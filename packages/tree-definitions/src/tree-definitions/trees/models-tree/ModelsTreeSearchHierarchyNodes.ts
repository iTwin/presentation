/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer, EMPTY, forkJoin, from, fromEvent, identity, map, mergeMap, of, reduce, takeUntil } from "rxjs";
import { HierarchyNode, HierarchyNodeKey, HierarchySearchTree } from "@itwin/presentation-hierarchies";
import { eachValueFrom } from "@itwin/presentation-shared";
import { CLASS_NAMES } from "../../shared/ClassNameDefinitions.js";
import { toObservable } from "../../shared/Rxjs.js";
import { getOrCreate } from "../../shared/Utils.js";
import { ModelsTreeNode } from "./ModelsTreeNode.js";

import type { Observable } from "rxjs";
import type { Id64String } from "@itwin/core-bentley";
import type { GenericInstanceFilter } from "@itwin/core-common";
import type {
  GetHierarchyNodesProps,
  GroupingHierarchyNode,
  HierarchyProvider,
  InstancesNodeKey,
  NonGroupingHierarchyNode,
} from "@itwin/presentation-hierarchies";
import type { InstanceKey } from "@itwin/presentation-shared";
import type {
  ClassGroupingHierarchyNode,
  ElementsGroupInfo,
  ModelsTreeSearchPath,
  ModelsTreeSearchPathKey,
  ModelsTreeSearchTree,
} from "./ModelsTreeDefinition.js";
import type { ModelsTreeIdsProvider } from "./ModelsTreeIdsProvider.js";

/**
 * An instance or grouping node in a models hierarchy search path. Label merging must be disabled in the hierarchy.
 * @alpha
 */
export type ModelsTreeHierarchyNode = (NonGroupingHierarchyNode & { key: InstancesNodeKey }) | GroupingHierarchyNode;

type ParentNode = GetHierarchyNodesProps["parentNode"];
/** Key of a search path entry, created by `createEntryKey` from the entry's path. */
type EntryKey = string;
interface LoadedInstanceNode {
  node: NonGroupingHierarchyNode & { key: InstancesNodeKey };
  /** Element class grouping node the instance node is grouped under. Models tree doesn't nest grouping nodes. */
  groupedByNode?: ClassGroupingHierarchyNode;
}
/** A "hidden" entry identifies a known hidden model, rather than a missing non-hidden ancestor. */
type LoadedNodes = Map<EntryKey, LoadedInstanceNode | "hidden">;

/** @internal */
export function createHierarchyNodePaths(props: {
  instanceKeyPaths: AsyncIterableIterator<{ path: ModelsTreeSearchPath; target: Id64String | ElementsGroupInfo }>;
  hierarchyProvider: HierarchyProvider;
  idsProvider: Pick<ModelsTreeIdsProvider, "getHiddenModelIds">;
  abortSignal?: AbortSignal;
}): AsyncIterableIterator<{ path: ModelsTreeHierarchyNode[]; target: Id64String | ElementsGroupInfo }> {
  return eachValueFrom(
    from(props.instanceKeyPaths).pipe(
      // merge paths into a tree, so that siblings can be requested together
      // and collect search paths
      reduce(
        (acc, instanceKeyPath) => {
          acc.builder.accept({ path: instanceKeyPath.path });
          acc.instanceKeyPaths.push(instanceKeyPath);
          return acc;
        },
        {
          builder: HierarchySearchTree.createBuilder(),
          instanceKeyPaths: new Array<{ path: ModelsTreeSearchPath; target: Id64String | ElementsGroupInfo }>(),
        },
      ),
      // load search tree nodes in a Map<key, HierarchyNode[]> structure
      // We can then take the search paths and map them to the loaded hierarchy nodes
      mergeMap(({ builder, instanceKeyPaths }) =>
        forkJoin({
          results: loadSearchTreeNodes({ ...props, searchTree: builder.getTree() as ModelsTreeSearchTree[] }),
          instanceKeyPaths: of(instanceKeyPaths),
        }),
      ),
      // Iterate over search paths and get corresponding hierarchy node paths
      mergeMap(({ results, instanceKeyPaths }) =>
        instanceKeyPaths.flatMap(({ path, target }) => {
          const nodesPath = createNodesPath({ path, results });
          return nodesPath ? [{ path: nodesPath, target }] : [];
        }),
      ),
      props.abortSignal ? takeUntil(fromEvent(props.abortSignal, "abort")) : identity,
    ),
  );
}

