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
export interface HierarchyLevelConfiguration {
  hierarchyNode: HierarchyNode;
  hierarchyLevelSizeLimit?: number | "unbounded";
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

interface UseTreeProps {
  hierarchyProvider?: HierarchyProvider;
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
  setHierarchyLevelFilter: (nodeId: string | undefined, filter: GenericInstanceFilter | undefined) => void;
  isNodeSelected: (nodeId: string) => boolean;
  getHierarchyLevelConfiguration: (nodeId: string) => HierarchyLevelConfiguration | undefined;
}

interface TreeState {
  model: TreeModel;
  rootNodes: Array<PresentationTreeNode> | undefined;
}

function useTreeInternal({ hierarchyProvider }: UseTreeProps): UseTreeResult & { getNode: (nodeId: string) => TreeModelRootNode | TreeModelNode | undefined } {
  const [state, setState] = useState<TreeState>({
    model: { idToNode: new Map(), parentChildMap: new Map(), rootNode: { id: undefined, nodeData: undefined } },
    rootNodes: undefined,
  });
  const [actions] = useState<TreeActions>(
    () =>
      new TreeActions((model) => {
        const rootNodes = model.parentChildMap.get(undefined) !== undefined ? generateTreeStructure(undefined, model) : undefined;
        setState({
          model,
          rootNodes,
        });
      }),
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
    actions.reloadTree(options);
  }).current;

  const selectNode = useRef((nodeId: string, isSelected: boolean) => {
    actions.selectNode(nodeId, isSelected);
  }).current;

  const setHierarchyLevelLimit = useRef((nodeId: string | undefined, limit: undefined | number | "unbounded") => {
    actions.setHierarchyLimit(nodeId, limit);
  }).current;

  const setHierarchyLevelFilter = useRef((nodeId: string | undefined, filter: GenericInstanceFilter | undefined) => {
    actions.setInstanceFilter(nodeId, filter);
  }).current;

  const isNodeSelected = useCallback((nodeId: string) => TreeModel.isNodeSelected(state.model, nodeId), [state]);

  const getHierarchyLevelConfiguration = useCallback(
    (nodeId: string): HierarchyLevelConfiguration | undefined => {
      const node = actions.getNode(nodeId);
      if (!node || !isTreeModelHierarchyNode(node)) {
        return undefined;
      }
      const hierarchyNode = node.nodeData;
      if (HierarchyNode.isGroupingNode(hierarchyNode)) {
        return undefined;
      }

      const currentFilter = node.instanceFilter;
      return {
        hierarchyNode,
        currentFilter,
        hierarchyLevelSizeLimit: node.hierarchyLimit,
      };
    },
    [actions],
  );

  return {
    rootNodes: state.rootNodes,
    isLoading: !!state.model.rootNode.isLoading,
    expandNode,
    reloadTree,
    selectNode,
    isNodeSelected,
    setHierarchyLevelLimit,
    getHierarchyLevelConfiguration,
    getNode,
    setHierarchyLevelFilter,
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
    nodeData: node.nodeData,
    isLoading: !!node.isLoading,
    isExpanded: !!node.isExpanded,
    isFilterable: !HierarchyNode.isGroupingNode(node.nodeData) && !!node.nodeData.supportsFiltering && node.children,
    isFiltered: !!node.instanceFilter,
    extendedData: node.nodeData.extendedData,
  };
}
