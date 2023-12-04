/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert, DuplicatePolicy, SortedArray } from "@itwin/core-bentley";
import { GroupingNodeKey, ProcessedInstanceHierarchyNode } from "../../../HierarchyNode";
import { mergeNodes } from "../../Common";
import { GroupingHandlerResult, ProcessedInstancesGroupingHierarchyNode } from "../Grouping";
import { sortNodesByLabel } from "../Sorting";

/** @internal */
export async function createLabelGroups(nodes: ProcessedInstanceHierarchyNode[]): Promise<GroupingHandlerResult> {
  const grouped = new Array<ProcessedInstancesGroupingHierarchyNode>();
  const ungrouped = new Array<ProcessedInstanceHierarchyNode>();
  const mergedInstanceNodes = new SortedNodesList();
  for (const node of nodes) {
    const byLabel = node.processingParams?.grouping?.byLabel;
    if (!byLabel) {
      ungrouped.push(node);
      continue;
    }
    if (typeof byLabel === "object" && "mergeId" in byLabel) {
      if (byLabel.mergeId === "") {
        ungrouped.push(node);
        continue;
      }
      const mergedInstanceNode = { ...node, processingParams: { mergeByLabelId: byLabel.mergeId } };
      const pos = mergedInstanceNodes.insert(mergedInstanceNode);
      const nodeAtPos = mergedInstanceNodes.get(pos)!;
      if (nodeAtPos !== mergedInstanceNode) {
        // non-matching nodes means we failed to insert the node, because nodeAtPos already exists in its
        // place - they need to be merged together
        const mergedNode = mergeNodes(nodeAtPos, mergedInstanceNode) as MergedHierarchyNode;
        mergedInstanceNodes.replace(pos, mergedNode);
      }
      continue;
    }
    if (grouped.length > 0) {
      const lastGroupedNode = grouped[grouped.length - 1];
      if (node.label === lastGroupedNode.label) {
        lastGroupedNode.children.push({ ...node, parentKeys: [...node.parentKeys, lastGroupedNode.key] });
        continue;
      }
    }
    const groupingNodeKey: GroupingNodeKey = {
      type: "label-grouping",
      label: node.label,
    };
    grouped.push({
      label: node.label,
      key: groupingNodeKey,
      parentKeys: [...node.parentKeys],
      children: [{ ...node, parentKeys: [...node.parentKeys, groupingNodeKey] }],
    });
  }

  return {
    grouped,
    ungrouped: sortNodesByLabel([...ungrouped, ...mergedInstanceNodes]),
    groupingType: "label",
  };
}

type MergedHierarchyNode = ProcessedInstanceHierarchyNode & { processingParams: { mergeByLabelId: string } };

class SortedNodesList extends SortedArray<MergedHierarchyNode> {
  public constructor() {
    const comp = (lhs: MergedHierarchyNode, rhs: MergedHierarchyNode): number => {
      const labelCompare = lhs.label.localeCompare(rhs.label);
      if (labelCompare !== 0) {
        return labelCompare;
      }
      return lhs.processingParams.mergeByLabelId.localeCompare(rhs.processingParams.mergeByLabelId);
    };
    super(comp, DuplicatePolicy.Retain);
  }
  public replace(pos: number, replacement: MergedHierarchyNode) {
    assert(this._compare(this._array[pos], replacement) === 0);
    this._array[pos] = replacement;
  }
}
