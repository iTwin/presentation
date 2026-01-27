/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HierarchyNode } from "@itwin/presentation-hierarchies";
import { TreeActions } from "./internal/TreeActions.js";
import { TreeModel } from "./internal/TreeModel.js";
import { useUnifiedTreeSelection } from "./internal/UseUnifiedSelection.js";
import { safeDispose } from "./internal/Utils.js";
import { useLatest } from "./Utils.js";

import type { GenericInstanceFilter, HierarchyProvider, HierarchySearchPath } from "@itwin/presentation-hierarchies";
import type { IPrimitiveValueFormatter } from "@itwin/presentation-shared";
import type { TreeModelHierarchyNode, TreeModelRootNode } from "./internal/TreeModel.js";
import type { UseUnifiedTreeSelectionProps } from "./internal/UseUnifiedSelection.js";
import type { RootErrorRendererProps, TreeRendererProps } from "./Renderers.js";
import type { TreeNode } from "./TreeNode.js";
import type { SelectionChangeType } from "./UseSelectionHandler.js";

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
 * through the given selection storage (previously the storage was provided through the, now
 * deprecated, `UnifiedSelectionProvider`).
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
export function useUnifiedSelectionTree({
  sourceName,
  selectionStorage,
  createSelectableForGenericNode,
  ...props
}: UseTreeProps & UseUnifiedTreeSelectionProps): UseTreeResult {
  const { getTreeModelNode, ...rest } = useTreeInternal(props);
  const selectionProps = useUnifiedTreeSelection({ sourceName, selectionStorage, getTreeModelNode, createSelectableForGenericNode });
  if (rest.rootErrorRendererProps === undefined && rest.treeRendererProps?.rootNodes) {
    return {
      ...rest,
      treeRendererProps: {
        ...rest.treeRendererProps,
        ...selectionProps,
      },
    };
  }
  return rest;
}

/** @public */
export interface UseTreeProps {
  /** Provides the hierarchy provider for the tree. */
  getHierarchyProvider: () => HierarchyProvider;
  /** Provides paths to search nodes. */
  getSearchPaths?: ({ abortSignal }: { abortSignal: AbortSignal }) => Promise<HierarchySearchPath[] | undefined>;
  /**
   * Callback that is called just after a certain action is finished.
   * Can be used for performance tracking.
   */
  onPerformanceMeasured?: (action: "initial-load" | "hierarchy-level-load" | "reload", duration: number) => void;
  /** Action to perform when hierarchy level contains more items that the specified limit. */
  onHierarchyLimitExceeded?: (props: { parentId?: string; filter?: GenericInstanceFilter; limit?: number | "unbounded" }) => void;
  /** Action to perform when an error occurs while loading hierarchy. */
  onHierarchyLoadError?: (props: { parentId?: string; type: "timeout" | "unknown"; error: unknown }) => void;
}

/** @public */
export type UseTreeResult = {
  /**
   * Specifies whether tree is reloading or not. It is set to `false` when initial tree load is in progress to check if
   * or tree is reloading.
   */
  isReloading: boolean;
  /** Get a tree node by id */
  getNode: (nodeId: string) => TreeNode | undefined;
  /** Sets a formatter for the primitive values that are displayed in the hierarchy. */
  setFormatter: (formatter: IPrimitiveValueFormatter | undefined) => void;
} & RendererProps;

/**.
 * @alpha
 */
type RendererProps =
  | {
      /**
       * An object containing information used to render root error handling UI.
       * Use in combination with `RootErrorRenderer` or your custom implementation.
       * Defined when root nodes fail to load.
       */
      rootErrorRendererProps: RootErrorRendererProps;
    }
  | {
      /** Is undefined when rootNodes where successfully loaded or are in initial loading process */
      rootErrorRendererProps: undefined;
      /**
       * An object containing information used to render tree.
       * Use with `TreeRenderer` or your custom implementation.
       * Is undefined on initial loading process.
       */
      treeRendererProps?: TreeRendererProps;
    };

interface TreeState {
  model: TreeModel;
  rootNodes: Array<TreeNode> | undefined;
}

