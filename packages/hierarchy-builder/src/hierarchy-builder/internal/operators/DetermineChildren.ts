/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { map, merge, mergeMap, Observable, partition, share, tap } from "rxjs";
import { InProgressTreeNode } from "../Common";

/** @internal */
export function createDetermineChildrenReducer(hasNodes: (node: InProgressTreeNode) => Observable<boolean>) {
  const enableLogging = false;
  return function (nodes: Observable<InProgressTreeNode>): Observable<InProgressTreeNode> {
    const [determined, undetermined] = partition(nodes.pipe(share()), (node) => node.children !== undefined);
    return merge(
      determined,
      undetermined.pipe(
        mergeMap((n) =>
          hasNodes(n).pipe(
            map((children) => {
              enableLogging && console.log(`DetermineChildrenReducer: children for ${n.label}: ${children}`);
              return { ...n, children };
            }),
          ),
        ),
      ),
    ).pipe(tap((node) => enableLogging && console.log(`DetermineChildrenReducer partial: ${node.label}: ${node.children}`)));
  };
}
