/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState } from "react";
import { HierarchyProvider } from "@itwin/presentation-hierarchy-builder";
import { TreeActions, TreeState } from "./TreeActions";
import { isHierarchyNodeSelected } from "./TreeModel";
import { PresentationHierarchyNode, PresentationTreeNode } from "./Types";
import { useUnifiedTreeSelection } from "./UseUnifiedSelection";

/** @beta */
export interface UseTreeStateProps {
  hierarchyProvider?: HierarchyProvider;
}

/** @beta */
export interface UseTreeResult {
  rootNodes: PresentationTreeNode[] | undefined;
  isLoading: boolean;
  reloadTree: (options?: { discardState?: boolean }) => void;
  expandNode: (node: PresentationHierarchyNode, isExpanded: boolean) => void;
  selectNode: (node: PresentationHierarchyNode, isSelected: boolean) => void;
  setHierarchyLevelLimit: (node: PresentationHierarchyNode | undefined, limit: undefined | number | "unbounded") => void;
  isNodeSelected: (node: PresentationHierarchyNode) => boolean;
}

/** @beta */
export function useTree({ hierarchyProvider }: UseTreeStateProps): UseTreeResult {
  const [state, setState] = useState<TreeState>({
    model: { idToNode: {}, parentChildMap: new Map(), rootNode: { id: undefined, nodeData: undefined } },
    rootNodes: undefined,
    isLoading: false,
  });
  const [actions] = useState<TreeActions>(() => new TreeActions((actionOrValue) => setState(actionOrValue)));

  useEffect(() => {
    actions.setHierarchyProvider(hierarchyProvider);
    actions.reloadTree();
    return () => {
      actions.dispose();
    };
  }, [actions, hierarchyProvider]);

  const expandNode = useRef((node: PresentationHierarchyNode, isExpanded: boolean) => {
    actions.expandNode(node, isExpanded);
  }).current;

  const reloadTree = useRef((options?: { discardState?: boolean }) => {
    actions.reloadTree(options);
  }).current;

  const selectNode = useRef((node: PresentationHierarchyNode, isSelected: boolean) => {
    actions.selectNode(node, isSelected);
  }).current;

  const setHierarchyLevelLimit = useRef((node: PresentationHierarchyNode | undefined, limit: undefined | number | "unbounded") => {
    actions.setHierarchyLimit(node, limit);
  }).current;

  const isNodeSelected = useCallback(
    (node: PresentationHierarchyNode) => {
      return isHierarchyNodeSelected(state.model, node);
    },
    [state],
  );

  return {
    rootNodes: state.rootNodes,
    isLoading: state.isLoading,
    expandNode,
    reloadTree,
    selectNode,
    isNodeSelected,
    setHierarchyLevelLimit,
  };
}

/** @beta */
export function useUnifiedSelectionTree({ hierarchyProvider }: UseTreeStateProps): UseTreeResult {
  return { ...useTree({ hierarchyProvider }), ...useUnifiedTreeSelection() };
}
