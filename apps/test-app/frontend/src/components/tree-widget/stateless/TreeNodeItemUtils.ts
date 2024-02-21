/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PropertyRecord } from "@itwin/appui-abstract";
import { DelayLoadedTreeNodeItem, TreeNodeItem } from "@itwin/components-react";
import { omit } from "@itwin/core-bentley";
import { InfoTreeNodeItemType, PresentationInfoTreeNodeItem } from "@itwin/presentation-components";
import { HierarchyNode, HierarchyNodeKey } from "@itwin/presentation-hierarchy-builder";

export function getHierarchyNode(item: TreeNodeItem): HierarchyNode | undefined {
  if ("__internal" in item) {
    return item.__internal as HierarchyNode;
  }
  return undefined;
}

export function createTreeNodeItem(node: HierarchyNode): DelayLoadedTreeNodeItem {
  if (node.children === undefined) {
    throw new Error("Invalid node: children not determined");
  }
  return {
    __internal: node,
    id: [
      ...node.parentKeys.map((key) => (typeof key === "string" ? key : convertObjectValuesToString(key))),
      HierarchyNodeKey.isCustom(node.key)
        ? node.key
        : HierarchyNodeKey.isInstances(node.key)
          ? convertObjectValuesToString(node.key)
          : convertObjectValuesToString(omit(node.key, ["groupedInstanceKeys"])),
    ].join(","),
    label: PropertyRecord.fromString(node.label, "Label"),
    icon: node.extendedData?.imageId,
    hasChildren: !!node.children,
    autoExpand: node.autoExpand,
  } as DelayLoadedTreeNodeItem;
}

function convertObjectValuesToString(obj: object): string {
  return Object.entries(obj)
    .map(([, value]) => {
      if (typeof value === "object") {
        return convertObjectValuesToString(value);
      }
      return String(value);
    })
    .join(",");
}

export function createInfoNode(parentNode: TreeNodeItem | undefined, message: string, type?: InfoTreeNodeItemType): PresentationInfoTreeNodeItem {
  const id = `${parentNode ? parentNode.id : ""}/info-node/${message}`;
  return {
    id,
    parentId: parentNode?.id,
    label: PropertyRecord.fromString(message),
    message,
    isSelectionDisabled: true,
    children: undefined,
    type: type ?? InfoTreeNodeItemType.Unset,
  };
}
