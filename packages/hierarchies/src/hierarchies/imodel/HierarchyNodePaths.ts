/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  defer,
  finalize,
  from,
  fromEvent,
  identity,
  lastValueFrom,
  mergeAll,
  mergeMap,
  of,
  reduce,
  takeUntil,
  toArray,
} from "rxjs";
import { HierarchyNode } from "../HierarchyNode.js";
import { HierarchyNodeIdentifier } from "../HierarchyNodeIdentifier.js";
import { HierarchyNodeKey } from "../HierarchyNodeKey.js";
import { createIModelHierarchyProvider } from "./IModelHierarchyProvider.js";
import { createHierarchyDefinitionFromPathBased } from "./PathBasedHierarchyDefinition.js";

import type { Observable } from "rxjs";
import type { Id64String } from "@itwin/core-bentley";
import type {
  GenericInstanceFilter,
  GenericInstanceFilterRule,
  GenericInstanceFilterRuleGroup,
} from "@itwin/core-common";
import type { DeepReadonly, EC, ECSchemaProvider, Props } from "@itwin/presentation-shared";
import type { GroupingHierarchyNode, NonGroupingHierarchyNode, ParentHierarchyNode } from "../HierarchyNode.js";
import type { GenericNodeKey, IModelInstanceKey } from "../HierarchyNodeKey.js";
import type { GetHierarchyNodesProps, HierarchyProvider } from "../HierarchyProvider.js";
import type { ProcessedHierarchyNode } from "./IModelHierarchyNode.js";
import type { PathBasedHierarchyDefinition } from "./PathBasedHierarchyDefinition.js";

/**
 * A search path for `createHierarchyNodePaths` - an object with a `path` of node identifiers from a root node to a
 * target node.
 * @beta
 */
type SearchPath = { path: DeepReadonly<HierarchyNodeIdentifier[]> };

/**
 * Props for `createHierarchyNodePaths`.
 * @beta
 */
interface CreateHierarchyNodePathsProps<TSearchPath extends SearchPath> extends Pick<
  Props<typeof createIModelHierarchyProvider>,
  "imodelAccess" | "instanceLabelSelectClauseFactory" | "queryConcurrency" | "localizedStrings" | "formatter"
> {
  /**
   * Definition of the hierarchy to load nodes from.
   *
   * The definition gets a `path` of node identifiers from a root node to the parent node (empty for root nodes),
   * instead of `parentNode`. The path is made of search path identifiers when loading nodes of search path entries,
   * and of actual node keys when determining whether loaded nodes have children.
   */
  hierarchyDefinition: PathBasedHierarchyDefinition;

  /**
   * Hierarchy level size limit override, passed to every hierarchy level request. If not provided, the limit of
   * `imodelAccess` applies.
   */
  hierarchyLevelSizeLimit?: GetHierarchyNodesProps["hierarchyLevelSizeLimit"];

  /**
   * Search paths to load hierarchy nodes for. Every search path object has a `path` of node identifiers from a root
   * node to a target node, and may have any other properties, e.g. ones yielded by tree definitions'
   * `createInstanceKeyPaths`.
   */
  paths: Iterable<TSearchPath> | AsyncIterable<TSearchPath>;

  /**
   * Stops consuming paths and loading hierarchy levels when aborted. The returned promise then rejects with the
   * signal's reason.
   */
  abortSignal?: AbortSignal;
}

type IdentifierKey = string;

/**
 * Loads hierarchy nodes for the given paths of node identifiers.
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
 * contain grouping nodes before the nodes they group. Nodes that are hidden in the hierarchy are included in the paths
 * with the `isHidden` flag - their children are displayed in their place. Input paths whose target or an ancestor is
 * not found in the hierarchy, or whose target is hidden, are omitted.
 *
 * Notes:
 * - Nodes hidden in the hierarchy have to be included in the search paths. Their children are requested separately
 *   from their siblings, so they're not grouped together with them.
 * - Instance nodes are matched to search path identifiers by ID and class, and generic nodes - by ID and source, if
 *   the identifier has it.
 * - Instances are filtered by their `ECInstanceId` values using `OR` expressions, so hierarchy levels with many
 *   requested instances result in large queries.
 *
 * @throws An error if a hierarchy level size limit is exceeded, a node is merged by label, or loading fails. The
 * signal's reason if `abortSignal` is aborted.
 * @beta
 */
