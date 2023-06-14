/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { isTreeModelNode, ITreeNodeLoader, Subscription, TreeModelSource, TreeNodeItem } from "@itwin/components-react";
import { useCallback, useRef } from "react";
import { PresentationInstanceFilterInfo } from "../../instance-filter-builder/PresentationInstanceFilterBuilder";
import { isPresentationTreeNodeItem } from "../PresentationTreeNodeItem";

/**
 * Props for [[useHierarchyLevelFiltering]] hook.
 * @beta
 */
export interface UseHierarchyLevelFilteringProps {
  nodeLoader: ITreeNodeLoader;
  modelSource: TreeModelSource;
}

/**
 * Custom hook that creates callbacks for filtering hierarchy levels in the tree. Filtering works only with trees based on
 * [[PresentationTreeDataProvider]].
 * @beta
 */
export function useHierarchyLevelFiltering(props: UseHierarchyLevelFilteringProps) {
  const { nodeLoader, modelSource } = props;
  const ongoingSubscriptions = useRef(new Map<string, Subscription>());

  const handleFilterAction = useCallback(
    (nodeId: string, info?: PresentationInstanceFilterInfo) => {
      if (ongoingSubscriptions.current.has(nodeId)) {
        ongoingSubscriptions.current.get(nodeId)!.unsubscribe();
        ongoingSubscriptions.current.delete(nodeId);
      }
      const subscription = applyHierarchyLevelFilter(nodeLoader, modelSource, nodeId, () => ongoingSubscriptions.current.delete(nodeId), info);
      if (subscription) {
        ongoingSubscriptions.current.set(nodeId, subscription);
      }
    },
    [nodeLoader, modelSource],
  );

  return {
    applyFilter: (node: TreeNodeItem, info: PresentationInstanceFilterInfo) => handleFilterAction(node.id, info),
    clearFilter: (node: TreeNodeItem) => handleFilterAction(node.id),
  };
}

function applyHierarchyLevelFilter(nodeLoader: ITreeNodeLoader, modelSource: TreeModelSource, nodeId: string, onComplete: (id: string) => void, filter?: PresentationInstanceFilterInfo) {
  modelSource.modifyModel((model) => {
    const modelNode = model.getNode(nodeId);
    if (!modelNode || !isTreeModelNode(modelNode) || !isPresentationTreeNodeItem(modelNode.item) || !modelNode.item.filtering) {
      return;
    }

    modelNode.item.filtering.active = filter;
    if (filter) {
      modelNode.isExpanded = true;
      modelNode.isLoading = true;
    }
    model.clearChildren(nodeId);
  });

  const updatedNode = modelSource.getModel().getNode(nodeId);
  if (updatedNode === undefined || !updatedNode.isExpanded || updatedNode.numChildren !== undefined) {
    return;
  }
  return nodeLoader.loadNode(updatedNode, 0).subscribe({ complete: () => onComplete(nodeId), error: () => onComplete(nodeId) });
}
