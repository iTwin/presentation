/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { concat, concatAll, delay, EMPTY, expand, finalize, from, last, map, merge, mergeMap, of, reduce, tap, toArray } from "rxjs";
import { assert, StopWatch } from "@itwin/core-bentley";
import { HierarchyNode } from "../../HierarchyNode.js";
import {
  LOGGING_NAMESPACE_PERFORMANCE as BASE_LOGGING_NAMESPACE_PERFORMANCE,
  LOGGING_NAMESPACE_PERFORMANCE_INTERNAL as BASE_LOGGING_NAMESPACE_PERFORMANCE_INTERNAL,
  createNodeIdentifierForLogging,
  createOperatorLoggingNamespace,
  LOGGING_NAMESPACE_INTERNAL,
} from "../../internal/Common.js";
import { doLog, log } from "../../internal/LoggingUtils.js";
import { releaseMainThreadOnItemsCount } from "../../internal/operators/ReleaseMainThread.js";
import { tapOnce } from "../../internal/operators/TapOnce.js";
import { assignAutoExpand } from "./grouping/AutoExpand.js";
import { createBaseClassGroupingHandlers } from "./grouping/BaseClassGrouping.js";
import { createClassGroups } from "./grouping/ClassGrouping.js";
import { applyGroupHidingParams } from "./grouping/GroupHiding.js";
import { createLabelGroups } from "./grouping/LabelGrouping.js";
import { createPropertiesGroupingHandlers } from "./grouping/PropertiesGrouping.js";

import type { Observable } from "rxjs";
import type { ECClassHierarchyInspector, ECSchemaProvider, IPrimitiveValueFormatter } from "@itwin/presentation-shared";
import type { ParentHierarchyNode } from "../../HierarchyNode.js";
import type { ProcessedGroupingHierarchyNode, ProcessedHierarchyNode, ProcessedInstanceHierarchyNode } from "../IModelHierarchyNode.js";
import type { PropertiesGroupingLocalizedStrings } from "./grouping/PropertiesGrouping.js";

const OPERATOR_NAME = "Grouping";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME, LOGGING_NAMESPACE_INTERNAL);
const LOGGING_NAMESPACE_PERFORMANCE = createOperatorLoggingNamespace(OPERATOR_NAME, BASE_LOGGING_NAMESPACE_PERFORMANCE);
const LOGGING_NAMESPACE_PERFORMANCE_INTERNAL = createOperatorLoggingNamespace(OPERATOR_NAME, BASE_LOGGING_NAMESPACE_PERFORMANCE_INTERNAL);

