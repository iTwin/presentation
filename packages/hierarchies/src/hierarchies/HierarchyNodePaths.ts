/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer, EMPTY, from, lastValueFrom, mergeAll, mergeMap, of, reduce, toArray } from "rxjs";
import { HierarchyNode } from "./HierarchyNode.js";

import type { Observable } from "rxjs";
import type { Id64String } from "@itwin/core-bentley";
import type {
  GenericInstanceFilter,
  GenericInstanceFilterRule,
  GenericInstanceFilterRuleGroup,
} from "@itwin/core-common";
import type { DeepReadonly, EC, ECSchemaProvider } from "@itwin/presentation-shared";
import type { GroupingHierarchyNode, NonGroupingHierarchyNode, ParentHierarchyNode } from "./HierarchyNode.js";
import type { HierarchyNodeKey, IModelInstanceKey, InstancesNodeKey } from "./HierarchyNodeKey.js";
import type { GetHierarchyNodesProps, HierarchyProvider } from "./HierarchyProvider.js";

/**
 * A node that `createHierarchyNodePaths` creates for every search path instance key, without loading it from a
 * `HierarchyProvider`. Minimal nodes of instances that have children in the search paths are used as parent nodes
 * when requesting those children, so they need the attributes that the provider uses to create the child hierarchy
 * level, e.g. `key`, `parentKeys` and `extendedData`.
 *
 * @beta
 */
export type MinimalHierarchyNode = ParentHierarchyNode<NonGroupingHierarchyNode> & {
  /** Hierarchy processing parameters of the node. */
  processingParams?: {
    /**
     * Set to `true` if the node is hidden in the hierarchy and its children are displayed in its place. Such
     * node itself is not requested and it's not included in the resulting nodes path, but it's still used as
     * a parent node when requesting its children.
     */
    hideInHierarchy?: boolean;
  };
};

/**
 * Props for `createHierarchyNodePaths`.
 * @beta
 */
interface CreateHierarchyNodePathsProps<TSearchPath extends { path: DeepReadonly<IModelInstanceKey[]> }> {
  /** Provider to load the hierarchy nodes from. */
  hierarchyProvider: HierarchyProvider;

  /**
   * Class hierarchy inspector of the iModel that the paths are created for. Used to match loaded nodes to search path
   * instance keys, whose class names may be base or derived classes of the actual instance classes.
   */
  imodelAccess: Pick<ECSchemaProvider, "classDerivesFrom">;

  /**
   * Hierarchy level size limit override, passed to every `HierarchyProvider.getNodes` call. If not provided, the
   * provider's limit applies.
   */
  hierarchyLevelSizeLimit?: GetHierarchyNodesProps["hierarchyLevelSizeLimit"];

  /**
   * Search paths to load hierarchy nodes for. Every search path object has a `path` of instance keys from a root node
   * to a target node, and may have any other properties, e.g. ones yielded by tree definitions' `createInstanceKeyPaths`.
   */
  paths: Iterable<TSearchPath> | AsyncIterable<TSearchPath>;

  /**
   * Creates a minimal node for the given search path instance key. If the instance has children in the search paths,
   * the node is used as a parent node when requesting them from `hierarchyProvider`, so it has to contain everything
   * the hierarchy definition expects from parent nodes.
   *
   * The function is called once for every unique search path prefix, as `paths` are consumed. Nodes are
   * created from root to leaves, so `parentNode` is the minimal node created for the previous identifier in the path,
   * or `undefined` for root identifiers.
   */
  createMinimalNode: (props: {
    instanceKey: DeepReadonly<IModelInstanceKey>;
    parentNode: MinimalHierarchyNode | undefined;
  }) => MinimalHierarchyNode;
}

type IdentifierKey = string;

