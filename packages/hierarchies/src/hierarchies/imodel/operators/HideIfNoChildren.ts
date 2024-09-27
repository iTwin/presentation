/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer, filter, map, merge, mergeMap, Observable } from "rxjs";
import { createNodeIdentifierForLogging, createOperatorLoggingNamespace, hasChildren, LOGGING_NAMESPACE_INTERNAL } from "../../internal/Common";
import { doLog, log } from "../../internal/LoggingUtils";
import { partition } from "../../internal/operators/Partition";
import { ProcessedCustomHierarchyNode, ProcessedHierarchyNode, ProcessedInstanceHierarchyNode } from "../IModelHierarchyNode";

const OPERATOR_NAME = "HideIfNoChildren";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME, LOGGING_NAMESPACE_INTERNAL);

/**
 * Creates an operator that hides nodes with no children if they have a `hideIfNoChildren` handling param.
 *
 * @internal
 */
export function createHideIfNoChildrenOperator(hasNodes: (node: ProcessedHierarchyNode) => Observable<boolean>) {
  return function (nodes: Observable<ProcessedHierarchyNode>): Observable<ProcessedHierarchyNode> {
    const inputNodes = nodes.pipe(log({ category: LOGGING_NAMESPACE, message: /* istanbul ignore next */ (n) => `in: ${createNodeIdentifierForLogging(n)}` }));
    // split input into 3 pieces:
    // - `doesntNeedHide` - nodes without the flag (return no matter if they have children or not)
    // - `determinedChildren` - nodes with the flag and known children
    // - `undeterminedChildren` - nodes with the flag and unknown children
    const [needsHide, doesntNeedHide] = partition(
      inputNodes,
      (n): n is ProcessedCustomHierarchyNode | ProcessedInstanceHierarchyNode =>
        (ProcessedHierarchyNode.isCustom(n) || ProcessedHierarchyNode.isInstancesNode(n)) && !!n.processingParams?.hideIfNoChildren,
    );
    const [determinedChildren, undeterminedChildren] = partition(needsHide, (n) => n.children !== undefined);
    return merge(
      doesntNeedHide.pipe(
        log({ category: LOGGING_NAMESPACE, message: /* istanbul ignore next */ (n) => `${createNodeIdentifierForLogging(n)}: doesn't need hide` }),
      ),
      merge(
        determinedChildren.pipe(
          log({ category: LOGGING_NAMESPACE, message: /* istanbul ignore next */ (n) => `${createNodeIdentifierForLogging(n)}: needs hide, has children` }),
        ),
        undeterminedChildren.pipe(
          log({ category: LOGGING_NAMESPACE, message: /* istanbul ignore next */ (n) => `${createNodeIdentifierForLogging(n)}: needs hide, needs children` }),
          mergeMap(
            (n) =>
              defer(() => {
                doLog({
                  category: LOGGING_NAMESPACE,
                  message: /* istanbul ignore next */ () => `${createNodeIdentifierForLogging(n)}: requesting children flag`,
                });
                return hasNodes(n).pipe(
                  log({
                    category: LOGGING_NAMESPACE,
                    message: /* istanbul ignore next */ (childrenFlag) => `${createNodeIdentifierForLogging(n)}: determined children: ${childrenFlag}`,
                  }),
                  map((children) => Object.assign(n, { children })),
                );
              }),
            // Sending child check requests for all nodes without any limit greatly slows down
            // the following case:
            // - NodeX (determining children) -> ... lots of children with "hide if no children" -> ...
            // We check the nodes with "hide if no children" at most 2 at a time to prefer going deep into
            // the hierarchy, where we're more likely to find an answer, rather than going wide.
            2,
          ),
          log({
            category: LOGGING_NAMESPACE,
            message: /* istanbul ignore next */ (n) => `${createNodeIdentifierForLogging(n)}: needs hide, determined children: ${hasChildren(n)}`,
          }),
        ),
      ).pipe(filter(hasChildren)),
    ).pipe(log({ category: LOGGING_NAMESPACE, message: /* istanbul ignore next */ (n) => `out: ${createNodeIdentifierForLogging(n)}` }));
  };
}
