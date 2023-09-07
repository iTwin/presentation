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
export type HierarchyNodeKey = InstancesNodeKey | ClassGroupingNodeKey;

/** @beta */
export interface HierarchyNode {
  key: HierarchyNodeKey;
  label: string;
  extendedData?: { [key: string]: any };
  children: undefined | boolean | Array<HierarchyNode>;
  autoExpand?: boolean;
}