/**
 * Loads hierarchy nodes for the given paths of instance keys.
 *
 * Paths are split into entries, and a minimal node is created for every unique entry using `createMinimalNode`. This
 * allows requesting all hierarchy levels concurrently, without waiting for parent nodes to be loaded. All sibling
 * entries are requested together, using an `instanceFilter` on their `ECInstanceId` values. Children of grouping nodes,
 * containing requested instances, are requested as soon as the grouping nodes are returned.
 *
 * Because every hierarchy level is requested with exactly the instances in the paths, grouping nodes group the same
 * instances as when the paths are applied using `HierarchyProvider.setHierarchySearch`.
 *
 * Paths are consumed one by one as they come in, hierarchy levels are requested once all paths are consumed, and the
 * returned promise resolves once all hierarchy levels are loaded.
 *
 * Resolves with a nodes path for every input path, together with the input path object as `searchPath`. Nodes paths
 * contain grouping nodes before the instance nodes they group, and don't contain nodes that are hidden in the
 * hierarchy. Input paths whose target or a non-hidden ancestor is not found in the hierarchy are omitted.
 *
 * Notes:
 * - The provider's state is not changed by this function.
 * - Ancestor keys of hidden nodes are taken from their minimal nodes.
 * - Instances are filtered by their `ECInstanceId` values using `OR` expressions, so hierarchy levels with many
 *   requested instances result in large queries.
 *
 * @throws An error if a hierarchy level size limit is exceeded, or loading fails.
 * @beta
 */
export async function createHierarchyNodePaths<TSearchPath extends { path: DeepReadonly<IModelInstanceKey[]> }>(
  props: CreateHierarchyNodePathsProps<TSearchPath>,
): Promise<Array<{ searchPath: TSearchPath; nodesPath: HierarchyNode[] }>> {
  const { hierarchyProvider, imodelAccess, hierarchyLevelSizeLimit, createMinimalNode } = props;
  return lastValueFrom(
    from(props.paths).pipe(
      // collect path entries by their parents as paths come in, so that siblings can be requested together once all
      // paths are received
      reduce(
        (acc, searchPath) => {
          let parentNode: MinimalHierarchyNode | undefined;
          const minimalNodesPath = searchPath.path.map((instanceKey) => {
            const children = getOrCreate(
              acc.minimalEntriesByParent,
              parentNode,
              () => new Map<IdentifierKey, SearchPathEntry>(),
            );
            const entry = getOrCreate(children, createIdentifierKey(instanceKey), () => ({
              instanceKey,
              minimalNode: createMinimalNode({ instanceKey, parentNode }),
            }));
            parentNode = entry.minimalNode;
            return entry.minimalNode;
          });
          acc.paths.push({ searchPath, minimalNodesPath });
          return acc;
        },
        {
          minimalEntriesByParent: new Map() as EntriesByParent,
          paths: new Array<{ searchPath: TSearchPath; minimalNodesPath: MinimalHierarchyNode[] }>(),
        },
      ),
      mergeMap(({ minimalEntriesByParent, paths }) =>
        getLoadedEntries({ hierarchyProvider, imodelAccess, hierarchyLevelSizeLimit, minimalEntriesByParent }).pipe(
          mergeMap((loadedEntries) => {
            // shared by all paths, so that entries of common path prefixes are resolved only once
            const resolvedEntriesAccumulator = new Map<MinimalHierarchyNode, ResolvedEntry>();
            return paths.flatMap(({ searchPath, minimalNodesPath }) => {
              const nodesPath = createNodesPath({ minimalNodesPath, loadedEntries, resolvedEntriesAccumulator });
              return nodesPath ? [{ searchPath, nodesPath }] : [];
            });
          }),
        ),
      ),
      toArray(),
    ),
  );
}

interface SearchPathEntry {
  instanceKey: DeepReadonly<IModelInstanceKey>;
  minimalNode: MinimalHierarchyNode;
}

/** Search path entries by the minimal node of their parent entry, or `undefined` for root entries. */
type EntriesByParent = Map<MinimalHierarchyNode | undefined, Map<IdentifierKey, SearchPathEntry>>;

/** An instance node loaded for a search path entry, together with the grouping nodes it's grouped under. */
interface LoadedEntryNodes {
  node: NonGroupingHierarchyNode & { key: InstancesNodeKey };
  /** Grouping nodes the instance node is grouped under, from the outermost to the innermost. */
  groupingNodes: GroupingHierarchyNode[];
}

/**
 * A search path entry with its nodes adjusted to the actual hierarchy, and information needed to resolve its children.
 */
