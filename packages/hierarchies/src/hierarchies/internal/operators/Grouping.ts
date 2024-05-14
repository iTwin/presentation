/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { concat, concatAll, delay, EMPTY, expand, finalize, from, last, map, merge, mergeMap, Observable, of, reduce, tap, toArray } from "rxjs";
import { assert, StopWatch } from "@itwin/core-bentley";
import { ECClassHierarchyInspector, ECSchemaProvider, IPrimitiveValueFormatter } from "@itwin/presentation-shared";
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
  imodelAccess: ECSchemaProvider & ECClassHierarchyInspector,
  parentNode: ParentHierarchyNode | undefined,
  valueFormatter: IPrimitiveValueFormatter,
  localizedStrings: PropertiesGroupingLocalizedStrings,
  onGroupingNodeCreated?: (groupingNode: ProcessedGroupingHierarchyNode) => void,
  groupingHandlers?: GroupingHandler[],
) {
  return function (nodes: Observable<ProcessedHierarchyNode>): Observable<ProcessedHierarchyNode> {
    return nodes.pipe(
      log({ category: LOGGING_NAMESPACE, message: /* istanbul ignore next */ (n) => `in: ${createNodeIdentifierForLogging(n)}` }),
      tapOnce(() => {
        doLog({
          category: PERF_LOGGING_NAMESPACE,
          message: /* istanbul ignore next */ () => `Starting grouping (parent: ${createNodeIdentifierForLogging(parentNode)})`,
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
          category: PERF_LOGGING_NAMESPACE,
          message: /* istanbul ignore next */ () => `Nodes partitioned. Got ${instanceNodes.length} instance nodes and ${restNodes.length} rest nodes.`,
        });
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
      releaseMainThreadOnItemsCount(500),
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
        mergeMap((result) => {
          if (result.grouped.length === 0) {
            return of({ handlerIndex: handlerIndex + 1, result: { ...result, grouped: curr?.grouped ?? [] } });
          }
          return of(result).pipe(
            map((r) => applyGroupHidingParams(r, extraSiblings)),
            map((r) => assignAutoExpand(r)),
            map((r) => ({ handlerIndex: handlerIndex + 1, result: { ...r, grouped: mergeInPlace(curr?.grouped, r.grouped) } })),
            delay(0),
          );
        }),
        log({
          category: PERF_LOGGING_NAMESPACE,
          message: /* istanbul ignore next */ () => `Total time for grouping handler ${handlerIndex}: ${timer.elapsedSeconds.toFixed(3)} s.`,
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
          category: PERF_LOGGING_NAMESPACE,
          message: /* istanbul ignore next */ () => `Start creating grouping handlers`,
        });
        timer.start();
      },
    }),
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
