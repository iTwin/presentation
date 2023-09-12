/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, merge, mergeMap, Observable, partition, reduce, shareReplay, tap } from "rxjs";
import { assert, DuplicatePolicy, Logger, SortedArray } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyNodeKey } from "../../HierarchyNode";
import { createOperatorLoggingNamespace, mergeNodesObs } from "../Common";

const OPERATOR_NAME = "MergeInstanceNodesByLabel";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

/**
 * Creates an operator that merges all same-label instance nodes from the input observable. For the nodes to get merged
 * they need to have the same label and same `mergeByLabelId` handling param value.
 *
 * @internal
 */
export function createMergeInstanceNodesByLabelOperator(directNodesCache: Map<string, Observable<HierarchyNode>>) {
  return function (nodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
    const sharedNodes = nodes.pipe(
      log((n) => `in: ${serializeNode(n)}`),
      // each partitioned observable is going to subscribe to this individually - share and replay to avoid requesting
      // nodes from source observable multiple times
      shareReplay(),
    );
    // split input into 3 pieces:
    // - `merged` - instance nodes that requested to be merged (have `mergeByLabelId`)
    // - `nonMerged` - nodes that don't need to be merged
    const [merged, nonMerged] = partition(sharedNodes, (node) => HierarchyNode.isInstancesNode(node) && !!node.params?.mergeByLabelId);
    return merge(
      nonMerged,
      (merged as Observable<MergingHierarchyNode>).pipe(
        // put all merged nodes into `SortedNodesList`
        reduce((acc, node) => {
          doLog(`reduce with ${serializeNode(node)}`);
          const pos = acc.insert(node);
          const nodeAtPos = acc.get(pos)!;
          if (nodeAtPos !== node) {
            const mergedNode = mergeNodesObs(nodeAtPos, node, directNodesCache);
            acc.replace(pos, mergedNode as MergingHierarchyNode);
          }
          return acc;
        }, new SortedNodesList()),
        // convert `SortedNodesList` to an observable
        mergeMap((list) => from(list.extractArray())),
      ),
    ).pipe(log((n) => `out: ${serializeNode(n)}`));
  };
}

type MergingHierarchyNode = HierarchyNode & { params: { mergeByLabelId: string } };
class SortedNodesList extends SortedArray<MergingHierarchyNode> {
  public constructor() {
    const comp = (lhs: MergingHierarchyNode, rhs: MergingHierarchyNode): number => {
      const labelCompare = lhs.label.localeCompare(rhs.label);
      if (labelCompare !== 0) {
        return labelCompare;
      }
      return lhs.params.mergeByLabelId.localeCompare(rhs.params.mergeByLabelId);
    };
    super(comp, DuplicatePolicy.Retain);
  }
  public replace(pos: number, replacement: MergingHierarchyNode) {
    assert(this._compare(this._array[pos], replacement) === 0);
    this._array[pos] = replacement;
  }
}

function serializeNode(node: HierarchyNode) {
  return JSON.stringify({
    label: node.label,
    keys: HierarchyNodeKey.isInstances(node.key) ? node.key.instanceKeys : node.key,
    mergeId: node.params?.mergeByLabelId,
  });
}

function doLog(msg: string) {
  Logger.logTrace(LOGGING_NAMESPACE, msg);
}

function log<T>(msg: (arg: T) => string) {
  return tap<T>((n) => doLog(msg(n)));
}
