/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, mergeMap, Observable, tap, toArray } from "rxjs";
import { Id64, Logger } from "@itwin/core-bentley";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ClassInfo } from "../../EC";
import { HierarchyNode } from "../../HierarchyNode";
import { createOperatorLoggingNamespace, getClass } from "../Common";
import { sortNodesByLabelOperator } from "./Sorting";

const OPERATOR_NAME = "Grouping.ByClass";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

/** @internal */
export function createClassGroupingOperator(schemas: SchemaContext) {
  return function (nodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
    return nodes.pipe(
      log((n) => `in: ${n.label}`),
      // need all nodes in one place to group them
      toArray(),
      // group all nodes
      mergeMap((resolvedNodes) => from(createClassGroupingInformation(schemas, resolvedNodes))),
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

interface ClassGroupingInformation {
  ungrouped: Array<HierarchyNode>;
  grouped: Map<string, { class: ClassInfo; groupedNodes: Array<HierarchyNode> }>;
}

async function createClassGroupingInformation(schemas: SchemaContext, nodes: HierarchyNode[]): Promise<ClassGroupingInformation> {
  const groupings: ClassGroupingInformation = { ungrouped: [], grouped: new Map() };
  for (const node of nodes) {
    // we're only grouping instance nodes
    if (HierarchyNode.isInstancesNode(node) && node.params?.groupByClass) {
      const fullClassName = node.key.instanceKeys[0].className;
      let groupingInfo = groupings.grouped.get(fullClassName);
      if (!groupingInfo) {
        const nodeClass = await getClass(schemas, fullClassName);
        groupingInfo = {
          class: { id: Id64.invalid, name: nodeClass.fullName.replace(".", ":"), label: nodeClass.label ?? nodeClass.name },
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
      label: entry.class.label,
      key: {
        type: "class-grouping",
        class: entry.class,
      },
      children: entry.groupedNodes,
    });
  });
  outNodes.push(...groupings.ungrouped);
  (outNodes as any).hasClassGroupingNodes = groupings.grouped.size > 0;
  return outNodes;
}

function doLog(msg: string) {
  Logger.logTrace(LOGGING_NAMESPACE, msg);
}

function log<T>(msg: (arg: T) => string) {
  return tap<T>((n) => doLog(msg(n)));
}
