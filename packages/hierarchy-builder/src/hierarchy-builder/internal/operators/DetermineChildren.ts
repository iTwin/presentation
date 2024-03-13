/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { concatMap, map, Observable, of } from "rxjs";
import { ProcessedHierarchyNode } from "../../HierarchyNode";
import { createNodeIdentifierForLogging, createOperatorLoggingNamespace } from "../Common";
import { log } from "../LoggingUtils";

const OPERATOR_NAME = "DetermineChildren";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

/**
 * Ensures all input nodes have their children determined.
 *
 * @internal
 */
export function createDetermineChildrenOperator(hasNodes: (node: ProcessedHierarchyNode) => Observable<boolean>) {
  return function (nodes: Observable<ProcessedHierarchyNode>): Observable<ProcessedHierarchyNode> {
    return nodes.pipe(
      log({ category: LOGGING_NAMESPACE, message: /* istanbul ignore next */ (n) => `in: ${createNodeIdentifierForLogging(n)}` }),
      concatMap((n: ProcessedHierarchyNode): Observable<ProcessedHierarchyNode> => {
        if (n.children !== undefined) {
          return of(n);
        }
        return hasNodes(n).pipe(
          log({
            category: LOGGING_NAMESPACE,
            message: /* istanbul ignore next */ (hasChildrenFlag) => `${createNodeIdentifierForLogging(n)}: determined children: ${hasChildrenFlag}`,
          }),
          map((hasChildrenFlag) => ({ ...n, children: hasChildrenFlag })),
        );
      }),
      log({ category: LOGGING_NAMESPACE, message: /* istanbul ignore next */ (n) => `out: ${createNodeIdentifierForLogging(n)}` }),
    );
  };
}
