/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { asapScheduler, defer, filter, map, merge, mergeMap, Observable, partition, share, subscribeOn, tap } from "rxjs";
import { HierarchyNode, ProcessedCustomHierarchyNode, ProcessedHierarchyNode, ProcessedInstanceHierarchyNode } from "../../HierarchyNode";
import { getLogger } from "../../Logging";
import { createNodeIdentifierForLogging, createOperatorLoggingNamespace, hasChildren } from "../Common";

const OPERATOR_NAME = "HideIfNoChildren";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

/**
 * Creates an operator that hides nodes with no children if they have a `hideIfNoChildren` handling param.
 *
 * @internal
 */
export function createHideIfNoChildrenOperator(hasNodes: (node: ProcessedHierarchyNode) => Observable<boolean>, stopOnFirstChild: boolean) {
  return function (nodes: Observable<ProcessedHierarchyNode>): Observable<ProcessedHierarchyNode> {
    const sharedNodes = nodes.pipe(
      log((n) => `in: ${createNodeIdentifierForLogging(n)}`),
      // each partitioned observable is going to subscribe to this individually - share to avoid requesting
      // nodes from source observable multiple times
      subscribeOn(asapScheduler),
      share(),
    );
    // split input into 3 pieces:
    // - `doesntNeedHide` - nodes without the flag (return no matter if they have children or not)
    // - `determinedChildren` - nodes with the flag and known children
    // - `undeterminedChildren` - nodes with the flag and unknown children
    const [needsHide, doesntNeedHide] = partition(
      sharedNodes,
      (n): n is ProcessedCustomHierarchyNode | ProcessedInstanceHierarchyNode =>
        (HierarchyNode.isCustom(n) || HierarchyNode.isInstancesNode(n)) && !!n.processingParams?.hideIfNoChildren,
    );
    const [determinedChildren, undeterminedChildren] = partition(needsHide, (n) => n.children !== undefined);
    return merge(
      doesntNeedHide.pipe(log((n) => `${createNodeIdentifierForLogging(n)}: doesn't need hide`)),
      merge(
        determinedChildren.pipe(log((n) => `${createNodeIdentifierForLogging(n)}: needs hide, has children`)),
        undeterminedChildren.pipe(
          log((n) => `${createNodeIdentifierForLogging(n)}: needs hide, needs children`),
          mergeMap(
            (n) =>
              defer(() => {
                doLog(`${createNodeIdentifierForLogging(n)}: requesting children flag`);
                return hasNodes(n).pipe(
                  log((children) => `${createNodeIdentifierForLogging(n)}: determined children: ${children}`),
                  map((children) => ({ ...n, children })),
                );
              }),
            // when checking for children, determine children one-by-one using a depth-first approach to avoid starting too many queries
            stopOnFirstChild ? 1 : undefined,
          ),
          log((n) => `${createNodeIdentifierForLogging(n)}: needs hide, determined children: ${hasChildren(n)}`),
        ),
      ).pipe(filter(hasChildren)),
    ).pipe(log((n) => `out: ${createNodeIdentifierForLogging(n)}`));
  };
}

function doLog(msg: string) {
  getLogger().logTrace(LOGGING_NAMESPACE, msg);
}

function log<T>(msg: (arg: T) => string) {
  return tap<T>((n) => doLog(msg(n)));
}
