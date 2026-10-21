/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { HierarchyNode } from "@itwin/presentation-hierarchies";
import type { TreeNode } from "../../presentation-hierarchies-react/TreeNode.js";

export function createTreeNode(props: Partial<TreeNode> & { id: string }): TreeNode {
  return {
    label: props.label ?? props.id,
    children: props.children ?? [],
    isExpanded: props.isExpanded ?? false,
    isLoading: props.isLoading ?? false,
    isFilterable: props.isFilterable ?? false,
    isFiltered: props.isFiltered ?? false,
    nodeData: props.nodeData ?? ({} as HierarchyNode),
    errors: props.errors ?? [],
    ...props,
  };
}