/**
 * Creates a path of loaded nodes for the given search path. Returns `undefined` if the path's target is not in the
 * hierarchy (e.g. it's a hidden model).
 */
function createNodesPath({
  path,
  results,
}: {
  path: ModelsTreeSearchPath;
  results: Map<EntryKey, LoadedInstanceNode>;
}): ModelsTreeHierarchyNode[] | undefined {
  let key: EntryKey | undefined;
  const loadedNodes = path.map((identifier) => {
    key = createEntryKey({ parentKey: key, identifier });
    return results.get(key);
  });
  // Path was empty or the target was missing (has hideNodeInHierarchy flag)
  // No need for this path
  if (path.length === 0 || loadedNodes[loadedNodes.length - 1] === undefined) {
    return undefined;
  }
  // Ancestor keys have already been adjusted when populating the node map.
  return loadedNodes.flatMap((loaded) =>
    loaded ? [...(loaded.groupedByNode ? [loaded.groupedByNode] : []), loaded.node] : [],
  );
}

/**
 * Indexes copies of loaded nodes with ancestor keys of the actual hierarchy into `results`, omitting missing non-hidden
 * branches.
 */
function populateAdjustedNodesMap({
  entries,
  loadedNodes,
  results,
  parentKey,
  ancestorKeys,
  parentNode,
}: {
  entries: ModelsTreeSearchTree[];
  loadedNodes: LoadedNodes;
  results: Map<EntryKey, LoadedInstanceNode>;
  /** Key of the parent entry's path. `undefined` for root entries. */
  parentKey?: EntryKey;
  ancestorKeys: HierarchyNodeKey[];
  parentNode?: LoadedInstanceNode["node"];
}): void {
  for (const entry of entries) {
    const key = createEntryKey({ parentKey, identifier: entry.identifier });
    const loadedNode = loadedNodes.get(key);
    if (loadedNode === undefined) {
      continue;
    }
    if (loadedNode === "hidden") {
      // the entry is hidden - its children take its place
      populateAdjustedNodesMap({
        entries: entry.children ?? [],
        loadedNodes,
        results,
        parentKey: key,
        ancestorKeys: [...ancestorKeys, createInstancesNodeKey(entry.identifier)],
      });
      continue;
    }
    const { groupedByNode } = loadedNode;
    // Created hierarchy nodes have parentKeys created based on search paths/tree.
    // Those keys use base classes; the loaded instance keys supply the actual ancestor classes.
    const node = createNodeWithAncestorKeys({ node: loadedNode.node, ancestorKeys });
    results.set(key, {
      node,
      ...(groupedByNode
        ? { groupedByNode: createGroupingNodeWithAncestors({ groupedByNode, ancestorKeys, parentNode }) }
        : {}),
    });
    populateAdjustedNodesMap({
      entries: entry.children ?? [],
      loadedNodes,
      results,
      parentKey: key,
      ancestorKeys: [...node.parentKeys, node.key],
      parentNode: node,
    });
  }
}

/** Creates a copy of the loaded grouping node with adjusted ancestor keys and non-grouping ancestor. */
function createGroupingNodeWithAncestors({
  groupedByNode,
  ancestorKeys,
  parentNode,
}: {
  groupedByNode: ClassGroupingHierarchyNode;
  ancestorKeys: HierarchyNodeKey[];
  parentNode?: LoadedInstanceNode["node"];
}): ClassGroupingHierarchyNode {
  const groupingNode = createNodeWithAncestorKeys({ node: groupedByNode, ancestorKeys });
  if (parentNode) {
    groupingNode.nonGroupingAncestor = parentNode;
  } else if (groupedByNode.nonGroupingAncestor) {
    // Hidden parents are not returned, but their request context is still needed to expand the group.
    groupingNode.nonGroupingAncestor = { ...groupedByNode.nonGroupingAncestor, parentKeys: ancestorKeys.slice(0, -1) };
  }
  return groupingNode;
}