interface ResolvedEntry {
  /** Grouping nodes and the instance node of the entry. Empty for hidden entries. */
  nodes: HierarchyNode[];
  /** Keys of the actual ancestors of the entry's children. */
  childrenAncestorKeys: HierarchyNodeKey[];
  /** The actual non-grouping parent node of the entry's children. `undefined` for children of hidden entries. */
  childrenParentNode?: NonGroupingHierarchyNode;
}

/** A hierarchy level request for sibling search path entries. */
interface NodesRequest {
  parentNode: ParentHierarchyNode | undefined;
  instanceFilter: GenericInstanceFilter;
  hierarchyLevelSizeLimit?: GetHierarchyNodesProps["hierarchyLevelSizeLimit"];
  /** Requested entries by their instance IDs. Used to match loaded nodes to entries. */
  entries: Map<Id64String, SearchPathEntry[]>;
}

/**
 * Maximum number of rules in a single filter rule group. Every rule adds a term to the group's `OR` expression, so the
 * number is limited to keep queries within SQLite expression depth limits.
 */
const MAX_RULES_IN_GROUP = 100;

function createIdentifierKey({ imodelKey, className, id }: DeepReadonly<IModelInstanceKey>): IdentifierKey {
  return JSON.stringify([imodelKey, className, id]);
}

/**
 * Creates a path of nodes for the given path of minimal nodes, with ancestor keys of the actual hierarchy. Returns
 * `undefined` if the path's target or a non-hidden ancestor is not in the hierarchy.
 *
 * Minimal nodes used as parents for requests are created from search paths, so keys of loaded nodes' ancestors don't match
 * the actual hierarchy (e.g. class names may be more general, grouping node keys are missing). Resolved entries are
 * stored in `resolvedEntriesAccumulator`, so that they're reused by other paths with the same prefix.
 */
function createNodesPath({
  minimalNodesPath,
  loadedEntries,
  resolvedEntriesAccumulator,
}: {
  minimalNodesPath: MinimalHierarchyNode[];
  loadedEntries: Map<MinimalHierarchyNode, LoadedEntryNodes>;
  resolvedEntriesAccumulator: Map<MinimalHierarchyNode, ResolvedEntry>;
}): HierarchyNode[] | undefined {
  if (minimalNodesPath.length === 0) {
    return undefined;
  }
  const nodesPath = new Array<HierarchyNode>();
  let resolvedParentEntry: ResolvedEntry = { nodes: [], childrenAncestorKeys: [] };
  for (const minimalNode of minimalNodesPath) {
    let entry = resolvedEntriesAccumulator.get(minimalNode);
    if (!entry) {
      entry = getResolvedEntry({ minimalNode, loadedEntry: loadedEntries.get(minimalNode), resolvedParentEntry });
      if (!entry) {
        return undefined;
      }
      resolvedEntriesAccumulator.set(minimalNode, entry);
    }
    nodesPath.push(...entry.nodes);
    resolvedParentEntry = entry;
  }
  // a hidden target isn't in the hierarchy
  return minimalNodesPath[minimalNodesPath.length - 1].processingParams?.hideInHierarchy ? undefined : nodesPath;
}

/**
 * Creates copies of the loaded entry nodes with ancestor keys of the actual hierarchy. Returns `undefined` if the entry
 * isn't hidden and its nodes weren't loaded.
 */
function getResolvedEntry({
  minimalNode,
  loadedEntry,
  resolvedParentEntry,
}: {
  minimalNode: MinimalHierarchyNode;
  loadedEntry: LoadedEntryNodes | undefined;
  resolvedParentEntry: ResolvedEntry;
}): ResolvedEntry | undefined {
  const { childrenAncestorKeys: ancestorKeys, childrenParentNode: parentNode } = resolvedParentEntry;
  if (minimalNode.processingParams?.hideInHierarchy) {
    // the entry is hidden - its children take its place
    return { nodes: [], childrenAncestorKeys: [...ancestorKeys, minimalNode.key] };
  }
  if (!loadedEntry) {
    return undefined;
  }
  // Nodes of this entry were requested with the entry's minimal parent node, so their `parentKeys` are based on minimal
  // nodes: ancestor class names come from the search path (may be base classes) and grouping nodes above minimal
  // ancestors are missing. Here they're replaced with keys of the actual ancestors - `ancestorKeys`, resolved from the
  // parent entry, followed by keys of the entry's grouping nodes that precede the node.
  const groupingNodes = loadedEntry.groupingNodes.map((groupingNode, index): GroupingHierarchyNode => ({
    ...groupingNode,
    parentKeys: [...ancestorKeys, ...loadedEntry.groupingNodes.slice(0, index).map(({ key }) => key)],
    ...getNonGroupingAncestor({ groupingNode, ancestorKeys, parentNode }),
  }));
  const node: NonGroupingHierarchyNode = {
    ...loadedEntry.node,
    parentKeys: [...ancestorKeys, ...groupingNodes.map(({ key }) => key)],
  };
  return {
    nodes: [...groupingNodes, node],
    childrenAncestorKeys: [...node.parentKeys, node.key],
    childrenParentNode: node,
  };
}

