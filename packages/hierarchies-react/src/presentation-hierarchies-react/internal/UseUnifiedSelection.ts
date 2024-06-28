/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from "react";
import { HierarchyNode } from "@itwin/presentation-hierarchies";
import { Selectable, Selectables, SelectionStorage } from "@itwin/unified-selection";
import { useUnifiedSelectionContext } from "../UnifiedSelectionContext";
import { SelectionChangeType } from "../UseSelectionHandler";
import { isTreeModelHierarchyNode, TreeModelNode, TreeModelRootNode } from "./TreeModel";

/** @internal */
export interface TreeSelectionOptions {
  isNodeSelected: (nodeId: string) => boolean;
  selectNodes: (nodeIds: Array<string>, changeType: SelectionChangeType) => void;
}

/** @beta */
export interface UseUnifiedTreeSelectionProps {
  imodelKey: string;
  sourceName: string;
}

/** @internal */
export function useUnifiedTreeSelection({
  imodelKey,
  sourceName,
  getNode,
}: UseUnifiedTreeSelectionProps & { getNode: (nodeId: string) => TreeModelNode | TreeModelRootNode | undefined }): TreeSelectionOptions {
  const [options, setOptions] = useState<TreeSelectionOptions>(() => ({
    isNodeSelected: /* istanbul ignore next */ () => false,
    selectNodes: /* istanbul ignore next */ () => {},
  }));

  const selectionStorage = useUnifiedSelectionContext();
  useEffect(() => {
    if (!selectionStorage) {
      setOptions({
        isNodeSelected: () => false,
        selectNodes: () => {},
      });
      return;
    }

    setOptions(createOptions(imodelKey, sourceName, selectionStorage, getNode));
    return selectionStorage.selectionChangeEvent.addListener((args) => {
      if (imodelKey !== args.imodelKey || args.level > 0) {
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
  storage: SelectionStorage,
  getNode: (nodeId: string) => TreeModelNode | TreeModelRootNode | undefined,
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

    selectNodes: (nodeIds: Array<string>, changeType: SelectionChangeType) => {
      let selectables: Selectable[] = [];

      for (const nodeId of nodeIds) {
        const node = getNode(nodeId);
        if (!node || !isTreeModelHierarchyNode(node)) {
          return;
        }
        selectables = [...selectables, ...createSelectables(node.id, node.nodeData)];
      }

      const actionProps = { imodelKey: key, source, selectables, level: 0 };

      switch (changeType) {
        case "add":
          storage.addToSelection(actionProps);
          return;
        case "remove":
          storage.removeFromSelection(actionProps);
          return;
        case "replace":
          storage.replaceSelection(actionProps);
          return;
      }
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
