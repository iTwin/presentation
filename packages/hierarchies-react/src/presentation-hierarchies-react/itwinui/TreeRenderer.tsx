/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, useCallback, useEffect, useMemo, useRef } from "react";
import { Tree } from "@itwin/itwinui-react/bricks";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PresentationHierarchyNode, PresentationTreeNode } from "../TreeNode.js";
import { SelectionMode, useSelectionHandler } from "../UseSelectionHandler.js";
import { useTree } from "../UseTree.js";
import { ErrorType, flattenNodes, getErrors } from "./FlatTreeNode.js";
import { LocalizationContextProvider } from "./LocalizationContext.js";
import { TreeErrorItemProps, TreeErrorRenderer } from "./TreeErrorRenderer.js";
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
  Pick<TreeErrorItemProps, "onFilterClick"> &
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
export function TreeRenderer({
  rootNodes,
  expandNode,
  localizedStrings,
  selectNodes,
  selectionMode,
  getHierarchyLevelDetails,
  onFilterClick,
  reloadTree,
  ...treeProps
}: TreeRendererProps) {
  const { onNodeClick, onNodeKeyDown } = useSelectionHandler({
    rootNodes,
    selectNodes: selectNodes ?? noopSelectNodes,
    selectionMode: selectionMode ?? "single",
  });
  const scrollToNode = useRef<string | undefined>(undefined);
  const parentRef = useRef<HTMLDivElement>(null);
  const flatNodes = useMemo(() => flattenNodes(rootNodes), [rootNodes]);
  const errorList = useMemo(() => getErrors(rootNodes), [rootNodes]);

  const isErrorNode = useCallback(
    (node: PresentationHierarchyNode) => {
      return !!errorList.find((error) => error.parentNode?.id === node.id);
    },
    [errorList],
  );

  const virtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => flatNodes[index].id,
    estimateSize: () => 28,
    overscan: 5,
  });

  const items = virtualizer.getVirtualItems();

  const scrollToElement = (errorNode: ErrorType) => {
    errorNode.expandToNode((nodeId) => expandNode(nodeId, true));
    const index = flatNodes.findIndex((flatNode) => flatNode.id === errorNode.parentNode?.id);
    if (index === -1) {
      scrollToNode.current = errorNode.parentNode?.id;
      return;
    }
    virtualizer.scrollToIndex(index);
  };

  useEffect(() => {
    if (scrollToNode.current === undefined) {
      return;
    }
    const index = flatNodes.findIndex((flatNode) => flatNode.id === scrollToNode.current);
    virtualizer.scrollToIndex(index);
    scrollToNode.current = undefined;
  }, [flatNodes, virtualizer]);

  return (
    <LocalizationContextProvider localizedStrings={localizedStrings}>
      <div>
        {errorList.map((error) => (
          <TreeErrorRenderer
            key={error.parentNode?.id}
            error={error}
            scrollToElement={scrollToElement}
            getHierarchyLevelDetails={getHierarchyLevelDetails}
            onFilterClick={onFilterClick}
            reloadTree={reloadTree}
          />
        ))}
      </div>
      <div style={{ height: "100%", width: "100%", overflowY: "auto" }} ref={parentRef}>
        <Tree.Root style={{ height: virtualizer.getTotalSize(), minHeight: "100%", width: "100%", position: "relative" }}>
          {items.map((virtualizedItem) => {
            return (
              <TreeNodeRenderer
                {...treeProps}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualizedItem.start}px)`,
                  willChange: "transform",
                }}
                expandNode={expandNode}
                onNodeClick={onNodeClick}
                onNodeKeyDown={onNodeKeyDown}
                isErrorNode={isErrorNode}
                node={flatNodes[virtualizedItem.index]}
                key={virtualizedItem.key}
                data-index={virtualizedItem.index}
              />
            );
          })}
        </Tree.Root>
      </div>
    </LocalizationContextProvider>
  );
}

function noopSelectNodes() {}
