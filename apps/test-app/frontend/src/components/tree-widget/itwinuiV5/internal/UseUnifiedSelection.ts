/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from "react";
import { assert } from "@itwin/core-bentley";
import { HierarchyNode, InstancesNodeKey } from "@itwin/presentation-hierarchies";
import { InstanceKey } from "@itwin/presentation-shared";
import { Selectable, Selectables, SelectionStorage } from "@itwin/unified-selection";
import { useUnifiedSelectionContext } from "../UnifiedSelectionContext.js";
import { SelectionChangeType } from "../UseSelectionHandler.js";
import { isTreeModelHierarchyNode, TreeModelHierarchyNode, TreeModelNode, TreeModelRootNode } from "./TreeModel.js";

/** @internal */
export interface TreeSelectionOptions {
  isNodeSelected: (nodeId: string) => boolean;
  selectNodes: (nodeIds: Array<string>, changeType: SelectionChangeType) => void;
}

/** @public */
export interface UseUnifiedTreeSelectionProps {
  /**
   * Identifier to distinguish this source of changes to the unified selection from another ones in the application.
   */
  sourceName: string;
}

/** @internal */
export function useUnifiedTreeSelection({
  sourceName,
  getTreeModelNode,
}: UseUnifiedTreeSelectionProps & { getTreeModelNode: (nodeId: string) => TreeModelNode | TreeModelRootNode | undefined }): TreeSelectionOptions {
  const [options, setOptions] = useState<TreeSelectionOptions>(() => ({
    isNodeSelected: /* c8 ignore next */ () => false,
    selectNodes: /* c8 ignore next */ () => {},
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

    setOptions(createOptions(sourceName, selectionStorage, getTreeModelNode));
    return selectionStorage.selectionChangeEvent.addListener((args) => {
      if (args.level > 0) {
        return;
      }
      setOptions(createOptions(sourceName, selectionStorage, getTreeModelNode));
    });
  }, [selectionStorage, getTreeModelNode, sourceName]);

  return options;
}

function createOptions(
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
      return Object.entries(groupNodeSelectablesByIModelKey(node)).some(([imodelKey, nodeSelectables]) => {
        const storageSelectables = storage.getSelection({ imodelKey, level: 0 });
        return Selectables.hasAny(storageSelectables, nodeSelectables);
      });
    },

    selectNodes: (nodeIds: Array<string>, changeType: SelectionChangeType) => {
      const imodelSelectables: { [imodelKey: string]: Selectable[] } = {};
      for (const nodeId of nodeIds) {
        const node = getNode(nodeId);
        if (!node || !isTreeModelHierarchyNode(node)) {
          return;
        }
        Object.entries(groupNodeSelectablesByIModelKey(node)).forEach(([imodelKey, nodeSelectables]) => {
          let selectablesList = imodelSelectables[imodelKey];
          if (!selectablesList) {
            selectablesList = [];
            imodelSelectables[imodelKey] = selectablesList;
          }
          nodeSelectables.forEach((selectable) => selectablesList.push(selectable));
        });
      }
      Object.entries(imodelSelectables).forEach(([imodelKey, selectables]) => {
        const actionProps = { imodelKey, source, selectables, level: 0 };
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
      });
    },
  };
}

function groupNodeSelectablesByIModelKey(modelNode: TreeModelHierarchyNode): { [imodelKey: string]: Selectable[] } {
  const hierarchyNode = modelNode.nodeData;
  if (HierarchyNode.isInstancesNode(hierarchyNode)) {
    return groupIModelInstanceKeys(hierarchyNode.key.instanceKeys);
  }
  if (HierarchyNode.isGroupingNode(hierarchyNode)) {
    return Object.entries(groupIModelInstanceKeys(hierarchyNode.groupedInstanceKeys)).reduce(
      (imodelSelectables, [imodelKey, instanceKeys]) => ({
        ...imodelSelectables,
        [imodelKey]: [
          {
            identifier: modelNode.id,
            data: hierarchyNode,
            async *loadInstanceKeys() {
              for (const key of instanceKeys) {
                yield key;
              }
            },
          },
        ],
      }),
      {} as { [imodelKey: string]: Selectable[] },
    );
  }
  assert(HierarchyNode.isGeneric(hierarchyNode));
  return {
    // note: generic nodes aren't associated with an imodel
    [""]: [
      {
        identifier: modelNode.id,
        data: hierarchyNode,
        async *loadInstanceKeys() {},
      },
    ],
  };
}

function groupIModelInstanceKeys(instanceKeys: InstancesNodeKey["instanceKeys"]) {
  return instanceKeys.reduce(
    (imodelSelectables, key) => {
      const imodelKey = key.imodelKey ?? "";
      let selectablesList = imodelSelectables[imodelKey];
      if (!selectablesList) {
        selectablesList = [];
        imodelSelectables[imodelKey] = selectablesList;
      }
      selectablesList.push(key);
      return imodelSelectables;
    },
    {} as { [imodelKey: string]: InstanceKey[] },
  );
}
