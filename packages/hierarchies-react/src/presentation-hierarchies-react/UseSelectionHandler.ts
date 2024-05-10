/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useRef } from "react";
import { isPresentationHierarchyNode, PresentationTreeNode } from "./Types";

/** @internal */
export enum SelectionModeFlags {
  Single = 1 << 0,
  DeselectEnabled = 1 << 1,
  KeysEnabled = 1 << 2,
  None = 1 << 3,
}

/** @beta */
export enum SelectionMode {
  /** Only one item selected at a time. */
  Single = SelectionModeFlags.Single,
  /** Only one item selected at a time; allows deselecting. */
  SingleAllowDeselect = SelectionModeFlags.Single | SelectionModeFlags.DeselectEnabled,
  /** Toggles items. */
  Multiple = SelectionModeFlags.DeselectEnabled,
  /** Toggles items; allows the use of Ctrl & Shift Keys. */
  Extended = SelectionModeFlags.KeysEnabled | SelectionModeFlags.DeselectEnabled,
  /** Disables selection */
  None = SelectionModeFlags.None,
}

/** @internal */
export type SelectionChangeType = "add" | "replace" | "remove";

interface UseSelectionHandlerProps {
  rootNodes: Array<PresentationTreeNode> | undefined;
  selectNode: (nodeIds: Array<string>, changeType: SelectionChangeType) => void;
  selectionMode: SelectionMode;
}

interface useSelectionHandlerResult {
  onNodeClick: (nodeId: string, isSelected: boolean, event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
  onNodeKeyDown: (nodeId: string, isSelected: boolean, event: React.KeyboardEvent<HTMLElement>) => void;
}

interface FlatTreeState {
  flatNodeList: Array<string>;
  nodeIdToIndexMap: Map<string, number>;
}

/** @beta */
export function useSelectionHandler(props: UseSelectionHandlerProps): useSelectionHandlerResult {
  const { rootNodes, selectionMode, selectNode } = props;
  const selectionModeRef = useLatest(selectionMode);
  const selectNodeRef = useLatest(selectNode);
  const previousSelectionRef = useRef<string | undefined>(undefined);
  const stateRef = useRef<FlatTreeState>({
    flatNodeList: [],
    nodeIdToIndexMap: new Map(),
  });

  useEffect(() => {
    if (!rootNodes) {
      return;
    }
    stateRef.current = computeFlatNodeList(rootNodes);
  }, [rootNodes]);

  const getNodeRange = (firstId?: string, secondId?: string) => {
    const getIndex = (nodeId?: string) => {
      return nodeId ? stateRef.current.nodeIdToIndexMap.get(nodeId) : 0;
    };
    const firstIndex = getIndex(firstId);
    const secondIndex = getIndex(secondId);
    if (firstIndex === undefined || secondIndex === undefined) {
      return [];
    }

    const startingIndex = Math.min(firstIndex, secondIndex);
    const endIndex = Math.max(firstIndex, secondIndex);
    return stateRef.current.flatNodeList.slice(startingIndex, endIndex + 1);
  };

  const onNodeSelect = (nodeId: string, isSelected: boolean, shiftDown: boolean, ctrlDown: boolean) => {
    const selection = getSelection(selectionModeRef.current, isSelected, shiftDown, ctrlDown);
    if (selection.type === "disabled") {
      return;
    }

    const nodes = selection.select === "range" ? getNodeRange(previousSelectionRef.current, nodeId) : [nodeId];
    selection.select !== "range" && (previousSelectionRef.current = nodeId);
    selectNodeRef.current(nodes, selection.type);
  };

  const onNodeClick = useRef((nodeId: string, isSelected: boolean, event: React.MouseEvent<HTMLElement, MouseEvent>) => {
    return onNodeSelect(nodeId, isSelected, event.shiftKey, event.ctrlKey);
  }).current;

  const onNodeKeyDown = useRef((nodeId: string, isSelected: boolean, event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === " " || event.key === "Spacebar" || event.key === "Enter") {
      return onNodeSelect(nodeId, isSelected, event.shiftKey, event.ctrlKey);
    }
  }).current;

  return { onNodeClick, onNodeKeyDown };
}

function getSelection(
  selectionMode: SelectionMode,
  isSelected: boolean,
  shiftDown: boolean,
  ctrlDown: boolean,
): { select: "node" | "range"; type: SelectionChangeType | "disabled" } {
  if (hasFlag(selectionMode, SelectionModeFlags.None)) {
    return { select: "node", type: "disabled" };
  }

  if (hasFlag(selectionMode, SelectionModeFlags.KeysEnabled)) {
    if (shiftDown) {
      return { select: "range", type: "replace" };
    }
    if (isSelected) {
      return { select: "node", type: ctrlDown ? "add" : "replace" };
    }
  }

  if (!isSelected) {
    return { select: "node", type: hasFlag(selectionMode, SelectionModeFlags.DeselectEnabled) ? "remove" : "disabled" };
  }

  return { select: "node", type: hasFlag(selectionMode, SelectionModeFlags.Single) ? "replace" : "add" };
}

function hasFlag(selectionMode: SelectionMode, flag: SelectionModeFlags): boolean {
  return (selectionMode & flag) !== 0;
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

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}
