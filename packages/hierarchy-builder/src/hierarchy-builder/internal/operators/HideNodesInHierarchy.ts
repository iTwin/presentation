/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  asapScheduler,
  concat,
  defer,
  EMPTY,
  filter,
  finalize,
  map,
  merge,
  mergeAll,
  mergeMap,
  Observable,
  partition,
  reduce,
  share,
  subscribeOn,
  take,
  tap,
} from "rxjs";
import { HierarchyNode, InstancesNodeKey, ProcessedCustomHierarchyNode, ProcessedHierarchyNode, ProcessedInstanceHierarchyNode } from "../../HierarchyNode";
import { createNodeIdentifierForLogging, createOperatorLoggingNamespace, hasChildren, mergeNodes } from "../Common";
import { doLog, log } from "../LoggingUtils";

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
        reduce((acc, node) => {
          addToMergeMap(acc, node);
          return acc;
        }, new Map() as LabelMergeMap),
        log({ category: LOGGING_NAMESPACE, message: /* istanbul ignore next */ (mm) => `created a merge map of size ${mm.size}` }),
        tap((_mm: LabelMergeMap) => {
          // TODO: check if it's worth looking for merged nodes' observables in cache and merging them for parent node
        }),
        mergeMap((mm) => [...mm.values()].map((v) => defer(() => getNodes(v.merged)))),
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

type LabelMergeMap = Map<
  string,
  { merged: ProcessedCustomHierarchyNode | ProcessedInstanceHierarchyNode; nodes: Array<ProcessedCustomHierarchyNode | ProcessedInstanceHierarchyNode> }
>;
function addToMergeMap(list: LabelMergeMap, node: ProcessedCustomHierarchyNode | ProcessedInstanceHierarchyNode) {
  const mergeKey = createMergeMapKey(node);
  const res = list.get(mergeKey);
  if (res) {
    list.set(mergeKey, { merged: mergeNodes(res.merged, node), nodes: [...res.nodes, node] });
  } else {
    list.set(mergeKey, { merged: node, nodes: [node] });
  }
}
