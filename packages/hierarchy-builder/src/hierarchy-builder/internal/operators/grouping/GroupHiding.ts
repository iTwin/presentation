/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ProcessedInstanceHierarchyNode } from "../../../HierarchyNode";
import { GroupingHandlerResult, GroupingType, ProcessedInstancesGroupingHierarchyNode } from "../Grouping";
import { mergeArraysByLabel } from "../Merging";
import { sortNodesByLabel } from "../Sorting";
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
  const grouped = new Array<ProcessedInstancesGroupingHierarchyNode>();
  const newUngroupedNodes = new Array<ProcessedInstanceHierarchyNode>();
  for (const node of props.grouped) {
    if (node.children.length === 1) {
      const hideParams = getHideOptionsFromNodeProcessingParams(node, props.groupingType);
      if (hideParams.hideIfOneGroupedNode) {
        newUngroupedNodes.push(node.children[0]);
        continue;
      }
    }
    grouped.push(node);
  }
  return {
    groupingType: props.groupingType,
    ungrouped: mergeArraysByLabel(props.ungrouped, sortNodesByLabel(newUngroupedNodes)),
    grouped,
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
