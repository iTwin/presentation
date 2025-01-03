/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState } from "react";
import { GenericInstanceFilter, getLogger, HierarchyFilteringPath, HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { InstanceKey, IPrimitiveValueFormatter } from "@itwin/presentation-shared";
import { TreeActions } from "./internal/TreeActions.js";
import { isTreeModelHierarchyNode, isTreeModelInfoNode, TreeModel, TreeModelHierarchyNode, TreeModelNode, TreeModelRootNode } from "./internal/TreeModel.js";
import { useUnifiedTreeSelection, UseUnifiedTreeSelectionProps } from "./internal/UseUnifiedSelection.js";
import { safeDispose } from "./internal/Utils.js";
import { PresentationHierarchyNode, PresentationTreeNode } from "./TreeNode.js";
import { SelectionChangeType } from "./UseSelectionHandler.js";

/**
 * A data structure that contains information about a single hierarchy level.
 * @public
 */
export interface HierarchyLevelDetails {
  /** The parent node whose hierarchy level's information is contained in this data structure */
  hierarchyNode: HierarchyNode | undefined;

  /** A function to get instance keys of the hierarchy level. */
  getInstanceKeysIterator: (props?: {
    instanceFilter?: GenericInstanceFilter;
    hierarchyLevelSizeLimit?: number | "unbounded";
  }) => AsyncIterableIterator<InstanceKey>;

  /** Get the limit of how many nodes can be loaded in this hierarchy level. */
  sizeLimit?: number | "unbounded";
  /** Set the limit of how many nodes can be loaded in this hierarchy level. */
  setSizeLimit: (value: undefined | number | "unbounded") => void;

  /** Get the active instance filter applied to this hierarchy level. */
  instanceFilter?: GenericInstanceFilter;
  /** Set the instance filter to apply to this hierarchy level */
  setInstanceFilter: (filter: GenericInstanceFilter | undefined) => void;
}

/**
 * A React hook that creates state for a tree component.
 *
 * The hook uses `@itwin/presentation-hierarchies` package to load the hierarchy data and returns a
 * component-agnostic result which may be used to render the hierarchy using any UI framework.
 *
 * See `README.md` for an example
 *
 * @see `useUnifiedSelectionTree`
 * @see `useIModelTree`
 * @public
 */
export function useTree(props: UseTreeProps): UseTreeResult {
  const { getTreeModelNode: _, ...rest } = useTreeInternal(props);
  return rest;
}

/**
 * A React hook that creates state for a tree component, that is integrated with unified selection
 * through context provided by `UnifiedSelectionProvider`.
 *
 * The hook uses `@itwin/presentation-hierarchies` package to load the hierarchy data and returns a
 * component-agnostic result which may be used to render the hierarchy using any UI framework.
 *
 * See `README.md` for an example
 *
 * @see `useTree`
 * @see `useIModelUnifiedSelectionTree`
 * @see `UnifiedSelectionProvider`
 * @public
 */
export function useUnifiedSelectionTree({ sourceName, ...props }: UseTreeProps & UseUnifiedTreeSelectionProps): UseTreeResult {
  const { getTreeModelNode, ...rest } = useTreeInternal(props);
  return {
    ...rest,
    ...useUnifiedTreeSelection({ sourceName, getTreeModelNode }),
  };
}

/** @public */
export interface UseTreeProps {
  /** Provides the hierarchy provider for the tree. */
  getHierarchyProvider: () => HierarchyProvider;
  /** Provides paths to filtered nodes. */
  getFilteredPaths?: () => Promise<HierarchyFilteringPath[] | undefined>;
  /**
   * Callback that is called just after a certain action is finished.
   * Can be used for performance tracking.
   */
  onPerformanceMeasured?: (action: "initial-load" | "hierarchy-level-load" | "reload", duration: number) => void;
  /** Action to perform when hierarchy level contains more items that the specified limit. */
  onHierarchyLimitExceeded?: (props: { parentId?: string; filter?: GenericInstanceFilter; limit?: number | "unbounded" }) => void;
  /** Action to perform when an error occurs while loading hierarchy. */
  onHierarchyLoadError?: (props: { parentId?: string; type: "timeout" | "unknown"; error: any }) => void;
}

/**
 * Options for doing either full or a sub tree reload.
 * @public
 */
interface ReloadTreeOptions {
  /** Specifies parent node under which sub tree should be reloaded. */
  parentNodeId: string | undefined;

  /**
   * Specifies how current tree state should be handled:
   * - `keep` - try to keep current tree state (expanded/collapsed nodes, instance filters, etc.).
   * - `discard` - do not try to keep current tree state. Tree model will be update after nodes are reloaded.
   * - `reset` - remove subtree from the model before reloading and reload nodes ignoring cache.
   *
   * Defaults to `"keep"`.
   */
  state?: "keep" | "discard" | "reset";
}

/** @public */
export interface UseTreeResult {
  /**
   * Array containing root tree nodes. It is `undefined` on initial render until any nodes are loaded.
   */
  rootNodes: PresentationTreeNode[] | undefined;
  /**
   * Specifies whether tree is loading or not. It is set to `true` when initial tree load is in progress
   * or tree is reloading.
   */
  isLoading: boolean;
  /**
   * A function that should be called to reload the tree.
   */
  reloadTree: (options?: ReloadTreeOptions) => void;
  /**
   * A function that should be called to either expand or collapse the given node.
   */
  expandNode: (nodeId: string, isExpanded: boolean) => void;
  /**
   * A function that should be called to select nodes in the tree.
   * @param nodeIds Ids of the nodes that are selected.
   * @param changeType Type of change that occurred for the selection.
   */
  selectNodes: (nodeIds: Array<string>, changeType: SelectionChangeType) => void;
  /** Determines whether a given node is selected. */
  isNodeSelected: (nodeId: string) => boolean;
  /** Get a tree node by id */
  getNode: (nodeId: string) => PresentationHierarchyNode | undefined;
  /** Returns hierarchy level details for a given node ID. */
  getHierarchyLevelDetails: (nodeId: string | undefined) => HierarchyLevelDetails | undefined;
  /** Sets a formatter for the primitive values that are displayed in the hierarchy. */
  setFormatter: (formatter: IPrimitiveValueFormatter | undefined) => void;
}

interface TreeState {
  model: TreeModel;
  rootNodes: Array<PresentationTreeNode> | undefined;
}

function useTreeInternal({
  getHierarchyProvider,
  getFilteredPaths,
  onPerformanceMeasured,
  onHierarchyLimitExceeded,
  onHierarchyLoadError,
}: UseTreeProps): UseTreeResult & {
  getTreeModelNode: (nodeId: string) => TreeModelRootNode | TreeModelNode | undefined;
} {
  const [state, setState] = useState<TreeState>({
    model: { idToNode: new Map(), parentChildMap: new Map(), rootNode: { id: undefined, nodeData: undefined } },
    rootNodes: undefined,
  });
  const onPerformanceMeasuredRef = useLatest(onPerformanceMeasured);
  const onHierarchyLimitExceededRef = useLatest(onHierarchyLimitExceeded);
  const defaultOnHierarchyLoadError = (props: { parentId?: string; type: "timeout" | "unknown"; error: any }) => {
    getLogger().logWarning("Hierarch load error", props.error);
  };
  const onHierarchyLoadErrorRef = useLatest(onHierarchyLoadError ?? defaultOnHierarchyLoadError);

  const [actions] = useState<TreeActions>(
    () =>
      new TreeActions(
        (model) => {
          const rootNodes = model.parentChildMap.get(undefined) !== undefined ? generateTreeStructure(undefined, model) : undefined;
          setState({
            model,
            rootNodes,
          });
        },
        (actionType, duration) => onPerformanceMeasuredRef.current?.(actionType, duration),
        (props) => onHierarchyLimitExceededRef.current?.(props),
        (props) => onHierarchyLoadErrorRef.current?.(props),
      ),
  );
  const currentFormatter = useRef<IPrimitiveValueFormatter>();

  const [hierarchyProvider, setHierarchyProvider] = useState<HierarchyProvider | undefined>();
  useEffect(() => {
    const provider = getHierarchyProvider();
    provider.setFormatter(currentFormatter.current);
    const removeHierarchyChangedListener = provider.hierarchyChanged.addListener((hierarchyChangeArgs) => {
      const shouldDiscardState = hierarchyChangeArgs?.filterChange?.newFilter !== undefined;
      actions.reloadTree({ state: shouldDiscardState ? "discard" : "keep" });
    });
    actions.setHierarchyProvider(provider);
    setHierarchyProvider(provider);
    return () => {
      removeHierarchyChangedListener();
      actions.reset();
      safeDispose(provider);
    };
  }, [actions, getHierarchyProvider]);

  const [isFiltering, setIsFiltering] = useState(false);
  useEffect(() => {
    let disposed = false;
    void (async () => {
      if (!getFilteredPaths || !hierarchyProvider) {
        hierarchyProvider?.setHierarchyFilter(undefined);
        setIsFiltering(false);
        return;
      }

      setIsFiltering(true);
      let paths: HierarchyFilteringPath[] | undefined;
      try {
        paths = await getFilteredPaths();
      } catch {
      } finally {
        if (!disposed) {
          hierarchyProvider.setHierarchyFilter(paths ? { paths } : undefined);
          setIsFiltering(false);
        }
      }
    })();
    return () => {
      disposed = true;
    };
  }, [hierarchyProvider, getFilteredPaths]);

  const getTreeModelNode = useCallback<(nodeId: string) => TreeModelRootNode | TreeModelNode | undefined>(
    (nodeId: string) => {
      return actions.getNode(nodeId);
    },
    [actions],
  );

  const getNode = useCallback(
    (nodeId: string): PresentationHierarchyNode | undefined => {
      const node = actions.getNode(nodeId);
      if (!node || !isTreeModelHierarchyNode(node)) {
        return undefined;
      }
      return createPresentationHierarchyNode(node, state.model);
    },
    [actions, state.model],
  );

  const expandNode = useCallback<UseTreeResult["expandNode"]>(
    (nodeId: string, isExpanded: boolean) => {
      actions.expandNode(nodeId, isExpanded);
    },
    [actions],
  );

  const reloadTree = useCallback<UseTreeResult["reloadTree"]>(
    (options) => {
      actions.reloadTree(options);
    },
    [actions],
  );

  const selectNodes = useCallback<UseTreeResult["selectNodes"]>(
    (nodeIds: Array<string>, changeType: SelectionChangeType) => {
      actions.selectNodes(nodeIds, changeType);
    },
    [actions],
  );

  const isNodeSelected = useCallback<UseTreeResult["isNodeSelected"]>((nodeId: string) => TreeModel.isNodeSelected(state.model, nodeId), [state]);

  const setFormatter = useCallback<UseTreeResult["setFormatter"]>(
    (formatter: IPrimitiveValueFormatter | undefined) => {
      currentFormatter.current = formatter;
      /* c8 ignore next 3 */
      if (!hierarchyProvider) {
        return;
      }

      hierarchyProvider.setFormatter(formatter);
    },
    [hierarchyProvider],
  );

  const getHierarchyLevelDetails = useCallback<UseTreeResult["getHierarchyLevelDetails"]>(
    (nodeId) => {
      const node = actions.getNode(nodeId);
      if (!hierarchyProvider || !node || isTreeModelInfoNode(node)) {
        return undefined;
      }
      const hierarchyNode = node.nodeData;
      if (hierarchyNode && HierarchyNode.isGroupingNode(hierarchyNode)) {
        return undefined;
      }

      return {
        hierarchyNode,
        getInstanceKeysIterator: (props) =>
          hierarchyProvider.getNodeInstanceKeys({
            parentNode: hierarchyNode,
            instanceFilter: props?.instanceFilter,
            hierarchyLevelSizeLimit: props?.hierarchyLevelSizeLimit,
          }),
        instanceFilter: node.instanceFilter,
        setInstanceFilter: (filter) => actions.setInstanceFilter(nodeId, filter),
        sizeLimit: node.hierarchyLimit,
        setSizeLimit: (value) => actions.setHierarchyLimit(nodeId, value),
      };
    },
    [actions, hierarchyProvider],
  );

  return {
    rootNodes: state.rootNodes,
    isLoading: !!state.model.rootNode.isLoading || isFiltering,
    expandNode,
    reloadTree,
    selectNodes,
    isNodeSelected,
    getTreeModelNode,
    getNode,
    getHierarchyLevelDetails,
    setFormatter,
  };
}

function generateTreeStructure(parentNodeId: string | undefined, model: TreeModel): Array<PresentationTreeNode> | undefined {
  const currentChildren = model.parentChildMap.get(parentNodeId);
  if (!currentChildren) {
    return undefined;
  }

  return currentChildren
    .map((childId) => model.idToNode.get(childId))
    .filter((node): node is TreeModelNode => !!node)
    .map<PresentationTreeNode>((node) => {
      if (isTreeModelHierarchyNode(node)) {
        return createPresentationHierarchyNode(node, model);
      }

      if (node.type === "ResultSetTooLarge") {
        return {
          id: node.id,
          parentNodeId,
          type: node.type,
          resultSetSizeLimit: node.resultSetSizeLimit,
        };
      }

      if (node.type === "NoFilterMatches") {
        return {
          id: node.id,
          parentNodeId,
          type: node.type,
        };
      }

      return {
        id: node.id,
        parentNodeId,
        type: node.type,
        message: node.message,
      };
    });
}

function createPresentationHierarchyNode(modelNode: TreeModelHierarchyNode, model: TreeModel): PresentationHierarchyNode {
  let children: Array<PresentationTreeNode> | undefined;
  return {
    ...toPresentationHierarchyNodeBase(modelNode),
    get children() {
      if (!children) {
        children = generateTreeStructure(modelNode.id, model);
      }
      return children ? children : modelNode.children === true ? true : [];
    },
  };
}

function toPresentationHierarchyNodeBase(node: TreeModelHierarchyNode): Omit<PresentationHierarchyNode, "children"> {
  return {
    id: node.id,
    label: node.label,
    nodeData: node.nodeData,
    isLoading: !!node.isLoading,
    isExpanded: !!node.isExpanded,
    isFilterable: !HierarchyNode.isGroupingNode(node.nodeData) && !!node.nodeData.supportsFiltering && node.children,
    isFiltered: !!node.instanceFilter,
    extendedData: node.nodeData.extendedData,
  };
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}
