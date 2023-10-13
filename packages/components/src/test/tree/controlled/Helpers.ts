/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PropertyRecord } from "@itwin/appui-abstract";
import { TreeModelNode, TreeModelNodeInput, TreeNodeItem } from "@itwin/components-react";
import { CheckBoxState } from "@itwin/core-react";
import { PresentationInfoTreeNodeItem, PresentationTreeNodeItem } from "../../../presentation-components/tree/PresentationTreeNodeItem";
import { createTestECInstancesNodeKey } from "../../_helpers/Hierarchy";

export function createTreeNodeItem(item?: Partial<PresentationTreeNodeItem>): PresentationTreeNodeItem {
  return {
    id: item?.id ?? "node_id",
    key: item?.key ?? createTestECInstancesNodeKey(),
    label: item?.label ?? PropertyRecord.fromString("Node Label"),
    ...item,
  };
}

export function createInfoTreeNodeItem(item?: Partial<PresentationInfoTreeNodeItem>): PresentationInfoTreeNodeItem {
  return {
    id: item?.id ?? "info_node_item",
    label: item?.label ?? PropertyRecord.fromString("Info Node Label"),
    message: item?.message ?? "",
    isSelectionDisabled: true,
    children: undefined,
    type: item?.type,
  };
}

export function createTreeModelNode(node?: Partial<TreeModelNode>, nodeItem?: TreeNodeItem): TreeModelNode {
  const label = nodeItem?.label ?? node?.label ?? PropertyRecord.fromString("TestLabel");
  return {
    id: node?.id ?? nodeItem?.id ?? "0",
    parentId: nodeItem?.parentId ?? node?.parentId,
    numChildren: node?.numChildren,
    depth: node?.depth ?? 0,
    isExpanded: node?.isExpanded ?? false,
    isSelected: node?.isSelected ?? false,
    description: nodeItem?.description ?? node?.description ?? "Node Description",
    checkbox: node?.checkbox ?? {
      isDisabled: false,
      isVisible: true,
      state: CheckBoxState.Off,
    },
    label,
    item: nodeItem ?? createTreeNodeItem({ label }),
  };
}

export function createTreeModelNodeInput(input?: Partial<Omit<TreeModelNodeInput, "item"> & { item?: Partial<PresentationTreeNodeItem> }>): TreeModelNodeInput {
  const id = input?.id ?? "0";
  const label = input?.label ?? PropertyRecord.fromString(input?.id ?? "TestNode");
  return {
    ...input,
    id,
    label,
    item: createTreeNodeItem({ id, label, ...input?.item }),
    isExpanded: input?.isExpanded ?? false,
    isSelected: input?.isSelected ?? false,
    isLoading: input?.isLoading ?? false,
  };
}
