/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback } from "react";
import { omit } from "@itwin/core-bentley";
import {
  GroupingNodeKey, InstanceKey, Key, KeySet, PresentationQuery, PresentationQueryBinding, StandardNodeTypes,
} from "@itwin/presentation-common";
import { useUnifiedSelectionContext } from "@itwin/presentation-components";
import { HierarchyNode, parseFullClassName } from "@itwin/presentation-hierarchy-builder";
import { isTreeModelHierarchyNode, TreeModelHierarchyNode, TreeModelRootNode } from "./TreeModel";

/** @internal */
export interface TreeSelectionOptions {
  isNodeSelected: (nodeId: string) => boolean;
  selectNode: (nodeId: string, isSelected: boolean) => void;
}

/** @internal */
export interface UseUnifiedTreeSelectionProps {
  getNode: (nodeId: string) => TreeModelHierarchyNode | TreeModelRootNode | undefined;
}

/** @internal */
export function useUnifiedTreeSelection({ getNode }: UseUnifiedTreeSelectionProps): TreeSelectionOptions {
  const context = useUnifiedSelectionContext();

  const isNodeSelected = useCallback(
    (nodeId: string) => {
      const node = getNode(nodeId);
      if (!context || !node || !isTreeModelHierarchyNode(node)) {
        return false;
      }

      const selection = context.getSelection(0);
      return selection.hasAny(getNodeKeys(node.nodeData));
    },
    [context, getNode],
  );

  const selectNode = useCallback(
    (nodeId: string, isSelected: boolean) => {
      const node = getNode(nodeId);
      if (!context || !node || !isTreeModelHierarchyNode(node)) {
        return;
      }

      const action = isSelected ? context.addToSelection : context.removeFromSelection;
      action(getNodeKeys(node.nodeData));
    },
    [context, getNode],
  );

  return {
    isNodeSelected,
    selectNode,
  };
}

function getNodeKeys(node: HierarchyNode): Key[] {
  if (HierarchyNode.isCustom(node)) {
    return [
      {
        version: 3,
        type: node.key,
        pathFromRoot: [...node.parentKeys, node.key].map((pk) => JSON.stringify(pk)),
      },
    ];
  }
  if (HierarchyNode.isInstancesNode(node)) {
    return node.key.instanceKeys.map((ik) => {
      const { schemaName, className } = parseFullClassName(ik.className);
      return { className: `${schemaName}:${className}`, id: ik.id };
    });
  }
  if (HierarchyNode.isGroupingNode(node)) {
    return [
      {
        version: 3,
        pathFromRoot: [...node.parentKeys.map((pk) => JSON.stringify(pk)), JSON.stringify(omit(node.key, ["groupedInstanceKeys"]))],
        groupedInstancesCount: node.key.groupedInstanceKeys.length,
        instanceKeysSelectQuery: createInstanceKeysSelectQuery(node.key.groupedInstanceKeys),
        ...(() => {
          switch (node.key.type) {
            case "class-grouping":
              return { type: StandardNodeTypes.ECClassGroupingNode, className: node.key.class.name };
            case "label-grouping":
              return { type: StandardNodeTypes.DisplayLabelGroupingNode, label: node.key.label };
            case "property-grouping:value":
            case "property-grouping:range":
              return { type: StandardNodeTypes.ECPropertyGroupingNode, className: node.key.propertyClassName, propertyName: node.key.propertyName };
            case "property-grouping:other":
              return { type: StandardNodeTypes.ECPropertyGroupingNode };
          }
        })(),
      } as GroupingNodeKey,
    ];
  }
  return [];
}

function createInstanceKeysSelectQuery(keys: InstanceKey[]): PresentationQuery {
  let query = "";
  const bindings: PresentationQueryBinding[] = [];
  new KeySet(keys).instanceKeys.forEach((idsSet, fullClassName) => {
    const { schemaName, className } = parseFullClassName(fullClassName);
    const ids = [...idsSet];
    if (query.length > 0) {
      query += ` UNION ALL `;
    }
    query += `SELECT ECClassId, ECInstanceId FROM [${schemaName}].[${className}] WHERE ECInstanceId IN (${ids.map(() => "?").join(",")})`;
    ids.forEach((id) => bindings.push({ type: "Id" as const, value: id }));
  });
  return { query, bindings };
}
