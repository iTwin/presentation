/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { from, mergeMap, Observable, of, tap, toArray } from "rxjs";
import { assert } from "@itwin/core-bentley";
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
export function createGroupingOperator(metadata: IMetadataProvider, groupingHandlers?: GroupingHandler[]) {
  return function (nodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
    return nodes.pipe(
      toArray(),
      mergeMap((resolvedNodes) => {
        const groupingHandlersObs = groupingHandlers ? of(groupingHandlers) : from(createGroupingHandlers(metadata, resolvedNodes));
        return groupingHandlersObs.pipe(mergeMap((createdGroupingHandlers) => from(groupNodes(resolvedNodes, createdGroupingHandlers))));
      }),
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
  grouped: HierarchyNode[];
  ungrouped: HierarchyNode[];
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

/** @internal */
export async function createGroupingHandlers(metadata: IMetadataProvider, nodes: HierarchyNode[]): Promise<GroupingHandler[]> {
  const groupingHandlers: GroupingHandler[] = new Array<GroupingHandler>();
  groupingHandlers.push(...(await createBaseClassGroupingHandlers(metadata, nodes)));
  groupingHandlers.push(async (allNodes: HierarchyNode[]) => createClassGroups(metadata, allNodes));
  groupingHandlers.push(async (allNodes: HierarchyNode[]) => createLabelGroups(allNodes));
  return groupingHandlers;
}

async function handlerWrapper(currentHandler: GroupingHandler, props: FullGroupingProps): Promise<HierarchyNode[]> {
  let currentGroupingNodes = await currentHandler(props.nodes);
  currentGroupingNodes = applyGroupHidingParams(currentGroupingNodes);

  const grouped = await Promise.all(
    currentGroupingNodes.grouped.map(async (grouping) => {
      assert(Array.isArray(grouping.children));
      return { ...grouping, children: await groupNodes(grouping.children, props.groupingHandlers) };
    }),
  );

  return grouped.length > 0 ? [...grouped, ...currentGroupingNodes.ungrouped] : props.nodes;
}

function doLog(msg: string) {
  getLogger().logTrace(LOGGING_NAMESPACE, msg);
}

function log<T>(msg: (arg: T) => string) {
  return tap<T>((n) => doLog(msg(n)));
}