/**
 * Loads nodes for all given search path entries. Nodes of every hierarchy level are requested concurrently.
 *
 * Emits a map from entries' minimal nodes to their loaded nodes. Loaded nodes have ancestor keys based on minimal
 * nodes. Entries that are hidden or aren't in the hierarchy are not in the map.
 */
function getLoadedEntries({
  hierarchyProvider,
  imodelAccess,
  hierarchyLevelSizeLimit,
  minimalEntriesByParent,
}: {
  hierarchyProvider: HierarchyProvider;
  imodelAccess: Pick<ECSchemaProvider, "classDerivesFrom">;
  hierarchyLevelSizeLimit: GetHierarchyNodesProps["hierarchyLevelSizeLimit"];
  minimalEntriesByParent: EntriesByParent;
}): Observable<Map<MinimalHierarchyNode, LoadedEntryNodes>> {
  return defer(() => from(getRequestPropsForGetNodes({ minimalEntriesByParent, hierarchyLevelSizeLimit }))).pipe(
    mergeMap((request) =>
      loadEntryNodes({ hierarchyProvider, request, groupingNodes: [], parentNode: request.parentNode }).pipe(
        mergeMap((loaded) =>
          from(
            loaded.node.key.instanceKeys.flatMap((loadedKey) =>
              (request.entries.get(loadedKey.id) ?? [])
                .filter(({ instanceKey }) => !instanceKey.imodelKey || instanceKey.imodelKey === loadedKey.imodelKey)
                .map((entry) => ({ entry, loadedKey })),
            ),
          ).pipe(
            // instances of different classes may share IDs (e.g. a model and its modeled element), so in addition to
            // IDs, the loaded instance class has to match the search path class
            mergeMap(async ({ entry, loadedKey }) =>
              (await classesMatch({ imodelAccess, lhs: entry.instanceKey.className, rhs: loadedKey.className }))
                ? [{ minimalNode: entry.minimalNode, loaded }]
                : [],
            ),
            mergeAll(),
          ),
        ),
      ),
    ),
    reduce(
      (acc, { minimalNode, loaded }) => acc.set(minimalNode, loaded),
      new Map<MinimalHierarchyNode, LoadedEntryNodes>(),
    ),
  );
}

/**
 * Creates hierarchy level requests for the given search path entries - one for every parent with non-hidden child
 * entries.
 * Entries hidden in the hierarchy are not requested, but their children are.
 */
function getRequestPropsForGetNodes({
  minimalEntriesByParent,
  hierarchyLevelSizeLimit,
}: {
  minimalEntriesByParent: EntriesByParent;
  hierarchyLevelSizeLimit: GetHierarchyNodesProps["hierarchyLevelSizeLimit"];
}): NodesRequest[] {
  const requests = new Array<NodesRequest>();
  for (const [minimalParentNode, children] of minimalEntriesByParent) {
    const entries = new Map<Id64String, SearchPathEntry[]>();
    for (const entry of children.values()) {
      if (!entry.minimalNode.processingParams?.hideInHierarchy) {
        getOrCreate(entries, entry.instanceKey.id, () => new Array<SearchPathEntry>()).push(entry);
      }
    }
    if (entries.size > 0) {
      requests.push({
        parentNode: minimalParentNode,
        instanceFilter: createECInstanceIdsFilter([...entries.keys()]),
        ...(hierarchyLevelSizeLimit !== undefined ? { hierarchyLevelSizeLimit } : {}),
        entries,
      });
    }
  }
  return requests;
}

