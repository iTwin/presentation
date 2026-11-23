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
  mergeAll,
  mergeMap,
  of,
  reduce,
  takeUntil,
  throwError,
} from "rxjs";
import { eachValueFrom } from "@itwin/presentation-shared";
import { HierarchyNode } from "../HierarchyNode.js";
import { HierarchyNodeIdentifier } from "../HierarchyNodeIdentifier.js";
import { HierarchyNodeKey } from "../HierarchyNodeKey.js";
import { HierarchySearchPath, HierarchySearchTree } from "../HierarchySearch.js";
import { releaseMainThreadOnItemsCount } from "../internal/operators/ReleaseMainThread.js";
import { IModelHierarchyProviderImpl } from "./IModelHierarchyProvider.js";
import { createHierarchyDefinitionFromPathBased } from "./PathBasedHierarchyDefinition.js";

import type { Observable } from "rxjs";
import type { Id64String } from "@itwin/core-bentley";
import type { DeepReadonly, EC, ECSchemaProvider, Props } from "@itwin/presentation-shared";
import type { GroupingHierarchyNode, NonGroupingHierarchyNode, ParentHierarchyNode } from "../HierarchyNode.js";
import type { GenericNodeKey, IModelInstanceKey } from "../HierarchyNodeKey.js";
import type { GetHierarchyNodesProps, HierarchyProvider } from "../HierarchyProvider.js";
import type { ProcessedHierarchyNode } from "./IModelHierarchyNode.js";
import type { createIModelHierarchyProvider } from "./IModelHierarchyProvider.js";
import type { PathBasedHierarchyDefinition } from "./PathBasedHierarchyDefinition.js";

/**
 * Props for `createIModelHierarchyNodePaths`.
 * @beta
 */
interface CreateIModelHierarchyNodePathsProps extends Pick<
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

  /** Search paths to load hierarchy nodes for, e.g. paths yielded by tree definitions' `createInstanceKeyPaths`. */
  paths: Iterable<DeepReadonly<HierarchySearchPath>> | AsyncIterable<DeepReadonly<HierarchySearchPath>>;

  /**
   * Stops consuming paths and loading hierarchy levels when aborted. The returned iterator then throws the signal's
   * reason.
   */
  abortSignal?: AbortSignal;
}

/**
 * Asynchronously loads paths of hierarchy nodes for the given identifier paths. Each nodes path contains the same
 * nodes that `HierarchyProvider.getNodes` returns when the hierarchy is loaded from the root down to the path's target.
 *
 * Nodes with multiple instance keys, e.g. nodes merged by label, are not supported - the hierarchy must not have such
 * nodes.
 *
 * @throws Iterating the returned iterator throws an error if a hierarchy level size limit is exceeded, a node has
 * multiple instance keys, or loading fails, and throws the signal's reason if `abortSignal` is aborted.
 * @beta
 */
