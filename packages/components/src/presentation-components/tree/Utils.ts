/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */
/** @packageDocumentation
 * @module Tree
 */

import { Observable as RxjsObservable } from "rxjs/internal/Observable";
import { PropertyRecord } from "@itwin/appui-abstract";
import { CheckBoxState } from "@itwin/core-react";
import { NodeKey } from "@itwin/presentation-common";
import { StyleHelper } from "../common/StyleHelper.js";
import { createLabelRecord } from "../common/Utils.js";
import { InfoTreeNodeItemType } from "./PresentationTreeNodeItem.js";

import type { DelayLoadedTreeNodeItem, ItemColorOverrides, ItemStyle, Observable, TreeNodeItem, PageOptions as UiPageOptions } from "@itwin/components-react";
import type { LabelDefinition, Node, PartialNode, PageOptions as PresentationPageOptions } from "@itwin/presentation-common";
import type { PresentationInfoTreeNodeItem, PresentationTreeNodeItem } from "./PresentationTreeNodeItem.js";

/** @internal */
export interface CreateTreeNodeItemProps {
  appendChildrenCountForGroupingNodes?: boolean;
  customizeTreeNodeItem?: (item: Partial<DelayLoadedTreeNodeItem>, node: Partial<Node>) => void;
}

/** @internal */
export function createTreeNodeItems(nodes: ReadonlyArray<Readonly<Node>>, parentId?: string, props?: CreateTreeNodeItemProps): PresentationTreeNodeItem[] {
  const list = new Array<PresentationTreeNodeItem>();
  for (const node of nodes) {
    list.push(createTreeNodeItem(node, parentId, props));
  }
  return list;
}

/** @internal */
export function createTreeNodeItem(node: Readonly<Node>, parentId?: string, props?: CreateTreeNodeItemProps): PresentationTreeNodeItem {
  const item: PresentationTreeNodeItem = {
    id: createTreeNodeId(node.key),
    label: createNodeLabelRecord(node, !!props?.appendChildrenCountForGroupingNodes),
    key: node.key,
  };
  assignOptionalTreeNodeItemFields(item, node, parentId);
  const customizeItemCallback = props?.customizeTreeNodeItem ?? customizeTreeNodeItem;
  customizeItemCallback(item, node);
  return item;
}

/** @internal */
export function createPartialTreeNodeItem(node: PartialNode, parentId: string | undefined, props: CreateTreeNodeItemProps): Partial<PresentationTreeNodeItem> {
  const item: Partial<PresentationTreeNodeItem> = {};
  if (node.key !== undefined) {
    item.id = createTreeNodeId(node.key);
    item.label = createNodeLabelRecord(node, !!props.appendChildrenCountForGroupingNodes);
  }

  assignOptionalTreeNodeItemFields(item, node, parentId);
  const customizeItemCallback = props.customizeTreeNodeItem ?? customizeTreeNodeItem;
  customizeItemCallback(item, node);
  return item;
}

/** @internal */
export function createTreeNodeId(key: NodeKey): string {
  return [...key.pathFromRoot].reverse().join("/");
}

function assignOptionalTreeNodeItemFields(item: Partial<PresentationTreeNodeItem>, node: Partial<Node>, parentId?: string): void {
  if (node.key !== undefined) {
    item.key = node.key;
  }

  if (parentId) {
    item.parentId = parentId;
  }

  if (node.description) {
    item.description = node.description;
  }

  if (node.hasChildren) {
    item.hasChildren = true;
  }

  if (node.isExpanded) {
    item.autoExpand = true;
  }

  if (node.extendedData) {
    item.extendedData = node.extendedData;
  }
}

/**
 * Applies customization from [Node]($presentation-common) to [TreeNodeItem]($components-react).
 * @public
 * @deprecated in 3.x. This is a temporary function to apply deprecated [Node]($presentation-common) customization attributes on a [TreeNodeItem]($components-react).
 * The recommendation is to switch to using a custom customization function that looks at node's [Node.extendedData]($presentation-common) and applies
 * [TreeNodeItem]($components-react) customization based on values in extended data.
 * See [extended data usage page]($docs/presentation/customization/ExtendedDataUsage.md) for more details.
 */
