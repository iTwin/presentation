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
import {
  DelayLoadedTreeNodeItem,
  Observable,
  TreeNodeItem,
  PageOptions as UiPageOptions,
} from "@itwin/components-react";
import {
  LabelDefinition,
  Node,
  NodeKey,
  PartialNode,
  PageOptions as PresentationPageOptions,
} from "@itwin/presentation-common";
import { createLabelRecord } from "../common/Utils.js";
import {
  InfoTreeNodeItemType,
  PresentationInfoTreeNodeItem,
  PresentationTreeNodeItem,
} from "./PresentationTreeNodeItem.js";

/** @internal */
export interface CreateTreeNodeItemProps {
  appendChildrenCountForGroupingNodes?: boolean;
  customizeTreeNodeItem?: (item: Partial<DelayLoadedTreeNodeItem>, node: Partial<Node>) => void;
}

/** @internal */
export function createTreeNodeItems(
  nodes: ReadonlyArray<Readonly<Node>>,
  parentId?: string,
  props?: CreateTreeNodeItemProps,
): PresentationTreeNodeItem[] {
  const list = new Array<PresentationTreeNodeItem>();
  for (const node of nodes) {
    list.push(createTreeNodeItem(node, parentId, props));
  }
  return list;
}

/** @internal */
export function createTreeNodeItem(
  node: Readonly<Node>,
  parentId?: string,
  props?: CreateTreeNodeItemProps,
): PresentationTreeNodeItem {
  const item: PresentationTreeNodeItem = {
    id: createTreeNodeId(node.key),
    label: createNodeLabelRecord(node, !!props?.appendChildrenCountForGroupingNodes),
    key: node.key,
  };
  assignOptionalTreeNodeItemFields(item, node, parentId);
  if (props?.customizeTreeNodeItem) {
    props.customizeTreeNodeItem(item, node);
  }
  return item;
}

/** @internal */
export function createPartialTreeNodeItem(
  node: PartialNode,
  parentId: string | undefined,
  props: CreateTreeNodeItemProps,
): Partial<PresentationTreeNodeItem> {
  const item: Partial<PresentationTreeNodeItem> = {};
  if (node.key !== undefined) {
    item.id = createTreeNodeId(node.key);
    item.label = createNodeLabelRecord(node, !!props.appendChildrenCountForGroupingNodes);
  }

  assignOptionalTreeNodeItemFields(item, node, parentId);
  if (props.customizeTreeNodeItem) {
    props.customizeTreeNodeItem(item, node);
  }
  return item;
}

/** @internal */
export function createTreeNodeId(key: NodeKey): string {
  return [...key.pathFromRoot].reverse().join("/");
}

function assignOptionalTreeNodeItemFields(
  item: Partial<PresentationTreeNodeItem>,
  node: Partial<Node>,
  parentId?: string,
): void {
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
      rawValue: { separator: " ", values: [labelDefinition, countDefinition] },
      typeName: "composite",
    };
  }
  return createLabelRecord(labelDefinition, "node_label");
}

/** @internal */
export function toRxjsObservable<T>(source: Observable<T>): RxjsObservable<T> {
  return new RxjsObservable((subscriber) => source.subscribe(subscriber));
}

export function createInfoNode(
  parentNode: TreeNodeItem | undefined,
  message: string,
  type?: InfoTreeNodeItemType,
): PresentationInfoTreeNodeItem {
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
