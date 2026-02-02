/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { concat, defer, EMPTY, filter, finalize, map, merge, mergeAll, mergeMap, take } from "rxjs";
import { assert } from "@itwin/core-bentley";
import { HierarchyNodeKey } from "../../HierarchyNodeKey.js";
import { createNodeIdentifierForLogging, createOperatorLoggingNamespace, hasChildren, LOGGING_NAMESPACE_INTERNAL } from "../../internal/Common.js";
import { doLog, log } from "../../internal/LoggingUtils.js";
import { partition } from "../../internal/operators/Partition.js";
import { reduceToMergeMapItem } from "../../internal/operators/ReduceToMergeMap.js";
import { ProcessedHierarchyNode } from "../IModelHierarchyNode.js";
import { mergeInstanceNodes } from "../Utils.js";

import type { Observable } from "rxjs";
import type { GenericNodeKey, InstancesNodeKey } from "../../HierarchyNodeKey.js";
import type { ProcessedGenericHierarchyNode, ProcessedInstanceHierarchyNode } from "../IModelHierarchyNode.js";

const OPERATOR_NAME = "HideNodesInHierarchy";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME, LOGGING_NAMESPACE_INTERNAL);

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
    const inputNodes = nodes.pipe(log({ category: LOGGING_NAMESPACE, message: /* c8 ignore next */ (n) => `in: ${createNodeIdentifierForLogging(n)}` }));
    const [withFlag, withoutFlag] = partition(
      inputNodes,
      (n): n is ProcessedGenericHierarchyNode | ProcessedInstanceHierarchyNode =>
        (ProcessedHierarchyNode.isGeneric(n) || ProcessedHierarchyNode.isInstancesNode(n)) && !!n.processingParams?.hideInHierarchy,
    );
    // Defer to create a new seed for reduce on every subscribe
    const withLoadedChildren = defer(() =>
      withFlag.pipe(
        log({
          category: LOGGING_NAMESPACE,
          message: /* c8 ignore next */ (n) => `${createNodeIdentifierForLogging(n)} needs hide and needs children to be loaded`,
        }),
        filter((node) => node.children !== false),
        reduceToMergeMapItem(
          (node) => createMergeMapKey(node),
          (node, mergedNode: ProcessedGenericHierarchyNode | ProcessedInstanceHierarchyNode | undefined) => {
            if (mergedNode) {
              if (ProcessedHierarchyNode.isGeneric(mergedNode)) {
                // we don't merge generic nodes, just return the first one
                return mergedNode;
              }
              assert(ProcessedHierarchyNode.isInstancesNode(node));
              return mergeInstanceNodes(mergedNode, node);
            }
            return node;
          },
        ),
        log({ category: LOGGING_NAMESPACE, message: /* c8 ignore next */ (mm) => `created a merge map of size ${mm.size}` }),
        mergeMap((mm) => [...mm.values()].map((mergedNode) => defer(() => getNodes(mergedNode)))),
        mergeAll(),
        map((n): ProcessedHierarchyNode => n),
      ),
    );

    return merge(
      withoutFlag.pipe(
        log({
          category: LOGGING_NAMESPACE,
          message: /* c8 ignore next */ (n) => `${createNodeIdentifierForLogging(n)} doesn't need hide, return the node`,
        }),
      ),
      stopOnFirstChild
        ? concat(
            // a small hack to handle situation when we're here to only check if parent node has children and one of them has `hideIfNoChildren` flag
            // with a `hasChildren = true` - we just return the hidden node itself in that case to avoid digging deeper into the hierarchy
            inputNodes.pipe(
              filter(hasChildren),
              log({
                category: LOGGING_NAMESPACE,
                message: /* c8 ignore next */ (n) =>
                  `\`stopOnFirstChild = true\` and node ${createNodeIdentifierForLogging(n)} is set to always have nodes - return the hidden node without loading children`,
              }),
            ),
            EMPTY.pipe(
              finalize(() =>
                doLog({
                  category: LOGGING_NAMESPACE,
                  message: /* c8 ignore next */ () =>
                    `\`stopOnFirstChild = true\` but none of the nodes had children determined to \`true\` - do load children`,
                }),
              ),
            ),
            withLoadedChildren,
          ).pipe(take(1))
        : withLoadedChildren,
    ).pipe(log({ category: LOGGING_NAMESPACE, message: /* c8 ignore next */ (n) => `out: ${createNodeIdentifierForLogging(n)}` }));
  };
}

function createMergeMapKey<TNode extends { key: InstancesNodeKey | GenericNodeKey }>(node: TNode): string {
  if (HierarchyNodeKey.isGeneric(node.key)) {
    return `${node.key.source ? `${node.key.source}:` : ""}${node.key.id}`;
  }
  return node.key.instanceKeys[0].className;
}
