/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { concatMap, from, Observable, of, tap, toArray } from "rxjs";
import { IMetadataProvider } from "../../ECMetadata";
import {
  HierarchyNode, HierarchyNodeKey, ProcessedGroupingHierarchyNode, ProcessedHierarchyNode, ProcessedInstanceHierarchyNode,
} from "../../HierarchyNode";
import { getLogger } from "../../Logging";
import { IPrimitiveValueFormatter } from "../../values/Formatting";
import { compareNodesByLabel, createOperatorLoggingNamespace, mergeSortedArrays } from "../Common";
import { assignAutoExpand } from "./grouping/AutoExpand";
import { createBaseClassGroupingHandlers } from "./grouping/BaseClassGrouping";
import { createClassGroups } from "./grouping/ClassGrouping";
import { applyGroupHidingParams } from "./grouping/GroupHiding";
import { createLabelGroups } from "./grouping/LabelGrouping";
import { createPropertiesGroupingHandlers, PropertiesGroupingLocalizedStrings } from "./grouping/PropertiesGrouping";

const OPERATOR_NAME = "Grouping";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

/** @internal */
export function createGroupingOperator(
  metadata: IMetadataProvider,
  valueFormatter: IPrimitiveValueFormatter,
  localizedStrings: PropertiesGroupingLocalizedStrings,
  onGroupingNodeCreated?: (groupingNode: ProcessedGroupingHierarchyNode) => void,
  groupingHandlers?: GroupingHandler[],
) {
  return function (nodes: Observable<ProcessedHierarchyNode>): Observable<ProcessedHierarchyNode> {
    return nodes.pipe(
      toArray(),
      concatMap((resolvedNodes) => {
        const groupingHandlersObs = groupingHandlers
          ? of(groupingHandlers)
          : from(createGroupingHandlers(metadata, resolvedNodes, valueFormatter, localizedStrings));
        return groupingHandlersObs.pipe(
          concatMap(async (createdGroupingHandlers) => {
            const { instanceNodes, restNodes } = partitionInstanceNodes(resolvedNodes);
            const grouped = await groupInstanceNodes(instanceNodes, restNodes.length, createdGroupingHandlers, onGroupingNodeCreated);
            return from([...grouped, ...restNodes]);
          }),
        );
      }),
      concatMap((groupedNodes) => from(groupedNodes)),
      log((n) => `out: ${n.label}`),
    );
  };
}

/** @internal */
export type ProcessedInstancesGroupingHierarchyNode = Omit<ProcessedGroupingHierarchyNode, "children"> & { children: ProcessedInstanceHierarchyNode[] };

/** @internal */
export interface GroupingHandlerResult<TGroupingNode = ProcessedInstancesGroupingHierarchyNode> {
  /** Expected to be sorted by label. */
  grouped: Array<TGroupingNode>;
  /** Expected to be sorted by label. */
  ungrouped: ProcessedInstanceHierarchyNode[];
  groupingType: GroupingType;
}

/** @internal */
export type GroupingType = "label" | "class" | "base-class" | "property";

/** @internal */
export type GroupingHandler = (allNodes: ProcessedInstanceHierarchyNode[]) => Promise<GroupingHandlerResult>;

function partitionInstanceNodes<TRestNode extends { key: HierarchyNodeKey }>(
  nodes: Array<ProcessedInstanceHierarchyNode | TRestNode>,
): { instanceNodes: ProcessedInstanceHierarchyNode[]; restNodes: TRestNode[] } {
  const instanceNodes = new Array<ProcessedInstanceHierarchyNode>();
  const restNodes = new Array<TRestNode>();
  nodes.forEach((n) => {
    if (HierarchyNode.isInstancesNode(n)) {
      instanceNodes.push(n as ProcessedInstanceHierarchyNode);
    } else {
      restNodes.push(n);
    }
  });
  return { instanceNodes, restNodes };
}

async function groupInstanceNodes(
  nodes: ProcessedInstanceHierarchyNode[],
  extraSiblings: number,
  groupingHandlers: GroupingHandler[],
  onGroupingNodeCreated: undefined | ((groupingNode: ProcessedGroupingHierarchyNode) => void),
): Promise<Array<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode>> {
  let curr: GroupingHandlerResult<ProcessedGroupingHierarchyNode> | undefined;
  for (let i = 0; i < groupingHandlers.length; ++i) {
    const currentHandler = groupingHandlers[i];
    const nextHandlers = groupingHandlers.slice(i + 1);
    const groupings = assignAutoExpand(applyGroupHidingParams(await currentHandler(curr?.ungrouped ?? nodes), extraSiblings));
    curr = {
      groupingType: groupings.groupingType,
      grouped: mergeSortedArrays(
        curr?.grouped ?? [],
        await Promise.all(
          groupings.grouped.map(
            async (grouping): Promise<ProcessedGroupingHierarchyNode> => ({
              ...grouping,
              children: await groupInstanceNodes(grouping.children, 0, nextHandlers, onGroupingNodeCreated),
            }),
          ),
        ),
        compareNodesByLabel,
      ),
      ungrouped: groupings.ungrouped,
    };
  }
  if (curr) {
    if (curr.grouped.length > 0) {
      onGroupingNodeCreated && curr.grouped.forEach(onGroupingNodeCreated);
      return mergeSortedArrays(curr.grouped, curr.ungrouped, compareNodesByLabel);
    }
    return curr.ungrouped;
  }
  return nodes;
}

/** @internal */
export async function createGroupingHandlers(
  metadata: IMetadataProvider,
  nodes: ProcessedHierarchyNode[],
  valueFormatter: IPrimitiveValueFormatter,
  localizedStrings: PropertiesGroupingLocalizedStrings,
): Promise<GroupingHandler[]> {
  const groupingHandlers: GroupingHandler[] = new Array<GroupingHandler>();
  groupingHandlers.push(
    ...(await createBaseClassGroupingHandlers(
      metadata,
      nodes.filter((n): n is ProcessedInstanceHierarchyNode => HierarchyNode.isInstancesNode(n)),
    )),
  );
  groupingHandlers.push(async (allNodes) => createClassGroups(metadata, allNodes));
  groupingHandlers.push(
    ...(await createPropertiesGroupingHandlers(
      metadata,
      nodes.filter((n): n is ProcessedInstanceHierarchyNode => HierarchyNode.isInstancesNode(n)),
      valueFormatter,
      localizedStrings,
    )),
  );
  groupingHandlers.push(async (allNodes) => createLabelGroups(allNodes));
  return groupingHandlers;
}

function doLog(msg: string) {
  getLogger().logTrace(LOGGING_NAMESPACE, msg);
}

function log<T>(msg: (arg: T) => string) {
  return tap<T>((n) => doLog(msg(n)));
}
