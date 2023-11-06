/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { BaseGroupingParams, HierarchyNode, HierarchyNodeHandlingParams } from "../../../HierarchyNode";
import { GroupingHandlerResult, GroupingType } from "../Grouping";

/** @internal */
export function assignAutoExpand(props: GroupingHandlerResult): GroupingHandlerResult {
  for (const node of props.grouped) {
    if (Array.isArray(node.children)) {
      const autoExpand = getGroupingAutoExpandOptionsFromParentNode(node, props.groupingType);
      if (autoExpand === "always" || (autoExpand === "single-child" && node.children.length === 1)) {
        node.autoExpand = true;
      }
    }
  }

  return props;
}

function getGroupingAutoExpandOptionsFromParentNode(parentNode: HierarchyNode, groupingType: GroupingType): string | undefined {
  // istanbul ignore else
  if (Array.isArray(parentNode.children)) {
    if (groupingType === "base-class") {
      return getAutoExpandOptionsFromNodeProcessingParams(parentNode.children, (p) => p.grouping?.byBaseClasses);
    }
    if (groupingType === "class") {
      return getAutoExpandOptionsFromNodeProcessingParams(parentNode.children, (p) =>
        typeof p.grouping?.byClass === "object" ? p.grouping.byClass : undefined,
      );
    }
    // istanbul ignore else
    if (groupingType === "label") {
      return getAutoExpandOptionsFromNodeProcessingParams(parentNode.children, (p) =>
        typeof p.grouping?.byLabel === "object" ? p.grouping.byLabel : undefined,
      );
    }
  }
  // istanbul ignore next
  return undefined;
}

function getAutoExpandOptionsFromNodeProcessingParams(
  nodes: HierarchyNode[],
  autoExpandOptionsAccessor: (params: HierarchyNodeHandlingParams) => BaseGroupingParams | undefined,
): string | undefined {
  for (const node of nodes) {
    const params = node.params ? autoExpandOptionsAccessor(node.params) : undefined;
    if (params?.autoExpand) {
      return params.autoExpand;
    }
  }
  return undefined;
}
