// /*---------------------------------------------------------------------------------------------
//  * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
//  * See LICENSE.md in the project root for license terms and full copyright notice.
//  *--------------------------------------------------------------------------------------------*/

// import { from, mergeMap, Observable, tap, toArray } from "rxjs";
// import { Id64 } from "@itwin/core-bentley";
// import { ClassInfo } from "../../EC";
// import { HierarchyNode } from "../../HierarchyNode";
// import { getLogger } from "../../Logging";
// import { IMetadataProvider } from "../../Metadata";
// import { createOperatorLoggingNamespace, getClass } from "../Common";
// import { sortNodesByLabelOperator } from "./Sorting";

// const OPERATOR_NAME = "Grouping.ByBaseClass";
// /** @internal */
// export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

// /** @internal */
// export function createBaseClassGroupingOperator(metadata: IMetadataProvider) {
//   return function (nodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
//     return nodes.pipe(
//       log((n) => `in: ${n.label}`),
//       // need all nodes in one place to group them
//       toArray(),
//       // group all nodes by base class
//       mergeMap((resolvedNodes) => from(createBaseClassGroupingInformation(metadata, resolvedNodes))),
//       // convert intermediate format into a nodes observable
//       mergeMap((groupings) => {
//         const grouped = createGroupingNodesClassType(groupings, "base-class-grouping");
//         const obs = from(grouped);
//         // source observable is expected to stream sorted nodes and we're keeping them in order - only
//         // need to re-sort if we created grouping nodes
//         return grouped.hasClassGroupingNodes ? obs.pipe(sortNodesByLabelOperator) : obs;
//       }),
//       toArray(),
//       // group all nodes by class
//       mergeMap((resolvedNodes) => from(createClassGroupingInformation(metadata, resolvedNodes))),
//       // convert intermediate format into a nodes observable
//       mergeMap((groupings) => {
//         const grouped = createGroupingNodesClassType(groupings, "class-grouping");
//         const obs = from(grouped);
//         return grouped.hasClassGroupingNodes ? obs.pipe(sortNodesByLabelOperator) : obs;
//       }),
//       log((n) => `out: ${n.label}`),
//     );
//   };
// }

// interface ClassGroupingInformation {
//   ungrouped: Array<HierarchyNode>;
//   grouped: Map<string, { class: ClassInfo; groupedNodes: Array<HierarchyNode> }>;
// }

// async function createClassGroupingInformation(metadata: IMetadataProvider, nodes: HierarchyNode[]): Promise<ClassGroupingInformation> {
//   const groupings: ClassGroupingInformation = { ungrouped: [], grouped: new Map() };
//   for (const node of nodes) {
//     // we're only grouping instance nodes
//     if (HierarchyNode.isInstancesNode(node) && node.params?.groupByClass) {
//       const fullClassName = node.key.instanceKeys[0].className;
//       let groupingInfo = groupings.grouped.get(fullClassName);
//       if (!groupingInfo) {
//         const nodeClass = await getClass(metadata, fullClassName);
//         groupingInfo = {
//           class: { id: Id64.invalid, name: nodeClass.fullName, label: nodeClass.label ?? nodeClass.name },
//           groupedNodes: [],
//         };
//         groupings.grouped.set(fullClassName, groupingInfo);
//       }
//       groupingInfo.groupedNodes.push(node);
//     } else {
//       groupings.ungrouped.push(node);
//     }
//   }
//   return groupings;
// }

// async function createBaseClassGroupingInformation(metadata: IMetadataProvider, nodes: HierarchyNode[]): Promise<ClassGroupingInformation> {
//   const groupings: ClassGroupingInformation = { ungrouped: [], grouped: new Map() };
//   for (const node of nodes) {
//     // we're only grouping instance nodes
//     if (HierarchyNode.isInstancesNode(node) && node.params?.groupByBaseClass && node.params.baseClassInfo) {
//       const fullClassName = node.key.instanceKeys[0].className;
//       const fullBaseClassName = `${node.params?.grouping?.baseClassInfo?.schemaName}.${node.params?.baseClassInfo?.className}`;
//       const nodeClass = await getClass(metadata, fullClassName);
//       const baseNodeClass = await getClass(metadata, fullBaseClassName);
//       if (await nodeClass.is(baseNodeClass)) {
//         let groupingInfo = groupings.grouped.get(fullBaseClassName);
//         if (!groupingInfo) {
//           groupingInfo = {
//             class: { id: Id64.invalid, name: baseNodeClass.fullName, label: baseNodeClass.label ?? baseNodeClass.name },
//             groupedNodes: [],
//           };
//           groupings.grouped.set(fullBaseClassName, groupingInfo);
//         }
//         groupingInfo.groupedNodes.push(node);
//         continue;
//       }
//     }
//     groupings.ungrouped.push(node);
//   }
//   return groupings;
// }

// function createGroupingNodesClassType(
//   groupings: ClassGroupingInformation,
//   classType: "class-grouping" | "base-class-grouping",
// ): HierarchyNode[] & { hasClassGroupingNodes?: boolean } {
//   const outNodes = new Array<HierarchyNode>();
//   groupings.grouped.forEach((entry) => {
//     outNodes.push({
//       label: entry.class.label,
//       key: {
//         type: classType,
//         class: entry.class,
//       },
//       children: entry.groupedNodes,
//     });
//   });
//   outNodes.push(...groupings.ungrouped);
//   (outNodes as any).hasClassGroupingNodes = groupings.grouped.size > 0;
//   return outNodes;
// }

// function doLog(msg: string) {
//   getLogger().logTrace(LOGGING_NAMESPACE, msg);
// }

// function log<T>(msg: (arg: T) => string) {
//   return tap<T>((n) => doLog(msg(n)));
// }