function useTreeInternal({
  getHierarchyProvider,
  getSearchPaths,
  onPerformanceMeasured,
  onHierarchyLimitExceeded,
  onHierarchyLoadError,
}: UseTreeProps): UseTreeResult & {
  getTreeModelNode: (nodeId: string) => TreeModelRootNode | TreeModelHierarchyNode | undefined;
} {
  const [state, setState] = useState<TreeState>({
    model: { idToNode: new Map(), parentChildMap: new Map(), rootNode: { id: undefined, nodeData: undefined } },
    rootNodes: undefined,
  });
  const onPerformanceMeasuredRef = useLatest(onPerformanceMeasured);
  const onHierarchyLimitExceededRef = useLatest(onHierarchyLimitExceeded);
  const onHierarchyLoadErrorRef = useLatest(onHierarchyLoadError);

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
      const shouldDiscardState = hierarchyChangeArgs?.searchChange?.newSearch !== undefined;
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

  const [isSearching, setIsSearching] = useState(false);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    void (async () => {
      if (!hierarchyProvider) {
        return;
      }

      if (!getSearchPaths) {
        hierarchyProvider.setHierarchySearch(undefined);
        // reload tree in case hierarchy provider does not use hierarchy search to load initial nodes
        actions.reloadTree({ state: "keep" });
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      let paths: HierarchySearchPath[] | undefined;
      try {
        paths = await getSearchPaths({ abortSignal: controller.signal });
      } catch {
      } finally {
        if (!disposed) {
          hierarchyProvider.setHierarchySearch(paths ? { paths } : undefined);
          setIsSearching(false);
        }
      }
    })();
    return () => {
      controller.abort();
      disposed = true;
    };
  }, [hierarchyProvider, getSearchPaths, actions]);

  const getTreeModelNode = useCallback<(nodeId: string) => TreeModelRootNode | TreeModelHierarchyNode | undefined>(
    (nodeId: string) => {
      return actions.getNode(nodeId);
    },
    [actions],
  );

  const getNode = useCallback(
    (nodeId: string): TreeNode | undefined => {
      const node = actions.getNode(nodeId);
      if (!node || node.id === undefined) {
        return undefined;
      }
      return createTreeNode(node, state.model);
    },
    [actions, state.model],
  );

  const expandNode = useCallback<TreeRendererProps["expandNode"]>(
    (nodeId: string, isExpanded: boolean) => {
      actions.expandNode(nodeId, isExpanded);
    },
    [actions],
  );

  const reloadTree = useCallback<TreeRendererProps["reloadTree"]>(
    (options) => {
      actions.reloadTree(options);
    },
    [actions],
  );

  const selectNodes = useCallback<TreeRendererProps["selectNodes"]>(
    (nodeIds: Array<string>, changeType: SelectionChangeType) => {
      actions.selectNodes(nodeIds, changeType);
    },
    [actions],
  );

  const isNodeSelected = useCallback<TreeRendererProps["isNodeSelected"]>((nodeId: string) => TreeModel.isNodeSelected(state.model, nodeId), [state]);

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

  const getHierarchyLevelDetails = useCallback<TreeRendererProps["getHierarchyLevelDetails"]>(
    (nodeId) => {
      const node = actions.getNode(nodeId);
      if (!hierarchyProvider || !node) {
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

  const renderProps: RendererProps = useMemo(() => {
    if (state.model.rootNode.error) {
      return {
        rootErrorRendererProps: {
          error: state.model.rootNode.error,
          reloadTree,
          getHierarchyLevelDetails,
        },
      };
    }
    return {
      rootErrorRendererProps: undefined,
      treeRendererProps: state.rootNodes
        ? {
            rootNodes: state.rootNodes,
            expandNode,
            selectNodes,
            isNodeSelected,
            reloadTree,
            getHierarchyLevelDetails,
          }
        : undefined,
    };
  }, [expandNode, getHierarchyLevelDetails, isNodeSelected, reloadTree, selectNodes, state.model.rootNode.error, state.rootNodes]);

  return {
    ...renderProps,
    isReloading: !!state.model.rootNode.isLoading || isSearching,
    getTreeModelNode,
    getNode,
    setFormatter,
  };
}

function generateTreeStructure(parentNodeId: string | undefined, model: TreeModel): Array<TreeNode> | undefined {
  const currentChildren = model.parentChildMap.get(parentNodeId);
  if (!currentChildren) {
    return undefined;
  }

  return currentChildren
    .map((childId) => model.idToNode.get(childId))
    .filter((node): node is TreeModelHierarchyNode => !!node)
    .map<TreeNode>((node) => {
      return createTreeNode(node, model);
    });
}

function createTreeNode(modelNode: TreeModelHierarchyNode, model: TreeModel): TreeNode {
  let children: Array<TreeNode> | undefined;
  return {
    ...toTreeNodeBase(modelNode),
    get children() {
      if (!children) {
        children = generateTreeStructure(modelNode.id, model);
      }
      return children ? children : modelNode.children === true ? true : [];
    },
  };
}

function toTreeNodeBase(node: TreeModelHierarchyNode): Omit<TreeNode, "children"> {
  return {
    id: node.id,
    label: node.label,
    nodeData: node.nodeData,
    isLoading: !!node.isLoading,
    isExpanded: !!node.isExpanded,
    isFilterable: !HierarchyNode.isGroupingNode(node.nodeData) && !!node.nodeData.supportsFiltering && node.children,
    isFiltered: !!node.instanceFilter,
    error: node.error,
  };
}
