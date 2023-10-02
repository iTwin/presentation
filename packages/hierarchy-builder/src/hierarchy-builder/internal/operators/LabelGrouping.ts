/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, mergeMap, Observable, tap, toArray } from "rxjs";
import { Id64 } from "@itwin/core-bentley";
import { LabelInfo } from "../../EC";
import { HierarchyNode } from "../../HierarchyNode";
import { getLogger } from "../../Logging";
import { createOperatorLoggingNamespace } from "../Common";
import { sortNodesByLabelOperator } from "./Sorting";

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
        // source observable is expected to stream sorted nodes and we're keeping them in order - only
        // need to re-sort if we created grouping nodes
        return grouped.hasLabelGroupingNodes ? obs.pipe(sortNodesByLabelOperator) : obs;
      }),
      log((n) => `out: ${n.label}`),
    );
  };
}

interface LabelGroupingInformation {
  ungrouped: Array<HierarchyNode>;
  grouped: Map<string, { labelInfo: LabelInfo; groupedNodes: Array<HierarchyNode> }>;
}

async function createLabelGroupingInformation(nodes: HierarchyNode[]): Promise<LabelGroupingInformation> {
  const groupings: LabelGroupingInformation = { ungrouped: [], grouped: new Map() };
  for (const node of nodes) {
    if (node.params?.groupByLabel) {
      const nodeLabel = node.label;
      let groupingInfo = groupings.grouped.get(nodeLabel);
      if (!groupingInfo) {
        groupingInfo = {
          labelInfo: { id: Id64.invalid, label: nodeLabel },
          groupedNodes: [],
        };
        groupings.grouped.set(nodeLabel, groupingInfo);
      }
      groupingInfo.groupedNodes.push(node);
    } else {
      groupings.ungrouped.push(node);
    }
  }
  // if all nodes have the same label, then they are already grouped
  if (groupings.grouped.size === 1 && groupings.ungrouped.length === 0) {
    return { ungrouped: nodes, grouped: new Map() };
  }

  if (groupings.grouped.size === 1 && groupings.ungrouped.length === 0) {
    return { ungrouped: nodes, grouped: new Map() };
  }
  return groupings;
}

function createGroupingNodes(groupings: LabelGroupingInformation): HierarchyNode[] & { hasLabelGroupingNodes?: boolean } {
  const outNodes = new Array<HierarchyNode>();
  groupings.grouped.forEach((entry) => {
    // if group contain 1 node, then they should not have their separate group
    if (entry.groupedNodes.length === 1) {
      outNodes.push(...entry.groupedNodes);
    } else {
      outNodes.push({
        label: entry.labelInfo.label,
        key: {
          type: "label-grouping",
          labelInfo: entry.labelInfo,
        },
        children: entry.groupedNodes,
      });
    }
  });
  outNodes.push(...groupings.ungrouped);
  (outNodes as any).hasLabelGroupingNodes = groupings.grouped.size > 0;
  return outNodes;
}

function doLog(msg: string) {
  getLogger().logTrace(LOGGING_NAMESPACE, msg);
}

function log<T>(msg: (arg: T) => string) {
  return tap<T>((n) => doLog(msg(n)));
}
