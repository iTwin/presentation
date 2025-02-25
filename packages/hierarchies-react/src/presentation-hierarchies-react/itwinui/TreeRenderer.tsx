/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, useMemo, useRef } from "react";
import { Tree } from "@itwin/itwinui-react/bricks";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PresentationTreeNode } from "../TreeNode.js";
import { SelectionMode, useSelectionHandler } from "../UseSelectionHandler.js";
import { useTree } from "../UseTree.js";
import { flattenNodes } from "./FlatTreeNode.js";
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
  Omit<TreeNodeRendererProps, "node" | "reloadTree"> &
  TreeRendererOwnProps &
  ComponentPropsWithoutRef<typeof LocalizationContextProvider>;

/**
 * A component that renders a tree using the `Tree` component from `@itwin/itwinui-react`. The tree nodes
 * are rendered using `TreeNodeRenderer` component from this package.
 *
 * @see https://itwinui.bentley.com/docs/tree
 * @alpha
 */
export function TreeRenderer({ rootNodes, expandNode, localizedStrings, selectNodes, selectionMode, ...treeProps }: TreeRendererProps) {
  const { onNodeClick, onNodeKeyDown } = useSelectionHandler({
    rootNodes,
    selectNodes: selectNodes ?? noopSelectNodes,
    selectionMode: selectionMode ?? "single",
  });
  const parentRef = useRef<HTMLDivElement>(null);
  const flatNodes = useMemo(() => flattenNodes(rootNodes), [rootNodes]);

  const virtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 30,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <LocalizationContextProvider localizedStrings={localizedStrings}>
      <div style={{ height: "100%", width: "100%", overflowY: "auto", position: "relative" }} ref={parentRef}>
        <Tree.Root style={{ height: "100%", width: "100%", overflow: "initial" }}>
          {items.map((virtualizedItem) => {
            return (
              <div
                key={virtualizedItem.key}
                data-index={virtualizedItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualizedItem.size}px`,
                  transform: `translateY(${virtualizedItem.start}px)`,
                  willChange: "transform",
                }}
              >
                <TreeNodeRenderer
                  {...treeProps}
                  expandNode={expandNode}
                  onNodeClick={onNodeClick}
                  onNodeKeyDown={onNodeKeyDown}
                  node={flatNodes[virtualizedItem.index]}
                  key={flatNodes[virtualizedItem.index].id}
                />
              </div>
            );
          })}
        </Tree.Root>
      </div>
    </LocalizationContextProvider>
  );
}

function noopSelectNodes() {}
