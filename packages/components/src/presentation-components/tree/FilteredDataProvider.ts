/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import "../common/DisposePolyfill.js";
import {
  ActiveMatchInfo,
  DelayLoadedTreeNodeItem,
  PageOptions,
  SimpleTreeDataProvider,
  SimpleTreeDataProviderHierarchy,
  TreeNodeItem,
} from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { InstanceFilterDefinition, Node, NodeKey, NodePathElement } from "@itwin/presentation-common";
import { memoize } from "../common/Utils.js";
import { PresentationTreeDataProvider } from "./DataProvider.js";
import { IFilteredPresentationTreeDataProvider, IPresentationTreeDataProvider } from "./IPresentationTreeDataProvider.js";
import { PresentationTreeNodeItem } from "./PresentationTreeNodeItem.js";
import { createTreeNodeItem } from "./Utils.js";

/** @internal */
export interface FilteredPresentationTreeDataProviderProps {
  parentDataProvider: IPresentationTreeDataProvider;
  filter: string;
  paths: ReadonlyArray<Readonly<NodePathElement>>;
}

/**
 * Rules-driven presentation tree data provider that returns filtered results.
 * @internal
 */
export class FilteredPresentationTreeDataProvider implements IFilteredPresentationTreeDataProvider {
  private _parentDataProvider: IPresentationTreeDataProvider;
  private _filteredDataProvider: SimpleTreeDataProvider;
  private _filter: string;
  private _filteredResultMatches: Array<{ id: string; matchesCount: number }> = [];

  public constructor(props: FilteredPresentationTreeDataProviderProps) {
    const { filter, parentDataProvider } = props;
    this._parentDataProvider = parentDataProvider;
    this._filter = filter;

    const treeNodeItemFactory: (node: Node, parentId?: string) => PresentationTreeNodeItem =
      parentDataProvider instanceof PresentationTreeDataProvider
        ? (node, parentId) => createTreeNodeItem(node, parentId, parentDataProvider.props)
        : createTreeNodeItem;

    const hierarchy: SimpleTreeDataProviderHierarchy = new Map<string | undefined, TreeNodeItem[]>();
    this.createHierarchy(props.paths, hierarchy, treeNodeItemFactory);
    this._filteredDataProvider = new SimpleTreeDataProvider(hierarchy);
  }

  /* c8 ignore next - only here to meet interface's requirements, nothing to test */
  public [Symbol.dispose]() {}
  /* c8 ignore next - only here to meet interface's requirements, nothing to test */
  public dispose() {}

  public get rulesetId(): string {
    return this._parentDataProvider.rulesetId;
  }

  public get imodel(): IModelConnection {
    return this._parentDataProvider.imodel;
  }

  public get filter(): string {
    return this._filter;
  }

  public get parentDataProvider(): IPresentationTreeDataProvider {
    return this._parentDataProvider;
  }

  private createHierarchy(
    paths: ReadonlyArray<Readonly<NodePathElement>>,
    hierarchy: SimpleTreeDataProviderHierarchy,
    treeNodeItemFactory: (node: Node, parentId?: string) => PresentationTreeNodeItem,
    parentId?: string,
  ) {
    const treeNodes: DelayLoadedTreeNodeItem[] = [];
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const node = treeNodeItemFactory(path.node, parentId);

      if (path.filteringData && path.filteringData.matchesCount) {
        this._filteredResultMatches.push({ id: node.id, matchesCount: path.filteringData.matchesCount });
      }

      if (path.children.length !== 0) {
        this.createHierarchy(path.children, hierarchy, treeNodeItemFactory, node.id);
        node.hasChildren = true;
        node.autoExpand = true;
      } else {
        delete node.hasChildren;
        delete node.autoExpand;
      }

      treeNodes[i] = node;
    }
    hierarchy.set(parentId, treeNodes);
  }

  public getActiveMatch: (index: number) => ActiveMatchInfo | undefined = memoize((index: number): ActiveMatchInfo | undefined => {
    let activeMatch: ActiveMatchInfo | undefined;
    if (index <= 0) {
      return undefined;
    }

    let i = 1;
    for (const node of this._filteredResultMatches) {
      if (index < i + node.matchesCount) {
        activeMatch = {
          nodeId: node.id,
          matchIndex: index - i,
        };
        break;
      }

      i += node.matchesCount;
    }
    return activeMatch;
  });

  /** Count filtering results. Including multiple possible matches within node labels */
  public countFilteringResults(nodePaths: ReadonlyArray<Readonly<NodePathElement>>): number {
    let resultCount = 0;

    // Loops through root level only
    for (const path of nodePaths) {
      if (path.filteringData) {
        resultCount += path.filteringData.matchesCount + path.filteringData.childMatchesCount;
      }
    }

    return resultCount;
  }

  public async getNodes(parent?: TreeNodeItem, pageOptions?: PageOptions): Promise<DelayLoadedTreeNodeItem[]> {
    return this._filteredDataProvider.getNodes(parent, pageOptions);
  }

  public async getNodesCount(parent?: TreeNodeItem): Promise<number> {
    return this._filteredDataProvider.getNodesCount(parent);
  }

  public async getFilteredNodePaths(filter: string): Promise<NodePathElement[]> {
    return this._parentDataProvider.getFilteredNodePaths(filter);
  }

  public createRequestOptions(parentKey?: NodeKey, instanceFilter?: InstanceFilterDefinition) {
    return this._parentDataProvider.createRequestOptions(parentKey, instanceFilter);
  }

  /** @deprecated in 4.0. Use [[isPresentationTreeNodeItem]] and [[PresentationTreeNodeItem.key]] to get [NodeKey]($presentation-common). */
  /* c8 ignore start */
  public getNodeKey(node: TreeNodeItem): NodeKey {
    return this._parentDataProvider.getNodeKey(node);
  }
  /* c8 ignore end */

  /** Check if node matches currently applied filter */
  public nodeMatchesFilter(node: TreeNodeItem): boolean {
    return this._filteredResultMatches.some((result) => result.id === node.id);
  }
}
