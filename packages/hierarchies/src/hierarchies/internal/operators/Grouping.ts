/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { concatAll, concatMap, from, Observable, of, toArray } from "rxjs";
import { assert } from "@itwin/core-bentley";
import { IMetadataProvider } from "../../ECMetadata";
import {
  HierarchyNode,
  HierarchyNodeKey,
  ParentHierarchyNode,
  ProcessedGroupingHierarchyNode,
  ProcessedHierarchyNode,
  ProcessedInstanceHierarchyNode,
} from "../../HierarchyNode";
import { IPrimitiveValueFormatter } from "../../values/Formatting";
import { BaseClassChecker, createNodeIdentifierForLogging, createOperatorLoggingNamespace } from "../Common";
import { log } from "../LoggingUtils";
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
  parentNode: ParentHierarchyNode | undefined,
  valueFormatter: IPrimitiveValueFormatter,
  localizedStrings: PropertiesGroupingLocalizedStrings,
  baseClassChecker: BaseClassChecker,
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
          : from(createGroupingHandlers(metadata, parentNode, instanceNodes, valueFormatter, localizedStrings, baseClassChecker));
        return groupingHandlersObs.pipe(
          concatMap(async (createdGroupingHandlers) => {
            const grouped = await groupInstanceNodes(instanceNodes, restNodes.length, createdGroupingHandlers, parentNode, onGroupingNodeCreated);
            return from([...grouped, ...restNodes]);
          }),
        );
      }),
      concatAll(),
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
      grouped: [...(curr?.grouped ?? []), ...groupings.grouped],
      ungrouped: groupings.ungrouped,
    };
  }
  if (curr) {
    if (curr.grouped.length > 0) {
      curr.grouped.forEach((groupingNode) => {
        if (parentNode) {
          if (HierarchyNode.isGroupingNode(parentNode)) {
            groupingNode.nonGroupingAncestor = parentNode.nonGroupingAncestor;
          } else {
            // not sure why type checker doesn't pick this up
            assert(HierarchyNode.isCustom(parentNode) || HierarchyNode.isInstancesNode(parentNode));
            groupingNode.nonGroupingAncestor = parentNode;
          }
        }
        onGroupingNodeCreated && onGroupingNodeCreated(groupingNode);
      });
      return [...curr.grouped, ...curr.ungrouped];
    }
    return curr.ungrouped;
  }
  return nodes;
}

/** @internal */
export async function createGroupingHandlers(
  metadata: IMetadataProvider,
  parentNode: ParentHierarchyNode | undefined,
  processedInstanceNodes: ProcessedInstanceHierarchyNode[],
  valueFormatter: IPrimitiveValueFormatter,
  localizedStrings: PropertiesGroupingLocalizedStrings,
  baseClassChecker: BaseClassChecker,
): Promise<GroupingHandler[]> {
  const groupingLevel = getNodeGroupingLevel(parentNode);
  const groupingHandlers: GroupingHandler[] = new Array<GroupingHandler>();
  if (groupingLevel <= GroupingLevel.Class) {
    groupingHandlers.push(...(await createBaseClassGroupingHandlers(metadata, parentNode, processedInstanceNodes, baseClassChecker)));
    groupingHandlers.push(async (allNodes) => createClassGroups(metadata, parentNode, allNodes));
  }
  if (groupingLevel <= GroupingLevel.Property) {
    groupingHandlers.push(
      ...(await createPropertiesGroupingHandlers(metadata, parentNode, processedInstanceNodes, valueFormatter, localizedStrings, baseClassChecker)),
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
