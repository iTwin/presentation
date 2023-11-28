/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { GroupingHandlerResult, GroupingType, ProcessedInstancesGroupingHierarchyNode } from "../Grouping";
import { iterateChildNodeGroupingParams } from "./Shared";

/** @internal */
export function applyGroupHidingParams(props: GroupingHandlerResult, extraSiblings: number): GroupingHandlerResult {
  if (props.grouped.length === 0) {
    return props;
  }

  // handle the "no siblings" case
  if (props.grouped.length === 1 && props.ungrouped.length === 0 && extraSiblings === 0) {
    const hideParams = getHideOptionsFromNodeProcessingParams(props.grouped[0], props.groupingType);
    if (hideParams.hideIfNoSiblings) {
      return { groupingType: props.groupingType, grouped: [], ungrouped: props.grouped[0].children };
    }
  }

  // handle the "no children" case
  const finalGroupings: GroupingHandlerResult = { ...props, ungrouped: [...props.ungrouped], grouped: [] };
  for (const node of props.grouped) {
    if (node.children.length === 1) {
      const hideParams = getHideOptionsFromNodeProcessingParams(node, props.groupingType);
      if (hideParams.hideIfOneGroupedNode) {
        finalGroupings.ungrouped.push(node.children[0]);
        continue;
      }
    }
    finalGroupings.grouped.push(node);
  }
  return finalGroupings;
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
