/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { concat, defer, EMPTY, filter, finalize, from, map, merge, mergeAll, mergeMap, Observable, partition, reduce, shareReplay, take, tap } from "rxjs";
import { HierarchyNodeKey, ProcessedHierarchyNode } from "../../HierarchyNode";
import { getLogger } from "../../Logging";
import { createOperatorLoggingNamespace, hasChildren, mergeNodes } from "../Common";

const OPERATOR_NAME = "HideNodesInHierarchy";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

/**
 * Creates an operator that hides nodes and instead returns their children if the nodes have a `hideInHierarchy` handling param.
 *
 * @internal
 */
export function createHideNodesInHierarchyOperator(
  getNodes: (parentNode: ProcessedHierarchyNode) => Observable<ProcessedHierarchyNode>,
  stopOnFirstChild: boolean,
) {
  return function (nodes: Observable<ProcessedHierarchyNode>): Observable<ProcessedHierarchyNode> {
    const sharedNodes = nodes.pipe(
      log((n) => `in: ${n.label}`),
      shareReplay(),
    );
    const [withFlag, withoutFlag] = partition(sharedNodes, (node) => !!node.processingParams?.hideInHierarchy);
    const [withChildren, withoutChildren] = partition(
      withFlag,
      <TNode extends ProcessedHierarchyNode>(node: TNode): node is TNode & { children: ProcessedHierarchyNode[] } => Array.isArray(node.children),
    );
    const withLoadedChildren = withoutChildren.pipe(
      log((n) => `${n.label} needs hide and needs children to be loaded`),
      filter((node) => node.children !== false),
      reduce((acc, node) => {
        addToMergeMap(acc, node);
        return acc;
      }, new Map() as LabelMergeMap),
      log((mm) => `created a merge map of size ${mm.size}`),
      tap((_mm: LabelMergeMap) => {
        // TODO: check if it's worth looking for merged nodes' observables in cache and merging them for parent node
      }),
      mergeMap((mm) => [...mm.values()].map((v) => defer(() => getNodes(v.merged)))),
      mergeAll(),
      map((n): ProcessedHierarchyNode => n),
    );
    return merge(
      withoutFlag.pipe(log((n) => `${n.label} doesn't need hide, return the node`)),
      withChildren.pipe(
        log((n) => `${n.label} needs hide and has ${(n.children as Array<any>).length} loaded children, return them`),
        mergeMap((parent) => from(parent.children)),
      ),
      stopOnFirstChild
        ? concat(
            // a small hack to handle situation when we're here to only check if parent node has children and one of them has `hideIfNoChildren` flag
            // with a `hasChildren = true` - we just return the hidden node itself in that case to avoid digging deeper into the hierarchy
            sharedNodes.pipe(
              filter(hasChildren),
              log((n) => `\`stopOnFirstChild = true\` and ${n.label} is set to always have nodes - return the hidden node without loading children`),
            ),
            EMPTY.pipe(finalize(() => doLog(`\`stopOnFirstChild = true\` but none of the nodes had children determined to \`true\` - do load children`))),
            withLoadedChildren,
          ).pipe(take(1))
        : withLoadedChildren,
    ).pipe(log((n) => `out: ${n.label}`));
  };
}

function createMergeMapKey<TNode extends { key: HierarchyNodeKey }>(node: TNode): string {
  if (typeof node.key === "string") {
    return node.key;
  }
  switch (node.key.type) {
    case "instances":
      return node.key.instanceKeys[0].className;
    case "class-grouping":
      return node.key.class.name;
    case "label-grouping":
      return node.key.label;
  }
}

type LabelMergeMap = Map<string, { merged: ProcessedHierarchyNode; nodes: ProcessedHierarchyNode[] }>;
function addToMergeMap(list: LabelMergeMap, node: ProcessedHierarchyNode) {
  const mergeKey = createMergeMapKey(node);
  const res = list.get(mergeKey);
  if (res) {
    list.set(mergeKey, { merged: mergeNodes(res.merged, node), nodes: [...res.nodes, node] });
  } else {
    list.set(mergeKey, { merged: node, nodes: [node] });
  }
}

function doLog(msg: string) {
  getLogger().logTrace(LOGGING_NAMESPACE, msg);
}

function log<T>(msg: (arg: T) => string) {
  return tap<T>((n) => doLog(msg(n)));
}
