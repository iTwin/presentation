/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, mergeMap, Observable, tap, toArray } from "rxjs";
import { HierarchyNode } from "../../HierarchyNode";
import { getLogger } from "../../Logging";
import { createOperatorLoggingNamespace } from "../Common";

const OPERATOR_NAME = "Grouping.ByLabel";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

/** @internal */
export function createLabelGroupingOperator() {
  return function (nodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
    return nodes.pipe(
      log((n) => `in: ${n.label}`),
      // need all nodes in one place to group them
      toArray(),
      // group all nodes
      mergeMap((resolvedNodes) => from(createLabelGroupingInformation(resolvedNodes))),
      // convert intermediate format into a nodes observable
      mergeMap((groupings) => {
        const grouped = createGroupingNodes(groupings);
        const obs = from(grouped);
        return obs;
      }),
      log((n) => `out: ${n.label}`),
    );
  };
}

interface LabelGroupingInformation {
  ungrouped: Array<HierarchyNode>;
  grouped: Map<string, { label: string; groupedNodes: Array<HierarchyNode> }>;
  order: Array<string>;
}

async function createLabelGroupingInformation(nodes: HierarchyNode[]): Promise<LabelGroupingInformation> {
  const groupings: LabelGroupingInformation = { ungrouped: [], grouped: new Map(), order: [] };
  for (const node of nodes) {
    if (HierarchyNode.isClassGroupingNode(node) && Array.isArray(node.children)) {
      const labelGroupings = await createLabelGroupingInformation(node.children);
      const labelGroupingNodes = createGroupingNodes(labelGroupings);
      const newClassGroupingNode: HierarchyNode = {
        ...node,
        children: labelGroupingNodes,
      };
      groupings.ungrouped.push(newClassGroupingNode);
      groupings.order.push("ungrouped");
    } else if (node.params?.groupByLabel) {
      const nodeLabel = node.label;
      let groupingInfo = groupings.grouped.get(nodeLabel);
      if (!groupingInfo) {
        groupingInfo = {
          label: nodeLabel,
          groupedNodes: [],
        };
        groupings.grouped.set(nodeLabel, groupingInfo);
        groupings.order.push("grouped");
      }
      groupingInfo.groupedNodes.push(node);
    } else {
      groupings.order.push("ungrouped");
      groupings.ungrouped.push(node);
    }
  }
  // if all nodes have the same label, then they should not be grouped
  if (groupings.grouped.size === 1 && groupings.ungrouped.length === 0) {
    return { ungrouped: nodes, grouped: new Map(), order: [] };
  }

  return groupings;
}

function createGroupingNodes(groupings: LabelGroupingInformation): HierarchyNode[] & { hasLabelGroupingNodes?: boolean } {
  const outNodes = new Array<HierarchyNode>();
  if (groupings.order.length === 0) {
    outNodes.push(...groupings.ungrouped);
    (outNodes as any).hasLabelGroupingNodes = false;
    return outNodes;
  }

  const tempOutNodes = new Array<HierarchyNode>();
  let isGroupingNodeCreated = false;
  groupings.grouped.forEach((entry) => {
    // if group contains 1 node, then the grouping should not be created
    if (entry.groupedNodes.length === 1) {
      tempOutNodes.push(...entry.groupedNodes);
    } else {
      tempOutNodes.push({
        label: entry.label,
        key: {
          type: "label-grouping",
          label: entry.label,
        },
        children: entry.groupedNodes,
      });
      isGroupingNodeCreated = true;
    }
  });
  tempOutNodes.push(...groupings.ungrouped);

  let ungroupedNodeIndex = 0;
  let groupedNodeIndex = 0;
  groupings.order.forEach((nodeType) => {
    if (nodeType === "grouped") {
      outNodes.push(tempOutNodes[groupedNodeIndex]);
      ++groupedNodeIndex;
    } else {
      outNodes.push(tempOutNodes[groupings.grouped.size + ungroupedNodeIndex]);
      ++ungroupedNodeIndex;
    }
  });

  (outNodes as any).hasLabelGroupingNodes = isGroupingNodeCreated;
  return outNodes;
}

function doLog(msg: string) {
  getLogger().logTrace(LOGGING_NAMESPACE, msg);
}

function log<T>(msg: (arg: T) => string) {
  return tap<T>((n) => doLog(msg(n)));
}
