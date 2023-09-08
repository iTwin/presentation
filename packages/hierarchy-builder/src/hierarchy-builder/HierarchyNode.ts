/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ClassInfo, InstanceKey } from "./EC";

/** @beta */
export interface InstancesNodeKey {
  type: "instances";
  instanceKeys: InstanceKey[];
}

/** @beta */
export interface ClassGroupingNodeKey {
  type: "class-grouping";
  class: ClassInfo;
}

/** @beta */
export type StandardHierarchyNodeKey = InstancesNodeKey | ClassGroupingNodeKey;

/** @beta */
export type HierarchyNodeKey = StandardHierarchyNodeKey | string;
/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace HierarchyNodeKey {
  export function isCustom(key: HierarchyNodeKey): key is string {
    return typeof key === "string";
  }
  export function isStandard(key: HierarchyNodeKey): key is StandardHierarchyNodeKey {
    return !!(key as StandardHierarchyNodeKey).type;
  }
  export function isInstances(key: HierarchyNodeKey): key is InstancesNodeKey {
    return isStandard(key) && key.type === "instances";
  }
  export function isClassGrouping(key: HierarchyNodeKey): key is ClassGroupingNodeKey {
    return isStandard(key) && key.type === "class-grouping";
  }
}

/** @beta */
export interface HierarchyNodeHandlingParams {
  hideIfNoChildren?: boolean;
  hideInHierarchy?: boolean;
  groupByClass?: boolean;
  mergeByLabelId?: string;
}

/** @beta */
export interface HierarchyNode {
  key: HierarchyNodeKey;
  label: string;
  extendedData?: { [key: string]: any };
  children: undefined | boolean | Array<HierarchyNode>;
  autoExpand?: boolean;
  params?: HierarchyNodeHandlingParams;
}
/** @beta */
export namespace HierarchyNode {
  export function isCustom<TNode extends HierarchyNode>(node: TNode): node is TNode & { key: string } {
    return HierarchyNodeKey.isCustom(node.key);
  }
  export function isStandard<TNode extends HierarchyNode>(node: TNode): node is TNode & { key: StandardHierarchyNodeKey } {
    return HierarchyNodeKey.isStandard(node.key);
  }
  export function isInstancesNode<TNode extends HierarchyNode>(node: TNode): node is TNode & { key: InstancesNodeKey } {
    return HierarchyNodeKey.isInstances(node.key);
  }
  export function isClassGroupingNode<TNode extends HierarchyNode>(node: TNode): node is TNode & { key: ClassGroupingNodeKey } {
    return HierarchyNodeKey.isClassGrouping(node.key);
  }
}
