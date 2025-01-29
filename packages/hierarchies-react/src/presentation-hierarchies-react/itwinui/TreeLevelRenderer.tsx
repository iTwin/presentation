/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ReactElement } from "react";
import { isPresentationHierarchyNode, PresentationHierarchyNode, PresentationTreeNode } from "../TreeNode.js";
import { useTree } from "../UseTree.js";
import { TreeNodeRenderer } from "./TreeNodeRenderer.js";
import { TreeNodeRendererProps } from "./TreeRenderer.js";

type TreeNodesRendererProps = Omit<TreeNodeRendererProps, "node"> & Partial<Pick<ReturnType<typeof useTree>, "isNodeSelected">> & TreeLevelRendererOwnProps;

interface TreeLevelRendererOwnProps {
  nodes: PresentationTreeNode[];
}

/** @alpha */
export const TreeLevelRenderer = ({ nodes, isNodeSelected, ...rest }: TreeNodesRendererProps): ReactElement[] =>
  nodes.map((node) => (
    <TreeNodeRenderer {...rest} node={node} key={node.id} selected={isNodeSelected?.(node.id)}>
      {renderChildren(node) && <TreeLevelRenderer {...rest} nodes={node.children} isNodeSelected={isNodeSelected} />}
    </TreeNodeRenderer>
  ));

function renderChildren(node: PresentationTreeNode): node is PresentationHierarchyNode & { children: PresentationTreeNode[] } {
  return isPresentationHierarchyNode(node) && node.children !== true && node.isExpanded === true;
}
