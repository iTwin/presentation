/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { from, merge, mergeMap, Observable, partition, reduce, share, tap } from "rxjs";
import { assert, DuplicatePolicy, SortedArray } from "@itwin/core-bentley";
import { HierarchyNode } from "../../HierarchyNode";
import { mergeDirectNodeObservables, mergeNodesObs } from "../Common";

/** @internal */
export function createMergeInstanceNodesByLabelOperator(directNodesCache: Map<string, Observable<HierarchyNode>>) {
  return function (nodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
    const enableLogging = false;
    class SortedNodesList extends SortedArray<HierarchyNode> {
      public constructor() {
        const comp = (lhs: HierarchyNode, rhs: HierarchyNode): number => {
          const labelCompare = lhs.label.localeCompare(rhs.label);
          if (labelCompare !== 0) {
            return labelCompare;
          }
          return (lhs.params?.mergeByLabelId ?? "").localeCompare(rhs.params?.mergeByLabelId ?? "");
        };
        super(comp, DuplicatePolicy.Retain);
      }
      public replace(pos: number, replacement: HierarchyNode) {
        assert(this._compare(this._array[pos], replacement) === 0);
        this._array[pos] = replacement;
      }
    }
    function tryMergeNodes(lhs: HierarchyNode, rhs: HierarchyNode): HierarchyNode | undefined {
      if (!HierarchyNode.isInstancesNode(lhs) || !HierarchyNode.isInstancesNode(rhs)) {
        return undefined;
      }
      if (lhs.params?.mergeByLabelId !== rhs.params?.mergeByLabelId) {
        return undefined;
      }
      if (lhs.label !== rhs.label) {
        return undefined;
      }
      return mergeNodesObs(lhs, rhs, directNodesCache);
    }
    const [merged, nonMerged] = partition(
      nodes.pipe(
        tap((n) => enableLogging && console.log(`MergeInstanceNodesByLabelOperator in: ${JSON.stringify(n)}`)),
        share(),
      ),
      (node) => !!node.params?.mergeByLabelId,
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
