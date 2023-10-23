/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { concatMap, from, Observable, tap, toArray } from "rxjs";
import { GroupingProcessedHierarchyNode, HierarchyNode, LabelGroupingNodeKey, ProcessedHierarchyNode } from "../../HierarchyNode";
import { getLogger } from "../../Logging";
import { createOperatorLoggingNamespace } from "../Common";

const OPERATOR_NAME = "Grouping.ByLabel";
/** @internal */
export const LOGGING_NAMESPACE = createOperatorLoggingNamespace(OPERATOR_NAME);

/** @internal */
export function createLabelGroupingOperator(onGroupingNodeCreated?: (groupingNode: GroupingProcessedHierarchyNode) => void) {
  return function (nodes: Observable<ProcessedHierarchyNode>): Observable<ProcessedHierarchyNode> {
    return nodes.pipe(
      log((n) => `in: ${n.label}`),
      // need all nodes in one place to group them
      toArray(),
      // group all nodes and format into a nodes observable
      concatMap((resolvedNodes) => {
        const obs = from(createLabelGroups(resolvedNodes, onGroupingNodeCreated));
        return obs;
      }),
      log((n) => `out: ${n.label}`),
    );
  };
}

function createLabelGroups(
  nodes: ProcessedHierarchyNode[],
  onGroupingNodeCreated?: (groupingNode: GroupingProcessedHierarchyNode) => void,
): ProcessedHierarchyNode[] {
  if (nodes.length === 0) {
    return nodes;
  }
  const [firstNode, firstHasChanged] = createLabelGroupsIfClassGroupingNode(nodes[0], onGroupingNodeCreated);
  const firstNodeParentKeys = firstNode.parentKeys;

  const outputNodes: ProcessedHierarchyNode[] = [firstNode];
  let hasChanged = firstHasChanged;

  for (let i = 1; i < nodes.length; ++i) {
    const [currentNode, currentHasChanged] = createLabelGroupsIfClassGroupingNode(nodes[i], onGroupingNodeCreated);
    hasChanged ||= currentHasChanged;

    const lastOutputNode = outputNodes[outputNodes.length - 1];
    if (currentNode.label === lastOutputNode.label) {
      if (HierarchyNode.isLabelGroupingNode(lastOutputNode)) {
        if (currentNode.processingParams?.groupByLabel) {
          lastOutputNode.children.push({ ...currentNode, parentKeys: [...firstNodeParentKeys, lastOutputNode.key] });
        } else {
          outputNodes.splice(outputNodes.length - 1, 0, currentNode);
        }
        continue;
      } else if (lastOutputNode.processingParams?.groupByLabel) {
        if (currentNode.processingParams?.groupByLabel) {
          const labelGroupingNodeKey: LabelGroupingNodeKey = {
            type: "label-grouping",
            label: currentNode.label,
          };
          outputNodes[outputNodes.length - 1] = {
            label: currentNode.label,
            key: labelGroupingNodeKey,
            parentKeys: firstNodeParentKeys,
            children: [lastOutputNode, currentNode].map((gn) => ({ ...gn, parentKeys: [...firstNodeParentKeys, labelGroupingNodeKey] })),
          };
        } else {
          outputNodes.splice(outputNodes.length - 1, 0, currentNode);
        }
        continue;
      }
    }
    outputNodes.push(nodes[i]);
  }

  // if all nodes have the same label and no classGrouping nodes have been changed then they should not be grouped
  if (outputNodes.length === 1 && !hasChanged) {
    return nodes;
  }

  if (onGroupingNodeCreated) {
    outputNodes.forEach((n) => {
      HierarchyNode.isLabelGroupingNode(n) && onGroupingNodeCreated(n);
    });
  }

  return outputNodes;
}

function createLabelGroupsIfClassGroupingNode(
  node: ProcessedHierarchyNode,
  onGroupingNodeCreated?: (groupingNode: GroupingProcessedHierarchyNode) => void,
): [node: ProcessedHierarchyNode, hasChanged: boolean] {
  if (HierarchyNode.isClassGroupingNode(node)) {
    const parentKeys = [...node.parentKeys, node.key];
    const labelGroupings = createLabelGroups(node.children, onGroupingNodeCreated);
    node.children.splice(0, node.children.length, ...labelGroupings.map((gn) => ({ ...gn, parentKeys })));
  }
  return [node, false];
}

function doLog(msg: string) {
  getLogger().logTrace(LOGGING_NAMESPACE, msg);
}

function log<T>(msg: (arg: T) => string) {
  return tap<T>((n) => doLog(msg(n)));
}
