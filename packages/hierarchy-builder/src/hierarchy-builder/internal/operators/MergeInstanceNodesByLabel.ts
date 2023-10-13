/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, merge, mergeMap, Observable, partition, reduce, shareReplay, tap } from "rxjs";
import { assert, DuplicatePolicy, SortedArray } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyNodeKey, ProcessedHierarchyNode } from "../../HierarchyNode";
import { getLogger } from "../../Logging";
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
export function createMergeInstanceNodesByLabelOperator(directNodesCache: Map<string, Observable<ProcessedHierarchyNode>>) {
  return function (nodes: Observable<ProcessedHierarchyNode>): Observable<ProcessedHierarchyNode> {
    const sharedNodes = nodes.pipe(
      log((n) => `in: ${serializeNode(n)}`),
      // each partitioned observable is going to subscribe to this individually - share and replay to avoid requesting
      // nodes from source observable multiple times
      shareReplay(),
    );
    // split input into 3 pieces:
    // - `merged` - instance nodes that requested to be merged (have `mergeByLabelId`)
    // - `nonMerged` - nodes that don't need to be merged
    const [merged, nonMerged] = partition(
      sharedNodes,
      (node): node is MergedHierarchyNode => HierarchyNode.isInstancesNode(node) && !!node.processingParams?.mergeByLabelId,
    );
    return merge(
      nonMerged,
      merged.pipe(
        // put all merged nodes into `SortedNodesList`
        reduce((acc, node) => {
          doLog(`reduce with ${serializeNode(node)}`);
          const pos = acc.insert(node);
          const nodeAtPos = acc.get(pos)!;
          if (nodeAtPos !== node) {
            const mergedNode = mergeNodesObs(nodeAtPos, node, directNodesCache) as MergedHierarchyNode;
            acc.replace(pos, mergedNode);
          }
          return acc;
        }, new SortedNodesList()),
        // convert `SortedNodesList` to an observable
        mergeMap((list) => from(list.extractArray())),
      ),
    ).pipe(log((n) => `out: ${serializeNode(n)}`));
  };
}

type MergedHierarchyNode = ProcessedHierarchyNode & { processingParams: { mergeByLabelId: string } };

class SortedNodesList extends SortedArray<MergedHierarchyNode> {
  public constructor() {
    const comp = (lhs: MergedHierarchyNode, rhs: MergedHierarchyNode): number => {
      const labelCompare = lhs.label.localeCompare(rhs.label);
      if (labelCompare !== 0) {
        return labelCompare;
      }
      return lhs.processingParams.mergeByLabelId.localeCompare(rhs.processingParams.mergeByLabelId);
    };
    super(comp, DuplicatePolicy.Retain);
  }
  public replace(pos: number, replacement: MergedHierarchyNode) {
    assert(this._compare(this._array[pos], replacement) === 0);
    this._array[pos] = replacement;
  }
}

function serializeNode(node: ProcessedHierarchyNode) {
  return JSON.stringify({
    label: node.label,
    keys: HierarchyNodeKey.isInstances(node.key) ? node.key.instanceKeys : node.key,
    mergeId: node.processingParams?.mergeByLabelId,
  });
}

function doLog(msg: string) {
  getLogger().logTrace(LOGGING_NAMESPACE, msg);
}

function log<T>(msg: (arg: T) => string) {
  return tap<T>((n) => doLog(msg(n)));
}
