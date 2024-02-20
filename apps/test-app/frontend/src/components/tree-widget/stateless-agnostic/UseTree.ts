/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState } from "react";
import { HierarchyProvider } from "@itwin/presentation-hierarchy-builder";
import { PresentationNode, PresentationTreeNode, TreeActions, TreeState } from "./TreeActions";
import { isModelNode } from "./TreeModel";
import { useUnifiedTreeSelection } from "./UseUnifiedSelection";

export interface UseTreeStateProps {
  hierarchyProvider?: HierarchyProvider;
}

export interface UseTreeResult {
  rootNodes: PresentationTreeNode[] | undefined;
  reloadTree: (options?: { discardState?: boolean }) => void;
  expandNode: (node: PresentationNode, isExpanded: boolean) => void;
  selectNode: (node: PresentationNode, isSelected: boolean) => void;
  setHierarchyLevelLimit: (node: PresentationNode | undefined, limit: undefined | number | "unbounded") => void;
  isNodeSelected: (node: PresentationNode) => boolean;
}

export function useTree({ hierarchyProvider }: UseTreeStateProps): UseTreeResult {
  const [state, setState] = useState<TreeState>({
    model: { idToNode: {}, parentChildMap: new Map(), rootNode: { id: undefined, nodeData: undefined } },
    rootNodes: undefined,
  });
  const [actions] = useState<TreeActions>(() => new TreeActions((updater) => setState(updater)));

  useEffect(() => {
    actions.setHierarchyProvider(hierarchyProvider);
    actions.reloadTree();
    return () => {
      actions.dispose();
    };
  }, [actions, hierarchyProvider]);

  const expandNode = useRef((node: PresentationNode, isExpanded: boolean) => {
    actions.expandNode(node, isExpanded);
  }).current;

  const reloadTree = useRef((options?: { discardState?: boolean }) => {
    actions.reloadTree(options);
  }).current;

  const selectNode = useRef((node: PresentationNode, isSelected: boolean) => {
    actions.selectNode(node, isSelected);
  }).current;

  const setHierarchyLevelLimit = useRef((node: PresentationNode | undefined, limit: undefined | number | "unbounded") => {
    actions.setHierarchyLimit(node, limit);
  }).current;

  const isNodeSelected = useCallback(
    (node: PresentationNode) => {
      const modelNode = state.model.idToNode[node.id];
      return modelNode && isModelNode(modelNode) && !!modelNode.isSelected;
    },
    [state],
  );

  return {
    rootNodes: state.rootNodes,
    expandNode,
    reloadTree,
    selectNode,
    isNodeSelected,
    setHierarchyLevelLimit,
  };
}

export function useUnifiedSelectionTree({ hierarchyProvider }: UseTreeStateProps): UseTreeResult {
  return { ...useTree({ hierarchyProvider }), ...useUnifiedTreeSelection() };
}
