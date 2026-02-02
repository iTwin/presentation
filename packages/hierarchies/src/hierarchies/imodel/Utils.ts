/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";
import { HierarchyNodeKey } from "../HierarchyNodeKey.js";

import type { HierarchyNodeLabelGroupingParams, InstanceHierarchyNodeProcessingParams, ProcessedInstanceHierarchyNode } from "./IModelHierarchyNode.js";

function mergeNodeHandlingParams(
  lhs: InstanceHierarchyNodeProcessingParams | undefined,
  rhs: InstanceHierarchyNodeProcessingParams | undefined,
): InstanceHierarchyNodeProcessingParams | undefined {
  if (!lhs && !rhs) {
    return undefined;
  }
  const params = {
    ...(lhs?.hideIfNoChildren || rhs?.hideIfNoChildren ? { hideIfNoChildren: true } : undefined),
    ...(lhs?.hideInHierarchy || rhs?.hideInHierarchy ? { hideInHierarchy: true } : undefined),
    ...mergeByLabelParams(lhs?.grouping?.byLabel, rhs?.grouping?.byLabel),
  };
  return Object.keys(params).length > 0 ? params : undefined;
}

function mergeByLabelParams(
  lhs: HierarchyNodeLabelGroupingParams | undefined,
  rhs: HierarchyNodeLabelGroupingParams | undefined,
): InstanceHierarchyNodeProcessingParams | undefined {
  if (lhs && typeof lhs === "object" && lhs.action === "merge" && rhs && typeof rhs === "object" && rhs.action === "merge" && lhs.groupId === rhs.groupId) {
    return {
      grouping: { byLabel: lhs },
    };
  }
  return undefined;
}

function mergeParentNodeKeys(lhsKeys: HierarchyNodeKey[], rhsKeys: HierarchyNodeKey[]): HierarchyNodeKey[] {
  const res = new Array<HierarchyNodeKey>();
  for (let i = 0; i < lhsKeys.length && i < rhsKeys.length; ++i) {
    if (!HierarchyNodeKey.equals(lhsKeys[i], rhsKeys[i])) {
      break;
    }
    res.push(lhsKeys[i]);
  }
  return res;
}

/** @internal */
export function mergeInstanceNodes(lhs: ProcessedInstanceHierarchyNode, rhs: ProcessedInstanceHierarchyNode): ProcessedInstanceHierarchyNode {
  assert(typeof lhs.key === typeof rhs.key);
  const mergedProcessingParams = mergeNodeHandlingParams(lhs.processingParams, rhs.processingParams);
  const mergedChildren = lhs.children === true || rhs.children === true ? true : lhs.children === false && rhs.children === false ? false : undefined;
  const mergedNode: ProcessedInstanceHierarchyNode = {
    ...lhs,
    ...rhs,
    label: lhs.label,
    key: { type: "instances", instanceKeys: [...lhs.key.instanceKeys, ...rhs.key.instanceKeys] },
    parentKeys: mergeParentNodeKeys(lhs.parentKeys, rhs.parentKeys),
  };
  // Remove specific properties or change their values based on lhs and rhs nodes
  mergedChildren !== undefined ? (mergedNode.children = mergedChildren) : delete mergedNode.children;
  mergedProcessingParams ? (mergedNode.processingParams = mergedProcessingParams) : delete mergedNode.processingParams;
  lhs.autoExpand || rhs.autoExpand ? (mergedNode.autoExpand = true) : delete mergedNode.autoExpand;
  lhs.extendedData || rhs.extendedData ? (mergedNode.extendedData = { ...lhs.extendedData, ...rhs.extendedData }) : delete mergedNode.extendedData;
  lhs.supportsFiltering && rhs.supportsFiltering ? (mergedNode.supportsFiltering = true) : delete mergedNode.supportsFiltering;
  return mergedNode;
}
