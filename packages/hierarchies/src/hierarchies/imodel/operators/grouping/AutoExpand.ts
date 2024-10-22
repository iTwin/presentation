/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HierarchyNodeAutoExpandProp } from "../../IModelHierarchyNode.js";
import { GroupingHandlerResult } from "../Grouping.js";
import { iterateChildNodeGroupingParams } from "./Shared.js";

/** @internal */
export function assignAutoExpand(props: GroupingHandlerResult): GroupingHandlerResult {
  for (const node of props.grouped) {
    let autoExpandProp: HierarchyNodeAutoExpandProp | undefined;
    iterateChildNodeGroupingParams(node, props.groupingType, (groupingProps) => {
      if (autoExpandProp === "always") {
        return true;
      }
      autoExpandProp = groupingProps?.autoExpand ? groupingProps.autoExpand : autoExpandProp;
      return;
    });
    if (autoExpandProp === "always" || (autoExpandProp === "single-child" && node.children.length === 1)) {
      node.autoExpand = true;
    }
  }
  return props;
}
