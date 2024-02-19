/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useState } from "react";
import { omit } from "@itwin/core-bentley";
import { GroupingNodeKey, InstanceKey, Key, KeySet, PresentationQuery, PresentationQueryBinding, StandardNodeTypes } from "@itwin/presentation-common";
import { useUnifiedSelectionContext } from "@itwin/presentation-components";
import { HierarchyNode, parseFullClassName } from "@itwin/presentation-hierarchy-builder";
import { PresentationNode } from "./UseTreeState";

export interface TreeSelectionOptions {
  isNodeSelected: (node: PresentationNode) => boolean;
  selectNode: (node: PresentationNode, isSelected: boolean) => void;
}

export function useTreeSelection(): TreeSelectionOptions {
  const [selection, setSelection] = useState<Record<string, boolean>>({});

  const isNodeSelected = useCallback(
    (node: PresentationNode) => {
      return !!selection[node.id];
    },
    [selection],
  );

  const selectNode = useCallback((node: PresentationNode, isSelected: boolean) => {
    setSelection((prev) => ({
      ...prev,
      [node.id]: isSelected,
    }));
  }, []);

  return {
    isNodeSelected,
    selectNode,
  };
}

export function useUnifiedTreeSelection(): TreeSelectionOptions {
  const context = useUnifiedSelectionContext();

  const isNodeSelected = useCallback(
    (node: PresentationNode) => {
      if (!context) {
        return false;
      }

      const selection = context.getSelection(0);
      return selection.hasAny(getNodeKeys(node.nodeData));
    },
    [context],
  );

  const selectNode = useCallback(
    (node: PresentationNode, isSelected: boolean) => {
      if (!context) {
        return;
      }

      const action = isSelected ? context.addToSelection : context.removeFromSelection;
      action(getNodeKeys(node.nodeData));
    },
    [context],
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