/**
 * Loads nodes for all entries of the given search tree. Nodes of every hierarchy level are requested in parallel, and all
 * sibling entries of the same class are requested at once.
 *
 * Emits a map from entry keys to loaded instance nodes and their grouping nodes. Entries that aren't in the hierarchy
 * are not in the map. Reconstruction happens only after loading and does not serialize the requests.
 */
function loadSearchTreeNodes({
  searchTree,
  hierarchyProvider,
  idsProvider,
}: {
  searchTree: ModelsTreeSearchTree[];
  hierarchyProvider: HierarchyProvider;
  idsProvider: Pick<ModelsTreeIdsProvider, "getHiddenModelIds">;
}): Observable<Map<EntryKey, LoadedInstanceNode>> {
  if (!searchTree.length) {
    return of(new Map());
  }
  return defer(() => {
    const loadedNodes: LoadedNodes = new Map();
    return toObservable(idsProvider.getHiddenModelIds()).pipe(
      mergeMap((hiddenModelIds) => {
        // Accumulator collects minimal parent nodes and children identifiers
        // needed for creating getNodes requests
        const accumulator = createNodesRequestsAccumulator();
        accumulateNodesRequests({ searchTree, hiddenModelIds, accumulator, loadedNodes });
        // getRequests returns the request props needed for getNodes
        return from(accumulator.getRequests());
      }),
      // Use the getNodes request props to load InstanceNodes
      mergeMap((request) =>
        loadInstanceNodes({ hierarchyProvider, ...request }).pipe(map((loaded) => ({ loaded, request }))),
      ),
      reduce((acc, { loaded, request }) => {
        const { node } = loaded;
        // Node class name is the actual class of that node. Search paths use base classes,
        // need to create a key based on base class so lookup works correctly
        const className = getSearchPathClassName(node);
        const { id } = node.key.instanceKeys[0];
        if (request.ids.has(id)) {
          acc.set(
            createEntryKeyFromParentNode({ parentNode: request.parentNode, identifier: { className, id } }),
            loaded,
          );
        }
        return acc;
      }, loadedNodes),
      map((loaded) => {
        const nodes = new Map<EntryKey, LoadedInstanceNode>();
        populateAdjustedNodesMap({ entries: searchTree, loadedNodes: loaded, results: nodes, ancestorKeys: [] });
        return nodes;
      }),
    );
  });
}

/** A hierarchy level request for sibling search tree entries of the same class. */
interface NodesRequest {
  parentNode: ParentNode;
  instanceFilter: GenericInstanceFilter;
  /** Used to ignore unrelated instances promoted through hidden or grouping nodes. */
  ids: ReadonlySet<Id64String>;
}

/**
 * Information about ancestors of search tree entries, needed to create requests for these entries. Root entries have no
 * ancestors.
 */
interface SearchTreeEntryAncestors {
  /** Node to request the entries from. */
  minimalParentNode: NonNullable<ParentNode>;
  nearestAncestorModelId?: Id64String;
  nearestAncestorCategoryId?: Id64String;
  /** ID of the closest ancestor element, if there's no model entry between it and the entries. */
  nearestAncestorElementId?: Id64String;
}

/**
 * Creates an accumulator of hierarchy level requests. Entries that share the parent node and class are requested together,
 * in chunks of up to `MAX_REQUESTED_IDS_COUNT` entries.
 */
