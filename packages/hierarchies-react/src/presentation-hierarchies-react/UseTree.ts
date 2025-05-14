/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GenericInstanceFilter, HierarchyFilteringPath, HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { InstanceKey, IPrimitiveValueFormatter } from "@itwin/presentation-shared";
import { TreeActions } from "./internal/TreeActions.js";
import { TreeModel, TreeModelHierarchyNode, TreeModelRootNode } from "./internal/TreeModel.js";
import { useUnifiedTreeSelection, UseUnifiedTreeSelectionProps } from "./internal/UseUnifiedSelection.js";
import { safeDispose } from "./internal/Utils.js";
import { ErrorInfo, PresentationHierarchyNode } from "./TreeNode.js";
import { SelectionChangeType } from "./UseSelectionHandler.js";
import { useLatest } from "./Utils.js";

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
export function useUnifiedSelectionTree({ sourceName, selectionStorage, ...props }: UseTreeProps & UseUnifiedTreeSelectionProps): UseTreeResult {
  const { getTreeModelNode, ...rest } = useTreeInternal(props);
  return {
    ...rest,
    ...useUnifiedTreeSelection({ sourceName, selectionStorage, getTreeModelNode }),
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
  onHierarchyLoadError?: (props: { parentId?: string; type: "timeout" | "unknown"; error: unknown }) => void;
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
export type UseTreeResult = {
  /**
   * Specifies whether tree is reloading or not. It is set to `false` when initial tree load is in progress to check if
   * or tree is reloading.
   */
  isReloading: boolean;
  /** Get a tree node by id */
  getNode: (nodeId: string) => PresentationHierarchyNode | undefined;
  /** Sets a formatter for the primitive values that are displayed in the hierarchy. */
  setFormatter: (formatter: IPrimitiveValueFormatter | undefined) => void;
  /**
   * A function that should be called to reload the tree.
   */
  reloadTree: (options?: ReloadTreeOptions) => void;
  /** Returns hierarchy level details for a given node ID. */
  getHierarchyLevelDetails: (nodeId: string | undefined) => HierarchyLevelDetails | undefined;
} & RenderProps;

export type RenderProps =
  | {
      rootErrorRenderProps: {
        /** An error object which is defined when root nodes fail to load. */
        rootError: ErrorInfo;
      };
    }
  | {
      /** Defined as undefined when rootNodes where sucessfully loaded or are in initial loading process */
      rootErrorRenderProps: undefined;
      /** An object containing information used to render tree. Is undefined on initial loading process. */
      treeRenderProps?: TreeRenderProps;
    };

export interface TreeRenderProps {
  /**
   * Array containing root tree nodes. It is `undefined` on initial render until any nodes are loaded.
   */
  rootNodes: PresentationHierarchyNode[];
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
}

interface TreeState {
  model: TreeModel;
  rootNodes: Array<PresentationHierarchyNode> | undefined;
}

function useTreeInternal({
  getHierarchyProvider,
  getFilteredPaths,
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
      if (!hierarchyProvider) {
        return;
      }

      if (!getFilteredPaths) {
        hierarchyProvider.setHierarchyFilter(undefined);
        // reload tree in case hierarchy provider does not use hierarchy filter to load initial nodes
        actions.reloadTree({ state: "keep" });
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
  }, [hierarchyProvider, getFilteredPaths, actions]);

  const getTreeModelNode = useCallback<(nodeId: string) => TreeModelRootNode | TreeModelHierarchyNode | undefined>(
    (nodeId: string) => {
      return actions.getNode(nodeId);
    },
    [actions],
  );

  const getNode = useCallback(
    (nodeId: string): PresentationHierarchyNode | undefined => {
      const node = actions.getNode(nodeId);
      if (!node || node.id === undefined) {
        return undefined;
      }
      return createPresentationHierarchyNode(node, state.model);
    },
    [actions, state.model],
  );

  const expandNode = useCallback<TreeRenderProps["expandNode"]>(
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

  const selectNodes = useCallback<TreeRenderProps["selectNodes"]>(
    (nodeIds: Array<string>, changeType: SelectionChangeType) => {
      actions.selectNodes(nodeIds, changeType);
    },
    [actions],
  );

  const isNodeSelected = useCallback<TreeRenderProps["isNodeSelected"]>((nodeId: string) => TreeModel.isNodeSelected(state.model, nodeId), [state]);

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

  const renderProps: RenderProps = useMemo(() => {
    if (state.model.rootNode.error) {
      return {
        rootErrorRenderProps: {
          rootError: state.model.rootNode.error,
        },
      };
    }
    return {
      rootErrorRenderProps: undefined,
      treeRenderProps: state.rootNodes
        ? {
            rootNodes: state.rootNodes,
            expandNode,
            selectNodes,
            isNodeSelected,
          }
        : undefined,
    };
  }, [expandNode, isNodeSelected, selectNodes, state.model.rootNode.error, state.rootNodes]);

  return {
    ...renderProps,
    isReloading: isFiltering,
    getTreeModelNode,
    getNode,
    setFormatter,
    reloadTree,
    getHierarchyLevelDetails,
  };
}

function generateTreeStructure(parentNodeId: string | undefined, model: TreeModel): Array<PresentationHierarchyNode> | undefined {
  const currentChildren = model.parentChildMap.get(parentNodeId);
  if (!currentChildren) {
    return undefined;
  }

  return currentChildren
    .map((childId) => model.idToNode.get(childId))
    .filter((node): node is TreeModelHierarchyNode => !!node)
    .map<PresentationHierarchyNode>((node) => {
      return createPresentationHierarchyNode(node, model);
    });
}

function createPresentationHierarchyNode(modelNode: TreeModelHierarchyNode, model: TreeModel): PresentationHierarchyNode {
  let children: Array<PresentationHierarchyNode> | undefined;
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
    error: node.error,
  };
}
