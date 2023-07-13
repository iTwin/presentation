/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ClassInfo, InstanceKey } from "@itwin/presentation-common";

export type TreeNodeKey =
  | {
      type: "instances";
      instanceKeys: InstanceKey[];
    }
  | {
      type: "class-grouping";
      class: ClassInfo;
    };

export interface TreeNode {
  key: TreeNodeKey;
  label: string;
  extendedData?: { [key: string]: any };
  children: undefined | boolean | Array<TreeNode>;
  autoExpand?: boolean;
  directChildren?: any;
}

export interface TreeNodeHandlingParams {
  hideIfNoChildren?: boolean;
  hideInHierarchy?: boolean;
  groupByClass?: boolean;
  mergeByLabelId?: string;
}

export type InProgressTreeNode = TreeNode & TreeNodeHandlingParams;
