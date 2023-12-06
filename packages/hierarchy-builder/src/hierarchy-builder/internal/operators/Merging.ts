/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import naturalCompare from "natural-compare-lite";

/** @internal */
export function mergeArraysByLabel<TNode1 extends { label: string }, TNode2 extends { label: string }, TNodeResult>(lhs: TNode1[], rhs: TNode2[]) {
  const sorted = new Array<TNodeResult>();
  let indexLhs = 0;
  let indexRhs = 0;
  while (indexLhs < lhs.length && indexRhs < rhs.length) {
    if (labelComparerFunc(lhs[indexLhs], rhs[indexRhs]) > 0) {
      sorted.push(rhs[indexRhs] as unknown as TNodeResult);
      ++indexRhs;
      continue;
    }
    sorted.push(lhs[indexLhs] as unknown as TNodeResult);
    ++indexLhs;
  }

  if (indexRhs < rhs.length) {
    const rhsRest = rhs.slice(indexRhs) as unknown as TNodeResult[];
    return sorted.concat(rhsRest);
  }
  const lhsRest = lhs.slice(indexLhs) as unknown as TNodeResult[];
  return sorted.concat(lhsRest);
}

function labelComparerFunc<TNode1 extends { label: string }, TNode2 extends { label: string }>(lhs: TNode1, rhs: TNode2): 0 | 1 | -1 {
  return naturalCompare(lhs.label.toLocaleLowerCase(), rhs.label.toLocaleLowerCase());
}