export function createIModelHierarchyNodePaths(
  props: CreateIModelHierarchyNodePathsProps,
): AsyncIterableIterator<HierarchyNode[]> {
  const {
    paths: searchPaths,
    hierarchyLevelSizeLimit,
    hierarchyDefinition,
    abortSignal,
    imodelAccess,
    instanceLabelSelectClauseFactory,
    ...providerProps
  } = props;
  return eachValueFrom(
    defer(() => {
      abortSignal?.throwIfAborted();
      return from(searchPaths);
    }).pipe(
      releaseMainThreadOnItemsCount(1000),
      // collect paths into a search tree as they come in, so that siblings can be requested together once all paths
      // are received
      reduce((builder, searchPath) => {
        const { path, options } = HierarchySearchPath.normalize(searchPath);
        return builder.accept({ path: { path: path.map(withoutGenericNodeSource), options } });
      }, HierarchySearchTree.createBuilder()),
      mergeMap((searchTreeBuilder) =>
        defer(() => {
          const searchTree = searchTreeBuilder.getTree();
          const hierarchyProvider = new IModelHierarchyProviderImpl({
            ...providerProps,
            imodels: [{ imodelAccess, instanceLabelSelectClauseFactory }],
            getHierarchyDefinition: () =>
              createHierarchyDefinitionFromPathBased(createHiddenNodesFlaggingDefinition(hierarchyDefinition)),
            // the provider filters hierarchy levels to search tree entries, and assigns search attributes to nodes
            search: { paths: searchTree },
            // only the nodes of search tree entries are needed, including the ones under search targets
            searchTargetsChildrenLoadingMode: "search-paths",
            // the provider is short-lived and grouping nodes' children are retrieved from cache, so don't limit it
            queryCacheSize: Number.MAX_SAFE_INTEGER,
          });
          return getLoadedEntries({ hierarchyProvider, imodelAccess, hierarchyLevelSizeLimit, searchTree }).pipe(
            mergeMap((loadedEntries) => createNodesPaths({ searchTree, loadedEntries })),
            finalize(() => hierarchyProvider[Symbol.dispose]()),
          );
        }),
      ),
      // fail with the signal's reason, which also stops consuming paths and loading hierarchy levels
      abortSignal
        ? takeUntil(fromEvent(abortSignal, "abort").pipe(mergeMap(() => throwError(() => abortSignal.reason))))
        : identity,
    ),
  );
}

/** A node returned by the hierarchy provider. Nodes hidden in the hierarchy have the `isHidden` flag. */
type NodeWithHiddenFlag = HierarchyNode & { isHidden?: boolean };

/** A node loaded for a search tree entry, together with the grouping nodes it's grouped under. */
interface LoadedEntryNodes {
  node: NonGroupingHierarchyNode;
  /** Grouping nodes the node is grouped under, from the outermost to the innermost. */
  groupingNodes: GroupingHierarchyNode[];
  /** Whether the node is hidden in the hierarchy. Hidden nodes aren't grouped. */
  isHidden: boolean;
}

/**
 * A search tree entry with its nodes adjusted to the actual hierarchy, and information needed to resolve its children.
 */
interface ResolvedEntry {
  /** Grouping nodes and the node of the entry, or nothing if the node is hidden in the hierarchy. */
  nodes: HierarchyNode[];
  /** Whether the entry's node is hidden in the hierarchy. */
  isHidden: boolean;
  /** Keys of the actual ancestors of the entry's children. */
  childrenAncestorKeys: HierarchyNodeKey[];
  /** The actual non-grouping parent node of the entry's children. May be a hidden node. */
  childrenParentNode: NonGroupingHierarchyNode;
}

