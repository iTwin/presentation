/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { concatMap, map, Observable, of } from "rxjs";
import { createNodeIdentifierForLogging, createOperatorLoggingNamespace, LOGGING_NAMESPACE_INTERNAL } from "../../internal/Common.js";
import { log } from "../../internal/LoggingUtils.js";
import { releaseMainThreadOnItemsCount } from "../../internal/operators/ReleaseMainThread.js";
import { ProcessedHierarchyNode } from "../IModelHierarchyNode.js";

const OPERATOR_NAME = "DetermineChildren";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME, LOGGING_NAMESPACE_INTERNAL);

/**
 * Ensures all input nodes have their children determined.
 *
 * @internal
 */
export function createDetermineChildrenOperator(hasNodes: (node: ProcessedHierarchyNode) => Observable<boolean>) {
  return function (nodes: Observable<ProcessedHierarchyNode>): Observable<ProcessedHierarchyNode> {
    return nodes.pipe(
      log({ category: LOGGING_NAMESPACE, message: /* c8 ignore next */ (n) => `in: ${createNodeIdentifierForLogging(n)}` }),
      releaseMainThreadOnItemsCount(200),
      concatMap((n: ProcessedHierarchyNode): Observable<ProcessedHierarchyNode> => {
        if (n.children !== undefined) {
          return of(n);
        }
        return hasNodes(n).pipe(
          log({
            category: LOGGING_NAMESPACE,
            message: /* c8 ignore next */ (hasChildrenFlag) => `${createNodeIdentifierForLogging(n)}: determined children: ${hasChildrenFlag}`,
          }),
          map((hasChildrenFlag) => Object.assign(n, { children: hasChildrenFlag })),
        );
      }),
      log({ category: LOGGING_NAMESPACE, message: /* c8 ignore next */ (n) => `out: ${createNodeIdentifierForLogging(n)}` }),
    );
  };
}
