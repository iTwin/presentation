/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ReactNode } from "react";
import { isPresentationHierarchyNode, PresentationTreeNode } from "@itwin/presentation-hierarchies-react";
import { TreeNodeRenderer } from "./TreeNodeRendererV5";
import { TreeNodeRendererProps } from "./TreeRendererV5";

type TreeNodesRendererProps = Omit<TreeNodeRendererProps, "node"> & TreeNodesRendererOwnProps;

interface TreeNodesRendererOwnProps {
  nodes: PresentationTreeNode[];
}

export const TreeNodesRenderer = ({
  nodes,
  ...rest
}: TreeNodesRendererProps): ReactNode => // TODO rename to make it more distinguishable from TreeNodeRenderer
  nodes.map((node) => {
    if (isPresentationHierarchyNode(node) && node.children !== true && node.isExpanded === true) {
      return (
        <TreeNodeRenderer {...rest} node={node} key={node.id}>
          <TreeNodesRenderer {...rest} nodes={node.children} />
        </TreeNodeRenderer>
      );
    }

    return <TreeNodeRenderer {...rest} node={node} key={node.id} />;
  });
