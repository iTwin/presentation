/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  defer,
  EMPTY,
  expand,
  finalize,
  from,
  fromEvent,
  identity,
  map,
  mergeAll,
  mergeMap,
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
            // the provider filters hierarchy levels to search tree branches, and assigns search attributes to nodes
            search: { paths: searchTree },
            // only the nodes of search tree branches are needed, including the ones under search targets
            searchTargetsChildrenLoadingMode: "search-paths",
            // the provider is short-lived and grouping nodes' children are retrieved from cache, so don't limit it
            queryCacheSize: Number.MAX_SAFE_INTEGER,
          });
          return loadSearchTreeNodes({ hierarchyProvider, imodelAccess, hierarchyLevelSizeLimit, searchTree }).pipe(
            mergeMap((loadedNodesByBranch) => createNodesPaths({ searchTree, loadedNodesByBranch })),
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

/** A node returned by the hierarchy provider, together with the grouping nodes it's grouped under. */
interface GroupedNode<TNode extends HierarchyNode = NonGroupingHierarchyNode> {
  /** Nodes hidden in the hierarchy have the `isHidden` flag. Hidden nodes aren't grouped. */
  node: TNode & { isHidden?: boolean };
  /** Grouping nodes the node is grouped under, from the outermost to the innermost. */
  groupingNodes: GroupingHierarchyNode[];
}

/** A hierarchy level request for sibling search tree branches. */
interface NodesRequest {
  parentNode: ParentHierarchyNode<NonGroupingHierarchyNode> | undefined;
  /** Requested instance node branches by their instance IDs. Used to match loaded nodes to branches. */
  instanceBranches: Map<Id64String, Array<HierarchySearchTree & { identifier: IModelInstanceKey }>>;
  /** Requested generic node branches. */
  genericBranches: Array<HierarchySearchTree & { identifier: GenericNodeKey }>;
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

interface StandInParentNodeProps {
  /** The search tree branch whose node the stand-in replaces. */
  branch: HierarchySearchTree;
  /** Identifiers of the branch's ancestors, from the root. */
  ancestors: HierarchyNodeIdentifier[];
  /** Whether any of the branch's ancestors is a search target. */
  hasSearchTargetAncestor: boolean;
}

/**
 * Creates a parent node, that stands in for the actual parent node of a hierarchy level identified by the given search
 * tree branch and its ancestors. The definition adapter turns the node's keys back into a path of identifiers, and the
 * provider filters the hierarchy level to the children of the branch.
 *
 * The stand-in has the same search attributes as a provider with the search applied assigns to the actual parent node.
 * Branches with children are search targets only if they're flagged as such.
 */
function createStandInParentNode({
  branch,
  ancestors,
  hasSearchTargetAncestor,
}: StandInParentNodeProps): ParentHierarchyNode<NonGroupingHierarchyNode> {
  return {
    key: createNodeKey(branch.identifier),
    parentKeys: ancestors.map(createNodeKey),
    label: "",
    search: {
      ...(hasSearchTargetAncestor ? { hasSearchTargetAncestor } : {}),
      ...(branch.isTarget ? { isSearchTarget: true } : {}),
      childrenTargetPaths: branch.children,
      ...(branch.options ? { options: branch.options } : {}),
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
 * Resolves loaded search tree branches level by level, from the root down, and creates a nodes path for every search
 * target found in the hierarchy. Nodes of every branch are copied with ancestor keys of the actual hierarchy.
 *
 * Nodes are loaded with ancestor keys based on search path identifiers, which don't match the actual hierarchy (e.g.
 * class names may be more general, grouping node keys are missing). Branches that aren't loaded, and their
 * descendants, are skipped.
 */
function createNodesPaths({
  searchTree,
  loadedNodesByBranch,
}: {
  searchTree: HierarchySearchTree[];
  loadedNodesByBranch: Map<HierarchySearchTree, GroupedNode>;
}): HierarchyNode[][] {
  const nodesPaths = new Array<HierarchyNode[]>();
  const resolveChildren = (
    branches: HierarchySearchTree[],
    parent?: { node: GroupedNode["node"]; nodesPath: HierarchyNode[] },
  ) => {
    // sibling branches match the same loaded node when their identifiers differ only by class
    const branchesByLoadedNode = new Map<GroupedNode, HierarchySearchTree[]>();
    for (const branch of branches) {
      const loadedNode = loadedNodesByBranch.get(branch);
      if (loadedNode) {
        getOrCreate(branchesByLoadedNode, loadedNode, () => []).push(branch);
      }
    }
    for (const [loadedNode, matchingBranches] of branchesByLoadedNode) {
      const { node, groupingNodes } = resolveGroupedNode({ groupedNode: loadedNode, parentNode: parent?.node });
      // hidden nodes aren't in the hierarchy, and they aren't grouped
      const nodesPath = [...(parent?.nodesPath ?? []), ...(node.isHidden ? [] : [...groupingNodes, node])];
      if (node.search?.isSearchTarget && !node.isHidden) {
        nodesPaths.push(nodesPath);
      }
      for (const branch of matchingBranches) {
        if (branch.children) {
          resolveChildren(branch.children, { node, nodesPath });
        }
      }
    }
  };
  resolveChildren(searchTree);
  return nodesPaths;
}

/** Creates a copy of the given grouped node, with ancestor keys of the actual hierarchy. */
function resolveGroupedNode({
  groupedNode,
  parentNode,
}: {
  groupedNode: GroupedNode;
  parentNode: GroupedNode["node"] | undefined;
}): GroupedNode {
  const ancestorKeys = parentNode ? [...parentNode.parentKeys, parentNode.key] : [];
  // the hidden flag is internal, so it's removed from a hidden parent node before it's returned as `nonGroupingAncestor`
  // of grouping nodes - other parent nodes don't have the flag, and are returned as is, because they're in the path too
  const nonGroupingAncestor = parentNode?.isHidden ? withoutHiddenFlag(parentNode) : parentNode;
  // Nodes of this branch were requested with a stand-in parent node, created from the branch's search path, so their
  // `parentKeys` and grouping nodes' `nonGroupingAncestor` are based on search path identifiers: ancestor class names
  // may be base classes, and grouping and hidden nodes' keys may differ. Here they're replaced with the actual
  // ancestors - `ancestorKeys`, resolved from the parent branch, followed by keys of the branch's grouping nodes that
  // precede the node.
  const groupingNodes = groupedNode.groupingNodes.map((groupingNode, index): GroupingHierarchyNode => {
    const { nonGroupingAncestor: _, ...rest } = groupingNode;
    return {
      ...rest,
      parentKeys: [...ancestorKeys, ...groupedNode.groupingNodes.slice(0, index).map(({ key }) => key)],
      ...(nonGroupingAncestor ? { nonGroupingAncestor } : {}),
    };
  });
  return {
    node: { ...groupedNode.node, parentKeys: [...ancestorKeys, ...groupingNodes.map(({ key }) => key)] },
    groupingNodes,
  };
}

function withoutHiddenFlag({ isHidden: _, ...node }: GroupedNode["node"]): NonGroupingHierarchyNode {
  return node;
}

/**
 * Loads nodes for all given search tree branches. Nodes of every hierarchy level are requested concurrently.
 *
 * Emits a map from branches to their loaded nodes. Loaded nodes have ancestor keys based on search path identifiers.
 * Branches that aren't in the hierarchy are not in the map.
 */
function loadSearchTreeNodes({
  hierarchyProvider,
  imodelAccess,
  hierarchyLevelSizeLimit,
  searchTree,
}: {
  hierarchyProvider: Pick<HierarchyProvider, "getNodes">;
  imodelAccess: Pick<ECSchemaProvider, "classDerivesFrom">;
  hierarchyLevelSizeLimit: GetHierarchyNodesProps["hierarchyLevelSizeLimit"];
  searchTree: HierarchySearchTree[];
}): Observable<Map<HierarchySearchTree, GroupedNode>> {
  return defer(() => from(getRequestPropsForGetNodes(searchTree))).pipe(
    mergeMap((request) => {
      const requestProps = {
        parentNode: request.parentNode,
        ...(hierarchyLevelSizeLimit !== undefined ? { hierarchyLevelSizeLimit } : {}),
      };
      return from(hierarchyProvider.getNodes(requestProps)).pipe(
        map((node): GroupedNode<HierarchyNode> => ({ node, groupingNodes: [] })),
        // load nodes grouped under grouping nodes - children of grouping nodes are cached by the provider for the same
        // request props
        expand(({ node, groupingNodes }): Observable<GroupedNode<HierarchyNode>> =>
          HierarchyNode.isGroupingNode(node)
            ? from(hierarchyProvider.getNodes({ ...requestProps, parentNode: node })).pipe(
                map((childNode) => ({ node: childNode, groupingNodes: [...groupingNodes, node] })),
              )
            : EMPTY,
        ),
        mergeMap(({ node, groupingNodes }) =>
          HierarchyNode.isGroupingNode(node)
            ? EMPTY
            : matchBranches({ imodelAccess, request, loadedNode: { node, groupingNodes } }),
        ),
      );
    }),
    reduce((acc, { branch, loadedNode }) => acc.set(branch, loadedNode), new Map<HierarchySearchTree, GroupedNode>()),
  );
}

/** Finds the requested search tree branches that match the given loaded node. */
function matchBranches({
  imodelAccess,
  request,
  loadedNode,
}: {
  imodelAccess: Pick<ECSchemaProvider, "classDerivesFrom">;
  request: NodesRequest;
  loadedNode: GroupedNode;
}): Observable<{ branch: HierarchySearchTree; loadedNode: GroupedNode }> {
  const { key } = loadedNode.node;
  if (HierarchyNodeKey.isGeneric(key)) {
    return from(
      request.genericBranches
        .filter(({ identifier }) => identifier.id === key.id)
        .map((branch) => ({ branch, loadedNode })),
    );
  }
  return from(
    key.instanceKeys.flatMap((loadedKey) =>
      // the provider only loads instances of the requested branches
      request.instanceBranches
        .get(loadedKey.id)!
        .filter(({ identifier }) => !identifier.imodelKey || identifier.imodelKey === loadedKey.imodelKey)
        .map((branch) => ({ branch, loadedKey })),
    ),
  ).pipe(
    // instances of different classes may share IDs (e.g. a model and its modeled element), so in addition to
    // IDs, the loaded instance class has to match the search path class
    mergeMap(async ({ branch, loadedKey }) =>
      (await classesMatch({ imodelAccess, lhs: branch.identifier.className, rhs: loadedKey.className }))
        ? [{ branch, loadedNode }]
        : [],
    ),
    mergeAll(),
  );
}

/**
 * Creates hierarchy level requests for the given search tree - one for the root level and one for every branch with
 * children.
 */
function getRequestPropsForGetNodes(searchTree: HierarchySearchTree[]): NodesRequest[] {
  const requests = new Array<NodesRequest>();
  const addRequests = (branches: HierarchySearchTree[], parent?: StandInParentNodeProps) => {
    const instanceBranches: NodesRequest["instanceBranches"] = new Map();
    const genericBranches: NodesRequest["genericBranches"] = [];
    // loaded nodes are mapped to the branch objects, so they're not copied
    for (const branch of branches) {
      if (isInstanceNodeSearchTreeBranch(branch)) {
        getOrCreate(instanceBranches, branch.identifier.id, () => []).push(branch);
      } else {
        // If branch is not instances it must be a generic node branch
        genericBranches.push(branch as HierarchySearchTree & { identifier: GenericNodeKey });
      }
    }
    requests.push({
      parentNode: parent ? createStandInParentNode(parent) : undefined,
      instanceBranches,
      genericBranches,
    });
    for (const branch of branches) {
      if (branch.children) {
        addRequests(branch.children, {
          branch,
          ancestors: parent ? [...parent.ancestors, parent.branch.identifier] : [],
          hasSearchTargetAncestor: !!parent && (parent.hasSearchTargetAncestor || !!parent.branch.isTarget),
        });
      }
    }
  };
  if (searchTree.length > 0) {
    addRequests(searchTree);
  }
  return requests;
}

// This narrows the whole branch, so casting with `as` is not needed.
function isInstanceNodeSearchTreeBranch(
  branch: HierarchySearchTree,
): branch is HierarchySearchTree & { identifier: IModelInstanceKey } {
  return HierarchyNodeIdentifier.isInstanceNodeIdentifier(branch.identifier);
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
