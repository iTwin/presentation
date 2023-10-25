/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer, filter, map, merge, mergeMap, Observable, partition, shareReplay, tap } from "rxjs";
import { HierarchyNode, ProcessedCustomHierarchyNode, ProcessedHierarchyNode, ProcessedInstanceHierarchyNode } from "../../HierarchyNode";
import { getLogger } from "../../Logging";
import { createOperatorLoggingNamespace, hasChildren } from "../Common";

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
      log((n) => `in: ${n.label}`),
      // each partitioned observable is going to subscribe to this individually - share and replay to avoid requesting
      // nodes from source observable multiple times
      shareReplay(),
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
      doesntNeedHide.pipe(log((n) => `doesnt need hide: ${n.label}`)),
      merge(
        determinedChildren.pipe(log((n) => `needs hide, has children: ${n.label}`)),
        undeterminedChildren.pipe(
          log((n) => `needs hide, needs children: ${n.label}`),
          mergeMap(
            (n) =>
              defer(() => {
                doLog(`requesting children flag for ${n.label}`);
                return hasNodes(n).pipe(
                  log((children) => `determined children for ${n.label}: ${children}`),
                  map((children) => ({ ...n, children })),
                );
              }),
            // when checking for children, determine children one-by-one using a depth-first approach to avoid starting too many queries
            stopOnFirstChild ? 1 : undefined,
          ),
          log((n) => `needs hide, determined children: ${n.label} / ${hasChildren(n)}`),
        ),
      ).pipe(filter(hasChildren)),
    ).pipe(log((n) => `out: ${n.label}: ${hasChildren(n)}`));
  };
}

function doLog(msg: string) {
  getLogger().logTrace(LOGGING_NAMESPACE, msg);
}

function log<T>(msg: (arg: T) => string) {
  return tap<T>((n) => doLog(msg(n)));
}
