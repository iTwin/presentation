/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNode, ParentHierarchyNode } from "../../../HierarchyNode";
import { GroupingHandlerResult } from "../Grouping";

/** @internal */
export function assignHierarchyDepth(props: GroupingHandlerResult, parentNode: ParentHierarchyNode | undefined): GroupingHandlerResult {
  const newDepth = parentNode && HierarchyNode.isGroupingNode(parentNode) && parentNode.hierarchyDepth ? parentNode.hierarchyDepth + 1 : 1;
  for (const node of props.grouped) {
    node.hierarchyDepth = newDepth;
  }
  return props;
}
