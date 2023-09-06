/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { from, mergeMap, Observable, toArray } from "rxjs";
import { Id64 } from "@itwin/core-bentley";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ClassInfo } from "../../EC";
import { getClass, InProgressHierarchyNode } from "../Common";
import { sortNodesByLabelOperator } from "./Sorting";

/** @internal */
export function createClassGroupingOperator(schemas: SchemaContext) {
  interface ClassGroupingInformation {
    ungrouped: Array<InProgressHierarchyNode>;
    grouped: Map<string, { class: ClassInfo; groupedNodes: Array<InProgressHierarchyNode> }>;
  }
  async function createClassGroupingInformation(nodes: InProgressHierarchyNode[]): Promise<ClassGroupingInformation> {
    const groupings: ClassGroupingInformation = { ungrouped: [], grouped: new Map() };
    for (const node of nodes) {
      if (node.key.type === "instances" && node.groupByClass) {
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
  function groupNodes(groupings: ClassGroupingInformation): InProgressHierarchyNode[] & { hasClassGroupingNodes?: boolean } {
    const outNodes = new Array<InProgressHierarchyNode>();
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
  return function (nodes: Observable<InProgressHierarchyNode>): Observable<InProgressHierarchyNode> {
    return nodes.pipe(
      toArray(),
      mergeMap((resolvedNodes) => from(createClassGroupingInformation(resolvedNodes))),
      mergeMap((groupings) => {
        const grouped = groupNodes(groupings);
        const obs = from(grouped);
        return grouped.hasClassGroupingNodes ? obs.pipe(sortNodesByLabelOperator) : obs;
      }),
    );
  };
}
