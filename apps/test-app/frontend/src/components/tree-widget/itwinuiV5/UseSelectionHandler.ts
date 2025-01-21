/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef } from "react";
import { isPresentationHierarchyNode, PresentationHierarchyNode, PresentationTreeNode } from "@itwin/presentation-hierarchies-react";
import { useTree } from "./UseTree.js";

/**
 * A union of different supported selection modes in a tree component:
 * - `none` - no selection is allowed,
 * - `single` - only one node can be selected at a time,
 * - `extended` - multiple nodes can be selected using shift and ctrl keys,
 * - `multiple` - multiple nodes can be selected without using shift or ctrl keys.
 *
 * @public
 */
export type SelectionMode = "none" | "single" | "extended" | "multiple";

/**
 * Type of selection change.
 * - `add` - a node was added to the selection,
 * - `replace` - a selected node was replaced with a different one,
 * - `remove` - a node was removed from the selection.
 *
 * @public
 */
export type SelectionChangeType = "add" | "replace" | "remove";

/**
 * Props for `useSelectionHandler` hook.
 * @public
 */
type UseSelectionHandlerProps = Pick<ReturnType<typeof useTree>, "rootNodes" | "selectNodes"> & {
  /** Selection mode that the component is working in. */
  selectionMode: SelectionMode;
};

/**
 * Result of `useSelectionHandler` hook.
 * @public
 */
interface UseSelectionHandlerResult {
  /** Should be called by node renderer when a node component is clicked. */
  onNodeClick: (node: PresentationHierarchyNode, isSelected: boolean, event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
  /** Should be called by node renderer when a keyboard event happens on a node. */
  onNodeKeyDown: (node: PresentationHierarchyNode, isSelected: boolean, event: React.KeyboardEvent<HTMLElement>) => void;
}

interface FlatTreeState {
  flatNodeList: Array<string>;
  nodeIdToIndexMap: Map<string, number>;
}

/**
 * A react hook that helps implement different selection modes in a tree component created using `useTree` hook.
 * @public
 */
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

  const onNodeSelect = useCallback(
    (nodeId: string, isSelected: boolean, shiftDown: boolean, ctrlDown: boolean) => {
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
    },
    [selectionMode, selectNodes],
  );

  const onNodeClick = useCallback(
    (node: PresentationHierarchyNode, isSelected: boolean, event: React.MouseEvent<HTMLElement, MouseEvent>) => {
      return onNodeSelect(node.id, isSelected, event.shiftKey, event.ctrlKey);
    },
    [onNodeSelect],
  );

  const onNodeKeyDown = useCallback(
    (node: PresentationHierarchyNode, isSelected: boolean, event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === " " || event.key === "Spacebar" || event.key === "Enter") {
        return onNodeSelect(node.id, isSelected, event.shiftKey, event.ctrlKey);
      }
    },
    [onNodeSelect],
  );

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
  if (ctrlDown) {
    return { select: "node", type: isSelected ? "add" : "remove" };
  }
  return { select: "node", type: isSelected ? "replace" : "disabled" };
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
