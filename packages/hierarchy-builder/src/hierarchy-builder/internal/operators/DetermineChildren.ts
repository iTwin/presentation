/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { concatMap, map, Observable, of, tap } from "rxjs";
import { ProcessedHierarchyNode } from "../../HierarchyNode";
import { getLogger } from "../../Logging";
import { createOperatorLoggingNamespace } from "../Common";

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
      log((n) => `in: ${n.label}`),
      concatMap((n: ProcessedHierarchyNode): Observable<ProcessedHierarchyNode> => {
        if (n.children !== undefined) {
          return of(n);
        }
        return hasNodes(n).pipe(
          log((hasChildrenFlag) => `determined children for ${n.label}: ${hasChildrenFlag}`),
          map((hasChildrenFlag) => ({ ...n, children: hasChildrenFlag })),
        );
      }),
      log((n) => `out: ${n.label}`),
    );
  };
}

function doLog(msg: string) {
  getLogger().logTrace(LOGGING_NAMESPACE, msg);
}

function log<T>(msg: (arg: T) => string) {
  return tap<T>((n) => doLog(msg(n)));
}
