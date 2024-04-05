/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { asapScheduler, concat, defer, EMPTY, filter, finalize, map, merge, mergeAll, mergeMap, Observable, partition, share, subscribeOn, take } from "rxjs";
import { HierarchyNode, InstancesNodeKey, ProcessedCustomHierarchyNode, ProcessedHierarchyNode, ProcessedInstanceHierarchyNode } from "../../HierarchyNode";
import { createNodeIdentifierForLogging, createOperatorLoggingNamespace, hasChildren, mergeNodes } from "../Common";
import { doLog, log } from "../LoggingUtils";
import { reduceToMergeMapItem } from "./ReduceToMergeMap";

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
      log({ category: LOGGING_NAMESPACE, message: /* istanbul ignore next */ (n) => `in: ${createNodeIdentifierForLogging(n)}` }),
      subscribeOn(asapScheduler),
      share(),
    );
    const [withFlag, withoutFlag] = partition(
      sharedNodes,
      (n): n is ProcessedCustomHierarchyNode | ProcessedInstanceHierarchyNode =>
        (HierarchyNode.isCustom(n) || HierarchyNode.isInstancesNode(n)) && !!n.processingParams?.hideInHierarchy,
    );
    // Defer to create a new seed for reduce on every subscribe
    const withLoadedChildren = defer(() =>
      withFlag.pipe(
        log({
          category: LOGGING_NAMESPACE,
          message: /* istanbul ignore next */ (n) => `${createNodeIdentifierForLogging(n)} needs hide and needs children to be loaded`,
        }),
        filter((node) => node.children !== false),
        reduceToMergeMapItem(
          (node) => createMergeMapKey(node),
          (node, mergedNode: ProcessedCustomHierarchyNode | ProcessedInstanceHierarchyNode | undefined) => (mergedNode ? mergeNodes(mergedNode, node) : node),
        ),
        log({ category: LOGGING_NAMESPACE, message: /* istanbul ignore next */ (mm) => `created a merge map of size ${mm.size}` }),
        mergeMap((mm) => [...mm.values()].map((mergedNode) => defer(() => getNodes(mergedNode)))),
        mergeAll(),
        map((n): ProcessedHierarchyNode => n),
      ),
    );

    return merge(
      withoutFlag.pipe(
        log({
          category: LOGGING_NAMESPACE,
          message: /* istanbul ignore next */ (n) => `${createNodeIdentifierForLogging(n)} doesn't need hide, return the node`,
        }),
      ),
      stopOnFirstChild
        ? concat(
            // a small hack to handle situation when we're here to only check if parent node has children and one of them has `hideIfNoChildren` flag
            // with a `hasChildren = true` - we just return the hidden node itself in that case to avoid digging deeper into the hierarchy
            sharedNodes.pipe(
              filter(hasChildren),
              log({
                category: LOGGING_NAMESPACE,
                message: /* istanbul ignore next */ (n) =>
                  `\`stopOnFirstChild = true\` and node ${createNodeIdentifierForLogging(n)} is set to always have nodes - return the hidden node without loading children`,
              }),
            ),
            EMPTY.pipe(
              finalize(() =>
                doLog({
                  category: LOGGING_NAMESPACE,
                  message: /* istanbul ignore next */ () =>
                    `\`stopOnFirstChild = true\` but none of the nodes had children determined to \`true\` - do load children`,
                }),
              ),
            ),
            withLoadedChildren,
          ).pipe(take(1))
        : withLoadedChildren,
    ).pipe(log({ category: LOGGING_NAMESPACE, message: /* istanbul ignore next */ (n) => `out: ${createNodeIdentifierForLogging(n)}` }));
  };
}

function createMergeMapKey<TNode extends { key: InstancesNodeKey | string }>(node: TNode): string {
  if (typeof node.key === "string") {
    return node.key;
  }
  return node.key.instanceKeys[0].className;
}
