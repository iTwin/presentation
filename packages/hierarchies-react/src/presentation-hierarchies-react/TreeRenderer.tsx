/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, useCallback } from "react";
import { Tree } from "@itwin/itwinui-react";
import { TreeNodeRenderer } from "./TreeNodeRenderer";
import { isPresentationHierarchyNode, PresentationTreeNode } from "./Types";
import { SelectionMode, useSelectionHandler } from "./UseSelectionHandler";
import { useTree } from "./UseTree";

type TreeProps<T> = ComponentPropsWithoutRef<typeof Tree<T>>;
type TreeNodeRendererProps = ComponentPropsWithoutRef<typeof TreeNodeRenderer>;

interface TreeRendererOwnProps {
  rootNodes: PresentationTreeNode[];
  selectionMode?: SelectionMode;
}

type TreeRendererProps = Pick<
  ReturnType<typeof useTree>,
  "rootNodes" | "expandNode" | "selectNode" | "isNodeSelected" | "setHierarchyLevelLimit" | "setHierarchyLevelFilter"
> &
  Pick<TreeNodeRendererProps, "onFilterClick" | "getIcon"> &
  TreeRendererOwnProps &
  Omit<TreeProps<PresentationTreeNode>, "data" | "nodeRenderer" | "getNode" | "enableVirtualization">;

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
  selectionMode,
  ...treeProps
}: TreeRendererProps) {
  const { onNodeClick, onNodeKeyDown } = useSelectionHandler({ rootNodes, selectNode, selectionMode: selectionMode ?? SelectionMode.Single });
  const nodeRenderer = useCallback<TreeProps<PresentationTreeNode>["nodeRenderer"]>(
    (nodeProps) => {
      return (
        <TreeNodeRenderer
          {...nodeProps}
          expandNode={expandNode}
          setHierarchyLevelFilter={setHierarchyLevelFilter}
          onFilterClick={onFilterClick}
          onNodeClick={onNodeClick}
          onNodeKeyDown={onNodeKeyDown}
          getIcon={getIcon}
          setHierarchyLevelLimit={setHierarchyLevelLimit}
        />
      );
    },
    [expandNode, setHierarchyLevelLimit, setHierarchyLevelFilter, onFilterClick, onNodeClick, onNodeKeyDown, getIcon],
  );

  const getNode = useCallback<TreeProps<PresentationTreeNode>["getNode"]>((node) => createTreeNode(node, isNodeSelected), [isNodeSelected]);

  return <Tree<PresentationTreeNode> {...treeProps} data={rootNodes} nodeRenderer={nodeRenderer} getNode={getNode} enableVirtualization={true} />;
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
