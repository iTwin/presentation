/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Tree */

import { ITreeDataProvider, TreeNodeItem } from "@bentley/ui-components";
import { IPresentationDataProvider } from "../common/IPresentationDataProvider";
import { NodeKey, NodePathElement } from "@bentley/presentation-common";

/**
 * Presentation tree data provider.
 * @public
 */
export interface IPresentationTreeDataProvider extends ITreeDataProvider, IPresentationDataProvider {
  /**
   * Returns a [[NodeKey]] from given [[TreeNodeItem]].
   */
  getNodeKey(node: TreeNodeItem): NodeKey;

  /**
   * Returns filtered node paths.
   */
  getFilteredNodePaths(filter: string): Promise<NodePathElement[]>;

  /**
   * Loads the hierarchy so on-demand requests and filtering works quicker
   * @alpha
   */
  loadHierarchy?(): Promise<void>;
}