/** @internal */
export function createGroupingOperator(
  imodelAccess: ECSchemaProvider & ECClassHierarchyInspector,
  parentNode: ParentHierarchyNode | undefined,
  valueFormatter: IPrimitiveValueFormatter,
  localizedStrings: PropertiesGroupingLocalizedStrings,
  onNodesGrouped?: (groupingResult: GroupingHandlerResult | undefined, handler: GroupingHandler) => void,
  onGroupingNodeCreated?: (groupingNode: ProcessedGroupingHierarchyNode) => void,
  groupingHandlers?: GroupingHandler[],
) {
  return function (nodes: Observable<ProcessedHierarchyNode>): Observable<ProcessedHierarchyNode> {
    return nodes.pipe(
      log({ category: LOGGING_NAMESPACE, message: /* c8 ignore next */ (n) => `in: ${createNodeIdentifierForLogging(n)}` }),
      tapOnce(() => {
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE,
          message: /* c8 ignore next */ () => `Starting grouping (parent: ${createNodeIdentifierForLogging(parentNode)})`,
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
      tap(({ instanceNodes, restNodes }) => {
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE_INTERNAL,
          message: /* c8 ignore next */ () => `Nodes partitioned. Got ${instanceNodes.length} instance nodes and ${restNodes.length} rest nodes.`,
        });
      }),
      mergeMap((res) => {
        const out = of(res);
        const totalNodes = res.instanceNodes.length + res.restNodes.length;
        /* c8 ignore next */
        return totalNodes <= 1000 ? out : out.pipe(delay(0));
      }),
      mergeMap(({ instanceNodes, restNodes }): Observable<ProcessedHierarchyNode> => {
        const timer = new StopWatch(undefined, true);
        const groupingHandlersObs: Observable<GroupingHandler> = groupingHandlers
          ? from(groupingHandlers)
          : createGroupingHandlers(imodelAccess, parentNode, instanceNodes, valueFormatter, localizedStrings);
        return merge(
          groupingHandlersObs.pipe(
            toArray(),
            mergeMap((createdGroupingHandlers) =>
              groupInstanceNodes(instanceNodes, restNodes.length, createdGroupingHandlers, parentNode, onNodesGrouped, onGroupingNodeCreated),
            ),
            finalize(() => {
              doLog({
                category: LOGGING_NAMESPACE_PERFORMANCE,
                message: /* c8 ignore next */ () => `Grouping ${instanceNodes.length} nodes took ${timer.elapsedSeconds.toFixed(3)} s`,
              });
            }),
          ),
          from(restNodes),
        );
      }),
      releaseMainThreadOnItemsCount(500),
      log({ category: LOGGING_NAMESPACE, message: /* c8 ignore next */ (n) => `out: ${createNodeIdentifierForLogging(n)}` }),
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
  onNodesGrouped?: (groupingResult: GroupingHandlerResult | undefined, handler: GroupingHandler) => void,
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
          category: LOGGING_NAMESPACE_PERFORMANCE_INTERNAL,
          message: /* c8 ignore next */ () => `Grouping handler ${handlerIndex} exclusively took ${timer.elapsedSeconds.toFixed(3)} s.`,
        }),
        tap((result) => {
          onNodesGrouped?.(result, currentHandler);
        }),
        mergeMap((result) => {
          if (result.grouped.length === 0) {
            return of({ handlerIndex: handlerIndex + 1, result: { ...result, grouped: curr?.grouped ?? [] } });
          }
          const groupingPostProcessingTimer = new StopWatch(undefined, true);
          return of(result).pipe(
            map((r) => applyGroupHidingParams(r, extraSiblings)),
            map((r) => assignAutoExpand(r)),
            map((r) => ({ handlerIndex: handlerIndex + 1, result: { ...r, grouped: mergeInPlace(curr?.grouped, r.grouped) } })),
            log({
              category: LOGGING_NAMESPACE_PERFORMANCE_INTERNAL,
              message: /* c8 ignore next */ () =>
                `Post-processing grouping handler ${handlerIndex} exclusively took ${groupingPostProcessingTimer.elapsedSeconds.toFixed(3)} s.`,
            }),
            delay(0),
          );
        }),
        log({
          category: LOGGING_NAMESPACE_PERFORMANCE_INTERNAL,
          message: /* c8 ignore next */ () => `Total time for grouping handler ${handlerIndex}: ${timer.elapsedSeconds.toFixed(3)} s.`,
        }),
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
        assert(HierarchyNode.isGeneric(parentNode) || HierarchyNode.isInstancesNode(parentNode));
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

function createGroupingHandlers(
  imodelAccess: ECSchemaProvider & ECClassHierarchyInspector,
  parentNode: ParentHierarchyNode | undefined,
  processedInstanceNodes: ProcessedInstanceHierarchyNode[],
  valueFormatter: IPrimitiveValueFormatter,
  localizedStrings: PropertiesGroupingLocalizedStrings,
): Observable<GroupingHandler> {
  const timer = new StopWatch();
  const groupingLevel = getNodeGroupingLevel(parentNode);
  return concat(
    groupingLevel <= GroupingLevel.Class
      ? concat(
          from(createBaseClassGroupingHandlers(imodelAccess, parentNode, processedInstanceNodes)).pipe(concatAll()),
          of<GroupingHandler>(async (allNodes) => createClassGroups(imodelAccess, parentNode, allNodes)),
        )
      : EMPTY,
    groupingLevel <= GroupingLevel.Property
      ? from(createPropertiesGroupingHandlers(imodelAccess, parentNode, processedInstanceNodes, valueFormatter, localizedStrings)).pipe(concatAll())
      : EMPTY,
    groupingLevel < GroupingLevel.Label ? of<GroupingHandler>(async (allNodes) => createLabelGroups(allNodes)) : EMPTY,
  ).pipe(
    tap({
      subscribe: () => {
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE_INTERNAL,
          message: /* c8 ignore next */ () => `Start creating grouping handlers`,
        });
        timer.start();
      },
    }),
    finalize(() => {
      doLog({
        category: LOGGING_NAMESPACE_PERFORMANCE_INTERNAL,
        message: /* c8 ignore next */ () => `Creating grouping handlers took ${timer.elapsedSeconds.toFixed(3)} s`,
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
