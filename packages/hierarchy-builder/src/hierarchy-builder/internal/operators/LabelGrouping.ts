/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, mergeMap, Observable, tap, toArray } from "rxjs";
import { HierarchyNode } from "../../HierarchyNode";
import { getLogger } from "../../Logging";
import { createOperatorLoggingNamespace } from "../Common";

const OPERATOR_NAME = "Grouping.ByLabel";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

/** @internal */
export function createLabelGroupingOperator() {
  return function (nodes: Observable<HierarchyNode>): Observable<HierarchyNode> {
    return nodes.pipe(
      log((n) => `in: ${n.label}`),
      // need all nodes in one place to group them
      toArray(),
      // group all nodes and format into a nodes observable
      mergeMap((resolvedNodes) => {
        const obs = from(createLabelGroups(resolvedNodes));
        return obs;
      }),
      log((n) => `out: ${n.label}`),
    );
  };
}

function createLabelGroups(nodes: HierarchyNode[]): HierarchyNode[] {
  if (nodes.length === 0) {
    return nodes;
  }
  const [firstNode, firstHasChanged] = createLabelGroupsIfClassGroupingNode(nodes[0]);
  const outputNodes: HierarchyNode[] = [firstNode];
  let hasChanged = firstHasChanged;

  for (let i = 1; i < nodes.length; ++i) {
    const [currentNode, currentHasChanged] = createLabelGroupsIfClassGroupingNode(nodes[i]);
    hasChanged |= currentHasChanged;

    if (currentNode.label === outputNodes[outputNodes.length - 1].label) {
      const lastOutputNode = outputNodes[outputNodes.length - 1];
      if (HierarchyNode.isLabelGroupingNode(lastOutputNode) && Array.isArray(lastOutputNode.children)) {
        if (currentNode.params?.groupByLabel) {
          lastOutputNode.children.push(currentNode);
        } else {
          outputNodes.push(currentNode);
          [outputNodes[outputNodes.length - 1], outputNodes[outputNodes.length - 2]] = [
            outputNodes[outputNodes.length - 2],
            outputNodes[outputNodes.length - 1],
          ];
        }
      } else if (lastOutputNode.params?.groupByLabel) {
        if (currentNode.params?.groupByLabel) {
          outputNodes[outputNodes.length - 1] = {
            label: currentNode.label,
            key: {
              type: "label-grouping",
              label: currentNode.label,
            },
            children: [lastOutputNode, currentNode],
          };
        } else {
          outputNodes.push(currentNode);
          [outputNodes[outputNodes.length - 1], outputNodes[outputNodes.length - 2]] = [
            outputNodes[outputNodes.length - 2],
            outputNodes[outputNodes.length - 1],
          ];
        }
      } else {
        outputNodes.push(currentNode);
      }
    } else {
      outputNodes.push(nodes[i]);
    }
  }
  // if all nodes have the same label and no classGrouping nodes have been changed then they should not be grouped
  if (outputNodes.length === 1 && !hasChanged) {
    return nodes;
  }

  return outputNodes;
}

function createLabelGroupsIfClassGroupingNode(node: HierarchyNode): [node: HierarchyNode, hasChanged?: boolean] {
  if (HierarchyNode.isClassGroupingNode(node) && Array.isArray(node.children)) {
    const labelGroupings = createLabelGroups(node.children);
    if (labelGroupings.length !== node.children.length) {
      const newClassGroupingNode: HierarchyNode = {
        ...node,
        children: labelGroupings,
      };
      return [newClassGroupingNode, true];
    }
  }
  return [node, false];
}

function doLog(msg: string) {
  getLogger().logTrace(LOGGING_NAMESPACE, msg);
}

function log<T>(msg: (arg: T) => string) {
  return tap<T>((n) => doLog(msg(n)));
}
