/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { concatAll, concatMap, from, Observable, of, toArray } from "rxjs";
import { assert } from "@itwin/core-bentley";
import { IECClassHierarchyInspector, IECMetadataProvider, IPrimitiveValueFormatter } from "@itwin/presentation-shared";
import {
  HierarchyNode,
  HierarchyNodeKey,
  ParentHierarchyNode,
  ProcessedGroupingHierarchyNode,
  ProcessedHierarchyNode,
  ProcessedInstanceHierarchyNode,
} from "../../HierarchyNode";
import { createNodeIdentifierForLogging, createOperatorLoggingNamespace } from "../Common";
import { log } from "../LoggingUtils";
import { assignAutoExpand } from "./grouping/AutoExpand";
import { createBaseClassGroupingHandlers } from "./grouping/BaseClassGrouping";
import { createClassGroups } from "./grouping/ClassGrouping";
import { applyGroupHidingParams } from "./grouping/GroupHiding";
import { createLabelGroups } from "./grouping/LabelGrouping";
import { createPropertiesGroupingHandlers, PropertiesGroupingLocalizedStrings } from "./grouping/PropertiesGrouping";
import { releaseMainThreadOnItemsCount } from "./ReleaseMainThread";

const OPERATOR_NAME = "Grouping";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

/** @internal */
export function createGroupingOperator(
  metadata: IECMetadataProvider,
  parentNode: ParentHierarchyNode | undefined,
  valueFormatter: IPrimitiveValueFormatter,
  localizedStrings: PropertiesGroupingLocalizedStrings,
  classHierarchyInspector: IECClassHierarchyInspector,
  onGroupingNodeCreated?: (groupingNode: ProcessedGroupingHierarchyNode) => void,
  groupingHandlers?: GroupingHandler[],
) {
  return function (nodes: Observable<ProcessedHierarchyNode>): Observable<ProcessedHierarchyNode> {
    return nodes.pipe(
      log({ category: LOGGING_NAMESPACE, message: /* istanbul ignore next */ (n) => `in: ${createNodeIdentifierForLogging(n)}` }),
      toArray(),
      concatMap((resolvedNodes) => {
        const { instanceNodes, restNodes } = partitionInstanceNodes(resolvedNodes);
        const groupingHandlersObs = groupingHandlers
          ? of(groupingHandlers)
          : from(createGroupingHandlers(metadata, parentNode, instanceNodes, valueFormatter, localizedStrings, classHierarchyInspector));
        return groupingHandlersObs.pipe(
          concatMap(async (createdGroupingHandlers) => {
            const grouped: ProcessedHierarchyNode[] = await groupInstanceNodes(
              instanceNodes,
              restNodes.length,
              createdGroupingHandlers,
              parentNode,
              onGroupingNodeCreated,
            );
            grouped.push(...restNodes);
            return from(grouped);
          }),
        );
      }),
      concatAll(),
      releaseMainThreadOnItemsCount(100),
      log({ category: LOGGING_NAMESPACE, message: /* istanbul ignore next */ (n) => `out: ${createNodeIdentifierForLogging(n)}` }),
    );
  };
}

/** @internal */
export type ProcessedInstancesGroupingHierarchyNode = Omit<ProcessedGroupingHierarchyNode, "children"> & { children: ProcessedInstanceHierarchyNode[] };

/** @internal */
export interface GroupingHandlerResult {
  /** Expected to be sorted by label. */
  grouped: Array<ProcessedInstancesGroupingHierarchyNode>;
  /** Expected to be sorted by label. */
  ungrouped: ProcessedInstanceHierarchyNode[];
  groupingType: GroupingType;
}

/** @internal */
export type GroupingType = "label" | "class" | "base-class" | "property";

/** @internal */
export type GroupingHandler = (
  nodesToGroup: ProcessedInstanceHierarchyNode[],
  nodesAlreadyGrouped: ProcessedInstancesGroupingHierarchyNode[],
) => Promise<GroupingHandlerResult>;

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
  parentNode: ParentHierarchyNode | undefined,
  onGroupingNodeCreated?: (groupingNode: ProcessedGroupingHierarchyNode) => void,
): Promise<Array<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode>> {
  let curr: GroupingHandlerResult | undefined;
  for (const currentHandler of groupingHandlers) {
    const groupings = assignAutoExpand(applyGroupHidingParams(await currentHandler(curr?.ungrouped ?? nodes, curr?.grouped ?? []), extraSiblings));
    curr = {
      groupingType: groupings.groupingType,
      grouped: mergeInPlace(curr?.grouped, groupings.grouped),
      ungrouped: groupings.ungrouped,
    };
  }
  if (!curr) {
    return nodes;
  }
  curr.grouped.forEach((groupingNode) => {
    onGroupingNodeCreated?.(groupingNode);
    if (!parentNode) {
      return;
    }

    if (HierarchyNode.isGroupingNode(parentNode)) {
      groupingNode.nonGroupingAncestor = parentNode.nonGroupingAncestor;
      return;
    }

    // not sure why type checker doesn't pick this up
    assert(HierarchyNode.isCustom(parentNode) || HierarchyNode.isInstancesNode(parentNode));
    groupingNode.nonGroupingAncestor = parentNode;
  });
  return mergeInPlace<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode>(curr.grouped, curr.ungrouped);
}

function mergeInPlace<T>(target: T[] | undefined, source: T[]) {
  if (!target || target.length === 0) {
    return source;
  }
  for (const item of source) {
    target.push(item);
  }
  return target;
}

/** @internal */
export async function createGroupingHandlers(
  metadata: IECMetadataProvider,
  parentNode: ParentHierarchyNode | undefined,
  processedInstanceNodes: ProcessedInstanceHierarchyNode[],
  valueFormatter: IPrimitiveValueFormatter,
  localizedStrings: PropertiesGroupingLocalizedStrings,
  classHierarchyInspector: IECClassHierarchyInspector,
): Promise<GroupingHandler[]> {
  const groupingLevel = getNodeGroupingLevel(parentNode);
  const groupingHandlers: GroupingHandler[] = new Array<GroupingHandler>();
  if (groupingLevel <= GroupingLevel.Class) {
    groupingHandlers.push(...(await createBaseClassGroupingHandlers(metadata, parentNode, processedInstanceNodes, classHierarchyInspector)));
    groupingHandlers.push(async (allNodes) => createClassGroups(metadata, parentNode, allNodes));
  }
  if (groupingLevel <= GroupingLevel.Property) {
    groupingHandlers.push(
      ...(await createPropertiesGroupingHandlers(metadata, parentNode, processedInstanceNodes, valueFormatter, localizedStrings, classHierarchyInspector)),
    );
  }
  if (groupingLevel < GroupingLevel.Label) {
    groupingHandlers.push(async (allNodes) => createLabelGroups(allNodes));
  }
  return groupingHandlers;
}

function getNodeGroupingLevel(node: ParentHierarchyNode | undefined): GroupingLevel {
  if (node && HierarchyNode.isClassGroupingNode(node)) {
    return GroupingLevel.Class;
  }
  if (node && HierarchyNode.isPropertyGroupingNode(node)) {
    return GroupingLevel.Property;
  }
  if (node && HierarchyNode.isLabelGroupingNode(node)) {
    return GroupingLevel.Label;
  }
  return GroupingLevel.None;
}

enum GroupingLevel {
  None = 0,
  Class = 2,
  Property = 3,
  Label = 4,
}
