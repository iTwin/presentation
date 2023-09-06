/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ClassInfo, InstanceKey } from "./EC";

/** @beta */
export type TreeNodeKey =
  | {
      type: "instances";
      instanceKeys: InstanceKey[];
    }
  | {
      type: "class-grouping";
      class: ClassInfo;
    };

/** @beta */
export interface TreeNode {
  key: TreeNodeKey;
  label: string;
  extendedData?: { [key: string]: any };
  children: undefined | boolean | Array<TreeNode>;
  autoExpand?: boolean;
  directChildren?: any;
}