function createNodesRequestsAccumulator() {
  // all children of an entry share the same parent node object, so requests are grouped by it
  // the same parent node can have children of different classes, need to group by them as well
  const requests = new Map<
    NonNullable<ParentNode> | undefined,
    Map<ModelsTreeSearchPathKey["className"], Id64String[]>
  >();
  return {
    add({
      minimalParentNode,
      identifier,
    }: {
      minimalParentNode?: NonNullable<ParentNode>;
      identifier: ModelsTreeSearchPathKey;
    }) {
      const idsByClass = getOrCreate({
        map: requests,
        key: minimalParentNode,
        createFunc: () => new Map<ModelsTreeSearchPathKey["className"], Id64String[]>(),
      });
      getOrCreate({ map: idsByClass, key: identifier.className, createFunc: () => new Array<Id64String>() }).push(
        identifier.id,
      );
    },
    getRequests(): NodesRequest[] {
      const result = new Array<NodesRequest>();
      for (const [minimalParentNode, idsByClass] of requests) {
        for (const [className, ids] of idsByClass) {
          // instanceFilter joins multiple ids with OR,
          // need to split the ids into chunks of MAX_REQUESTED_IDS_COUNT
          for (let start = 0; start < ids.length; start += MAX_REQUESTED_IDS_COUNT) {
            const requestedIds =
              ids.length > MAX_REQUESTED_IDS_COUNT ? ids.slice(start, start + MAX_REQUESTED_IDS_COUNT) : ids;
            result.push({
              parentNode: minimalParentNode,
              ids: new Set(requestedIds),
              instanceFilter: createECInstanceIdsFilter({ className, ids: requestedIds }),
            });
          }
        }
      }
      return result;
    },
  };
}

/**
 * Adds hierarchy level requests for the given search tree entries and their descendants to the accumulator.
 *
 * Entries hidden in the hierarchy are not requested: sub-models are always hidden, and models hidden by partition content
 * properties are specified by `hiddenModelIds`. Instead, they're marked as hidden in `loadedNodes`, and their children
 * are requested as usual.
 */
function accumulateNodesRequests({
  searchTree,
  hiddenModelIds,
  ancestors,
  accumulator,
  loadedNodes,
  parentKey,
}: {
  searchTree: ModelsTreeSearchTree[];
  hiddenModelIds: ReadonlySet<Id64String>;
  ancestors?: SearchTreeEntryAncestors;
  accumulator: ReturnType<typeof createNodesRequestsAccumulator>;
  loadedNodes: LoadedNodes;
  parentKey?: EntryKey;
}) {
  for (const { identifier, children } of searchTree) {
    const key = createEntryKey({ parentKey, identifier });
    // For hidden models there is no need to send a request since the hidden nodes are
    // not returned by getNodes (instead it returns non hidden children of hidden nodes)
    const isHidden =
      identifier.className === CLASS_NAMES.GeometricModel3d &&
      (hiddenModelIds.has(identifier.id) || isSubModel({ modelId: identifier.id, ancestors }));
    if (isHidden) {
      loadedNodes.set(key, "hidden");
    } else {
      accumulator.add({ minimalParentNode: ancestors?.minimalParentNode, identifier });
    }
    if (children) {
      accumulateNodesRequests({
        searchTree: children,
        hiddenModelIds,
        ancestors: createChildrenAncestors({ identifier, ancestors }),
        accumulator,
        loadedNodes,
        parentKey: key,
      });
    }
  }
}

/** Creates ancestors information for children of the given entry. */
function createChildrenAncestors({
  identifier,
  ancestors,
}: {
  identifier: ModelsTreeSearchPathKey;
  ancestors?: SearchTreeEntryAncestors;
}): SearchTreeEntryAncestors {
  let nearestAncestorModelId = ancestors?.nearestAncestorModelId;
  let nearestAncestorCategoryId = ancestors?.nearestAncestorCategoryId;
  let nearestAncestorElementId = ancestors?.nearestAncestorElementId;
  switch (identifier.className) {
    case CLASS_NAMES.GeometricModel3d:
      nearestAncestorModelId = identifier.id;
      nearestAncestorElementId = undefined;
      break;
    case CLASS_NAMES.SpatialCategory:
      nearestAncestorCategoryId = identifier.id;
      break;
    case CLASS_NAMES.GeometricElement3d:
      nearestAncestorElementId = identifier.id;
      break;
  }
  return {
    minimalParentNode: createMinimalParentNode({ identifier, ancestors }),
    nearestAncestorModelId,
    nearestAncestorCategoryId,
    nearestAncestorElementId,
  };
}

