/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from "react";
import { assert } from "@itwin/core-bentley";
import { GenericNodeKey, HierarchyNode, InstancesNodeKey, NonGroupingHierarchyNode } from "@itwin/presentation-hierarchies";
import { InstanceKey } from "@itwin/presentation-shared";
import { Selectable, Selectables, SelectionStorage } from "@itwin/unified-selection";
import { SelectionChangeType } from "../UseSelectionHandler.js";
import { TreeModelHierarchyNode, TreeModelRootNode } from "./TreeModel.js";

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

  /**
   * An optional function that allows customizing the `Selectable` object that gets created for generic hierarchy nodes. When
   * not supplied, the `Selectable` is created using the following signature:
   * ```ts
   * {
   *   identifier: treeModelNodeId,
   *   data: node,
   *   async *loadInstanceKeys() {},
   * }
   * ```
   *
   * @param node Hierarchy node to create a selectable for.
   * @param treeModelNodeId ID of the hierarchy node in the internal tree model. This ID uniquely identifies the node in the whole hierarchy, as opposed to `GenericNodeKey.id` contained within the `node`, which may not be unique.
   */
  createSelectableForGenericNode?: (node: NonGroupingHierarchyNode & { key: GenericNodeKey }, treeModelNodeId: string) => Selectable;

  /**
   * Unified selection storage to use for listening, getting and changing active selection.
   */
  selectionStorage: SelectionStorage;
}

/** @internal */
export function useUnifiedTreeSelection({
  sourceName,
  selectionStorage,
  getTreeModelNode,
  createSelectableForGenericNode = defaultCreateSelectableForGenericNode,
}: UseUnifiedTreeSelectionProps & { getTreeModelNode: (nodeId: string) => TreeModelHierarchyNode | TreeModelRootNode | undefined }): TreeSelectionOptions {
  const [options, setOptions] = useState<TreeSelectionOptions>(() => ({
    isNodeSelected: /* c8 ignore next */ () => false,
    selectNodes: /* c8 ignore next */ () => {},
  }));

  useEffect(() => {
    setOptions(createOptions(sourceName, selectionStorage, createSelectableForGenericNode, getTreeModelNode));
    return selectionStorage.selectionChangeEvent.addListener((args) => {
      if (args.level > 0) {
        return;
      }
      setOptions(createOptions(sourceName, selectionStorage, createSelectableForGenericNode, getTreeModelNode));
    });
  }, [selectionStorage, createSelectableForGenericNode, getTreeModelNode, sourceName]);

  return options;
}

const defaultCreateSelectableForGenericNode: NonNullable<UseUnifiedTreeSelectionProps["createSelectableForGenericNode"]> = (
  node,
  treeModelNodeId,
): Selectable => ({
  identifier: treeModelNodeId,
  data: node,
  async *loadInstanceKeys() {},
});

function createOptions(
  source: string,
  storage: SelectionStorage,
  createSelectableForGenericNode: NonNullable<UseUnifiedTreeSelectionProps["createSelectableForGenericNode"]>,
  getNode: (nodeId: string) => TreeModelHierarchyNode | TreeModelRootNode | undefined,
): TreeSelectionOptions {
  return {
    isNodeSelected: (nodeId: string) => {
      const node = getNode(nodeId);
      if (!node || node?.id === undefined) {
        return false;
      }
      return Object.entries(groupNodeSelectablesByIModelKey(node, createSelectableForGenericNode)).some(([imodelKey, nodeSelectables]) => {
        const storageSelectables = storage.getSelection({ imodelKey, level: 0 });
        return Selectables.hasAny(storageSelectables, nodeSelectables);
      });
    },

    selectNodes: (nodeIds: Array<string>, changeType: SelectionChangeType) => {
      const imodelSelectables: { [imodelKey: string]: Selectable[] } = {};
      for (const nodeId of nodeIds) {
        const node = getNode(nodeId);
        if (!node || node?.id === undefined) {
          return;
        }
        Object.entries(groupNodeSelectablesByIModelKey(node, createSelectableForGenericNode)).forEach(([imodelKey, nodeSelectables]) => {
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

function groupNodeSelectablesByIModelKey(
  modelNode: TreeModelHierarchyNode,
  createSelectableForGenericNode: NonNullable<UseUnifiedTreeSelectionProps["createSelectableForGenericNode"]>,
): { [imodelKey: string]: Selectable[] } {
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
    [""]: [createSelectableForGenericNode(hierarchyNode, modelNode.id)],
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
