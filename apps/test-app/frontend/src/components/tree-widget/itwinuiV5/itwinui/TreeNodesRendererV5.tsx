/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ReactNode } from "react";
import { isPresentationHierarchyNode, PresentationTreeNode, useTree } from "@itwin/presentation-hierarchies-react";
import { TreeNodeRenderer } from "./TreeNodeRendererV5";
import { TreeNodeRendererProps } from "./TreeRendererV5";

type TreeNodesRendererProps = Omit<TreeNodeRendererProps, "node"> & Partial<Pick<ReturnType<typeof useTree>, "isNodeSelected">> & TreeNodesRendererOwnProps;

interface TreeNodesRendererOwnProps {
  nodes: PresentationTreeNode[];
}

export const TreeNodesRenderer = ({
  nodes,
  isNodeSelected,
  ...rest
}: TreeNodesRendererProps): ReactNode => // TODO rename to make it more distinguishable from TreeNodeRenderer
  nodes.map((node) => {
    if (isPresentationHierarchyNode(node) && node.children !== true && node.isExpanded === true) {
      return (
        <TreeNodeRenderer {...rest} node={node} key={node.id} selected={isNodeSelected?.(node.id)}>
          <TreeNodesRenderer {...rest} nodes={node.children} isNodeSelected={isNodeSelected} />
        </TreeNodeRenderer>
      );
    }

    return <TreeNodeRenderer {...rest} node={node} key={node.id} selected={isNodeSelected?.(node.id)} />;
  });
