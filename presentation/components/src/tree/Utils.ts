/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Tree */

import { StyleHelper } from "../common/StyleHelper";
import { CheckBoxState } from "@bentley/ui-core";
import { Node, PageOptions as PresentationPageOptions } from "@bentley/presentation-common";
import { DelayLoadedTreeNodeItem, PageOptions as UiPageOptions } from "@bentley/ui-components";

/** @hidden */
export const createTreeNodeItems = (nodes: ReadonlyArray<Readonly<Node>>, parentId?: string): DelayLoadedTreeNodeItem[] => {
  const list = new Array<DelayLoadedTreeNodeItem>();
  for (const node of nodes)
    list.push(createTreeNodeItem(node, parentId));
  return list;
};

/** @hidden */
export const createTreeNodeItem = (node: Readonly<Node>, parentId?: string): DelayLoadedTreeNodeItem => {
  const item: DelayLoadedTreeNodeItem = {
    id: [...node.key.pathFromRoot].reverse().join("/"),
    label: node.label,
    extendedData: { key: node.key },
  };
  if (parentId)
    item.parentId = parentId;
  if (node.description)
    item.description = node.description;
  if (node.hasChildren)
    item.hasChildren = true;
  if (StyleHelper.isBold(node))
    item.labelBold = true;
  if (StyleHelper.isItalic(node))
    item.labelItalic = true;
  const foreColor = StyleHelper.getForeColor(node);
  if (foreColor)
    item.labelForeColor = foreColor;
  const backColor = StyleHelper.getBackColor(node);
  if (backColor)
    item.labelBackColor = backColor;
  if (node.isCheckboxVisible) {
    item.isCheckboxVisible = true;
    if (node.isChecked)
      item.checkBoxState = CheckBoxState.On;
    if (!node.isCheckboxEnabled)
      item.isCheckboxDisabled = true;
  }
  return item;
};

/** @hidden */
export const pageOptionsUiToPresentation = (pageOptions?: UiPageOptions): PresentationPageOptions | undefined => {
  if (pageOptions)
    return { ...pageOptions };
  return undefined;
};
