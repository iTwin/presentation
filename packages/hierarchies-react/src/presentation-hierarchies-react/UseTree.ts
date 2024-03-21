/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState } from "react";
import { GenericInstanceFilter, HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { TreeActions, TreeState } from "./internal/TreeActions";
import { isHierarchyNodeSelected, isTreeModelHierarchyNode, TreeModelHierarchyNode, TreeModelRootNode } from "./internal/TreeModel";
import { useUnifiedTreeSelection, UseUnifiedTreeSelectionProps } from "./internal/UseUnifiedSelection";
import { PresentationTreeNode } from "./Types";

interface UseTreeProps {
  hierarchyProvider?: HierarchyProvider;
}

/** @beta */
export interface HierarchyLevelFilteringOptions {
  hierarchyNode: HierarchyNode | undefined;
  applyFilter: (filter?: GenericInstanceFilter) => void;
  currentFilter?: GenericInstanceFilter;
}

interface UseTreeResult {
  /**
   * Array containing root tree nodes. It is `undefined` on initial render until any nodes are loaded.
   */
  rootNodes: PresentationTreeNode[] | undefined;
  /**
   * Specifies whether tree is loading or not. It is set to `true` when initial tree load is in progress
   * or tree is reloading.
   */
  isLoading: boolean;
  reloadTree: (options?: { discardState?: boolean }) => void;
  expandNode: (nodeId: string, isExpanded: boolean) => void;
  selectNode: (nodeId: string, isSelected: boolean) => void;
  setHierarchyLevelLimit: (nodeId: string | undefined, limit: undefined | number | "unbounded") => void;
  removeHierarchyLevelFilter: (nodeId: string) => void;
  isNodeSelected: (nodeId: string) => boolean;
  getHierarchyLevelFilteringOptions: (nodeId: string) => HierarchyLevelFilteringOptions | undefined;
}

/** @beta */
export function useTree(props: UseTreeProps): UseTreeResult {
  const { getNode: _, ...rest } = useTreeInternal(props);
  return rest;
}

/** @beta */
export function useUnifiedSelectionTree({ imodelKey, sourceName, ...props }: UseTreeProps & Omit<UseUnifiedTreeSelectionProps, "getNode">): UseTreeResult {
  const { getNode, ...rest } = useTreeInternal(props);
  return { ...rest, ...useUnifiedTreeSelection({ imodelKey, sourceName, getNode }) };
}

function useTreeInternal({
  hierarchyProvider,
}: UseTreeProps): UseTreeResult & { getNode: (nodeId: string) => TreeModelRootNode | TreeModelHierarchyNode | undefined } {
  const [state, setState] = useState<TreeState>({
    model: { idToNode: new Map(), parentChildMap: new Map(), rootNode: { id: undefined, nodeData: undefined } },
    rootNodes: undefined,
    isLoading: false,
  });
  const [actions] = useState<TreeActions>(() => new TreeActions((actionOrValue) => setState(actionOrValue)));

  useEffect(() => {
    actions.setHierarchyProvider(hierarchyProvider);
    actions.reloadTree(undefined);
    return () => {
      actions.dispose();
    };
  }, [actions, hierarchyProvider]);

  const getNode = useRef((nodeId: string) => {
    return actions.getNode(nodeId);
  }).current;

  const expandNode = useRef((nodeId: string, isExpanded: boolean) => {
    actions.expandNode(nodeId, isExpanded);
  }).current;

  const reloadTree = useRef((options?: { discardState?: boolean }) => {
    actions.reloadTree(undefined, options);
  }).current;

  const selectNode = useRef((nodeId: string, isSelected: boolean) => {
    actions.selectNode(nodeId, isSelected);
  }).current;

  const setHierarchyLevelLimit = useRef((nodeId: string | undefined, limit: undefined | number | "unbounded") => {
    actions.setHierarchyLimit(nodeId, limit);
  }).current;

  const removeHierarchyLevelFilter = useRef((nodeId: string) => {
    actions.setInstanceFilter(nodeId, undefined);
  }).current;

  const isNodeSelected = useCallback(
    (nodeId: string) => {
      return isHierarchyNodeSelected(state.model, nodeId);
    },
    [state],
  );

  const getHierarchyLevelFilteringOptions = useCallback(
    (nodeId: string | undefined) => {
      const node = actions.getNode(nodeId);
      if (!node) {
        return undefined;
      }
      const hierarchyNode = isTreeModelHierarchyNode(node) ? node.nodeData : undefined;
      if (hierarchyNode && HierarchyNode.isGroupingNode(hierarchyNode)) {
        return undefined;
      }

      const currentFilter = node.instanceFilter;
      const filteringOptions: HierarchyLevelFilteringOptions = {
        hierarchyNode,
        applyFilter: (filter?: GenericInstanceFilter) => {
          actions.setInstanceFilter(nodeId, filter);
        },
        currentFilter,
      };

      return filteringOptions;
    },
    [actions],
  );

  return {
    rootNodes: state.rootNodes,
    isLoading: state.isLoading,
    expandNode,
    reloadTree,
    selectNode,
    isNodeSelected,
    setHierarchyLevelLimit,
    getHierarchyLevelFilteringOptions,
    getNode,
    removeHierarchyLevelFilter,
  };
}
