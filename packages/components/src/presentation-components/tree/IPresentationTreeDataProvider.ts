/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { ActiveMatchInfo, ITreeDataProvider, TreeNodeItem } from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { HierarchyRequestOptions, InstanceFilterDefinition, NodeKey, NodePathElement } from "@itwin/presentation-common";
import { IPresentationDataProvider } from "../common/IPresentationDataProvider";

/**
 * Presentation tree data provider.
 * @public
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
