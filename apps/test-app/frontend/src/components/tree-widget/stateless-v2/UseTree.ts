/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState } from "react";
import { HierarchyProvider } from "@itwin/presentation-hierarchy-builder";
import { TreeActions, TreeState } from "./internal/TreeActions";
import { isHierarchyNodeSelected, TreeModelHierarchyNode } from "./internal/TreeModel";
import { useUnifiedTreeSelection } from "./internal/UseUnifiedSelection";
import { PresentationTreeNode } from "./Types";

/** @beta */
export interface UseTreeProps {
  hierarchyProvider?: HierarchyProvider;
}

/** @beta */
export interface UseTreeResult {
  rootNodes: PresentationTreeNode[] | undefined;
  isLoading: boolean;
  reloadTree: (options?: { discardState?: boolean }) => void;
  expandNode: (nodeId: string, isExpanded: boolean) => void;
  selectNode: (nodeId: string, isSelected: boolean) => void;
  setHierarchyLevelLimit: (nodeId: string | undefined, limit: undefined | number | "unbounded") => void;
  isNodeSelected: (nodeId: string) => boolean;
}

/** @beta */
export function useTree(props: UseTreeProps): UseTreeResult {
  const { getNode: _, ...rest } = useTreeInternal(props);
  return rest;
}

/** @beta */
export function useUnifiedSelectionTree(props: UseTreeProps): UseTreeResult {
  const { getNode, ...rest } = useTreeInternal(props);
  return { ...rest, ...useUnifiedTreeSelection({ getNode }) };
}

/** @internal */
export function useTreeInternal({ hierarchyProvider }: UseTreeProps): UseTreeResult & { getNode: (nodeId: string) => TreeModelHierarchyNode | undefined } {
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

  const isNodeSelected = useCallback(
    (nodeId: string) => {
      return isHierarchyNodeSelected(state.model, nodeId);
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
    getNode,
  };
}
