/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState } from "react";
import { GenericInstanceFilter, HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { TreeActions } from "./internal/TreeActions";
import { isTreeModelHierarchyNode, TreeModel, TreeModelHierarchyNode, TreeModelNode, TreeModelRootNode } from "./internal/TreeModel";
import { useUnifiedTreeSelection, UseUnifiedTreeSelectionProps } from "./internal/UseUnifiedSelection";
import { PresentationHierarchyNode, PresentationTreeNode } from "./Types";

/** @beta */
export interface HierarchyLevelFilteringOptions {
  hierarchyNode: HierarchyNode | undefined;
  applyFilter: (filter?: GenericInstanceFilter) => void;
  currentFilter?: GenericInstanceFilter;
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

/** @internal */
export interface UseTreeProps {
  hierarchyProvider?: HierarchyProvider;
}

/** @internal */
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
  reloadTree: (options?: { discardState?: boolean }) => void;
  expandNode: (nodeId: string, isExpanded: boolean) => void;
  selectNode: (nodeId: string, isSelected: boolean) => void;
  setHierarchyLevelLimit: (nodeId: string | undefined, limit: undefined | number | "unbounded") => void;
  removeHierarchyLevelFilter: (nodeId: string) => void;
  isNodeSelected: (nodeId: string) => boolean;
  getHierarchyLevelFilteringOptions: (nodeId: string) => HierarchyLevelFilteringOptions | undefined;
}

/** @internal */
export interface TreeState {
  model: TreeModel;
  rootNodes: Array<PresentationTreeNode> | undefined;
  isLoading: boolean;
}

export function useTreeInternal({
  hierarchyProvider,
}: UseTreeProps): UseTreeResult & { getNode: (nodeId: string) => TreeModelRootNode | TreeModelNode | undefined } {
  const [state, setState] = useState<TreeState>({
    model: { idToNode: new Map(), parentChildMap: new Map(), rootNode: { id: undefined, nodeData: undefined } },
    rootNodes: undefined,
    isLoading: false,
  });
  const [actions] = useState<TreeActions>(
    () =>
      new TreeActions(
        (model) => {
          const rootNodes = model.parentChildMap.get(undefined) !== undefined ? generateTreeStructure(undefined, model) : undefined;
          setState({
            model,
            rootNodes,
            isLoading: false,
          });
        },
        () => setState((prevState) => ({ ...prevState, isLoading: true })),
      ),
  );

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

  const isNodeSelected = useCallback((nodeId: string) => TreeModel.isHierarchyNodeSelected(state.model, nodeId), [state]);

  const getHierarchyLevelFilteringOptions = useCallback(
    (nodeId: string | undefined) => {
      const node = actions.getNode(nodeId);
      if (!node || !isTreeModelHierarchyNode(node)) {
        return undefined;
      }
      const hierarchyNode = node.nodeData;
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

function generateTreeStructure(parentNodeId: string | undefined, model: TreeModel): Array<PresentationTreeNode> | undefined {
  const currentChildren = model.parentChildMap.get(parentNodeId);
  if (!currentChildren) {
    return undefined;
  }

  return currentChildren
    .map((childId) => model.idToNode.get(childId))
    .filter((node): node is TreeModelNode => !!node)
    .map<PresentationTreeNode>((node) => {
      if (!isTreeModelHierarchyNode(node)) {
        return {
          id: node.id,
          parentNodeId,
          type: node.type,
          message: node.message,
        };
      }

      const children = generateTreeStructure(node.id, model);
      return {
        ...toPresentationHierarchyNodeBase(node),
        children: children ? children : node.children === true ? true : [],
      };
    });
}

function toPresentationHierarchyNodeBase(node: TreeModelHierarchyNode): Omit<PresentationHierarchyNode, "children"> {
  return {
    id: node.id,
    label: node.label,
    isLoading: !!node.isLoading,
    isExpanded: !!node.isExpanded,
    isFilterable: !HierarchyNode.isGroupingNode(node.nodeData) && !!node.nodeData.supportsFiltering && node.children,
    isFiltered: !!node.instanceFilter,
    extendedData: node.nodeData.extendedData,
  };
}
