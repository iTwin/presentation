/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/no-unused-vars */
import { ComponentPropsWithoutRef } from "react";
import { Tree } from "@itwin/itwinui-react-v5/bricks";
import { LocalizationContextProvider, PresentationTreeNode, useSelectionHandler, useTree } from "@itwin/presentation-hierarchies-react";
import { SelectionMode } from "../UseSelectionHandler";
import { TreeNodeRenderer } from "./TreeNodeRendererV5";
import { TreeNodesRenderer } from "./TreeNodesRendererV5";

/** @public */
export type TreeProps = ComponentPropsWithoutRef<typeof Tree.Root>;

/** @public */

export type TreeNodeRendererProps = ComponentPropsWithoutRef<typeof TreeNodeRenderer>;
/** @public */
interface TreeRendererOwnProps {
  /** Root nodes of the tree. */
  rootNodes: PresentationTreeNode[];
  /** Active selection mode used by the tree. Defaults to `"single"`. */
  selectionMode?: SelectionMode;
}

/** @public */
type TreeRendererProps = Pick<ReturnType<typeof useTree>, "expandNode"> &
  Partial<Pick<ReturnType<typeof useTree>, "selectNodes" | "isNodeSelected" | "getHierarchyLevelDetails" | "reloadTree">> &
  Pick<TreeNodeRendererProps, "onFilterClick" | "getIcon" | "getLabel" | "getSublabel"> &
  TreeRendererOwnProps &
  TreeProps &
  ComponentPropsWithoutRef<typeof LocalizationContextProvider>;

/**
 * A component that renders a tree using the `Tree` component from `@itwin/itwinui-react`. The tree nodes
 * are rendered using `TreeNodeRenderer` component from this package.
 *
 * @see https://itwinui.bentley.com/docs/tree
 * @public
 */
export function TreeRenderer({ rootNodes, expandNode, localizedStrings, selectNodes, isNodeSelected, selectionMode, ...treeProps }: TreeRendererProps) {
  const { onNodeClick, onNodeKeyDown } = useSelectionHandler({
    rootNodes,
    selectNodes: selectNodes ?? noopSelectNodes,
    selectionMode: selectionMode ?? "extended",
  });

  return (
    <LocalizationContextProvider localizedStrings={localizedStrings}>
      <Tree.Root style={{ height: "100%", width: "100%" }}>
        <TreeNodesRenderer {...treeProps} nodes={rootNodes} expandNode={expandNode} onNodeClick={onNodeClick} onNodeKeyDown={onNodeKeyDown} />
      </Tree.Root>
    </LocalizationContextProvider>
  );
}

function noopSelectNodes() {}

/**
 * A data structure for a tree node that is rendered using the `TreeRenderer` component.
 *
 * In addition to the `PresentationTreeNode` union, this type may have one additional variation - an informational
 * type of node with `ChildrenPlaceholder` type. This type of node is returned as the single child node of a parent
 * while its children are being loaded. This allows the node renderer to show a placeholder under the parent during
 * the process.
 *
 * @public
 */
export type RenderedTreeNode =
  | PresentationTreeNode
  | {
      id: string;
      parentNodeId: string | undefined;
      type: "ChildrenPlaceholder";
    };
