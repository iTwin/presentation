/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, forwardRef, memo, ReactElement, useCallback, useEffect, useMemo, useRef } from "react";
import { Tree } from "@itwin/itwinui-react/bricks";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PresentationTreeNode } from "../TreeNode.js";
import { SelectionMode, useSelectionHandler } from "../UseSelectionHandler.js";
import { useTree } from "../UseTree.js";
import { useEvent } from "../Utils.js";
import { ErrorNode, useErrorList, useFlatTreeNodeList } from "./FlatTreeNode.js";
import { LocalizationContextProvider } from "./LocalizationContext.js";
import { TreeErrorRenderer, TreeErrorRendererProps } from "./TreeErrorRenderer.js";
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
  /** A render function for errors' display component. Defaults to `<TreeErrorRenderer />`. */
  errorRenderer?: (props: TreeErrorRendererProps) => ReactElement;
}

/** @alpha */
type TreeRendererProps = Pick<ReturnType<typeof useTree>, "expandNode"> &
  Partial<Pick<ReturnType<typeof useTree>, "selectNodes" | "isNodeSelected" | "getHierarchyLevelDetails">> &
  Pick<ReturnType<typeof useTree>, "reloadTree"> &
  Pick<TreeErrorRendererProps, "onFilterClick"> &
  Omit<TreeNodeRendererProps, "node" | "reloadTree" | "selected" | "error"> &
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
  isNodeSelected,
  actions,
  getDecorations,
  getLabel,
  getSublabel,
  errorRenderer,
  ...treeProps
}: TreeRendererProps) {
  const { onNodeClick, onNodeKeyDown } = useSelectionHandler({
    rootNodes,
    selectNodes: selectNodes ?? noopSelectNodes,
    selectionMode: selectionMode ?? "single",
  });
  const scrollToNode = useRef<string | undefined>(undefined);
  const parentRef = useRef<HTMLDivElement>(null);
  const flatNodes = useFlatTreeNodeList(rootNodes);
  const errorList = useErrorList(rootNodes);

  const handleNodeClick = useEvent(onNodeClick);
  const handleKeyDown = useEvent(onNodeKeyDown);

  const hasError = useCallback(
    (nodeId: string) => {
      return errorList.find((errorNode) => errorNode.parent?.id === nodeId);
    },
    [errorList],
  );

  const virtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => flatNodes[index].id,
    estimateSize: () => 28,
    overscan: 10,
  });

  const items = virtualizer.getVirtualItems();

  const scrollToElement = useCallback(
    (errorNode: ErrorNode) => {
      const index = flatNodes.findIndex((flatNode) => flatNode.id === errorNode.parent?.id);
      if (index === -1) {
        errorNode.expandTo((nodeId) => expandNode(nodeId, true));
        scrollToNode.current = errorNode.parent?.id;
        return;
      }
      virtualizer.scrollToIndex(index, { align: "end" });
    },
    [expandNode, flatNodes, virtualizer],
  );

  useEffect(() => {
    if (scrollToNode.current === undefined) {
      return;
    }
    const index = flatNodes.findIndex((flatNode) => flatNode.id === scrollToNode.current);
    if (index === -1) {
      return;
    }
    virtualizer.scrollToIndex(index, { align: "end" });
    scrollToNode.current = undefined;
  }, [flatNodes, virtualizer]);

  const errorRendererProps: TreeErrorRendererProps = {
    errorList,
    scrollToElement,
    getHierarchyLevelDetails,
    onFilterClick,
    reloadTree,
  };

  return (
    <LocalizationContextProvider localizedStrings={localizedStrings}>
      {errorRenderer ? errorRenderer(errorRendererProps) : <TreeErrorRenderer {...errorRendererProps} />}
      <div style={{ height: "100%", width: "100%", overflowY: "auto" }} ref={parentRef}>
        <Tree.Root style={{ height: virtualizer.getTotalSize(), minHeight: "100%", width: "100%", position: "relative", overflow: "hidden" }}>
          {items.map((virtualizedItem) => {
            const selected = isNodeSelected?.(flatNodes[virtualizedItem.index].id) ?? false;
            const error = hasError(flatNodes[virtualizedItem.index].id);
            return (
              <VirtualTreeItem
                {...treeProps}
                ref={virtualizer.measureElement}
                start={virtualizedItem.start}
                expandNode={expandNode}
                onNodeClick={handleNodeClick}
                onNodeKeyDown={handleKeyDown}
                error={error}
                node={flatNodes[virtualizedItem.index]}
                key={virtualizedItem.key}
                data-index={virtualizedItem.index}
                reloadTree={reloadTree}
                selected={selected}
                actions={actions}
                getDecorations={getDecorations}
                getLabel={getLabel}
                getSublabel={getSublabel}
              />
            );
          })}
        </Tree.Root>
      </div>
    </LocalizationContextProvider>
  );
}

const VirtualTreeItem = memo(
  forwardRef<HTMLElement, TreeNodeRendererProps & { start: number }>(function VirtualTreeItem({ start, ...props }, forwardedRef) {
    return (
      <TreeNodeRenderer
        {...props}
        ref={forwardedRef}
        style={useMemo(
          () => ({
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            transform: `translateY(${start}px)`,
            willChange: "transform",
          }),
          [start],
        )}
      />
    );
  }),
);

function noopSelectNodes() {}