/**
 * Maximum number of instance IDs in a single hierarchy level request. Every ID adds a term to the query's `OR` expression,
 * so the number is limited to keep queries within SQLite expression depth limits.
 */
const MAX_REQUESTED_IDS_COUNT = 100;

/** Creates a key of a search path entry, given the key of its parent entry's path. */
function createEntryKey({
  parentKey,
  identifier,
}: {
  /** Key of the parent entry's path. `undefined` for root entries. */
  parentKey?: EntryKey;
  identifier: InstanceKey;
}): EntryKey {
  const entryKey = `${identifier.className}:${identifier.id}`;
  return parentKey ? `${parentKey}/${entryKey}` : entryKey;
}

/**
 * Creates an entry key of a loaded node from the request's parent node and the search path class name and ID of the
 * instance the node represents.
 *
 * Parent nodes used for requests are created from search path entries, so their instance keys have search path class
 * names. Use the request's parent rather than returned node ancestry, which grouping and hiding may change.
 */
function createEntryKeyFromParentNode({
  parentNode,
  identifier,
}: {
  parentNode: ParentNode;
  identifier: InstanceKey;
}): EntryKey {
  const parentKey = (parentNode ? [...parentNode.parentKeys, parentNode.key] : [])
    .filter((key) => HierarchyNodeKey.isInstances(key))
    .reduce<EntryKey | undefined>(
      (key, { instanceKeys }) => createEntryKey({ parentKey: key, identifier: instanceKeys[0] }),
      undefined,
    );
  return createEntryKey({ parentKey, identifier });
}

const SEARCH_PATH_CLASS_NAMES = {
  subject: CLASS_NAMES.Subject,
  model: CLASS_NAMES.GeometricModel3d,
  category: CLASS_NAMES.SpatialCategory,
  element: CLASS_NAMES.GeometricElement3d,
} as const;

/**
 * Returns the search path class name of the instance represented by the given loaded node. Node keys have actual class
 * names of instances, while search path entries have base class names.
 */
function getSearchPathClassName(node: LoadedInstanceNode["node"]): ModelsTreeSearchPathKey["className"] {
  const type = ModelsTreeNode.getType(node);
  if (type === undefined || type === "elements-class-group") {
    throw new Error("Expected a subject, model, category or element node");
  }
  return SEARCH_PATH_CLASS_NAMES[type];
}

/** Returns keys of grouping nodes that the given loaded node is grouped under. */
function getGroupingNodeKeys(node: ModelsTreeHierarchyNode) {
  return node.parentKeys.filter((key) => !HierarchyNodeKey.isInstances(key));
}

/**
 * Parent nodes used for requests are built from search path keys, so their keys don't match the actual hierarchy
 * node keys (e.g. class names are more general, grouping node keys are missing). This replaces `parentKeys` of the loaded
 * node with keys of the actual ancestors.
 */
function createNodeWithAncestorKeys<TNode extends ModelsTreeHierarchyNode>({
  node,
  ancestorKeys,
}: {
  node: TNode;
  ancestorKeys: HierarchyNodeKey[];
}): TNode {
  return { ...node, parentKeys: [...ancestorKeys, ...getGroupingNodeKeys(node)] };
}

/**
 * Loads instance nodes of the hierarchy level of `parentNode` together with their class grouping nodes.
 * Nodes grouped under class grouping nodes are loaded by requesting children of those grouping nodes. Models tree
 * doesn't nest grouping nodes, so other kinds of nodes are ignored.
 */
