/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import naturalCompare from "natural-compare-lite";
import { mergeMap, Observable, toArray } from "rxjs";
import { HierarchyNode } from "../../HierarchyNode";

/**
 * This should accept sorting params in some form:
 * - is sorting disabled?
 * - are we sorting by label or some property value, in case of the latter - how do we get the value?
 *
 * @internal
 */
export function sortNodesByLabelOperator(nodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
  return nodes.pipe(
    toArray(),
    mergeMap((allNodes) => allNodes.sort((lhs, rhs) => naturalCompare(lhs.label.toLocaleLowerCase(), rhs.label.toLocaleLowerCase()))),
  );
}
