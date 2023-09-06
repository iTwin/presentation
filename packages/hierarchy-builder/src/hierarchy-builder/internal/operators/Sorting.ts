/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import naturalCompare from "natural-compare-lite";
import { mergeMap, Observable, toArray } from "rxjs";
import { TreeNode } from "../../TreeNode";

/** @internal */
export function sortNodesByLabelReducer(nodes: Observable<TreeNode>): Observable<TreeNode> {
  return nodes.pipe(
    toArray(),
    mergeMap((allNodes) => allNodes.sort((lhs, rhs) => naturalCompare(lhs.label.toLocaleLowerCase(), rhs.label.toLocaleLowerCase()))),
  );
}
