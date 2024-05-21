/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, useCallback } from "react";
import { NodeData, Tree } from "@itwin/itwinui-react";
import { PresentationTreeNode } from "../TreeNode";
import { TreeNodeRenderer } from "./TreeNodeRenderer";
import { SelectionMode, useSelectionHandler } from "../UseSelectionHandler";
import { useTree } from "../UseTree";

type TreeProps = ComponentPropsWithoutRef<typeof Tree<RenderedTreeNode>>;
type TreeNodeRendererProps = ComponentPropsWithoutRef<typeof TreeNodeRenderer>;

interface TreeRendererOwnProps {
  rootNodes: PresentationTreeNode[];
  selectionMode?: SelectionMode;
}

type TreeRendererProps = Pick<
  ReturnType<typeof useTree>,
  "rootNodes" | "expandNode" | "selectNodes" | "isNodeSelected" | "setHierarchyLevelLimit" | "setHierarchyLevelFilter"
> &
  Pick<TreeNodeRendererProps, "onFilterClick" | "getIcon"> &
  TreeRendererOwnProps &
  Omit<TreeProps, "data" | "nodeRenderer" | "getNode" | "enableVirtualization">;

/** @beta */
export function TreeRenderer({
  rootNodes,
  expandNode,
  selectNodes,
  isNodeSelected,
  setHierarchyLevelLimit,
  setHierarchyLevelFilter,
  onFilterClick,
  getIcon,
  selectionMode,
  ...treeProps
}: TreeRendererProps) {
  const { onNodeClick, onNodeKeyDown } = useSelectionHandler({ rootNodes, selectNodes, selectionMode: selectionMode ?? "single" });
  const nodeRenderer = useCallback<TreeProps["nodeRenderer"]>(
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

  const getNode = useCallback<TreeProps["getNode"]>((node) => createRenderedTreeNodeData(node, isNodeSelected), [isNodeSelected]);

  return <Tree<RenderedTreeNode> {...treeProps} data={rootNodes} nodeRenderer={nodeRenderer} getNode={getNode} enableVirtualization={true} />;
}

/** @beta */
export type RenderedTreeNode = PresentationTreeNode | {
  id: string;
  parentNodeId: string | undefined;
  type: "ChildrenPlaceholder";
};

/** @beta */
export function createRenderedTreeNodeData(
  node: RenderedTreeNode,
  isNodeSelected: (nodeId: string) => boolean,
): NodeData<RenderedTreeNode> {
  if ("type" in node) {
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
            },
          ]
        : node.children,
    isExpanded: node.isExpanded,
    isSelected: isNodeSelected(node.id),
  };
}
