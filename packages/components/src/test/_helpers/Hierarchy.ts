/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { ECClassGroupingNodeKey, ECInstancesNodeKey, Node, NodePathElement, StandardNodeTypes } from "@itwin/presentation-common";
import { createTestECInstanceKey } from "./Common";
import { createTestLabelDefinition } from "./LabelDefinition";

export function createTestECInstancesNodeKey(key?: Partial<ECInstancesNodeKey>): ECInstancesNodeKey {
  return {
    type: StandardNodeTypes.ECInstancesNode,
    version: 2,
    pathFromRoot: key?.pathFromRoot ?? ["parentHash", "childHash"],
    instanceKeys: key?.instanceKeys ?? [createTestECInstanceKey(), createTestECInstanceKey()],
  };
};

export function createTestECClassGroupingNodeKey(key?: Partial<ECClassGroupingNodeKey>): ECClassGroupingNodeKey {
  return {
    type: StandardNodeTypes.ECClassGroupingNode,
    version: 2,
    pathFromRoot: key?.pathFromRoot ?? ["hash"],
    className: key?.className ?? "TestSchema:GroupedClass",
    groupedInstancesCount: key?.groupedInstancesCount ?? 2,
  };
}

export function createTestECInstancesNode(props?: Partial<Node>): Node {
  return {
    key: props?.key ?? createTestECInstancesNodeKey(),
    label: props?.label ?? createTestLabelDefinition(),
    description: props?.description ?? "testDescription",
    hasChildren: props?.hasChildren ?? false,
    isSelectionDisabled: props?.isSelectionDisabled ?? false,
    isEditable: props?.isEditable ?? false,
    isExpanded: props?.isExpanded ?? false,
  };
};

export function createRandomNodePathElement(element?: Partial<NodePathElement>): NodePathElement {
  return {
    node: element?.node ?? createTestECInstancesNode(),
    index: element?.index ?? 0,
    children: element?.children ?? [],
    isMarked: element?.isMarked,
    filteringData: element?.filteringData,
  };
};