function loadInstanceNodes(
  props: NodesRequest & { hierarchyProvider: HierarchyProvider },
  groupedByNode?: ClassGroupingHierarchyNode,
): Observable<LoadedInstanceNode> {
  const { hierarchyProvider, parentNode, instanceFilter } = props;
  return defer(() => from(hierarchyProvider.getNodes({ parentNode, instanceFilter }))).pipe(
    mergeMap((node) => {
      if (HierarchyNode.isInstancesNode(node)) {
        return of(groupedByNode ? { node, groupedByNode } : { node });
      }
      return HierarchyNode.isClassGroupingNode(node) && node.groupedInstanceKeys.some(({ id }) => props.ids.has(id))
        ? loadInstanceNodes({ ...props, parentNode: node }, node)
        : EMPTY;
    }),
  );
}

function createECInstanceIdsFilter({
  className,
  ids,
}: {
  className: ModelsTreeSearchPathKey["className"];
  ids: Id64String[];
}): GenericInstanceFilter {
  const rules = ids.map((id) => ({
    sourceAlias: "this",
    propertyName: "ECInstanceId",
    operator: "is-equal" as const,
    propertyTypeName: "long",
    value: { rawValue: id, displayValue: id },
  }));
  return {
    propertyClassNames: [className],
    relatedInstances: [],
    rules: rules.length === 1 ? rules[0] : { operator: "or", rules },
  };
}

function createInstancesNodeKey(key: ModelsTreeSearchPathKey): InstancesNodeKey {
  return { type: "instances", instanceKeys: [{ className: key.className, id: key.id }] };
}

/** Sub-models follow their modeled element in search paths and have the same ID as the element. */
function isSubModel({ modelId, ancestors }: { modelId: Id64String; ancestors?: SearchTreeEntryAncestors }) {
  return modelId === ancestors?.nearestAncestorElementId;
}

/**
 * Creates a parent node with the same key and extended data, that models tree hierarchy definition expects from
 * a node representing the given search tree entry.
 */
function createMinimalParentNode({
  identifier,
  ancestors,
}: {
  identifier: ModelsTreeSearchPathKey;
  ancestors?: SearchTreeEntryAncestors;
}): NonNullable<ParentNode> {
  const parentNodeBase = {
    key: createInstancesNodeKey(identifier),
    parentKeys: ancestors ? [...ancestors.minimalParentNode.parentKeys, ancestors.minimalParentNode.key] : [],
    label: "",
  };
  const nearestAncestorModelId = ancestors?.nearestAncestorModelId;
  const nearestAncestorElementId = ancestors?.nearestAncestorElementId;
  const nearestAncestorCategoryId = ancestors?.nearestAncestorCategoryId;
  switch (identifier.className) {
    case CLASS_NAMES.Subject:
      return { ...parentNodeBase, extendedData: { type: "subject" } };
    case CLASS_NAMES.GeometricModel3d:
      return {
        ...parentNodeBase,
        extendedData: {
          type: "model",
          ...(isSubModel({ modelId: identifier.id, ancestors })
            ? { subModeledElementCategory: nearestAncestorCategoryId }
            : {}),
        },
      };
    case CLASS_NAMES.SpatialCategory:
      if (nearestAncestorModelId === undefined) {
        throw new Error("SpatialCategory must have a nearest ancestor model ID");
      }
      return {
        ...parentNodeBase,
        extendedData: {
          type: "category",
          modelIds: [nearestAncestorModelId],
          ...(nearestAncestorElementId ? { parentElementIds: [nearestAncestorElementId] } : {}),
        },
      };
    case CLASS_NAMES.GeometricElement3d:
      if (nearestAncestorModelId === undefined || nearestAncestorCategoryId === undefined) {
        throw new Error("GeometricElement3d must have nearest ancestor model and category IDs");
      }
      return {
        ...parentNodeBase,
        extendedData: { type: "element", modelId: nearestAncestorModelId, categoryId: nearestAncestorCategoryId },
      };
  }
}
