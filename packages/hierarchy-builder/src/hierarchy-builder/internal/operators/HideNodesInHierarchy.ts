/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import { defer, filter, from, merge, mergeAll, mergeMap, Observable, partition, reduce, share, take, tap } from "rxjs";
import { InProgressTreeNode, mergeInstanceNodesObs } from "../Common";

/** @internal */
export function createHideNodesInHierarchyReducer(
  getNodes: (parentNode: InProgressTreeNode) => Observable<InProgressTreeNode>,
  directNodesCache: Map<string, Observable<InProgressTreeNode>>,
  stopOnFirstChild: boolean,
) {
  const enableLogging = false;
  function addToMergeMap(list: Map<string, InProgressTreeNode>, node: InProgressTreeNode) {
    if (node.key.type !== "instances" || node.key.instanceKeys.length === 0) {
      return;
    }
    const fullClassName = node.key.instanceKeys[0].className;
    const merged = list.get(fullClassName);
    if (merged) {
      list.set(fullClassName, mergeInstanceNodesObs(merged, node, directNodesCache));
    } else {
      list.set(fullClassName, node);
    }
  }
  return function (nodes: Observable<InProgressTreeNode>): Observable<InProgressTreeNode> {
    const sharedNodes = nodes.pipe(
      tap((n) => `HideNodesInHierarchyReducer in: ${n.label}`),
      share(),
    );
    const [withFlag, withoutFlag] = partition(sharedNodes, (node) => !!node.hideInHierarchy);
    const [withChildren, withoutChildren] = partition(withFlag, (node) => Array.isArray(node.children));
    return merge(
      withoutFlag,
      withChildren.pipe(mergeMap((parent) => from(parent.children as InProgressTreeNode[]))),
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
        }, new Map<string, InProgressTreeNode>()),
        mergeMap((mergedNodes) => [...mergedNodes.values()].map((mergedNode) => defer(() => getNodes(mergedNode)))),
        mergeAll(),
      ),
    ).pipe(tap((node) => enableLogging && console.log(`HideNodesInHierarchyReducer out: ${node.label}`)));
  };
}
