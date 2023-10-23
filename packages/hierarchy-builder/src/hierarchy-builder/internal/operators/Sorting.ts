/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import naturalCompare from "natural-compare-lite";
import { concatMap, Observable, toArray } from "rxjs";
import { ProcessedHierarchyNode } from "../../HierarchyNode";

/**
 * This should accept sorting params in some form:
 * - is sorting disabled?
 * - are we sorting by label or some property value, in case of the latter - how do we get the value?
 *
 * @internal
 */
export function sortNodesByLabelOperator(nodes: Observable<ProcessedHierarchyNode>): Observable<ProcessedHierarchyNode> {
  return nodes.pipe(
    toArray(),
    concatMap((allNodes) => allNodes.sort((lhs, rhs) => naturalCompare(lhs.label.toLocaleLowerCase(), rhs.label.toLocaleLowerCase()))),
  );
}
