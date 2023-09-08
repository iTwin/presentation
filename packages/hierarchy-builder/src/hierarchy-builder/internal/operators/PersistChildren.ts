/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { Observable, reduce, tap } from "rxjs";
import { HierarchyNode } from "../../HierarchyNode";

/** @internal */
export function createPersistChildrenOperator(parentNode: HierarchyNode) {
  return function (nodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
    nodes.pipe(
      reduce((acc, node) => [...acc, node], new Array<HierarchyNode>()),
      tap((list) => {
        if (Object.isExtensible(parentNode)) {
          parentNode.children = list;
        } else {
          // eslint-disable-next-line no-console
          console.log(`node ${parentNode.label} not extensible for setting children`);
        }
      }),
    );
    return nodes;
  };
}
