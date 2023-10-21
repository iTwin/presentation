/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, mergeMap, Observable, tap, toArray } from "rxjs";
import { HierarchyNode } from "../../HierarchyNode";
import { getLogger } from "../../Logging";
import { IMetadataProvider } from "../../Metadata";
import { createOperatorLoggingNamespace } from "../Common";
import { createBaseClassGroupsForSingleBaseClass, getBaseClassGroupingECClasses } from "./grouping/BaseClassGrouping";
import { createClassGroups } from "./grouping/ClassGrouping";
import { applyGroupHidingParams } from "./grouping/GroupHiding";
import { createLabelGroups } from "./grouping/LabelGrouping";
import { sortNodesByLabel } from "./Sorting";

const OPERATOR_NAME = "Grouping";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

/** @internal */
export function createGroupingOperator(metadata: IMetadataProvider) {
  return function (nodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
    return nodes.pipe(
      toArray(),
      mergeMap((resolvedNodes) => from(groupNodesFromHandlerCreator(metadata, resolvedNodes, createGroupingHandlers))),
      mergeMap((groupedNodes) => from(groupedNodes)),
      log((n) => `out: ${n.label}`),
    );
  };
}

type GroupingHandlerCreator = (metadata: IMetadataProvider, nodes: HierarchyNode<string>[]) => Promise<GroupingHandlerType[]>;

export interface FullGroupingProps {
  nodes: HierarchyNode[];
  groupingHandlers: GroupingHandlerType[];
}

export interface GroupingHandlerResult {
  allNodes: HierarchyNode[];
  groupedNodes: HierarchyNode[];
  groupingType: GroupingType;
}
export type GroupingType = "label" | "class" | "base-class";

export type GroupingHandlerType = (allNodes: HierarchyNode[]) => Promise<GroupingHandlerResult>;

async function groupNodesFromHandlerCreator(
  metadata: IMetadataProvider,
  nodes: HierarchyNode[],
  groupingHandlerCreator: GroupingHandlerCreator,
): Promise<HierarchyNode[]> {
  const groupingHandlers = await groupingHandlerCreator(metadata, nodes);
  return groupNodes(nodes, groupingHandlers);
}

export async function groupNodes(nodes: HierarchyNode[], groupingHandlers: GroupingHandlerType[]): Promise<HierarchyNode[]> {
  const originalNodes = nodes;
  let allNodes = nodes;
  for (let i = 0; i < groupingHandlers.length; ++i) {
    allNodes = await handlerWrapper(groupingHandlers[i], {
      nodes: allNodes,
      groupingHandlers: groupingHandlers.slice(i + 1),
    });
  }
  return originalNodes !== allNodes ? sortNodesByLabel(allNodes) : allNodes;
}

async function createGroupingHandlers(metadata: IMetadataProvider, nodes: HierarchyNode[]): Promise<GroupingHandlerType[]> {
  const groupingHandlers: GroupingHandlerType[] = new Array<GroupingHandlerType>();
  const baseClassGroupingECClasses = await getBaseClassGroupingECClasses(metadata, nodes);
  for (const baseECClass of baseClassGroupingECClasses) {
    groupingHandlers.push(async (allNodes: HierarchyNode[]) => {
      return createBaseClassGroupsForSingleBaseClass(metadata, allNodes, baseECClass);
    });
  }
  groupingHandlers.push(async (allNodes: HierarchyNode[]) => createClassGroups(metadata, allNodes));
  groupingHandlers.push(async (allNodes: HierarchyNode[]) => createLabelGroups(allNodes));
  return groupingHandlers;
}

export async function handlerWrapper(currentHandler: GroupingHandlerType, props: FullGroupingProps): Promise<HierarchyNode[]> {
  let currentGroupingNodes = await currentHandler(props.nodes);
  currentGroupingNodes = applyGroupHidingParams(currentGroupingNodes);

  for (const grouping of currentGroupingNodes.groupedNodes) {
    if (Array.isArray(grouping.children)) {
      grouping.children = await groupNodes(grouping.children, props.groupingHandlers);
    }
  }
  return currentGroupingNodes.allNodes;
}

function doLog(msg: string) {
  getLogger().logTrace(LOGGING_NAMESPACE, msg);
}

function log<T>(msg: (arg: T) => string) {
  return tap<T>((n) => doLog(msg(n)));
}
