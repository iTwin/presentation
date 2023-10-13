/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, mergeMap, Observable, tap, toArray } from "rxjs";
import { HierarchyNode } from "../../../HierarchyNode";
import { getLogger } from "../../../Logging";
import { IMetadataProvider } from "../../../Metadata";
import { createOperatorLoggingNamespace, getClass } from "../../Common";
import { sortNodesByLabelOperator } from "../Sorting";

const OPERATOR_NAME = "Grouping.ByClass";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

/** @internal */
export function createClassGroupingOperator(metadata: IMetadataProvider) {
  return function (nodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
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
  ungrouped: Array<HierarchyNode>;
  grouped: Map<string, { class: ClassInfo; groupedNodes: Array<HierarchyNode> }>;
}

async function createClassGroupingInformation(metadata: IMetadataProvider, nodes: HierarchyNode[]): Promise<ClassGroupingInformation> {
  const groupings: ClassGroupingInformation = { ungrouped: [], grouped: new Map() };
  for (const node of nodes) {
    if (HierarchyNode.isGroupingNode(node) && Array.isArray(node.children)) {
      const groupingInformation = await createClassGroupingInformation(metadata, node.children);
      const groupedNodes = createGroupingNodes(groupingInformation);
      node.children = groupedNodes;
    }
    // we're only grouping instance nodes
    if (HierarchyNode.isInstancesNode(node) && node.params?.grouping?.groupByClass) {
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

function createGroupingNodes(groupings: ClassGroupingInformation): HierarchyNode[] & { hasClassGroupingNodes?: boolean } {
  const outNodes = new Array<HierarchyNode>();
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
