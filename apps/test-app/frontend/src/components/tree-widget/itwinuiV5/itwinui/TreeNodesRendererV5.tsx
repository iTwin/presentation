/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ReactNode } from "react";
import { isPresentationHierarchyNode, PresentationTreeNode, useTree } from "@itwin/presentation-hierarchies-react";
import { TreeNodeRenderer } from "./TreeNodeRendererV5";
import { TreeNodeRendererProps } from "./TreeRendererV5";

type TreeNodesRendererProps = Omit<TreeNodeRendererProps, "node"> & Partial<Pick<ReturnType<typeof useTree>, "isNodeSelected">> & TreeLevelRendererOwnProps;

interface TreeLevelRendererOwnProps {
  nodes: PresentationTreeNode[];
}

export const TreeLevelRenderer = ({ nodes, isNodeSelected, ...rest }: TreeNodesRendererProps): ReactNode =>
  nodes.map((node) => {
    if (isPresentationHierarchyNode(node) && node.children !== true && node.isExpanded === true) {
      return (
        <TreeNodeRenderer {...rest} node={node} key={node.id} selected={isNodeSelected?.(node.id)}>
          <TreeLevelRenderer {...rest} nodes={node.children} isNodeSelected={isNodeSelected} />
        </TreeNodeRenderer>
      );
    }

    return <TreeNodeRenderer {...rest} node={node} key={node.id} selected={isNodeSelected?.(node.id)} />;
  });
