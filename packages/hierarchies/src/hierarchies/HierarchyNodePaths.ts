/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer, EMPTY, from, lastValueFrom, mergeAll, mergeMap, of, reduce, toArray } from "rxjs";
import { HierarchyNode } from "./HierarchyNode.js";
import { PathBasedIModelHierarchyProvider } from "./imodel/PathBasedIModelHierarchyProvider.js";

import type { Observable } from "rxjs";
import type { Id64String } from "@itwin/core-bentley";
import type {
  GenericInstanceFilter,
  GenericInstanceFilterRule,
  GenericInstanceFilterRuleGroup,
} from "@itwin/core-common";
import type { DeepReadonly, EC, ECSchemaProvider, Props } from "@itwin/presentation-shared";
import type { GroupingHierarchyNode, NonGroupingHierarchyNode } from "./HierarchyNode.js";
import type { HierarchyNodeKey, IModelInstanceKey, InstancesNodeKey } from "./HierarchyNodeKey.js";
import type { GetHierarchyNodesProps } from "./HierarchyProvider.js";
import type { HierarchyDefinition } from "./imodel/IModelHierarchyDefinition.js";
import type { createIModelHierarchyProvider } from "./imodel/IModelHierarchyProvider.js";
import type { PathBasedHierarchyNode } from "./imodel/PathBasedIModelHierarchyProvider.js";

/**
 * Props for `createHierarchyNodePaths`.
 * @beta
 */
interface CreateHierarchyNodePathsProps<TSearchPath extends { path: DeepReadonly<IModelInstanceKey[]> }> {
  /**
   * Props for the hierarchy provider that `createHierarchyNodePaths` creates internally to load the nodes.
   *
   * The hierarchy definition identifies parents of hierarchy levels by paths of instance keys rather than parent
   * nodes - its callbacks receive a `path` of search path instance keys from a root node to the parent node (empty for
   * root nodes), instead of `parentNode`. When determining whether nodes have children, the path ends with the
   * instance key of the node, rather than a search path instance key. Generic node keys can't be put into paths, so
   * generic nodes can't have children.
   */
  hierarchyProviderProps: Pick<
    Props<typeof createIModelHierarchyProvider>,
    "imodelAccess" | "instanceLabelSelectClauseFactory" | "queryConcurrency" | "localizedStrings" | "formatter"
  > & { hierarchyDefinition: HierarchyDefinition<{ path: DeepReadonly<IModelInstanceKey[]> }> };

  /**
   * Hierarchy level size limit override, passed to every hierarchy level request. If not provided, the limit of
   * `hierarchyProviderProps.imodelAccess` applies.
   */
  hierarchyLevelSizeLimit?: GetHierarchyNodesProps["hierarchyLevelSizeLimit"];

  /**
   * Search paths to load hierarchy nodes for. Every search path object has a `path` of instance keys from a root node
   * to a target node, and may have any other properties, e.g. ones yielded by tree definitions' `createInstanceKeyPaths`.
   */
  paths: Iterable<TSearchPath> | AsyncIterable<TSearchPath>;
}

type IdentifierKey = string;

/**
 * Loads hierarchy nodes for the given paths of instance keys.
 *
 * Paths are split into entries, and every unique entry is identified by its path from the root. This allows requesting
 * all hierarchy levels concurrently, without waiting for parent nodes to be loaded. All sibling entries are requested
 * together, using an `instanceFilter` on their `ECInstanceId` values.
 *
 * Because every hierarchy level is requested with exactly the instances in the paths, grouping nodes group the same
 * instances as when the paths are applied using `HierarchyProvider.setHierarchySearch`.
 *
 * Paths are consumed one by one as they come in, hierarchy levels are requested once all paths are consumed, and the
 * returned promise resolves once all hierarchy levels are loaded.
 *
 * Resolves with a nodes path for every input path, together with the input path object as `searchPath`. Nodes paths
 * contain grouping nodes before the instance nodes they group. Nodes that are hidden in the hierarchy are included in
 * the paths with the `isHidden` flag - their children are displayed in their place. Input paths whose target or an
 * ancestor is not found in the hierarchy, or whose target is hidden, are omitted.
 *
 * Notes:
 * - Nodes hidden in the hierarchy have to be included in the search paths. Their children are requested separately
 *   from their siblings, so they're not grouped together with them.
 * - Instances are filtered by their `ECInstanceId` values using `OR` expressions, so hierarchy levels with many
 *   requested instances result in large queries.
 *
 * @throws An error if a hierarchy level size limit is exceeded, or loading fails.
 * @beta
 */
