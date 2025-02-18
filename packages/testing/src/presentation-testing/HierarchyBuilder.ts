/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */
/** @packageDocumentation
 * @module Hierarchies
 */

import { TreeNodeItem } from "@itwin/components-react";
import { using } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { Omit, RegisteredRuleset, Ruleset } from "@itwin/presentation-common";
import { PresentationTreeDataProvider, PresentationTreeNodeItem } from "@itwin/presentation-components";
import { Presentation } from "@itwin/presentation-frontend";

/**
 * Structure that describes a Node with any indexed properties
 * except `children`.
 *
 * @public
 * @deprecated in 5.2. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export interface MappedNode {
  /** Indexer for all properties in this data structure */
  [index: string]: any;
  /** Prohibited property */
  children?: never;
}

/**
 * Node in a hierarchy.
 * @public
 * @deprecated in 5.2. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export interface HierarchyNode extends Omit<MappedNode, "children"> {
  /** Children of this node */
  children?: HierarchyNode[];
}

/**
 * A function that converts `TreeNodeItem` into a new custom object.
 * @public
 * @deprecated in 5.2. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export type NodeMappingFunc = (node: TreeNodeItem) => MappedNode;

/**
 * Default [[NodeMappingFunc]] implementation that outputs the whole `TreeNodeItem` object.
 * @public
 * @deprecated in 5.2. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export const defaultNodeMappingFunc: NodeMappingFunc = (node: TreeNodeItem) => {
  // Skip properties 'id', 'parentId' as they contain  internal stuff
  // that callers are most likely not interested in. Otherwise they can supply
  // a custom `NodeMappingFunc` that does return those properties as well.
  const { id, parentId, ...resultNode } = node; // eslint-disable-line @typescript-eslint/no-unused-vars
  return resultNode;
};

/**
 * Properties for creating a `HierarchyBuilder` instance.
 * @public
 * @deprecated in 5.2. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export interface HierarchyBuilderProps {
  /** The iModel to pull data from */
  imodel: IModelConnection;
  /**
   * A function that maps node to something that the user of
   * this API is interested in. E.g. custom implementation may skip some unimportant
   * node properties to make resulting object smaller and easier to read.
   */
  nodeMappingFunc?: NodeMappingFunc;
}

/**
 * A class that constructs simple node hierarchy from specified
 * imodel and ruleset.
 *
 * @public
 * @deprecated in 5.2. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export class HierarchyBuilder {
  private readonly _iModel: IModelConnection;
  private readonly _nodeMappingFunc: NodeMappingFunc;

  /** Constructor */
  constructor(props: HierarchyBuilderProps) {
    this._iModel = props.imodel;
    this._nodeMappingFunc = props.nodeMappingFunc ?? defaultNodeMappingFunc;
  }

  private async createSubHierarchy(nodes: TreeNodeItem[], dataProvider: PresentationTreeDataProvider) {
    const hierarchy: HierarchyNode[] = [];
    for (const node of nodes) {
      const { key: _key, ...nodeNoKey } = node as PresentationTreeNodeItem;
      const nodeIndex = hierarchy.push(this._nodeMappingFunc(nodeNoKey)) - 1;
      const childNodes = await dataProvider.getNodes(node);
      if (childNodes.length > 0) {
        hierarchy[nodeIndex].children = await this.createSubHierarchy(childNodes, dataProvider);
      }
    }
    return hierarchy;
  }

  private async doCreateHierarchy(rulesetId: string): Promise<HierarchyNode[]> {
    const dataProvider = new PresentationTreeDataProvider({ imodel: this._iModel, ruleset: rulesetId });
    const rootNodes = await dataProvider.getNodes();
    return this.createSubHierarchy(rootNodes, dataProvider);
  }

  /**
   * Create a hierarchy using the supplied presentation ruleset.
   * @param rulesetOrId Either a [Ruleset]($presentation-common) object or a ruleset id.
   */
  public async createHierarchy(rulesetOrId: Ruleset | string): Promise<HierarchyNode[]> {
    if (typeof rulesetOrId === "string") {
      return this.doCreateHierarchy(rulesetOrId);
    }

    return using(await Presentation.presentation.rulesets().add(rulesetOrId), async (ruleset: RegisteredRuleset) => {
      return this.doCreateHierarchy(ruleset.id);
    });
  }
}
