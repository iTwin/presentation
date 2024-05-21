/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useRef } from "react";
import { isPresentationHierarchyNode, PresentationTreeNode } from "./TreeNode";

/** @internal */
export type SelectionMode = "none" | "single" | "extended" | "multiple";

/** @internal */
export type SelectionChangeType = "add" | "replace" | "remove";

interface UseSelectionHandlerProps {
  rootNodes: Array<PresentationTreeNode> | undefined;
  selectNodes: (nodeIds: Array<string>, changeType: SelectionChangeType) => void;
  selectionMode: SelectionMode;
}

interface UseSelectionHandlerResult {
  onNodeClick: (nodeId: string, isSelected: boolean, event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
  onNodeKeyDown: (nodeId: string, isSelected: boolean, event: React.KeyboardEvent<HTMLElement>) => void;
}

interface FlatTreeState {
  flatNodeList: Array<string>;
  nodeIdToIndexMap: Map<string, number>;
}

/** @beta */
export function useSelectionHandler(props: UseSelectionHandlerProps): UseSelectionHandlerResult {
  const { rootNodes, selectionMode, selectNodes } = props;
  const previousSelectionRef = useRef<string | undefined>(undefined);
  const state = useRef<FlatTreeState>({
    flatNodeList: [],
    nodeIdToIndexMap: new Map(),
  });

  useEffect(() => {
    if (!rootNodes) {
      return;
    }
    state.current = computeFlatNodeList(rootNodes);
  }, [rootNodes]);

  const getNodeRange = (firstId?: string, secondId?: string) => {
    const getIndex = (nodeId?: string) => {
      return nodeId ? state.current.nodeIdToIndexMap.get(nodeId) : 0;
    };
    const firstIndex = getIndex(firstId);
    const secondIndex = getIndex(secondId);
    if (firstIndex === undefined || secondIndex === undefined) {
      return [];
    }

    const startingIndex = Math.min(firstIndex, secondIndex);
    const endIndex = Math.max(firstIndex, secondIndex);
    return state.current.flatNodeList.slice(startingIndex, endIndex + 1);
  };

  const onNodeSelect = (nodeId: string, isSelected: boolean, shiftDown: boolean, ctrlDown: boolean) => {
    const selection = getSelectionAction(selectionMode, isSelected, shiftDown, ctrlDown);
    if (selection.type === "disabled") {
      return;
    }

    const nodes = selection.select === "range" ? getNodeRange(previousSelectionRef.current, nodeId) : [nodeId];
    if (!nodes.length) {
      return;
    }

    selection.select !== "range" && (previousSelectionRef.current = nodeId);
    selectNodes(nodes, selection.type);
  };

  const onNodeClick = (nodeId: string, isSelected: boolean, event: React.MouseEvent<HTMLElement, MouseEvent>) => {
    return onNodeSelect(nodeId, isSelected, event.shiftKey, event.ctrlKey);
  };

  const onNodeKeyDown = (nodeId: string, isSelected: boolean, event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === " " || event.key === "Spacebar" || event.key === "Enter") {
      return onNodeSelect(nodeId, isSelected, event.shiftKey, event.ctrlKey);
    }
  };

  return { onNodeClick, onNodeKeyDown };
}

interface SelectionAction {
  select: "node" | "range";
  type: SelectionChangeType | "disabled";
}

function getSelectionAction(selectionMode: SelectionMode, isSelected: boolean, shiftDown: boolean, ctrlDown: boolean): SelectionAction {
  switch (selectionMode) {
    case "none":
      return { select: "node", type: "disabled" };
    case "single":
      return { select: "node", type: isSelected ? "replace" : "remove" };
    case "multiple":
      return { select: "node", type: isSelected ? "add" : "remove" };
    case "extended":
      return getExtendedSelectionAction(isSelected, shiftDown, ctrlDown);
  }
}

function getExtendedSelectionAction(isSelected: boolean, shiftDown: boolean, ctrlDown: boolean): SelectionAction {
  if (shiftDown) {
    return { select: "range", type: "replace" };
  }
  if (!isSelected) {
    return { select: "node", type: "remove" };
  }

  return { select: "node", type: ctrlDown ? "add" : "replace" };
}

function computeFlatNodeList(rootNodes: Array<PresentationTreeNode>): FlatTreeState {
  const flatNodeList: Array<string> = [];
  const nodeIdToIndexMap: Map<string, number> = new Map();

  const flattenNodeRecursively = (nodes: Array<PresentationTreeNode>) => {
    nodes.forEach((node) => {
      if (!isPresentationHierarchyNode(node)) {
        return;
      }
      nodeIdToIndexMap.set(node.id, flatNodeList.length);
      flatNodeList.push(node.id);
      if (node.isExpanded && typeof node.children !== "boolean") {
        flattenNodeRecursively(node.children);
      }
    });
  };

  flattenNodeRecursively(rootNodes);
  return { flatNodeList, nodeIdToIndexMap };
}