export async function createHierarchyNodePaths<TSearchPath extends { path: DeepReadonly<IModelInstanceKey[]> }>(
  props: CreateHierarchyNodePathsProps<TSearchPath>,
): Promise<Array<{ searchPath: TSearchPath; nodesPath: Array<HierarchyNode & { isHidden?: boolean }> }>> {
  const { hierarchyProviderProps, hierarchyLevelSizeLimit } = props;
  return lastValueFrom(
    from(props.paths).pipe(
      // collect path entries by their parents as paths come in, so that siblings can be requested together once all
      // paths are received
      reduce(
        (acc, searchPath) => {
          let parentEntry: SearchPathEntry | undefined;
          const entriesPath = searchPath.path.map((instanceKey) => {
            const children = getOrCreate(
              acc.entriesByParent,
              parentEntry,
              () => new Map<IdentifierKey, SearchPathEntry>(),
            );
            const parentPath = parentEntry?.path ?? [];
            const entry = getOrCreate(children, createIdentifierKey(instanceKey), () => ({
              instanceKey,
              path: [...parentPath, instanceKey],
            }));
            parentEntry = entry;
            return entry;
          });
          acc.paths.push({ searchPath, entriesPath });
          return acc;
        },
        {
          entriesByParent: new Map() as EntriesByParent,
          paths: new Array<{ searchPath: TSearchPath; entriesPath: SearchPathEntry[] }>(),
        },
      ),
      mergeMap(({ entriesByParent, paths }) =>
        getLoadedEntries({
          hierarchyProvider: new PathBasedIModelHierarchyProvider(hierarchyProviderProps),
          imodelAccess: hierarchyProviderProps.imodelAccess,
          hierarchyLevelSizeLimit,
          entriesByParent,
        }).pipe(
          mergeMap((loadedEntries) => {
            // shared by all paths, so that entries of common path prefixes are resolved only once
            const resolvedEntriesAccumulator = new Map<SearchPathEntry, ResolvedEntry>();
            return paths.flatMap(({ searchPath, entriesPath }) => {
              const nodesPath = createNodesPath({ entriesPath, loadedEntries, resolvedEntriesAccumulator });
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
  /** Instance keys of the search path from the root entry to this entry, inclusive. */
  path: DeepReadonly<IModelInstanceKey[]>;
}

/** Search path entries by their parent entry, or `undefined` for root entries. */
type EntriesByParent = Map<SearchPathEntry | undefined, Map<IdentifierKey, SearchPathEntry>>;

/** An instance node loaded for a search path entry, together with the grouping nodes it's grouped under. */
interface LoadedEntryNodes {
  node: NonGroupingHierarchyNode & { key: InstancesNodeKey };
  /** Grouping nodes the instance node is grouped under, from the outermost to the innermost. */
  groupingNodes: GroupingHierarchyNode[];
  /** Whether the node is hidden in the hierarchy. Hidden nodes aren't grouped. */
  isHidden: boolean;
}

/**
 * A search path entry with its nodes adjusted to the actual hierarchy, and information needed to resolve its children.
 */
interface ResolvedEntry {
  /** Grouping nodes and the instance node of the entry. Hidden instance nodes have the `isHidden` flag. */
  nodes: Array<HierarchyNode & { isHidden?: boolean }>;
  /** Whether the entry's node is hidden in the hierarchy. */
  isHidden: boolean;
  /** Keys of the actual ancestors of the entry's children. */
  childrenAncestorKeys: HierarchyNodeKey[];
  /** The actual non-grouping parent node of the entry's children. May be a hidden node. */
  childrenParentNode: NonGroupingHierarchyNode;
}

/** A hierarchy level request for sibling search path entries. */
interface NodesRequest {
  path: DeepReadonly<IModelInstanceKey[]>;
  instanceFilter: GenericInstanceFilter;
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
 * Creates a path of nodes for the given path of entries, with ancestor keys of the actual hierarchy. Returns
 * `undefined` if the path's target or an ancestor is not in the hierarchy, or the target is hidden.
 *
 * Nodes are loaded with ancestor keys based on search path instance keys, which don't match the actual hierarchy (e.g.
 * class names may be more general, grouping node keys are missing). Resolved entries are stored in
 * `resolvedEntriesAccumulator`, so that they're reused by other paths with the same prefix.
 */
function createNodesPath({
  entriesPath,
  loadedEntries,
  resolvedEntriesAccumulator,
}: {
  entriesPath: SearchPathEntry[];
  loadedEntries: Map<SearchPathEntry, LoadedEntryNodes>;
  resolvedEntriesAccumulator: Map<SearchPathEntry, ResolvedEntry>;
}): ResolvedEntry["nodes"] | undefined {
  const nodesPath: ResolvedEntry["nodes"] = [];
  let resolvedParentEntry: Pick<ResolvedEntry, "childrenAncestorKeys" | "childrenParentNode"> | undefined;
  let resolvedEntry: ResolvedEntry | undefined;
  for (const entry of entriesPath) {
    resolvedEntry = resolvedEntriesAccumulator.get(entry);
    if (!resolvedEntry) {
      const loadedEntry = loadedEntries.get(entry);
      if (!loadedEntry) {
        return undefined;
      }
      resolvedEntry = getResolvedEntry({ loadedEntry, resolvedParentEntry });
      resolvedEntriesAccumulator.set(entry, resolvedEntry);
    }
    nodesPath.push(...resolvedEntry.nodes);
    resolvedParentEntry = resolvedEntry;
  }
  // a hidden target isn't in the hierarchy
  return resolvedEntry && !resolvedEntry.isHidden ? nodesPath : undefined;
}

/** Creates copies of the loaded entry nodes with ancestor keys of the actual hierarchy. */
function getResolvedEntry({
  loadedEntry,
  resolvedParentEntry,
}: {
  loadedEntry: LoadedEntryNodes;
  resolvedParentEntry: Pick<ResolvedEntry, "childrenAncestorKeys" | "childrenParentNode"> | undefined;
}): ResolvedEntry {
  const ancestorKeys = resolvedParentEntry?.childrenAncestorKeys ?? [];
  // Nodes of this entry were requested with the entry's search path, so their `parentKeys` are based on search path
  // instance keys: ancestor class names may be base classes, and grouping and hidden nodes' keys may differ. Here they're
  // replaced with keys of the actual ancestors - `ancestorKeys`, resolved from the parent entry, followed by keys of the
  // entry's grouping nodes that precede the node.
  const groupingNodes = loadedEntry.groupingNodes.map((groupingNode, index): GroupingHierarchyNode => ({
    ...groupingNode,
    parentKeys: [...ancestorKeys, ...loadedEntry.groupingNodes.slice(0, index).map(({ key }) => key)],
    ...(resolvedParentEntry ? { nonGroupingAncestor: resolvedParentEntry.childrenParentNode } : {}),
  }));
  const node: NonGroupingHierarchyNode = {
    ...loadedEntry.node,
    parentKeys: [...ancestorKeys, ...groupingNodes.map(({ key }) => key)],
  };
  return {
    // hidden nodes aren't grouped
    nodes: loadedEntry.isHidden ? [{ ...node, isHidden: true }] : [...groupingNodes, node],
    isHidden: loadedEntry.isHidden,
    childrenAncestorKeys: [...node.parentKeys, node.key],
    childrenParentNode: node,
  };
}

/**
 * Loads nodes for all given search path entries. Nodes of every hierarchy level are requested concurrently.
 *
 * Emits a map from entries to their loaded nodes. Loaded nodes have ancestor keys based on search path instance keys.
 * Entries that aren't in the hierarchy are not in the map.
 */
function getLoadedEntries({
  hierarchyProvider,
  imodelAccess,
  hierarchyLevelSizeLimit,
  entriesByParent,
}: {
  hierarchyProvider: Pick<PathBasedIModelHierarchyProvider, "getNodes" | "getGroupingNodeChildren">;
  imodelAccess: Pick<ECSchemaProvider, "classDerivesFrom">;
  hierarchyLevelSizeLimit: GetHierarchyNodesProps["hierarchyLevelSizeLimit"];
  entriesByParent: EntriesByParent;
}): Observable<Map<SearchPathEntry, LoadedEntryNodes>> {
  return defer(() => from(getRequestPropsForGetNodes(entriesByParent))).pipe(
    mergeMap((request) => {
      const requestProps = {
        path: request.path,
        instanceFilter: request.instanceFilter,
        ...(hierarchyLevelSizeLimit !== undefined ? { hierarchyLevelSizeLimit } : {}),
      };
      return hierarchyProvider.getNodes(requestProps).pipe(
        mergeMap((node) => getEntryNodes({ hierarchyProvider, requestProps, node, groupingNodes: [] })),
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
                ? [{ entry, loaded }]
                : [],
            ),
            mergeAll(),
          ),
        ),
      );
    }),
    reduce((acc, { entry, loaded }) => acc.set(entry, loaded), new Map<SearchPathEntry, LoadedEntryNodes>()),
  );
}

/** Creates hierarchy level requests for the given search path entries - one for every parent with child entries. */
function getRequestPropsForGetNodes(entriesByParent: EntriesByParent): NodesRequest[] {
  return [...entriesByParent].map(([parentEntry, children]) => {
    const entries = new Map<Id64String, SearchPathEntry[]>();
    for (const entry of children.values()) {
      getOrCreate(entries, entry.instanceKey.id, () => new Array<SearchPathEntry>()).push(entry);
    }
    return { path: parentEntry?.path ?? [], instanceFilter: createECInstanceIdsFilter([...entries.keys()]), entries };
  });
}

/**
 * Emits the given instance node, or instance nodes grouped under the given grouping node, together with the grouping
 * nodes they're grouped under. Generic nodes are skipped, because they can't be search path entries.
 */
function getEntryNodes({
  hierarchyProvider,
  requestProps,
  node,
  groupingNodes,
}: {
  hierarchyProvider: Pick<PathBasedIModelHierarchyProvider, "getGroupingNodeChildren">;
  requestProps: Omit<Props<PathBasedIModelHierarchyProvider["getGroupingNodeChildren"]>, "groupingNode">;
  node: PathBasedHierarchyNode;
  groupingNodes: GroupingHierarchyNode[];
}): Observable<LoadedEntryNodes> {
  if (HierarchyNode.isGroupingNode(node)) {
    return hierarchyProvider
      .getGroupingNodeChildren({ groupingNode: node, ...requestProps })
      .pipe(
        mergeMap((childNode) =>
          getEntryNodes({ hierarchyProvider, requestProps, node: childNode, groupingNodes: [...groupingNodes, node] }),
        ),
      );
  }
  if (!HierarchyNode.isInstancesNode(node)) {
    return EMPTY;
  }
  const { isHidden, ...instanceNode } = node;
  return of({ node: instanceNode, groupingNodes, isHidden: !!isHidden });
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
