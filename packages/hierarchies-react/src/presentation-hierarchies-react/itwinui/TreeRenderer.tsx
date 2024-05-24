/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, useCallback } from "react";
import { NodeData, Tree } from "@itwin/itwinui-react";
import { PresentationTreeNode } from "../TreeNode";
import { SelectionMode, useSelectionHandler } from "../UseSelectionHandler";
import { useTree } from "../UseTree";
import { LocalizationContextProvider, LocalizedStrings } from "./LocalizationContext";
import { TreeNodeRenderer } from "./TreeNodeRenderer";

type TreeProps = ComponentPropsWithoutRef<typeof Tree<RenderedTreeNode>>;
type TreeNodeRendererProps = ComponentPropsWithoutRef<typeof TreeNodeRenderer>;

interface TreeRendererOwnProps {
  rootNodes: PresentationTreeNode[];
  selectionMode?: SelectionMode;
  localizedStrings?: Partial<LocalizedStrings>;
}

type TreeRendererProps = Pick<ReturnType<typeof useTree>, "rootNodes" | "expandNode"> &
  Partial<Pick<ReturnType<typeof useTree>, "selectNodes" | "isNodeSelected" | "getHierarchyLevelDetails">> &
  Pick<TreeNodeRendererProps, "onFilterClick" | "getIcon"> &
  TreeRendererOwnProps &
  Omit<TreeProps, "data" | "nodeRenderer" | "getNode" | "enableVirtualization">;

/**
 * A component that renders a tree using the `Tree` component from `@itwin/itwinui-react`. The tree nodes
 * are rendered using `TreeNodeRenderer` component from this package.
 *
 * @see https://itwinui.bentley.com/docs/tree
 * @beta
 */
export function TreeRenderer({
  rootNodes,
  expandNode,
  selectNodes,
  isNodeSelected,
  onFilterClick,
  getIcon,
  getHierarchyLevelDetails,
  selectionMode,
  localizedStrings,
  ...treeProps
}: TreeRendererProps) {
  const { onNodeClick, onNodeKeyDown } = useSelectionHandler({
    rootNodes,
    selectNodes: selectNodes ?? noopSelectNodes,
    selectionMode: selectionMode ?? "single",
  });
  const nodeRenderer = useCallback<TreeProps["nodeRenderer"]>(
    (nodeProps) => {
      return (
        <TreeNodeRenderer
          {...nodeProps}
          expandNode={expandNode}
          getHierarchyLevelDetails={getHierarchyLevelDetails}
          onFilterClick={onFilterClick}
          onNodeClick={onNodeClick}
          onNodeKeyDown={onNodeKeyDown}
          getIcon={getIcon}
        />
      );
    },
    [expandNode, getHierarchyLevelDetails, onFilterClick, onNodeClick, onNodeKeyDown, getIcon],
  );

  const getNode = useCallback<TreeProps["getNode"]>((node) => createRenderedTreeNodeData(node, isNodeSelected ?? noopIsNodeSelected), [isNodeSelected]);

  return (
    <LocalizationContextProvider localizedStrings={localizedStrings}>
      <Tree<RenderedTreeNode> {...treeProps} data={rootNodes} nodeRenderer={nodeRenderer} getNode={getNode} enableVirtualization={true} />
    </LocalizationContextProvider>
  );
}

function noopSelectNodes() {}
function noopIsNodeSelected() {
  return false;
}

/**
 * A data structure for a tree node that is rendered using the `TreeRenderer` component.
 *
 * In addition to the `PresentationTreeNode` union, this type may have one additional variation - an informational
 * type of node with `ChildrenPlaceholder` type. This type of node is returned as the single child node of a parent
 * while its children are being loaded. This allows the node renderer to show a placeholder under the parent during
 * the process.
 *
 * @beta
 */
export type RenderedTreeNode =
  | PresentationTreeNode
  | {
      id: string;
      parentNodeId: string | undefined;
      type: "ChildrenPlaceholder";
    };

/**
 * An utility function that creates an `@itwin/itwinui-react` `NodeData` object for the `Tree` component from a
 * `RenderedTreeNode` object.
 *
 * Usage example:
 * ```tsx
 * function MyComponent({ rootNodes, nodeRenderer }: MyComponentProps) {
 *   const getNode = useCallback<TreeProps["getNode"]>((node) => createRenderedTreeNodeData(node, () => false), []);
 *   return <Tree<RenderedTreeNode> data={rootNodes} getNode={getNode} nodeRenderer={nodeRenderer} />;
 * }
 * ```
 *
 * @beta
 */
export function createRenderedTreeNodeData(node: RenderedTreeNode, isNodeSelected: (nodeId: string) => boolean): NodeData<RenderedTreeNode> {
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
