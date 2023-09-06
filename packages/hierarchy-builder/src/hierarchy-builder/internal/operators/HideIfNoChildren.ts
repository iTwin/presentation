/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { defer, filter, map, merge, mergeMap, Observable, partition, share, tap } from "rxjs";
import { hasChildren, InProgressHierarchyNode } from "../Common";

/** @internal */
export function createHideIfNoChildrenOperator(hasNodes: (node: InProgressHierarchyNode) => Observable<boolean>, stopOnFirstChild: boolean) {
  const enableLogging = false;
  return function (nodes: Observable<InProgressHierarchyNode>): Observable<InProgressHierarchyNode> {
    const [needsHide, doesntNeedHide] = partition(
      nodes.pipe(
        tap((n) => `HideIfNoChildrenOperator in: ${n.label}`),
        share(),
      ),
      (n) => !!n.hideIfNoChildren,
    );
    const [determinedChildren, undeterminedChildren] = partition(needsHide, (n) => n.children !== undefined);
    return merge(
      doesntNeedHide.pipe(tap((n) => enableLogging && console.log(`HideIfNoChildrenOperator: doesnt need hide: ${n.label}`))),
      merge(
        determinedChildren.pipe(tap((n) => enableLogging && console.log(`HideIfNoChildrenOperator: needs hide, has children: ${n.label}`))),
        undeterminedChildren.pipe(
          tap((n) => enableLogging && console.log(`HideIfNoChildrenOperator: needs hide, needs children: ${n.label}`)),
          mergeMap(
            (n) =>
              defer(() => {
                enableLogging && console.log(`HideIfNoChildrenOperator: requesting children flag for ${n.label}`);
                return hasNodes(n).pipe(
                  map((children) => {
                    enableLogging && console.log(`HideIfNoChildrenOperator: children for ${n.label}: ${children}`);
                    return { ...n, children };
                  }),
                );
              }),
            // when checking for children, determine children one-by-one using a depth-first approach to avoid starting too many queries
            stopOnFirstChild ? 1 : undefined,
          ),
          tap((n) => enableLogging && console.log(`HideIfNoChildrenOperator: needs hide, determined children: ${n.label} / ${hasChildren(n)}`)),
        ),
      ).pipe(filter(hasChildren)),
    ).pipe(tap((node) => enableLogging && console.log(`HideIfNoChildrenOperator out: ${node.label}: ${node.children}`)));
  };
}
