/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from "react";
import { HierarchyNode } from "@itwin/presentation-hierarchies";
import { Selectable, Selectables, SelectionStorage } from "@itwin/unified-selection";
import { useUnifiedSelectionContext } from "../UnifiedSelectionContext";
import { isTreeModelHierarchyNode, TreeModelHierarchyNode, TreeModelRootNode } from "./TreeModel";

/** @internal */
export interface TreeSelectionOptions {
  isNodeSelected: (nodeId: string) => boolean;
  selectNode: (nodeId: string, isSelected: boolean) => void;
}

/** @internal */
export interface UseUnifiedTreeSelectionProps {
  imodelKey: string;
  sourceName: string;
  getNode: (nodeId: string) => TreeModelHierarchyNode | TreeModelRootNode | undefined;
}

/** @internal */
export function useUnifiedTreeSelection({ imodelKey, sourceName, getNode }: UseUnifiedTreeSelectionProps): TreeSelectionOptions {
  const [options, setOptions] = useState<TreeSelectionOptions>({
    isNodeSelected: () => false,
    selectNode: () => {},
  });

  const selectionStorage = useUnifiedSelectionContext();
  useEffect(() => {
    if (!selectionStorage) {
      setOptions({
        isNodeSelected: () => false,
        selectNode: () => {},
      });
      return;
    }

    setOptions(createOptions(imodelKey, sourceName, selectionStorage, getNode));
    return selectionStorage.selectionChangeEvent.addListener((args) => {
      if (imodelKey !== args.iModelKey || args.level > 0) {
        return;
      }

      setOptions(createOptions(imodelKey, sourceName, selectionStorage, getNode));
    });
  }, [selectionStorage, getNode, imodelKey, sourceName]);

  return options;
}

function createOptions(
  key: string,
  source: string,
  storage: SelectionStorage | undefined,
  getNode: (nodeId: string) => TreeModelHierarchyNode | TreeModelRootNode | undefined,
): TreeSelectionOptions {
  if (!storage) {
    return {
      isNodeSelected: () => false,
      selectNode: () => {},
    };
  }

  return {
    isNodeSelected: (nodeId: string) => {
      const node = getNode(nodeId);
      if (!node || !isTreeModelHierarchyNode(node)) {
        return false;
      }

      const selectables = storage.getSelection({ iModelKey: key, level: 0 });

      const hierarchyNode = node.nodeData;
      if (HierarchyNode.isInstancesNode(hierarchyNode)) {
        return Selectables.hasAny(selectables, hierarchyNode.key.instanceKeys);
      }

      return Selectables.has(selectables, { identifier: node.id });
    },

    selectNode: (nodeId: string, isSelected: boolean) => {
      const node = getNode(nodeId);
      if (!node || !isTreeModelHierarchyNode(node)) {
        return;
      }

      const action = isSelected ? storage.addToSelection.bind(storage) : storage.removeFromSelection.bind(storage);
      action({ iModelKey: key, source, selectables: createSelectables(node.id, node.nodeData), level: 0 });
    },
  };
}

function createSelectables(nodeId: string, node: HierarchyNode): Selectable[] {
  if (HierarchyNode.isInstancesNode(node)) {
    return node.key.instanceKeys;
  }

  return [
    {
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
    },
  ];
}
