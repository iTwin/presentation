/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, mergeMap, Observable, tap, toArray } from "rxjs";
import { HierarchyNode } from "../../HierarchyNode";
import { getLogger } from "../../Logging";
import { IMetadataProvider } from "../../Metadata";
import { createOperatorLoggingNamespace } from "../Common";
import { createBaseClassGroupingHandlers } from "./grouping/BaseClassGrouping";
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
      mergeMap((resolvedNodes) =>
        from(createGroupingHandlers(metadata, resolvedNodes)).pipe(mergeMap((groupingHandlers) => from(groupNodes(resolvedNodes, groupingHandlers)))),
      ),
      mergeMap((groupedNodes) => from(groupedNodes)),
      log((n) => `out: ${n.label}`),
    );
  };
}

interface FullGroupingProps {
  nodes: HierarchyNode[];
  groupingHandlers: GroupingHandler[];
}

/** @internal */
export interface GroupingHandlerResult {
  allNodes: HierarchyNode[];
  groupedNodes: HierarchyNode[];
  ungroupedNodes: HierarchyNode[];
  groupingType: GroupingType;
}

/** @internal */
export type GroupingType = "label" | "class" | "base-class";

/** @internal */
export type GroupingHandler = (allNodes: HierarchyNode[]) => Promise<GroupingHandlerResult>;

async function groupNodes(nodes: HierarchyNode[], groupingHandlers: GroupingHandler[]): Promise<HierarchyNode[]> {
  const originalNodes = nodes;
  for (let i = 0; i < groupingHandlers.length; ++i) {
    nodes = await handlerWrapper(groupingHandlers[i], {
      nodes,
      groupingHandlers: groupingHandlers.slice(i + 1),
    });
  }
  // only need to sort if the nodes list changed (e.g. grouping nodes were created)
  return originalNodes !== nodes ? sortNodesByLabel(nodes) : nodes;
}

async function createGroupingHandlers(metadata: IMetadataProvider, nodes: HierarchyNode[]): Promise<GroupingHandler[]> {
  const groupingHandlers: GroupingHandler[] = new Array<GroupingHandler>();
  groupingHandlers.push(...(await createBaseClassGroupingHandlers(metadata, nodes)));
  groupingHandlers.push(async (allNodes: HierarchyNode[]) => createClassGroups(metadata, allNodes));
  groupingHandlers.push(async (allNodes: HierarchyNode[]) => createLabelGroups(allNodes));
  return groupingHandlers;
}

async function handlerWrapper(currentHandler: GroupingHandler, props: FullGroupingProps): Promise<HierarchyNode[]> {
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
