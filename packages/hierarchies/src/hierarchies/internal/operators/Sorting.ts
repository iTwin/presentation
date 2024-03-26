/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { concatAll, map, Observable, reduce } from "rxjs";
import { DuplicatePolicy, SortedArray } from "@itwin/core-bentley";
import { ProcessedHierarchyNode } from "../../HierarchyNode";
import { compareNodesByLabel } from "../Common";

/**
 * This should accept sorting params in some form:
 * - is sorting disabled?
 * - are we sorting by label or some property value, in case of the latter - how do we get the value?
 *
 * @note Nodes with same labels are returned in undefined order.
 * @internal
 */
export function sortNodesByLabelOperator(nodes: Observable<ProcessedHierarchyNode>): Observable<ProcessedHierarchyNode> {
  return nodes.pipe(
    reduce(
      (sorted, node) => {
        sorted.insert(node);
        return sorted;
      },
      new SortedArray<ProcessedHierarchyNode>(compareNodesByLabel, DuplicatePolicy.Allow),
    ),
    map((sortedArray) => sortedArray.extractArray()),
    concatAll(),
  );
}
