/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ReactElement } from "react";
import { isPresentationHierarchyNode, PresentationHierarchyNode, PresentationTreeNode, useTree } from "@itwin/presentation-hierarchies-react";
import { TreeNodeRenderer } from "./TreeNodeRendererV5";
import { TreeNodeRendererProps } from "./TreeRendererV5";

type TreeNodesRendererProps = Omit<TreeNodeRendererProps, "node"> & Partial<Pick<ReturnType<typeof useTree>, "isNodeSelected">> & TreeLevelRendererOwnProps;

interface TreeLevelRendererOwnProps {
  nodes: PresentationTreeNode[];
}

export const TreeLevelRenderer = ({ nodes, isNodeSelected, ...rest }: TreeNodesRendererProps): ReactElement[] =>
  nodes.map((node) => (
    <TreeNodeRenderer {...rest} node={node} key={node.id} selected={isNodeSelected?.(node.id)}>
      {renderChildren(node) ? (
        <TreeLevelRenderer {...rest} nodes={node.children} isNodeSelected={isNodeSelected} />
      ) : (
        <TreeNodeRenderer {...rest} node={node} key={node.id} selected={isNodeSelected?.(node.id)} />
      )}
    </TreeNodeRenderer>
  ));

function renderChildren(node: PresentationTreeNode): node is PresentationHierarchyNode & { children: PresentationTreeNode[] } {
  return isPresentationHierarchyNode(node) && node.children !== true && node.isExpanded === true;
}
