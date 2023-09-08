/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { map, merge, mergeMap, Observable, partition, share, tap } from "rxjs";
import { HierarchyNode } from "../../HierarchyNode";

/** @internal */
export function createDetermineChildrenOperator(hasNodes: (node: HierarchyNode) => Observable<boolean>) {
  const enableLogging = false;
  return function (nodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
    const [determined, undetermined] = partition(nodes.pipe(share()), (node) => node.children !== undefined);
    return merge(
      determined,
      undetermined.pipe(
        mergeMap((n) =>
          hasNodes(n).pipe(
            map((children) => {
              enableLogging && console.log(`DetermineChildrenOperator: children for ${n.label}: ${children}`);
              return { ...n, children };
            }),
          ),
        ),
      ),
    ).pipe(tap((node) => enableLogging && console.log(`DetermineChildrenOperator partial: ${node.label}: ${node.children}`)));
  };
}
