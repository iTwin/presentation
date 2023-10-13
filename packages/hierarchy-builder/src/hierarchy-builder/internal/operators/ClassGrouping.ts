/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, mergeMap, Observable, tap, toArray } from "rxjs";
import { HierarchyNode, ProcessedHierarchyNode } from "../../HierarchyNode";
import { getLogger } from "../../Logging";
import { IMetadataProvider } from "../../Metadata";
import { createOperatorLoggingNamespace, getClass } from "../Common";
import { sortNodesByLabelOperator } from "./Sorting";

const OPERATOR_NAME = "Grouping.ByClass";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

/** @internal */
export function createClassGroupingOperator(metadata: IMetadataProvider) {
  return function (nodes: Observable<ProcessedHierarchyNode>): Observable<ProcessedHierarchyNode> {
    return nodes.pipe(
      log((n) => `in: ${n.label}`),
      // need all nodes in one place to group them
      toArray(),
      // group all nodes
      mergeMap((resolvedNodes) => from(createClassGroupingInformation(metadata, resolvedNodes))),
      // convert intermediate format into a nodes observable
      mergeMap((groupings) => {
        const grouped = createGroupingNodes(groupings);
        const obs = from(grouped);
        // source observable is expected to stream sorted nodes and we're keeping them in order - only
        // need to re-sort if we created grouping nodes
        return grouped.hasClassGroupingNodes ? obs.pipe(sortNodesByLabelOperator) : obs;
      }),
      log((n) => `out: ${n.label}`),
    );
  };
}

interface ClassInfo {
  fullName: string;
  name: string;
  label?: string;
}

interface ClassGroupingInformation {
  ungrouped: Array<ProcessedHierarchyNode>;
  grouped: Map<string, { class: ClassInfo; groupedNodes: Array<ProcessedHierarchyNode> }>;
}

async function createClassGroupingInformation(metadata: IMetadataProvider, nodes: ProcessedHierarchyNode[]): Promise<ClassGroupingInformation> {
  const groupings: ClassGroupingInformation = { ungrouped: [], grouped: new Map() };
  for (const node of nodes) {
    // we're only grouping instance nodes
    if (HierarchyNode.isInstancesNode(node) && node.processingParams?.groupByClass) {
      const fullClassName = node.key.instanceKeys[0].className;
      let groupingInfo = groupings.grouped.get(fullClassName);
      if (!groupingInfo) {
        const nodeClass = await getClass(metadata, fullClassName);
        groupingInfo = {
          class: nodeClass,
          groupedNodes: [],
        };
        groupings.grouped.set(fullClassName, groupingInfo);
      }
      groupingInfo.groupedNodes.push(node);
    } else {
      groupings.ungrouped.push(node);
    }
  }
  return groupings;
}

function createGroupingNodes(groupings: ClassGroupingInformation): ProcessedHierarchyNode[] & { hasClassGroupingNodes?: boolean } {
  const outNodes = new Array<ProcessedHierarchyNode>();
  groupings.grouped.forEach((entry) => {
    outNodes.push({
      label: entry.class.label ?? entry.class.name,
      key: {
        type: "class-grouping",
        class: { name: entry.class.fullName, label: entry.class.label },
      },
      children: entry.groupedNodes,
    });
  });
  outNodes.push(...groupings.ungrouped);
  (outNodes as any).hasClassGroupingNodes = groupings.grouped.size > 0;
  return outNodes;
}

function doLog(msg: string) {
  getLogger().logTrace(LOGGING_NAMESPACE, msg);
}

function log<T>(msg: (arg: T) => string) {
  return tap<T>((n) => doLog(msg(n)));
}
