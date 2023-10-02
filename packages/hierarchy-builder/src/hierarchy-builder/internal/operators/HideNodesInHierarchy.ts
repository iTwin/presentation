/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { concat, defer, EMPTY, filter, finalize, from, merge, mergeAll, mergeMap, Observable, partition, reduce, shareReplay, take, tap } from "rxjs";
import { HierarchyNode } from "../../HierarchyNode";
import { getLogger } from "../../Logging";
import { createOperatorLoggingNamespace, hasChildren, mergeNodesObs } from "../Common";

const OPERATOR_NAME = "HideNodesInHierarchy";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

/**
 * Creates an operator that hides nodes and instead returns their children if the nodes have a `hideInHierarchy` handling param.
 *
 * @internal
 */
export function createHideNodesInHierarchyOperator(
  getNodes: (parentNode: HierarchyNode) => Observable<HierarchyNode>,
  directNodesCache: Map<string, Observable<HierarchyNode>>,
  stopOnFirstChild: boolean,
) {
  return function (nodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
    const sharedNodes = nodes.pipe(
      log((n) => `in: ${n.label}`),
      shareReplay(),
    );
    const [withFlag, withoutFlag] = partition(sharedNodes, (node) => !!node.params?.hideInHierarchy);
    const [withChildren, withoutChildren] = partition(withFlag, (node) => Array.isArray(node.children));
    const withLoadedChildren = withoutChildren.pipe(
      log((n) => `${n.label} needs hide and needs children to be loaded`),
      filter((node) => node.children !== false),
      reduce((acc, node) => {
        addToMergeMap(directNodesCache, acc, node);
        return acc;
      }, new Map<string, HierarchyNode>()),
      log((mm) => `created a merge map of size ${mm.size}`),
      mergeMap((mergedNodes) => [...mergedNodes.values()].map((mergedNode) => defer(() => getNodes(mergedNode)))),
      mergeAll(),
    );
    return merge(
      withoutFlag.pipe(log((n) => `${n.label} doesn't need hide, return the node`)),
      withChildren.pipe(
        log((n) => `${n.label} needs hide and has ${(n.children as Array<any>).length} loaded children, return them`),
        mergeMap((parent) => from(parent.children as HierarchyNode[])),
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

function createMergeMapKey(node: HierarchyNode): string {
  if (typeof node.key === "string") {
    return node.key;
  }
  switch (node.key.type) {
    case "instances":
      return node.key.instanceKeys[0].className;
    case "class-grouping":
      return node.key.class.name;
    case "label-grouping":
      return node.key.labelInfo.label;
  }
}

function addToMergeMap(directNodesCache: Map<string, Observable<HierarchyNode>>, list: Map<string, HierarchyNode>, node: HierarchyNode) {
  const mergeKey = createMergeMapKey(node);
  const merged = list.get(mergeKey);
  if (merged) {
    list.set(mergeKey, mergeNodesObs(merged, node, directNodesCache));
  } else {
    list.set(mergeKey, node);
  }
}

function doLog(msg: string) {
  getLogger().logTrace(LOGGING_NAMESPACE, msg);
}

function log<T>(msg: (arg: T) => string) {
  return tap<T>((n) => doLog(msg(n)));
}
