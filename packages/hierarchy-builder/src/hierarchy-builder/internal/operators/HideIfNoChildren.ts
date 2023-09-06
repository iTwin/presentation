/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { defer, filter, map, merge, mergeMap, Observable, partition, share, tap } from "rxjs";
import { hasChildren, InProgressHierarchyNode } from "../Common";

/** @internal */
export function createHideIfNoChildrenReducer(hasNodes: (node: InProgressHierarchyNode) => Observable<boolean>, stopOnFirstChild: boolean) {
  const enableLogging = false;
  return function (nodes: Observable<InProgressHierarchyNode>): Observable<InProgressHierarchyNode> {
    const [needsHide, doesntNeedHide] = partition(
      nodes.pipe(
        tap((n) => `HideIfNoChildrenReducer in: ${n.label}`),
        share(),
      ),
      (n) => !!n.hideIfNoChildren,
    );
    const [determinedChildren, undeterminedChildren] = partition(needsHide, (n) => n.children !== undefined);
    return merge(
      doesntNeedHide.pipe(tap((n) => enableLogging && console.log(`HideIfNoChildrenReducer: doesnt need hide: ${n.label}`))),
      merge(
        determinedChildren.pipe(tap((n) => enableLogging && console.log(`HideIfNoChildrenReducer: needs hide, has children: ${n.label}`))),
        undeterminedChildren.pipe(
          tap((n) => enableLogging && console.log(`HideIfNoChildrenReducer: needs hide, needs children: ${n.label}`)),
          mergeMap(
            (n) =>
              defer(() => {
                enableLogging && console.log(`HideIfNoChildrenReducer: requesting children flag for ${n.label}`);
                return hasNodes(n).pipe(
                  map((children) => {
                    enableLogging && console.log(`HideIfNoChildrenReducer: children for ${n.label}: ${children}`);
                    return { ...n, children };
                  }),
                );
              }),
            // when checking for children, determine children one-by-one using a depth-first approach to avoid starting too many queries
            stopOnFirstChild ? 1 : undefined,
          ),
          tap((n) => enableLogging && console.log(`HideIfNoChildrenReducer: needs hide, determined children: ${n.label} / ${hasChildren(n)}`)),
        ),
      ).pipe(filter(hasChildren)),
    ).pipe(tap((node) => enableLogging && console.log(`HideIfNoChildrenReducer out: ${node.label}: ${node.children}`)));
  };
}
