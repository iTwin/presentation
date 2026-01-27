/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */
/** @packageDocumentation
 * @module Tree
 */

import { DelayLoadedTreeNodeItem, ImmediatelyLoadedTreeNodeItem, TreeNodeItem } from "@itwin/components-react";
import { Descriptor, NodeKey } from "@itwin/presentation-common";
import { PresentationInstanceFilterInfo } from "../instance-filter-builder/PresentationFilterBuilder.js";

/**
 * Describes descriptor used for hierarchy level filtering. It can be lazy loaded.
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export type HierarchyLevelFilteringDescriptor = Descriptor | (() => Promise<Descriptor>);

/**
 * Data structure that describes information for tree item hierarchy level filtering.
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export interface PresentationTreeNodeItemFilteringInfo {
  /**
   * Descriptor that describes instances of this tree node item hierarchy level. It can be used to create instance
   * filter for filtering hierarchy level.
   *
   * If it is set to `undefined` hierarchy level under this node is not filterable.
   */
  descriptor: HierarchyLevelFilteringDescriptor;
  /**
   * List of filters applied on ancestor nodes. Some nodes might need to apply ancestor filter to get correct children.
   * For example, grouping node under filtered hierarchy level.
   */
  ancestorFilters: PresentationInstanceFilterInfo[];
  /** Currently active filter for this item hierarchy. */
  active?: PresentationInstanceFilterInfo;
}

/**
 * Data structure that describes tree node item created by [[PresentationTreeDataProvider]].
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export interface PresentationTreeNodeItem extends DelayLoadedTreeNodeItem {
  /** Node key of the node from which this item was created. */
  key: NodeKey;
  /** Information for this item hierarchy level filtering. */
  filtering?: PresentationTreeNodeItemFilteringInfo;
}

/**
 * Type that is assigned to a [[PresentationInfoTreeNodeItem]] to determine what type of message an item conveys.
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export enum InfoTreeNodeItemType {
  ResultSetTooLarge,
  BackendTimeout,
  Cancelled,
  NoChildren,
  Unset,
}

/**
 * Data structure that describes tree node item created by [[PresentationTreeDataProvider]]
 * which is used to carry information message.
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export interface PresentationInfoTreeNodeItem extends ImmediatelyLoadedTreeNodeItem {
  /** Message that his tree item is carrying. */
  message: string;
  /** Selection is disabled for this type of tree item. */
  isSelectionDisabled: true;
  /** This type of tree item cannot have children. */
  children: undefined;
  /** Type of item message */
  type: InfoTreeNodeItemType;
}

/**
 * Describes tree node item that supports hierarchy level filtering.
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export type FilterablePresentationTreeNodeItem = PresentationTreeNodeItem & {
  filtering: PresentationTreeNodeItemFilteringInfo;
};

/**
 * Function that checks if supplied [TreeNodeItem]($components-react) is [[PresentationTreeNodeItem]].
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export function isPresentationTreeNodeItem(item: TreeNodeItem): item is PresentationTreeNodeItem {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return (item as PresentationTreeNodeItem).key !== undefined;
}

/**
 * Function that checks if supplied [TreeNodeItem]($components-react) is [[PresentationInfoTreeNodeItem]].
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export function isPresentationInfoTreeNodeItem(item: TreeNodeItem): item is PresentationInfoTreeNodeItem {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return (item as PresentationInfoTreeNodeItem).message !== undefined;
}

/**
 * Function that check if supplied [[PresentationTreeNodeItem]] is [[FilterablePresentationTreeNodeItem]].
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export function isFilterablePresentationTreeNodeItem(item: PresentationTreeNodeItem): item is FilterablePresentationTreeNodeItem {
  return item.filtering !== undefined;
}