/** A hierarchy level request for sibling search tree entries. */
interface NodesRequest {
  parentNode: ParentHierarchyNode<NonGroupingHierarchyNode> | undefined;
  /** Requested instance node entries by their instance IDs. Used to match loaded nodes to entries. */
  instanceEntries: Map<Id64String, Array<HierarchySearchTree & { identifier: IModelInstanceKey }>>;
  /** Requested generic node entries. */
  genericEntries: Array<HierarchySearchTree & { identifier: GenericNodeKey }>;
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
 * Creates a parent node, that stands in for the actual parent node of a hierarchy level identified by the given path of
 * search tree entries. The definition adapter turns the node's keys back into a path of identifiers, and the provider
 * filters the hierarchy level to the children of the last entry.
 *
 * The stand-in has the same search attributes as a provider with the search applied assigns to the actual parent node.
 * Entries with children are search targets only if they're flagged as such.
 */
function createStandInParentNode(
  entriesPath: HierarchySearchTree[],
): ParentHierarchyNode<NonGroupingHierarchyNode> | undefined {
  const parentEntry = entriesPath.at(-1);
  if (!parentEntry) {
    return undefined;
  }
  const keys = entriesPath.map(({ identifier }) => createNodeKey(identifier));
  const key = keys.pop()!;
  const hasSearchTargetAncestor = entriesPath.slice(0, -1).some(({ isTarget }) => isTarget);
  return {
    key,
    parentKeys: keys,
    label: "",
    search: {
      ...(hasSearchTargetAncestor ? { hasSearchTargetAncestor } : {}),
      ...(parentEntry.isTarget ? { isSearchTarget: true } : {}),
      childrenTargetPaths: parentEntry.children,
      ...(parentEntry.options ? { options: parentEntry.options } : {}),
    },
  };
}

/**
 * Removes `source` from generic node identifiers, because it never matches the unique source name of the hierarchy
 * provider that loads the nodes.
 */
function withoutGenericNodeSource(
  identifier: DeepReadonly<HierarchyNodeIdentifier>,
): DeepReadonly<HierarchyNodeIdentifier> {
  if (!HierarchyNodeIdentifier.isGenericNodeIdentifier(identifier)) {
    return identifier;
  }
  const { source: _, ...rest } = identifier;
  return rest;
}

function createNodeKey(identifier: HierarchyNodeIdentifier): NonGroupingHierarchyNode["key"] {
  if (HierarchyNodeIdentifier.isGenericNodeIdentifier(identifier)) {
    return { ...identifier };
  }
  return { type: "instances", instanceKeys: [{ ...identifier }] };
}

/**
 * Resolves loaded search tree entries level by level, from the root down, and creates a nodes path for every search
 * target found in the hierarchy. Every resolved entry gets copies of its loaded nodes with ancestor keys of the actual
 * hierarchy.
 *
 * Nodes are loaded with ancestor keys based on search path identifiers, which don't match the actual hierarchy (e.g.
 * class names may be more general, grouping node keys are missing). Entries that aren't loaded, and their
 * descendants, are skipped.
 */
function createNodesPaths({
  searchTree,
  loadedEntries,
}: {
  searchTree: HierarchySearchTree[];
  loadedEntries: Map<HierarchySearchTree, LoadedEntryNodes>;
}): Array<ResolvedEntry["nodes"]> {
  const nodesPaths = new Array<ResolvedEntry["nodes"]>();
  const resolveChildren = (
    entries: HierarchySearchTree[],
    parent?: { resolvedEntry: ResolvedEntry; nodesPath: ResolvedEntry["nodes"] },
  ) => {
    // sibling entries match the same loaded node when their identifiers differ only by class
    const entriesByLoaded = new Map<LoadedEntryNodes, HierarchySearchTree[]>();
    for (const entry of entries) {
      const loadedEntry = loadedEntries.get(entry);
      if (loadedEntry) {
        getOrCreate(entriesByLoaded, loadedEntry, () => []).push(entry);
      }
    }
    for (const [loadedEntry, matchingEntries] of entriesByLoaded) {
      const resolvedEntry = getResolvedEntry({ loadedEntry, resolvedParentEntry: parent?.resolvedEntry });
      const nodesPath = [...(parent?.nodesPath ?? []), ...resolvedEntry.nodes];
      // a hidden target isn't in the hierarchy
      if (resolvedEntry.childrenParentNode.search?.isSearchTarget && !resolvedEntry.isHidden) {
        nodesPaths.push(nodesPath);
      }
      for (const entry of matchingEntries) {
        if (entry.children) {
          resolveChildren(entry.children, { resolvedEntry, nodesPath });
        }
      }
    }
  };
  resolveChildren(searchTree);
  return nodesPaths;
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
    // hidden nodes aren't in the hierarchy, and they aren't grouped
    nodes: loadedEntry.isHidden ? [] : [...groupingNodes, node],
    isHidden: loadedEntry.isHidden,
    childrenAncestorKeys: [...node.parentKeys, node.key],
    childrenParentNode: node,
  };
}

/**
 * Loads nodes for all given search tree entries. Nodes of every hierarchy level are requested concurrently.
 *
 * Emits a map from entries to their loaded nodes. Loaded nodes have ancestor keys based on search path identifiers.
 * Entries that aren't in the hierarchy are not in the map.
 */
