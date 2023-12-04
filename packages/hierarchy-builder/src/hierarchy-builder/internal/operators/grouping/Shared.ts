/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNodeGroupingParamsBase, InstanceHierarchyNodeProcessingParams } from "../../../HierarchyNode";
import { GroupingType, ProcessedInstancesGroupingHierarchyNode } from "../Grouping";

/** @internal */
export function iterateChildNodeGroupingParams(
  parentNode: ProcessedInstancesGroupingHierarchyNode,
  groupingType: GroupingType,
  cb: (groupingParams: HierarchyNodeGroupingParamsBase | undefined) => boolean | undefined,
): void {
  function getGroupingParams(params: InstanceHierarchyNodeProcessingParams | undefined) {
    switch (groupingType) {
      case "base-class":
        return params?.grouping?.byBaseClasses;
      case "class":
        return typeof params?.grouping?.byClass === "object" ? params.grouping.byClass : undefined;
      case "label":
        return typeof params?.grouping?.byLabel === "object" && !("mergeId" in params.grouping.byLabel) ? params.grouping.byLabel : undefined;
      case "property":
        return params?.grouping?.byProperties;
    }
  }
  for (const childNode of parentNode.children) {
    const groupingParams = getGroupingParams(childNode.processingParams);
    if (cb(groupingParams)) {
      return;
    }
  }
}
