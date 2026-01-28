/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */
/** @packageDocumentation
 * @module Tree
 */

import type { ActiveMatchInfo, ITreeDataProvider, TreeNodeItem } from "@itwin/components-react";
import type { IModelConnection } from "@itwin/core-frontend";
import type { HierarchyRequestOptions, InstanceFilterDefinition, NodeKey, NodePathElement } from "@itwin/presentation-common";
import type { IPresentationDataProvider } from "../common/IPresentationDataProvider.js";

/**
 * Presentation tree data provider.
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export interface IPresentationTreeDataProvider extends ITreeDataProvider, IPresentationDataProvider {
  /**
   * Returns a [NodeKey]($presentation-common) from given [TreeNodeItem]($components-react).
   *
   * @deprecated in 4.0. Use [[isPresentationTreeNodeItem]] and [[PresentationTreeNodeItem.key]] to get [NodeKey]($presentation-common).
   */
  getNodeKey(node: TreeNodeItem): NodeKey;

  /**
   * Returns filtered node paths.
   */
  getFilteredNodePaths(filter: string): Promise<NodePathElement[]>;

  /**
   * Creates options for nodes request.
   */
  createRequestOptions(parentKey?: NodeKey, instanceFilter?: InstanceFilterDefinition): HierarchyRequestOptions<IModelConnection, NodeKey>;
}

/**
 * Filtered presentation tree data provider.
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export interface IFilteredPresentationTreeDataProvider extends IPresentationTreeDataProvider {
  /**
   * Applied filter.
   */
  filter: string;
  /**
   * Returns active match for given index.
   */
  getActiveMatch(index: number): ActiveMatchInfo | undefined;
  /**
   * Counts all filter matches.
   */
  countFilteringResults(nodePaths: ReadonlyArray<Readonly<NodePathElement>>): number;
  /**
   * Checks whether node matches applied filter or not.
   */
  nodeMatchesFilter(node: TreeNodeItem): boolean;
}
