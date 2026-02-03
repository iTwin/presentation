/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from "react";
import { assert } from "@itwin/core-bentley";
import { HierarchyNode } from "@itwin/presentation-hierarchies";
import { Selectables } from "@itwin/unified-selection";

import type { GenericNodeKey, InstancesNodeKey, NonGroupingHierarchyNode } from "@itwin/presentation-hierarchies";
import type { InstanceKey } from "@itwin/presentation-shared";
import type { Selectable, SelectionStorage } from "@itwin/unified-selection";
import type { SelectionChangeType } from "../UseSelectionHandler.js";
import type { TreeModelHierarchyNode, TreeModelRootNode } from "./TreeModel.js";

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      if (!node || node.id === undefined) {
        return false;
      }
      for (const [imodelKey, nodeSelectables] of groupNodeSelectablesByIModelKey(node, createSelectableForGenericNode)) {
        const storageSelectables = storage.getSelection({ imodelKey, level: 0 });
        if (Selectables.hasAny(storageSelectables, nodeSelectables)) {
          return true;
        }
      }
      return false;
    },

    selectNodes: (nodeIds: Array<string>, changeType: SelectionChangeType) => {
      const imodelSelectables = new Map<string, Selectable[]>();
      for (const nodeId of nodeIds) {
        const node = getNode(nodeId);
        if (!node || node.id === undefined) {
          return;
        }
        for (const [imodelKey, nodeSelectables] of groupNodeSelectablesByIModelKey(node, createSelectableForGenericNode)) {
          let selectablesList = imodelSelectables.get(imodelKey);
          if (!selectablesList) {
            selectablesList = [];
            imodelSelectables.set(imodelKey, selectablesList);
          }
          nodeSelectables.forEach((selectable) => selectablesList.push(selectable));
        }
      }
      imodelSelectables.forEach((selectables, imodelKey) => {
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
): Map<string, Selectable[]> {
  const hierarchyNode = modelNode.nodeData;
  if (HierarchyNode.isInstancesNode(hierarchyNode)) {
    return groupIModelInstanceKeys(hierarchyNode.key.instanceKeys);
  }
  if (HierarchyNode.isGroupingNode(hierarchyNode)) {
    const groupingNodeSelectables = new Map<string, Selectable[]>();
    groupIModelInstanceKeys(hierarchyNode.groupedInstanceKeys).forEach((instanceKeys, imodelKey) => {
      groupingNodeSelectables.set(imodelKey, [
        {
          identifier: modelNode.id,
          data: hierarchyNode,
          async *loadInstanceKeys() {
            for (const key of instanceKeys) {
              yield key;
            }
          },
        },
      ]);
    });
    return groupingNodeSelectables;
  }
  assert(HierarchyNode.isGeneric(hierarchyNode));
  // note: generic nodes aren't associated with an imodel
  return new Map([["", [createSelectableForGenericNode(hierarchyNode, modelNode.id)]]]);
}

function groupIModelInstanceKeys(instanceKeys: InstancesNodeKey["instanceKeys"]) {
  return instanceKeys.reduce((imodelSelectables, key) => {
    const imodelKey = key.imodelKey ?? "";
    let selectablesList = imodelSelectables.get(imodelKey);
    if (!selectablesList) {
      selectablesList = [];
      imodelSelectables.set(imodelKey, selectablesList);
    }
    selectablesList.push(key);
    return imodelSelectables;
  }, new Map<string, InstanceKey[]>());
}