function getLoadedEntries({
  hierarchyProvider,
  imodelAccess,
  hierarchyLevelSizeLimit,
  searchTree,
}: {
  hierarchyProvider: Pick<HierarchyProvider, "getNodes">;
  imodelAccess: Pick<ECSchemaProvider, "classDerivesFrom">;
  hierarchyLevelSizeLimit: GetHierarchyNodesProps["hierarchyLevelSizeLimit"];
  searchTree: HierarchySearchTree[];
}): Observable<Map<HierarchySearchTree, LoadedEntryNodes>> {
  return defer(() => from(getRequestPropsForGetNodes(searchTree))).pipe(
    mergeMap((request) => {
      const requestProps = {
        parentNode: request.parentNode,
        ...(hierarchyLevelSizeLimit !== undefined ? { hierarchyLevelSizeLimit } : {}),
      };
      return from(hierarchyProvider.getNodes(requestProps)).pipe(
        mergeMap((node) => getEntryNodes({ hierarchyProvider, requestProps, node, groupingNodes: [] })),
        mergeMap((loaded) => matchEntries({ imodelAccess, request, loaded })),
      );
    }),
    reduce((acc, { entry, loaded }) => acc.set(entry, loaded), new Map<HierarchySearchTree, LoadedEntryNodes>()),
  );
}

/** Finds the requested search tree entries that match the given loaded node. */
function matchEntries({
  imodelAccess,
  request,
  loaded,
}: {
  imodelAccess: Pick<ECSchemaProvider, "classDerivesFrom">;
  request: NodesRequest;
  loaded: LoadedEntryNodes;
}): Observable<{ entry: HierarchySearchTree; loaded: LoadedEntryNodes }> {
  const { key } = loaded.node;
  if (HierarchyNodeKey.isGeneric(key)) {
    return from(
      request.genericEntries.filter(({ identifier }) => identifier.id === key.id).map((entry) => ({ entry, loaded })),
    );
  }
  return from(
    key.instanceKeys.flatMap((loadedKey) =>
      // the provider only loads instances of the requested entries
      request.instanceEntries
        .get(loadedKey.id)!
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

/**
 * Creates hierarchy level requests for the given search tree - one for the root level and one for every entry with
 * children.
 */
function getRequestPropsForGetNodes(searchTree: HierarchySearchTree[]): NodesRequest[] {
  const requests = new Array<NodesRequest>();
  const addRequests = (entries: HierarchySearchTree[], parentEntries: HierarchySearchTree[]) => {
    const instanceEntries: NodesRequest["instanceEntries"] = new Map();
    const genericEntries: NodesRequest["genericEntries"] = [];
    // loaded nodes are mapped to the entry objects, so they're not copied
    for (const entry of entries) {
      if (isInstanceNodeEntry(entry)) {
        getOrCreate(instanceEntries, entry.identifier.id, () => []).push(entry);
      } else {
        // If entry is not instances it must be a generic node entry
        genericEntries.push(entry as HierarchySearchTree & { identifier: GenericNodeKey });
      }
    }
    requests.push({ parentNode: createStandInParentNode(parentEntries), instanceEntries, genericEntries });
    for (const entry of entries) {
      if (entry.children) {
        addRequests(entry.children, [...parentEntries, entry]);
      }
    }
  };
  if (searchTree.length > 0) {
    addRequests(searchTree, []);
  }
  return requests;
}

function isInstanceNodeEntry(
  entry: HierarchySearchTree,
): entry is HierarchySearchTree & { identifier: IModelInstanceKey } {
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

function getOrCreate<TKey, TValue>(source: Map<TKey, TValue>, key: TKey, createValue: () => TValue): TValue {
  let value = source.get(key);
  if (value === undefined) {
    value = createValue();
    source.set(key, value);
  }
  return value;
}
