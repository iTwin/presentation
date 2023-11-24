/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNodeAutoExpandProp, ProcessedInstanceHierarchyNode } from "../../../HierarchyNode";
import { GroupingHandlerResult } from "../Grouping";
import { getGroupingBaseParamsOptionsFromParentNode, OptionsAccessor } from "./Shared";

/** @internal */
export function assignAutoExpand(props: GroupingHandlerResult): GroupingHandlerResult {
  for (const node of props.grouped) {
    const baseParams = getGroupingBaseParamsOptionsFromParentNode(node, props.groupingType, getAutoExpandOptionsFromNodeProcessingParams);
    if (baseParams === "always" || (baseParams === "single-child" && node.children.length === 1)) {
      node.autoExpand = true;
    }
  }

  return props;
}

function getAutoExpandOptionsFromNodeProcessingParams(
  nodes: ProcessedInstanceHierarchyNode[],
  autoExpandOptionsAccessor: OptionsAccessor,
): HierarchyNodeAutoExpandProp | undefined {
  let autoExpand: HierarchyNodeAutoExpandProp | undefined;
  for (const node of nodes) {
    if (autoExpand === "always") {
      break;
    }
    const params = node.processingParams ? autoExpandOptionsAccessor(node.processingParams) : undefined;
    autoExpand = !!params?.autoExpand ? params.autoExpand : autoExpand;
  }
  return autoExpand;
}
