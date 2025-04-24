/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */
/** @packageDocumentation
 * @module Tree
 */

import { useRef } from "react";
import { isTreeModelNode, ITreeNodeLoader, Subscription, TreeModelSource } from "@itwin/components-react";
import { PresentationInstanceFilterInfo } from "../../instance-filter-builder/PresentationFilterBuilder.js";
import { isPresentationTreeNodeItem } from "../PresentationTreeNodeItem.js";

/**
 * Props for [[useHierarchyLevelFiltering]] hook.
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export interface UseHierarchyLevelFilteringProps {
  nodeLoader: ITreeNodeLoader;
  modelSource: TreeModelSource;
}

/**
 * Custom hook that creates callbacks for filtering hierarchy levels in the tree. Filtering works only with trees based on
 * [[PresentationTreeDataProvider]].
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export function useHierarchyLevelFiltering(props: UseHierarchyLevelFilteringProps) {
  const { nodeLoader, modelSource } = props;
  const ongoingSubscriptions = useRef(new Map<string, Subscription>());

  const handleFilterAction = (nodeId: string, info?: PresentationInstanceFilterInfo) => {
    if (ongoingSubscriptions.current.has(nodeId)) {
      ongoingSubscriptions.current.get(nodeId)?.unsubscribe();
      ongoingSubscriptions.current.delete(nodeId);
    }
    const subscription = applyHierarchyLevelFilter(nodeLoader, modelSource, nodeId, () => ongoingSubscriptions.current.delete(nodeId), info);
    if (subscription) {
      ongoingSubscriptions.current.set(nodeId, subscription);
    }
  };

  return {
    applyFilter: (nodeId: string, info: PresentationInstanceFilterInfo) => handleFilterAction(nodeId, info),
    clearFilter: (nodeId: string) => handleFilterAction(nodeId),
  };
}

function applyHierarchyLevelFilter(
  nodeLoader: ITreeNodeLoader,
  modelSource: TreeModelSource,
  nodeId: string,
  onComplete: (id: string) => void,
  filter?: PresentationInstanceFilterInfo,
) {
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
