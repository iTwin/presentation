/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { map, merge, mergeMap, Observable, partition, shareReplay, tap } from "rxjs";
import { HierarchyNode } from "../../HierarchyNode";
import { getLogger } from "../../Logging";
import { createOperatorLoggingNamespace, hasChildren } from "../Common";

const OPERATOR_NAME = "DetermineChildren";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

/**
 * Ensures all input nodes have their children determined.
 *
 * @internal
 */
export function createDetermineChildrenOperator(hasNodes: (node: HierarchyNode) => Observable<boolean>) {
  return function (nodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
    const sharedNodes = nodes.pipe(
      log((n) => `in: ${n.label}`),
      // each partitioned observable is going to subscribe to this individually - share and replay to avoid requesting
      // nodes from source observable multiple times
      shareReplay(),
    );
    const [determined, undetermined] = partition(sharedNodes, (node) => node.children !== undefined);
    return merge(
      determined,
      undetermined.pipe(
        mergeMap((n) =>
          hasNodes(n).pipe(
            log((hasChildrenFlag) => `children for ${n.label}: ${hasChildrenFlag}`),
            map((hasChildrenFlag) => ({ ...n, children: hasChildrenFlag })),
          ),
        ),
      ),
    ).pipe(log((n) => `out: ${n.label} / ${hasChildren(n)}`));
  };
}

function doLog(msg: string) {
  getLogger().logTrace(LOGGING_NAMESPACE, msg);
}

function log<T>(msg: (arg: T) => string) {
  return tap<T>((n) => doLog(msg(n)));
}
