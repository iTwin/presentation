/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ClassInfo, InstanceKey } from "@itwin/presentation-common";

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

/** @internal */
export interface TreeNodeHandlingParams {
  hideIfNoChildren?: boolean;
  hideInHierarchy?: boolean;
  groupByClass?: boolean;
  mergeByLabelId?: string;
}

/** @internal */
export type InProgressTreeNode = TreeNode & TreeNodeHandlingParams;
