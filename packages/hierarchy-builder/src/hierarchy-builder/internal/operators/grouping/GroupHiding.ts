/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ProcessedInstanceHierarchyNode } from "../../../HierarchyNode";
import { GroupingHandlerResult } from "../Grouping";
import { getGroupingBaseParamsOptionsFromParentNode, OptionsAccessor } from "./Shared";

/** @internal */
export function applyGroupHidingParams(props: GroupingHandlerResult, extraSiblings: number): GroupingHandlerResult {
  if (props.grouped.length === 0) {
    return props;
  }

  // handle the "no siblings" case
  if (props.grouped.length === 1 && props.ungrouped.length === 0 && extraSiblings === 0) {
    const baseParams = getGroupingBaseParamsOptionsFromParentNode(props.grouped[0], props.groupingType, getHideOptionsFromNodeProcessingParams);
    if (typeof baseParams === "object" && baseParams.hideIfNoSiblings) {
      return { groupingType: props.groupingType, grouped: [], ungrouped: props.grouped[0].children };
    }
  }

  // handle the "no children" case
  const finalGroupings: GroupingHandlerResult = { ...props, ungrouped: [...props.ungrouped], grouped: [] };
  for (const node of props.grouped) {
    if (node.children.length === 1) {
      const baseParams = getGroupingBaseParamsOptionsFromParentNode(node, props.groupingType, getHideOptionsFromNodeProcessingParams);
      if (typeof baseParams === "object" && baseParams.hideIfOneGroupedNode) {
        finalGroupings.ungrouped.push(node.children[0]);
        continue;
      }
    }
    finalGroupings.grouped.push(node);
  }
  return finalGroupings;
}

function getHideOptionsFromNodeProcessingParams(
  nodes: ProcessedInstanceHierarchyNode[],
  hideOptionsAccessor: OptionsAccessor,
): { hideIfNoSiblings: boolean; hideIfOneGroupedNode: boolean } {
  let hideIfNoSiblings = false;
  let hideIfOneGroupedNode = false;
  for (const node of nodes) {
    if (hideIfNoSiblings && hideIfOneGroupedNode) {
      break;
    }
    const params = node.processingParams ? hideOptionsAccessor(node.processingParams) : undefined;
    hideIfNoSiblings ||= !!params?.hideIfNoSiblings;
    hideIfOneGroupedNode ||= !!params?.hideIfOneGroupedNode;
  }
  return { hideIfNoSiblings, hideIfOneGroupedNode };
}
