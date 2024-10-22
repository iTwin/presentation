/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { GroupingHandlerResult, GroupingType, ProcessedInstancesGroupingHierarchyNode } from "../Grouping.js";
import { iterateChildNodeGroupingParams } from "./Shared.js";

/** @internal */
export function applyGroupHidingParams(props: GroupingHandlerResult, extraSiblings: number): GroupingHandlerResult {
  const { grouped, ungrouped, groupingType } = props;
  if (grouped.length === 0) {
    return props;
  }

  // handle the "no siblings" case
  if (grouped.length === 1 && ungrouped.length === 0 && extraSiblings === 0) {
    const hideParams = getHideOptionsFromNodeProcessingParams(grouped[0], groupingType);
    if (hideParams.hideIfNoSiblings) {
      return { groupingType, grouped: [], ungrouped: grouped[0].children };
    }
  }

  // handle the "no children" case
  const filteredGrouped = new Array<ProcessedInstancesGroupingHierarchyNode>();
  for (const node of grouped) {
    if (node.children.length === 1) {
      const hideParams = getHideOptionsFromNodeProcessingParams(node, groupingType);
      if (hideParams.hideIfOneGroupedNode) {
        ungrouped.push(node.children[0]);
        continue;
      }
    }
    filteredGrouped.push(node);
  }
  return {
    groupingType,
    grouped: filteredGrouped,
    ungrouped,
  };
}

function getHideOptionsFromNodeProcessingParams(
  groupingNode: ProcessedInstancesGroupingHierarchyNode,
  groupingType: GroupingType,
): { hideIfNoSiblings: boolean; hideIfOneGroupedNode: boolean } {
  let hideIfNoSiblings = false;
  let hideIfOneGroupedNode = false;
  iterateChildNodeGroupingParams(groupingNode, groupingType, (groupingProps) => {
    if (hideIfNoSiblings && hideIfOneGroupedNode) {
      return true;
    }
    hideIfNoSiblings ||= !!groupingProps?.hideIfNoSiblings;
    hideIfOneGroupedNode ||= !!groupingProps?.hideIfOneGroupedNode;
    return;
  });
  return { hideIfNoSiblings, hideIfOneGroupedNode };
}