/* c8 ignore start */
export function customizeTreeNodeItem(item: Partial<DelayLoadedTreeNodeItem>, node: Partial<Node>) {
  if (node.imageId) {
    item.icon = node.imageId;
  }

  if (hasCheckboxVisible(node) && node.isCheckboxVisible) {
    item.isCheckboxVisible = true;

    if (hasIsChecked(node) && node.isChecked) {
      item.checkBoxState = CheckBoxState.On;
    }

    if (hasIsCheckboxEnabled(node) && !node.isCheckboxEnabled) {
      item.isCheckboxDisabled = true;
    }
  }

  const style = createTreeNodeItemStyle(node);
  if (Object.keys(style).length > 0) {
    item.style = style;
  }
}

function createTreeNodeItemStyle(node: Partial<Node>): ItemStyle {
  const style: ItemStyle = {};
  if (StyleHelper.isBold(node)) {
    style.isBold = true;
  }

  if (StyleHelper.isItalic(node)) {
    style.isItalic = true;
  }

  const colorOverrides: ItemColorOverrides = {};
  const foreColor = StyleHelper.getForeColor(node);
  if (foreColor) {
    colorOverrides.color = foreColor;
  }

  const backColor = StyleHelper.getBackColor(node);
  if (backColor) {
    colorOverrides.backgroundColor = backColor;
  }

  if (Object.keys(colorOverrides).length > 0) {
    style.colorOverrides = colorOverrides;
  }

  return style;
}
/* c8 ignore end */

/** @internal */
export function pageOptionsUiToPresentation(pageOptions?: UiPageOptions): PresentationPageOptions | undefined {
  if (pageOptions) {
    return { ...pageOptions };
  }
  return undefined;
}

function createNodeLabelRecord(node: Node, appendChildrenCountForGroupingNodes: boolean): PropertyRecord {
  let labelDefinition = node.label;
  if (appendChildrenCountForGroupingNodes && NodeKey.isGroupingNodeKey(node.key)) {
    const countDefinition: LabelDefinition = {
      displayValue: `(${node.key.groupedInstancesCount})`,
      rawValue: `(${node.key.groupedInstancesCount})`,
      typeName: "string",
    };
    labelDefinition = {
      displayValue: `${labelDefinition.displayValue} ${countDefinition.displayValue}`,
      rawValue: {
        separator: " ",
        values: [labelDefinition, countDefinition],
      },
      typeName: "composite",
    };
  }
  return createLabelRecord(labelDefinition, "node_label");
}

/** @internal */
export function toRxjsObservable<T>(source: Observable<T>): RxjsObservable<T> {
  return new RxjsObservable((subscriber) => source.subscribe(subscriber));
}

export function createInfoNode(parentNode: TreeNodeItem | undefined, message: string, type?: InfoTreeNodeItemType): PresentationInfoTreeNodeItem {
  const id = parentNode ? `${parentNode.id}/info-node` : `/info-node/${message}`;
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

// TODO: Remove these types after itwinjs-core 4.x is dropped
type WithCheckboxVisible<T> = T & { isCheckboxVisible?: boolean };
type WithIsChecked<T> = T & { isChecked?: boolean };
type WithIsCheckboxEnabled<T> = T & { isCheckboxEnabled?: boolean };

function hasCheckboxVisible<T extends object>(node: T): node is WithCheckboxVisible<T> {
  return "isCheckboxVisible" in node;
}

function hasIsChecked<T extends object>(node: T): node is WithIsChecked<T> {
  return "isChecked" in node;
}

function hasIsCheckboxEnabled<T extends object>(node: T): node is WithIsCheckboxEnabled<T> {
  return "isCheckboxEnabled" in node;
}