/**
 * Loads nodes of the hierarchy level of `parentNode` for the requested entries. Emits every loaded instance node together
 * with the grouping nodes it's grouped under. Nodes grouped under grouping nodes are loaded by requesting children of
 * those grouping nodes.
 */
function loadEntryNodes({
  hierarchyProvider,
  request,
  parentNode,
  groupingNodes,
}: {
  hierarchyProvider: HierarchyProvider;
  request: NodesRequest;
  parentNode: ParentHierarchyNode | undefined;
  groupingNodes: GroupingHierarchyNode[];
}): Observable<LoadedEntryNodes> {
  const { instanceFilter, hierarchyLevelSizeLimit } = request;
  return defer(() =>
    from(
      hierarchyProvider.getNodes({
        parentNode,
        instanceFilter,
        ...(hierarchyLevelSizeLimit !== undefined ? { hierarchyLevelSizeLimit } : {}),
      }),
    ),
  ).pipe(
    mergeMap((node) => {
      if (HierarchyNode.isGroupingNode(node)) {
        // grouping nodes may also group unrelated instances promoted from hidden nodes - skip groups without requested instances
        return node.groupedInstanceKeys.some(({ id }) => request.entries.has(id))
          ? loadEntryNodes({ hierarchyProvider, request, parentNode: node, groupingNodes: [...groupingNodes, node] })
          : EMPTY;
      }
      return HierarchyNode.isInstancesNode(node) ? of({ node, groupingNodes }) : EMPTY;
    }),
  );
}

/** Checks whether one of the given classes derives from the other. */
async function classesMatch({
  imodelAccess,
  lhs,
  rhs,
}: {
  imodelAccess: Pick<ECSchemaProvider, "classDerivesFrom">;
  lhs: EC.FullClassNameDotNotation;
  rhs: EC.FullClassNameDotNotation;
}): Promise<boolean> {
  return (
    lhs === rhs || (await imodelAccess.classDerivesFrom(lhs, rhs)) || (await imodelAccess.classDerivesFrom(rhs, lhs))
  );
}

function getNonGroupingAncestor({
  groupingNode,
  ancestorKeys,
  parentNode,
}: {
  groupingNode: GroupingHierarchyNode;
  ancestorKeys: HierarchyNodeKey[];
  parentNode?: NonGroupingHierarchyNode;
}): Pick<GroupingHierarchyNode, "nonGroupingAncestor"> {
  if (parentNode) {
    return { nonGroupingAncestor: parentNode };
  }
  if (groupingNode.nonGroupingAncestor) {
    // Hidden parents are not returned, but their request context is still needed to expand the group.
    return { nonGroupingAncestor: { ...groupingNode.nonGroupingAncestor, parentKeys: ancestorKeys.slice(0, -1) } };
  }
  return {};
}

/**
 * Creates a filter for instances with given IDs. The filter doesn't specify property classes, so it applies to
 * instances of all classes in the hierarchy level.
 */
function createECInstanceIdsFilter(ids: Id64String[]): GenericInstanceFilter {
  let rules: Array<GenericInstanceFilterRule | GenericInstanceFilterRuleGroup> = ids.map((id) => ({
    sourceAlias: "this",
    propertyName: "ECInstanceId",
    operator: "is-equal" as const,
    propertyTypeName: "long",
    value: { rawValue: id, displayValue: id },
  }));
  // every rule adds a term to an `OR` expression, so rules are nested into groups to keep the expressions short
  while (rules.length > MAX_RULES_IN_GROUP) {
    const groups = new Array<GenericInstanceFilterRuleGroup>();
    for (let start = 0; start < rules.length; start += MAX_RULES_IN_GROUP) {
      groups.push({ operator: "or", rules: rules.slice(start, start + MAX_RULES_IN_GROUP) });
    }
    rules = groups;
  }
  return {
    propertyClassNames: [],
    relatedInstances: [],
    rules: rules.length === 1 ? rules[0] : { operator: "or", rules },
  };
}

function getOrCreate<TKey, TValue>(source: Map<TKey, TValue>, key: TKey, createValue: () => TValue): TValue {
  let value = source.get(key);
  if (value === undefined) {
    value = createValue();
    source.set(key, value);
  }
  return value;
}
