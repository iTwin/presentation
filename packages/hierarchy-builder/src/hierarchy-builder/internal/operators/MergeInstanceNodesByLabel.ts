/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { from, merge, mergeMap, Observable, partition, reduce, share, tap } from "rxjs";
import { assert, DuplicatePolicy, SortedArray } from "@itwin/core-bentley";
import { InProgressHierarchyNode, mergeDirectNodeObservables, mergeInstanceNodesObs } from "../Common";

/** @internal */
export function createMergeInstanceNodesByLabelOperator(directNodesCache: Map<string, Observable<InProgressHierarchyNode>>) {
  return function (nodes: Observable<InProgressHierarchyNode>): Observable<InProgressHierarchyNode> {
    const enableLogging = false;
    class SortedNodesList extends SortedArray<InProgressHierarchyNode> {
      public constructor() {
        const comp = (lhs: InProgressHierarchyNode, rhs: InProgressHierarchyNode): number => {
          const labelCompare = lhs.label.localeCompare(rhs.label);
          if (labelCompare !== 0) {
            return labelCompare;
          }
          return (lhs.mergeByLabelId ?? "").localeCompare(rhs.mergeByLabelId ?? "");
        };
        super(comp, DuplicatePolicy.Retain);
      }
      public replace(pos: number, replacement: InProgressHierarchyNode) {
        assert(this._compare(this._array[pos], replacement) === 0);
        this._array[pos] = replacement;
      }
    }
    function tryMergeNodes(lhs: InProgressHierarchyNode, rhs: InProgressHierarchyNode): InProgressHierarchyNode | undefined {
      if (lhs.mergeByLabelId !== rhs.mergeByLabelId) {
        return undefined;
      }
      if (lhs.label !== rhs.label) {
        return undefined;
      }
      return mergeInstanceNodesObs(lhs, rhs, directNodesCache);
    }
    const [merged, nonMerged] = partition(
      nodes.pipe(
        tap((n) => enableLogging && console.log(`MergeInstanceNodesByLabelOperator in: ${JSON.stringify(n)}`)),
        share(),
      ),
      (node) => !!node.mergeByLabelId,
    );
    const res = merge(
      nonMerged,
      merged.pipe(
        reduce((acc, node) => {
          enableLogging && console.log(`reduce with ${JSON.stringify(node)}`);
          const pos = acc.insert(node);
          const nodeAtPos = acc.get(pos)!;
          if (nodeAtPos !== node) {
            const mergedNode = tryMergeNodes(nodeAtPos, node);
            if (mergedNode) {
              mergeDirectNodeObservables(nodeAtPos, node, mergedNode, directNodesCache);
              acc.replace(pos, mergedNode);
            }
          }
          return acc;
        }, new SortedNodesList()),
        mergeMap((list) => from(list.extractArray())),
      ),
    ).pipe(
      tap((n) => {
        enableLogging && console.log(`MergeInstanceNodesByLabelOperator out: ${JSON.stringify(n)}`);
      }),
    );
    return res;
  };
}
