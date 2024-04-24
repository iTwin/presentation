/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, useCallback } from "react";
import { Tree } from "@itwin/itwinui-react";
import { isPresentationHierarchyNode, PresentationTreeNode } from "./Types";
import { useTree } from "./UseTree";
import { TreeNodeRenderer, TreeNodeRendererProps } from "./TreeNodeRenderer";

type TreeRendererProps = Omit<ReturnType<typeof useTree>, "rootNodes" | "isLoading" | "reloadTree" | "getHierarchyLevelFilteringOptions"> &
  Pick<TreeNodeRendererProps, "onFilterClick" | "getIcon"> & {
    rootNodes: PresentationTreeNode[];
  };

/** @beta */
export function TreeRenderer({
  rootNodes,
  expandNode,
  selectNode,
  isNodeSelected,
  setHierarchyLevelLimit,
  setHierarchyLevelFilter,
  onFilterClick,
  getIcon,
}: TreeRendererProps) {
  const nodeRenderer = useCallback<TreeProps<PresentationTreeNode>["nodeRenderer"]>(
    (nodeProps) => {
      return (
        <TreeNodeRenderer
          {...nodeProps}
          expandNode={expandNode}
          selectNode={selectNode}
          setHierarchyLevelFilter={setHierarchyLevelFilter}
          onFilterClick={onFilterClick}
          getIcon={getIcon}
          setHierarchyLevelLimit={setHierarchyLevelLimit}
        />
      );
    },
    [expandNode, selectNode, setHierarchyLevelLimit, setHierarchyLevelFilter, onFilterClick, getIcon],
  );

  const getNode = useCallback<TreeProps<PresentationTreeNode>["getNode"]>((node) => createTreeNode(node, isNodeSelected), [isNodeSelected]);

  return (
    <div
      style={{
        width: "100%",
        overflow: "auto",
      }}
    >
      <Tree<PresentationTreeNode> data={rootNodes} nodeRenderer={nodeRenderer} getNode={getNode} enableVirtualization={true} />
    </div>
  );
}

/** @beta */
export function createTreeNode(
  node: PresentationTreeNode,
  isNodeSelected: (nodeId: string) => boolean,
): ReturnType<TreeProps<PresentationTreeNode>["getNode"]> {
  if (!isPresentationHierarchyNode(node)) {
    return {
      nodeId: node.id,
      node,
      hasSubNodes: false,
      isExpanded: false,
      isSelected: false,
      isDisabled: true,
    };
  }
  return {
    nodeId: node.id,
    node,
    hasSubNodes: node.children === true || node.children.length > 0,
    subNodes:
      // returns placeholder node to show as child while children is loading.
      node.children === true
        ? [
            {
              id: `Loading-${node.id}`,
              parentNodeId: node.id,
              type: "ChildrenPlaceholder",
              message: "Loading...",
            },
          ]
        : node.children,
    isExpanded: node.isExpanded,
    isSelected: isNodeSelected(node.id),
  };
}

type TreeProps<T> = ComponentPropsWithoutRef<typeof Tree<T>>;
