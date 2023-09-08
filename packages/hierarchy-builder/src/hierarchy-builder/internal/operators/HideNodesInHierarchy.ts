/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { defer, filter, from, merge, mergeAll, mergeMap, Observable, partition, reduce, share, take, tap } from "rxjs";
import { HierarchyNode } from "../../HierarchyNode";
import { mergeNodesObs } from "../Common";

/** @internal */
export function createHideNodesInHierarchyOperator(
  getNodes: (parentNode: HierarchyNode) => Observable<HierarchyNode>,
  directNodesCache: Map<string, Observable<HierarchyNode>>,
  stopOnFirstChild: boolean,
) {
  const enableLogging = false;
  function createMergeMapKey(node: HierarchyNode): string | undefined {
    if (HierarchyNode.isInstancesNode(node)) {
      return node.key.instanceKeys[0].className;
    }
    if (HierarchyNode.isCustom(node)) {
      return node.key;
    }
    return undefined;
  }
  function addToMergeMap(list: Map<string, HierarchyNode>, node: HierarchyNode) {
    const mergeKey = createMergeMapKey(node);
    if (!mergeKey) {
      return;
    }
    const merged = list.get(mergeKey);
    if (merged) {
      list.set(mergeKey, mergeNodesObs(merged, node, directNodesCache));
    } else {
      list.set(mergeKey, node);
    }
  }
  return function (nodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
    const sharedNodes = nodes.pipe(
      tap((n) => enableLogging && console.log(`HideNodesInHierarchyOperator in: ${n.label}`)),
      share(),
    );
    const [withFlag, withoutFlag] = partition(sharedNodes, (node) => !!node.params?.hideInHierarchy);
    const [withChildren, withoutChildren] = partition(withFlag, (node) => Array.isArray(node.children));
    return merge(
      withoutFlag,
      withChildren.pipe(mergeMap((parent) => from(parent.children as HierarchyNode[]))),
      ...(stopOnFirstChild
        ? [
            // a small hack to handle situation when we're here to only check if parent node has children and one of them has `hideIfNoChildren` flag
            // with a `hasChildren = true` - we just return the hidden node itself in that case to avoid digging deeper into the hierarchy
            sharedNodes.pipe(
              filter((n) => n.children === true),
              take(1),
            ),
          ]
        : []),
      withoutChildren.pipe(
        filter((node) => node.children !== false),
        reduce((acc, node) => {
          addToMergeMap(acc, node);
          return acc;
        }, new Map<string, HierarchyNode>()),
        mergeMap((mergedNodes) => [...mergedNodes.values()].map((mergedNode) => defer(() => getNodes(mergedNode)))),
        mergeAll(),
      ),
    ).pipe(tap((node) => enableLogging && console.log(`HideNodesInHierarchyOperator out: ${node.label}`)));
  };
}
