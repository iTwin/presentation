/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, useMemo } from "react";
import { Tree } from "@itwin/itwinui-react/bricks";
import { isPresentationHierarchyNode, PresentationTreeNode } from "../TreeNode.js";
import { SelectionMode, useSelectionHandler } from "../UseSelectionHandler.js";
import { useTree } from "../UseTree.js";
import { LocalizationContextProvider } from "./LocalizationContext.js";
import { TreeNodeRenderer } from "./TreeNodeRenderer.js";

/** @alpha */
export type TreeProps = ComponentPropsWithoutRef<typeof Tree.Root>;

/** @alpha */
export type TreeNodeRendererProps = ComponentPropsWithoutRef<typeof TreeNodeRenderer>;
/** @alpha */
interface TreeRendererOwnProps {
  /** Root nodes of the tree. */
  rootNodes: PresentationTreeNode[];
  /** Active selection mode used by the tree. Defaults to `"single"`. */
  selectionMode?: SelectionMode;
}

/** @alpha */
type TreeRendererProps = Pick<ReturnType<typeof useTree>, "expandNode"> &
  Partial<Pick<ReturnType<typeof useTree>, "selectNodes" | "isNodeSelected" | "getHierarchyLevelDetails" | "reloadTree">> &
  Omit<TreeNodeRendererProps, "node" | "reloadTree" | "aria-level" | "aria-posinset" | "aria-setsize"> &
  TreeRendererOwnProps &
  ComponentPropsWithoutRef<typeof LocalizationContextProvider>;

/**
 * A component that renders a tree using the `Tree` component from `@itwin/itwinui-react`. The tree nodes
 * are rendered using `TreeNodeRenderer` component from this package.
 *
 * @see https://itwinui.bentley.com/docs/tree
 * @alpha
 */
export function TreeRenderer({ rootNodes, expandNode, localizedStrings, selectNodes, isNodeSelected, selectionMode, ...treeProps }: TreeRendererProps) {
  const { onNodeClick, onNodeKeyDown } = useSelectionHandler({
    rootNodes,
    selectNodes: selectNodes ?? noopSelectNodes,
    selectionMode: selectionMode ?? "single",
  });

  const flatNodes = useMemo(() => getFlatNodes(rootNodes, 0), [rootNodes]);

  return (
    <LocalizationContextProvider localizedStrings={localizedStrings}>
      <Tree.Root style={{ height: "100%", width: "100%" }}>
        {flatNodes.map((flatNode) => (
          <TreeNodeRenderer
            {...treeProps}
            expandNode={expandNode}
            onNodeClick={onNodeClick}
            onNodeKeyDown={onNodeKeyDown}
            node={flatNode}
            key={flatNode.id}
            selected={isNodeSelected?.(flatNode.id)}
          />
        ))}
      </Tree.Root>
    </LocalizationContextProvider>
  );
}

function noopSelectNodes() {}

/** @alpha */
export type FlatPresentationTreeNode = {
  level: number;
  levelSize: number;
  posInLevel: number;
} & PresentationTreeNode;

/** @alpha */
export function flattenNodes(rootNodes: PresentationTreeNode[]) {
  return getFlatNodes(rootNodes, 0);
}

function getFlatNodes(nodes: PresentationTreeNode[], level: number) {
  const flatNodes: FlatPresentationTreeNode[] = [];
  nodes.forEach((node, index) => {
    flatNodes.push({ ...node, level, levelSize: nodes.length, posInLevel: index + 1 });
    if (isPresentationHierarchyNode(node) && node.isExpanded && node.children !== true) {
      const childNodes = getFlatNodes(node.children, level + 1);
      flatNodes.push(...childNodes);
    }
  });
  return flatNodes;
}
