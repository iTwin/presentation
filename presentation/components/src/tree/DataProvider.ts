/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Tree */

import * as _ from "lodash";
import { IModelConnection } from "@bentley/imodeljs-frontend";
import { NodeKey, NodePathElement, HierarchyRequestOptions } from "@bentley/presentation-common";
import { Presentation } from "@bentley/presentation-frontend";
import { DelayLoadedTreeNodeItem, TreeNodeItem, PageOptions } from "@bentley/ui-components";
import { createTreeNodeItems, pageOptionsUiToPresentation } from "./Utils";
import { IPresentationTreeDataProvider } from "./IPresentationTreeDataProvider";

/**
 * Presentation Rules-driven tree data provider.
 */
export class PresentationTreeDataProvider implements IPresentationTreeDataProvider {
  private _rulesetId: string;
  private _imodel: IModelConnection;

  /**
   * Constructor.
   * @param imodel Connection to an imodel to pull data from.
   * @param rulesetId Id of the ruleset used by this data provider.
   */
  public constructor(imodel: IModelConnection, rulesetId: string) {
    this._rulesetId = rulesetId;
    this._imodel = imodel;
  }

  /** Id of the ruleset used by this data provider */
  public get rulesetId(): string { return this._rulesetId; }

  /** [[IModelConnection]] used by this data provider */
  public get imodel(): IModelConnection { return this._imodel; }

  /** Called to get extended options for node requests */
  private createRequestOptions(): HierarchyRequestOptions<IModelConnection> {
    return {
      imodel: this._imodel,
      rulesetId: this._rulesetId,
    };
  }

  /**
   * Returns a [[NodeKey]] from given [[TreeNodeItem]].
   * **Warning:** the `node` must be created by this data provider.
   */
  public getNodeKey(node: TreeNodeItem): NodeKey {
    return node.extendedData.key as NodeKey;
  }

  /**
   * Returns nodes
   * @param parentNode The parent node to return children for.
   * @param pageOptions Information about the requested page of data.
   */
  public getNodes = _.memoize(async (parentNode?: TreeNodeItem, pageOptions?: PageOptions): Promise<DelayLoadedTreeNodeItem[]> => {
    if (parentNode) {
      const parentKey = this.getNodeKey(parentNode);
      const childNodes = await Presentation.presentation.getChildren({ ...this.createRequestOptions(), paging: pageOptionsUiToPresentation(pageOptions) }, parentKey);
      return createTreeNodeItems(childNodes, parentNode.id);
    }
    const rootNodes = await Presentation.presentation.getRootNodes({ ...this.createRequestOptions(), paging: pageOptionsUiToPresentation(pageOptions) });
    return createTreeNodeItems(rootNodes);
  }, MemoizationHelpers.getNodesKeyResolver);

  /**
   * Returns the total number of nodes
   * @param parentNode The parent node to return children count for.
   */
  public getNodesCount = _.memoize(async (parentNode?: TreeNodeItem): Promise<number> => {
    if (parentNode) {
      const parentKey = this.getNodeKey(parentNode);
      return Presentation.presentation.getChildrenCount(this.createRequestOptions(), parentKey);
    }
    return Presentation.presentation.getRootNodesCount(this.createRequestOptions());
  }, MemoizationHelpers.getNodesCountKeyResolver);

  /**
   * Returns filtered node paths.
   * @param filter Filter.
   */
  public getFilteredNodePaths = async (filter: string): Promise<NodePathElement[]> => {
    return Presentation.presentation.getFilteredNodePaths(this.createRequestOptions(), filter);
  }
}

class MemoizationHelpers {
  public static createKeyForPageOptions(pageOptions?: PageOptions) {
    if (!pageOptions)
      return "0/0";
    return `${(pageOptions.start) ? pageOptions.start : 0}/${(pageOptions.size) ? pageOptions.size : 0}`;
  }
  public static createKeyForTreeNodeItem(item?: TreeNodeItem) { return item ? item.id : ""; }
  public static getNodesKeyResolver(parent?: TreeNodeItem, pageOptions?: PageOptions) {
    return `${MemoizationHelpers.createKeyForTreeNodeItem(parent)}/${MemoizationHelpers.createKeyForPageOptions(pageOptions)}`;
  }
  public static getNodesCountKeyResolver(parent?: TreeNodeItem) { return MemoizationHelpers.createKeyForTreeNodeItem(parent); }
}