export async function createHierarchyNodePaths<TSearchPath extends SearchPath>(
  props: CreateHierarchyNodePathsProps<TSearchPath>,
): Promise<Array<{ searchPath: TSearchPath; nodesPath: Array<HierarchyNode & { isHidden?: boolean }> }>> {
  const { paths: searchPaths, hierarchyLevelSizeLimit, hierarchyDefinition, abortSignal, ...providerProps } = props;
  abortSignal?.throwIfAborted();
  const result = await lastValueFrom(
    defer(() => {
      const hierarchyProvider = createIModelHierarchyProvider({
        ...providerProps,
        hierarchyDefinition: createHierarchyDefinitionFromPathBased(
          createHiddenNodesFlaggingDefinition(hierarchyDefinition),
        ),
        // the provider is short-lived and grouping nodes' children are retrieved from cache, so don't limit it
        queryCacheSize: Number.MAX_SAFE_INTEGER,
      });
      return from(searchPaths).pipe(
        // collect path entries by their parents as paths come in, so that siblings can be requested together once all
        // paths are received
        reduce(
          (acc, searchPath) => {
            let parentEntry: SearchPathEntry | undefined;
            const entriesPath = searchPath.path.map((identifier: HierarchyNodeIdentifier) => {
              const children = getOrCreate(
                acc.entriesByParent,
                parentEntry,
                () => new Map<IdentifierKey, SearchPathEntry>(),
              );
              const parentPath = parentEntry?.path ?? [];
              const entry = getOrCreate(children, createIdentifierKey(identifier), () => ({
                identifier,
                path: [...parentPath, identifier],
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
            hierarchyProvider,
            imodelAccess: providerProps.imodelAccess,
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
        finalize(() => hierarchyProvider[Symbol.dispose]()),
      );
    }).pipe(
      // unsubscribing stops consuming paths and loading hierarchy levels
      abortSignal ? takeUntil(fromEvent(abortSignal, "abort")) : identity,
      toArray(),
    ),
  );
  // `takeUntil` completes the pipeline with partial results, so reject instead of returning them
  abortSignal?.throwIfAborted();
  return result;
}

/** A node returned by the hierarchy provider. Nodes hidden in the hierarchy have the `isHidden` flag. */
type NodeWithHiddenFlag = HierarchyNode & { isHidden?: boolean };

interface SearchPathEntry {
  identifier: HierarchyNodeIdentifier;
  /** Identifiers of the search path from the root entry to this entry, inclusive. */
  path: HierarchyNodeIdentifier[];
}

/** Search path entries by their parent entry, or `undefined` for root entries. */
type EntriesByParent = Map<SearchPathEntry | undefined, Map<IdentifierKey, SearchPathEntry>>;

/** A node loaded for a search path entry, together with the grouping nodes it's grouped under. */
interface LoadedEntryNodes {
  node: NonGroupingHierarchyNode;
  /** Grouping nodes the node is grouped under, from the outermost to the innermost. */
  groupingNodes: GroupingHierarchyNode[];
  /** Whether the node is hidden in the hierarchy. Hidden nodes aren't grouped. */
  isHidden: boolean;
}

/**
 * A search path entry with its nodes adjusted to the actual hierarchy, and information needed to resolve its children.
 */
interface ResolvedEntry {
  /** Grouping nodes and the node of the entry. Hidden nodes have the `isHidden` flag. */
  nodes: NodeWithHiddenFlag[];
  /** Whether the entry's node is hidden in the hierarchy. */
  isHidden: boolean;
  /** Keys of the actual ancestors of the entry's children. */
  childrenAncestorKeys: HierarchyNodeKey[];
  /** The actual non-grouping parent node of the entry's children. May be a hidden node. */
  childrenParentNode: NonGroupingHierarchyNode;
}

/** A hierarchy level request for sibling search path entries. */
interface NodesRequest {
  parentNode: ParentHierarchyNode<NonGroupingHierarchyNode> | undefined;
  instanceFilter: GenericInstanceFilter;
  /** Requested instance node entries by their instance IDs. Used to match loaded nodes to entries. */
  instanceEntries: Map<Id64String, Array<SearchPathEntry & { identifier: IModelInstanceKey }>>;
  /** Requested generic node entries. */
  genericEntries: Array<SearchPathEntry & { identifier: GenericNodeKey }>;
}

/**
 * Maximum number of rules in a single filter rule group. Every rule adds a term to the group's `OR` expression, so the
 * number is limited to keep queries within SQLite expression depth limits.
 */
const MAX_RULES_IN_GROUP = 100;

function createIdentifierKey(identifier: HierarchyNodeIdentifier): IdentifierKey {
  return HierarchyNodeIdentifier.isGenericNodeIdentifier(identifier)
    ? JSON.stringify(["generic", identifier.source, identifier.id])
    : JSON.stringify([identifier.imodelKey, identifier.className, identifier.id]);
}

/**
 * Wraps the given definition, so that nodes hidden in the hierarchy are returned with the `isHidden` flag instead of
 * their children. Hidden nodes aren't grouped.
 */
function createHiddenNodesFlaggingDefinition(source: PathBasedHierarchyDefinition): PathBasedHierarchyDefinition {
  return {
    ...source,
    defineHierarchyLevel: async (props) => source.defineHierarchyLevel(props),
    preProcessNode: async (props) => {
      const node = source.preProcessNode ? await source.preProcessNode(props) : props.node;
      if (!node?.processingParams?.hideInHierarchy) {
        return node;
      }
      const { hideInHierarchy: _, ...processingParams } = node.processingParams;
      if ("grouping" in processingParams) {
        delete processingParams.grouping;
      }
      return { ...node, processingParams, isHidden: true };
    },
    postProcessNode: async (props) => {
      const node = source.postProcessNode ? await source.postProcessNode(props) : props.node;
      // the flag has to be kept, even if the source post-processor creates a new node object
      return isFlaggedAsHidden(props.node) ? { ...node, isHidden: true } : node;
    },
  };
}

function isFlaggedAsHidden(node: ProcessedHierarchyNode): boolean {
  return "isHidden" in node && !!node.isHidden;
}

/**
 * Creates a parent node, that stands in for the actual parent node of a hierarchy level identified by the given path.
 * The provider only uses keys of the node, and the definition adapter turns the keys back into the path.
 */
function createStandInParentNode(
  path: HierarchyNodeIdentifier[],
): ParentHierarchyNode<NonGroupingHierarchyNode> | undefined {
  const keys = path.map(createNodeKey);
  const key = keys.pop();
  return key ? { key, parentKeys: keys, label: "" } : undefined;
}

function createNodeKey(identifier: HierarchyNodeIdentifier): NonGroupingHierarchyNode["key"] {
  if (HierarchyNodeIdentifier.isGenericNodeIdentifier(identifier)) {
    return { ...identifier };
  }
  return { type: "instances", instanceKeys: [{ ...identifier }] };
}

/**
 * Creates a path of nodes for the given path of entries, with ancestor keys of the actual hierarchy. Returns
 * `undefined` if the path's target or an ancestor is not in the hierarchy, or the target is hidden.
 *
 * Nodes are loaded with ancestor keys based on search path identifiers, which don't match the actual hierarchy (e.g.
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
  // Nodes of this entry were requested with a stand-in parent node, created from the entry's search path, so their
  // `parentKeys` and grouping nodes' `nonGroupingAncestor` are based on search path identifiers: ancestor class names
  // may be base classes, and grouping and hidden nodes' keys may differ. Here they're replaced with the actual
  // ancestors - `ancestorKeys`, resolved from the parent entry, followed by keys of the entry's grouping nodes that
  // precede the node.
  const groupingNodes = loadedEntry.groupingNodes.map((groupingNode, index): GroupingHierarchyNode => {
    const { nonGroupingAncestor: _, ...rest } = groupingNode;
    return {
      ...rest,
      parentKeys: [...ancestorKeys, ...loadedEntry.groupingNodes.slice(0, index).map(({ key }) => key)],
      ...(resolvedParentEntry ? { nonGroupingAncestor: resolvedParentEntry.childrenParentNode } : {}),
    };
  });
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
 * Emits a map from entries to their loaded nodes. Loaded nodes have ancestor keys based on search path identifiers.
 * Entries that aren't in the hierarchy are not in the map.
 */
function getLoadedEntries({
  hierarchyProvider,
  imodelAccess,
  hierarchyLevelSizeLimit,
  entriesByParent,
}: {
  hierarchyProvider: Pick<HierarchyProvider, "getNodes">;
  imodelAccess: Pick<ECSchemaProvider, "classDerivesFrom">;
  hierarchyLevelSizeLimit: GetHierarchyNodesProps["hierarchyLevelSizeLimit"];
  entriesByParent: EntriesByParent;
}): Observable<Map<SearchPathEntry, LoadedEntryNodes>> {
  return defer(() => from(getRequestPropsForGetNodes(entriesByParent))).pipe(
    mergeMap((request) => {
      const requestProps = {
        parentNode: request.parentNode,
        instanceFilter: request.instanceFilter,
        ...(hierarchyLevelSizeLimit !== undefined ? { hierarchyLevelSizeLimit } : {}),
      };
      return from(hierarchyProvider.getNodes(requestProps)).pipe(
        mergeMap((node) => getEntryNodes({ hierarchyProvider, requestProps, node, groupingNodes: [] })),
        mergeMap((loaded) => matchEntries({ imodelAccess, request, loaded })),
      );
    }),
    reduce((acc, { entry, loaded }) => acc.set(entry, loaded), new Map<SearchPathEntry, LoadedEntryNodes>()),
  );
}

/** Finds the requested search path entries that match the given loaded node. */
function matchEntries({
  imodelAccess,
  request,
  loaded,
}: {
  imodelAccess: Pick<ECSchemaProvider, "classDerivesFrom">;
  request: NodesRequest;
  loaded: LoadedEntryNodes;
}): Observable<{ entry: SearchPathEntry; loaded: LoadedEntryNodes }> {
  const { key } = loaded.node;
  if (HierarchyNodeKey.isGeneric(key)) {
    return from(
      request.genericEntries
        .filter(
          ({ identifier }) => identifier.id === key.id && (!identifier.source || identifier.source === key.source),
        )
        .map((entry) => ({ entry, loaded })),
    );
  }
  return from(
    key.instanceKeys.flatMap((loadedKey) =>
      (request.instanceEntries.get(loadedKey.id) ?? [])
        .filter(({ identifier }) => !identifier.imodelKey || identifier.imodelKey === loadedKey.imodelKey)
        .map((entry) => ({ entry, loadedKey })),
    ),
  ).pipe(
    // instances of different classes may share IDs (e.g. a model and its modeled element), so in addition to
    // IDs, the loaded instance class has to match the search path class
    mergeMap(async ({ entry, loadedKey }) =>
      (await classesMatch({ imodelAccess, lhs: entry.identifier.className, rhs: loadedKey.className }))
        ? [{ entry, loaded }]
        : [],
    ),
    mergeAll(),
  );
}

/** Creates hierarchy level requests for the given search path entries - one for every parent with child entries. */
function getRequestPropsForGetNodes(entriesByParent: EntriesByParent): NodesRequest[] {
  return [...entriesByParent].map(([parentEntry, children]) => {
    const instanceEntries: NodesRequest["instanceEntries"] = new Map();
    const genericEntries: NodesRequest["genericEntries"] = [];
    // loaded nodes are mapped to the entry objects, so they're not copied
    for (const entry of children.values()) {
      if (isInstanceNodeEntry(entry)) {
        getOrCreate(instanceEntries, entry.identifier.id, () => []).push(entry);
      } else {
        // If entry is not instances it must be a generic node entry
        genericEntries.push(entry as SearchPathEntry & { identifier: GenericNodeKey });
      }
    }
    return {
      parentNode: createStandInParentNode(parentEntry?.path ?? []),
      instanceFilter: createECInstanceIdsFilter([...instanceEntries.keys()]),
      instanceEntries,
      genericEntries,
    };
  });
}

function isInstanceNodeEntry(entry: SearchPathEntry): entry is SearchPathEntry & { identifier: IModelInstanceKey } {
  return HierarchyNodeIdentifier.isInstanceNodeIdentifier(entry.identifier);
}

/**
 * Emits the given node, or nodes grouped under the given grouping node, together with the grouping nodes they're
 * grouped under.
 */
function getEntryNodes({
  hierarchyProvider,
  requestProps,
  node,
  groupingNodes,
}: {
  hierarchyProvider: Pick<HierarchyProvider, "getNodes">;
  requestProps: Omit<GetHierarchyNodesProps, "parentNode">;
  node: NodeWithHiddenFlag;
  groupingNodes: GroupingHierarchyNode[];
}): Observable<LoadedEntryNodes> {
  if (HierarchyNode.isGroupingNode(node)) {
    // children of grouping nodes are cached by the provider for the same request props
    return from(hierarchyProvider.getNodes({ ...requestProps, parentNode: node })).pipe(
      mergeMap((childNode) =>
        getEntryNodes({ hierarchyProvider, requestProps, node: childNode, groupingNodes: [...groupingNodes, node] }),
      ),
    );
  }
  const { isHidden, ...nonGroupingNode } = node;
  return of({ node: nonGroupingNode, groupingNodes, isHidden: !!isHidden });
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
  if (ids.length === 0) {
    // `ECInstanceId` is never null, so the filter excludes all instances
    return {
      propertyClassNames: [],
      relatedInstances: [],
      rules: { sourceAlias: "this", propertyName: "ECInstanceId", operator: "is-null", propertyTypeName: "long" },
    };
  }
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
