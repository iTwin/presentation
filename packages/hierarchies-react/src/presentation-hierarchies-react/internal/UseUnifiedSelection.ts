/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from "react";
import { HierarchyNode } from "@itwin/presentation-hierarchies";
import { Selectable, Selectables, SelectionStorage } from "@itwin/unified-selection";
import { useUnifiedSelectionContext } from "../UnifiedSelectionContext";
import { SelectionMode, SelectionModeFlags } from "../UseTree";
import { isTreeModelHierarchyNode, TreeModelHierarchyNode, TreeModelNode, TreeModelRootNode } from "./TreeModel";

/** @internal */
export interface TreeSelectionOptions {
  isNodeSelected: (nodeId: string) => boolean;
  selectNode: (nodeId: string, isSelected: boolean, event?: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
}

/** @internal */
export interface UseUnifiedTreeSelectionProps {
  imodelKey: string;
  sourceName: string;
  getNode: (nodeId: string) => TreeModelNode | TreeModelRootNode | undefined;
  getNodeRange: (firstId?: string, secondId?: string) => TreeModelHierarchyNode[];
  selectionMode?: SelectionMode;
}

/** @internal */
export function useUnifiedTreeSelection({ imodelKey, sourceName, getNode, getNodeRange, selectionMode }: UseUnifiedTreeSelectionProps): TreeSelectionOptions {
  const [options, setOptions] = useState<TreeSelectionOptions>(() => ({
    isNodeSelected: /* istanbul ignore next */ () => false,
    selectNode: /* istanbul ignore next */ () => {},
  }));

  const previousSelectionRef = useRef<string | undefined>(undefined);
  const selectionStorage = useUnifiedSelectionContext();

  useEffect(() => {
    const nodeSelectionMode = selectionMode ?? SelectionMode.Single;
    if (!selectionStorage) {
      setOptions({
        isNodeSelected: () => false,
        selectNode: () => {},
      });
      return;
    }

    setOptions(createOptions(imodelKey, sourceName, selectionStorage, getNode, getNodeRange, nodeSelectionMode, previousSelectionRef));
    return selectionStorage.selectionChangeEvent.addListener((args) => {
      if (imodelKey !== args.imodelKey || args.level > 0) {
        return;
      }

      setOptions(createOptions(imodelKey, sourceName, selectionStorage, getNode, getNodeRange, nodeSelectionMode, previousSelectionRef));
    });
  }, [selectionStorage, getNode, getNodeRange, imodelKey, sourceName, selectionMode]);

  return options;
}

function hasSelectionFlag(selectionMode: SelectionMode, flag: SelectionModeFlags): boolean {
  return (selectionMode & flag) !== 0;
}

function createOptions(
  key: string,
  source: string,
  storage: SelectionStorage,
  getNode: (nodeId: string) => TreeModelNode | TreeModelRootNode | undefined,
  getNodeRange: (firstId?: string, secondId?: string) => TreeModelHierarchyNode[],
  selectionMode: SelectionMode,
  previousSelection: React.MutableRefObject<string | undefined>,
): TreeSelectionOptions {
  return {
    isNodeSelected: (nodeId: string) => {
      const node = getNode(nodeId);
      if (!node || !isTreeModelHierarchyNode(node)) {
        return false;
      }

      const selectables = storage.getSelection({ imodelKey: key, level: 0 });

      const hierarchyNode = node.nodeData;
      if (HierarchyNode.isInstancesNode(hierarchyNode)) {
        return Selectables.hasAny(selectables, hierarchyNode.key.instanceKeys);
      }

      return Selectables.has(selectables, { identifier: node.id });
    },

    selectNode: (nodeId: string, isSelected: boolean, event?: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      const node = getNode(nodeId);
      if (!node || !isTreeModelHierarchyNode(node)) {
        return;
      }

      if (hasSelectionFlag(selectionMode, SelectionModeFlags.None)) {
        return;
      }

      let updatePreviousSelection = true;
      let selection = [{ nodeId, node: node.nodeData }];

      const removeAction = hasSelectionFlag(selectionMode, SelectionModeFlags.DeselectEnabled) ? storage.removeFromSelection.bind(storage) : () => {};
      let action = isSelected ? storage.addToSelection.bind(storage) : removeAction;

      if (isSelected && hasSelectionFlag(selectionMode, SelectionModeFlags.Single)) {
        action = storage.replaceSelection.bind(storage);
      }

      if (hasSelectionFlag(selectionMode, SelectionModeFlags.KeysEnabled)) {
        if (event?.shiftKey) {
          updatePreviousSelection = false;
          const selectedNodes = getNodeRange(previousSelection.current, nodeId);
          selection = selectedNodes.map((selectedNode) => ({ nodeId: selectedNode.id, node: selectedNode.nodeData }));
          action = storage.replaceSelection.bind(storage);
        } else if (!event?.ctrlKey && isSelected) {
          action = storage.replaceSelection.bind(storage);
        }
      }

      updatePreviousSelection && (previousSelection.current = nodeId);
      const actionProps = { imodelKey: key, source, selectables: createSelectables(selection), level: 0 };
      action(actionProps);
    },
  };
}

function createSelectables(nodes: { nodeId: string; node: HierarchyNode }[]): Selectable[] {
  let selectables: Selectable[] = [];
  for (const { nodeId, node } of nodes) {
    if (HierarchyNode.isInstancesNode(node)) {
      selectables = [...selectables, ...node.key.instanceKeys];
      continue;
    }

    selectables.push({
      identifier: nodeId,
      async *loadInstanceKeys() {
        if (!HierarchyNode.isGroupingNode(node)) {
          return;
        }
        for (const key of node.groupedInstanceKeys) {
          yield key;
        }
      },
      data: node,
    });
  }
  return selectables;
}
