/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { concat, concatAll, delay, EMPTY, expand, finalize, from, last, map, merge, mergeMap, Observable, of, reduce, tap, toArray } from "rxjs";
import { assert, StopWatch } from "@itwin/core-bentley";
import { IECClassHierarchyInspector, IECMetadataProvider, IPrimitiveValueFormatter } from "@itwin/presentation-shared";
import {
  HierarchyNode,
  ParentHierarchyNode,
  ProcessedGroupingHierarchyNode,
  ProcessedHierarchyNode,
  ProcessedInstanceHierarchyNode,
} from "../../HierarchyNode";
import { createNodeIdentifierForLogging, createOperatorLoggingNamespace } from "../Common";
import { doLog, log } from "../LoggingUtils";
import { assignAutoExpand } from "./grouping/AutoExpand";
import { createBaseClassGroupingHandlers } from "./grouping/BaseClassGrouping";
import { createClassGroups } from "./grouping/ClassGrouping";
import { applyGroupHidingParams } from "./grouping/GroupHiding";
import { createLabelGroups } from "./grouping/LabelGrouping";
import { createPropertiesGroupingHandlers, PropertiesGroupingLocalizedStrings } from "./grouping/PropertiesGrouping";
import { releaseMainThreadOnItemsCount } from "./ReleaseMainThread";
import { tapOnce } from "./TapOnce";

const OPERATOR_NAME = "Grouping";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);
const PERF_LOGGING_NAMESPACE = `${LOGGING_NAMESPACE}.Performance`;

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
      tapOnce(() => {
        doLog({
          category: PERF_LOGGING_NAMESPACE,
          message: /* istanbul ignore next */ () => `Starting grouping`,
        });
      }),
      reduce<ProcessedHierarchyNode, { instanceNodes: ProcessedInstanceHierarchyNode[]; restNodes: ProcessedHierarchyNode[] }>(
        (resolvedNodes, node) => {
          if (HierarchyNode.isInstancesNode(node)) {
            resolvedNodes.instanceNodes.push(node);
          } else {
            resolvedNodes.restNodes.push(node);
          }
          return resolvedNodes;
        },
        { instanceNodes: [], restNodes: [] },
      ),
      tap(() => {
        doLog({
          category: PERF_LOGGING_NAMESPACE,
          message: /* istanbul ignore next */ () => `Nodes partitioned`,
        });
      }),
      mergeMap(({ instanceNodes, restNodes }): Observable<ProcessedHierarchyNode> => {
        const timer = new StopWatch(undefined, true);
        const groupingHandlersObs: Observable<GroupingHandler> = groupingHandlers
          ? from(groupingHandlers)
          : createGroupingHandlers(metadata, parentNode, instanceNodes, valueFormatter, localizedStrings, classHierarchyInspector);
        return merge(
          groupingHandlersObs.pipe(
            toArray(),
            mergeMap((createdGroupingHandlers) =>
              groupInstanceNodes(instanceNodes, restNodes.length, createdGroupingHandlers, parentNode, onGroupingNodeCreated),
            ),
            finalize(() => {
              doLog({
                category: PERF_LOGGING_NAMESPACE,
                message: /* istanbul ignore next */ () => `Grouping ${instanceNodes.length} nodes took ${timer.elapsedSeconds.toFixed(3)} s`,
              });
            }),
          ),
          from(restNodes),
        );
      }),
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

function groupInstanceNodes(
  nodes: ProcessedInstanceHierarchyNode[],
  extraSiblings: number,
  groupingHandlers: GroupingHandler[],
  parentNode: ParentHierarchyNode | undefined,
  onGroupingNodeCreated?: (groupingNode: ProcessedGroupingHierarchyNode) => void,
): Observable<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode> {
  if (groupingHandlers.length === 0) {
    return from(nodes);
  }
  return of<{ handlerIndex: number; result?: GroupingHandlerResult | undefined }>({ handlerIndex: 0 }).pipe(
    expand(({ handlerIndex, result: curr }) => {
      if (handlerIndex >= groupingHandlers.length) {
        return EMPTY;
      }
      const timer = new StopWatch(undefined, true);
      const currentHandler = groupingHandlers[handlerIndex];
      return from(currentHandler(curr?.ungrouped ?? nodes, curr?.grouped ?? [])).pipe(
        log({
          category: PERF_LOGGING_NAMESPACE,
          message: /* istanbul ignore next */ () => `Grouping handler ${handlerIndex} exclusively took ${timer.elapsedSeconds.toFixed(3)} s.`,
        }),
        map((result) => applyGroupHidingParams(result, extraSiblings)),
        map((result) => assignAutoExpand(result)),
        map((result) => ({ handlerIndex: handlerIndex + 1, result: { ...result, grouped: mergeInPlace(curr?.grouped, result.grouped) } })),
        log({
          category: PERF_LOGGING_NAMESPACE,
          message: /* istanbul ignore next */ () => `Total time for grouping handler ${handlerIndex}: ${timer.elapsedSeconds.toFixed(3)} s.`,
        }),
        delay(0),
      );
    }),
    last(),
    mergeMap(({ result }) => {
      result.grouped.forEach((groupingNode) => {
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
      return mergeInPlace<ProcessedGroupingHierarchyNode | ProcessedInstanceHierarchyNode>(result.grouped, result.ungrouped);
    }),
  );
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
export function createGroupingHandlers(
  metadata: IECMetadataProvider,
  parentNode: ParentHierarchyNode | undefined,
  processedInstanceNodes: ProcessedInstanceHierarchyNode[],
  valueFormatter: IPrimitiveValueFormatter,
  localizedStrings: PropertiesGroupingLocalizedStrings,
  classHierarchyInspector: IECClassHierarchyInspector,
): Observable<GroupingHandler> {
  doLog({
    category: PERF_LOGGING_NAMESPACE,
    message: /* istanbul ignore next */ () => `Start creating grouping handlers`,
  });
  const timer = new StopWatch(undefined, true);
  const groupingLevel = getNodeGroupingLevel(parentNode);
  return concat(
    groupingLevel <= GroupingLevel.Class
      ? concat(
          from(createBaseClassGroupingHandlers(metadata, parentNode, processedInstanceNodes, classHierarchyInspector)).pipe(concatAll()),
          of<GroupingHandler>(async (allNodes) => createClassGroups(metadata, parentNode, allNodes)),
        )
      : EMPTY,
    groupingLevel <= GroupingLevel.Property
      ? from(createPropertiesGroupingHandlers(metadata, parentNode, processedInstanceNodes, valueFormatter, localizedStrings, classHierarchyInspector)).pipe(
          concatAll(),
        )
      : EMPTY,
    groupingLevel < GroupingLevel.Label ? of<GroupingHandler>(async (allNodes) => createLabelGroups(allNodes)) : EMPTY,
  ).pipe(
    finalize(() => {
      doLog({
        category: PERF_LOGGING_NAMESPACE,
        message: /* istanbul ignore next */ () => `Creating grouping handlers took ${timer.elapsedSeconds.toFixed(3)} s`,
      });
    }),
  );
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
