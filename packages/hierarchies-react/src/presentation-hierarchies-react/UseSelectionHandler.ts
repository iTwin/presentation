/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef } from "react";
import type { TreeRendererProps } from "./Renderers.js";
import type { TreeNode } from "./TreeNode.js";

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
 * @alpha
 */
type UseSelectionHandlerProps = Pick<TreeRendererProps, "selectNodes" | "rootNodes"> & {
  /** Selection mode that the component is working in. */
  selectionMode: SelectionMode;
};

/**
 * Result of `useSelectionHandler` hook.
 * @internal
 */
interface UseSelectionHandlerResult {
  /** Updates nodes selection based on current node state and modifier keys used. */
  handleNodeSelect: (props: { nodeId: string; isSelected: boolean; shiftDown: boolean; ctrlDown: boolean }) => void;
}

interface FlatTreeState {
  flatNodeList: Array<string>;
  nodeIdToIndexMap: Map<string, number>;
}

/**
 * A react hook that helps implement different selection modes in a tree component created using `useTree` hook.
 * @internal
 */
export function useSelectionHandler(props: UseSelectionHandlerProps): UseSelectionHandlerResult {
  const { rootNodes, selectionMode, selectNodes } = props;
  const previousSelectionRef = useRef<string | undefined>(undefined);
  const state = useRef<FlatTreeState>({
    flatNodeList: [],
    nodeIdToIndexMap: new Map(),
  });

  useEffect(() => {
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

  const handleNodeSelect = useCallback<UseSelectionHandlerResult["handleNodeSelect"]>(
    ({ nodeId, isSelected, shiftDown, ctrlDown }) => {
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

  return { handleNodeSelect };
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
      return { select: "node", type: isSelected ? "remove" : "replace" };
    case "multiple":
      return { select: "node", type: isSelected ? "remove" : "add" };
    case "extended":
      return getExtendedSelectionAction(isSelected, shiftDown, ctrlDown);
  }
}

function getExtendedSelectionAction(isSelected: boolean, shiftDown: boolean, ctrlDown: boolean): SelectionAction {
  if (shiftDown) {
    return { select: "range", type: "replace" };
  }
  if (ctrlDown) {
    return { select: "node", type: isSelected ? "remove" : "add" };
  }
  return { select: "node", type: "replace" };
}

function computeFlatNodeList(rootNodes: Array<TreeNode>): FlatTreeState {
  const flatNodeList: Array<string> = [];
  const nodeIdToIndexMap: Map<string, number> = new Map();

  const flattenNodeRecursively = (nodes: Array<TreeNode>) => {
    nodes.forEach((node) => {
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
