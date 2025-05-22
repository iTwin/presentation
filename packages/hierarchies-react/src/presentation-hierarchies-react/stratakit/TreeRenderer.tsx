/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, CSSProperties, forwardRef, memo, ReactElement, useCallback, useEffect, useMemo, useRef } from "react";
import { Tree } from "@stratakit/structures";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TreeRendererProps } from "../Renderers.js";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { SelectionMode, useSelectionHandler } from "../UseSelectionHandler.js";
import { useEvent } from "../Utils.js";
import { ErrorItem, FlatTreeNode, isPlaceholderNode, useErrorList, useFlatTreeNodeList } from "./FlatTreeNode.js";
import { LocalizationContextProvider } from "./LocalizationContext.js";
import { TreeErrorRenderer, TreeErrorRendererProps } from "./TreeErrorRenderer.js";
import { PlaceholderNode, StrataKitTreeNodeRenderer } from "./TreeNodeRenderer.js";

/** @alpha */
export type TreeProps = ComponentPropsWithoutRef<typeof Tree.Root>;

/** @alpha */
export type TreeNodeRendererProps = ComponentPropsWithoutRef<typeof StrataKitTreeNodeRenderer>;

/** @alpha */
interface TreeRendererOwnProps {
  /** Active selection mode used by the tree. Defaults to `"single"`. */
  selectionMode?: SelectionMode;
  /** A render function for errors' display component. Defaults to `<TreeErrorRenderer />`. */
  errorRenderer?: (props: TreeErrorRendererProps) => ReactElement;
  /** Props that defines if current node supports editing. */
  getEditingProps?: (node: PresentationHierarchyNode) => {
    /** Callback that is invoked when node label is changed. If `undefined` node label is not editable. */
    onLabelChanged?: (newLabel: string) => void;
  };
}

/** @alpha */
type StrataKitTreeRendererProps = TreeRendererProps &
  Pick<TreeErrorRendererProps, "onFilterClick"> &
  Omit<TreeNodeRendererProps, "node" | "aria-level" | "aria-posinset" | "aria-setsize" | "reloadTree" | "selected" | "error"> &
  TreeRendererOwnProps &
  ComponentPropsWithoutRef<typeof LocalizationContextProvider>;

/**
 * A component that renders a tree using the `Tree` component from `@itwin/itwinui-react`. The tree nodes
 * are rendered using `TreeNodeRenderer` component from this package.
 *
 * @see https://itwinui.bentley.com/docs/tree
 * @alpha
 */
export function StrataKitTreeRenderer({
  rootNodes,
  selectNodes,
  selectionMode,
  expandNode,
  localizedStrings,
  getHierarchyLevelDetails,
  onFilterClick,
  reloadTree,
  isNodeSelected,
  errorRenderer,
  onNodeClick: onNodeClickOverride,
  onNodeKeyDown: onNodeKeyDownOverride,
  getEditingProps,
  ...treeProps
}: StrataKitTreeRendererProps) {
  const { onNodeClick, onNodeKeyDown } = useSelectionHandler({
    rootNodes,
    selectNodes: selectNodes ?? noopSelectNodes,
    selectionMode: selectionMode ?? "single",
  });
  const handleNodeClick = useEvent(onNodeClickOverride ?? onNodeClick);
  const handleKeyDown = useEvent(onNodeKeyDownOverride ?? onNodeKeyDown);
  const flatNodes = useFlatTreeNodeList(rootNodes);
  const errorList = useErrorList(rootNodes);

  const scrollToNode = useRef<string | undefined>(undefined);
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => flatNodes[index].id,
    estimateSize: () => 28,
    overscan: 10,
  });

  const items = virtualizer.getVirtualItems();

  const scrollToElement = useCallback(
    ({ errorNode, expandTo }: ErrorItem) => {
      const index = flatNodes.findIndex((flatNode) => flatNode.id === errorNode.id);
      if (index === -1) {
        expandTo((nodeId) => expandNode(nodeId, true));
        scrollToNode.current = errorNode.id;
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
            const node = flatNodes[virtualizedItem.index];
            const selected = isNodeSelected?.(node.id) ?? false;
            return (
              <VirtualTreeItem
                {...treeProps}
                onNodeClick={handleNodeClick}
                onNodeKeyDown={handleKeyDown}
                ref={virtualizer.measureElement}
                start={virtualizedItem.start}
                expandNode={expandNode}
                node={node}
                key={virtualizedItem.key}
                data-index={virtualizedItem.index}
                reloadTree={reloadTree}
                selected={selected}
                getEditingProps={getEditingProps}
              />
            );
          })}
        </Tree.Root>
      </div>
    </LocalizationContextProvider>
  );
}

type VirtualTreeItemProps = Omit<TreeNodeRendererProps, "node" | "aria-level" | "aria-posinset" | "aria-setsize"> & {
  start: number;
  node: FlatTreeNode;
  getEditingProps?: (node: PresentationHierarchyNode) => {
    onLabelChanged?: (newLabel: string) => void;
  };
};

const VirtualTreeItem = memo(
  forwardRef<HTMLElement, VirtualTreeItemProps>(function VirtualTreeItem(
    { start, node, getDecorations, getActions, getLabel, getSublabel, expandNode, reloadTree, onNodeClick, onNodeKeyDown, getEditingProps, ...props },
    forwardedRef,
  ) {
    const style: CSSProperties = useMemo(
      () => ({
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        transform: `translateY(${start}px)`,
        willChange: "transform",
      }),
      [start],
    );

    if (isPlaceholderNode(node)) {
      return <PlaceholderNode {...props} ref={forwardedRef} style={style} aria-level={node.level} aria-posinset={1} aria-setsize={1} />;
    }

    const editingProps = getEditingProps?.(node);

    return (
      <StrataKitTreeNodeRenderer
        {...props}
        ref={forwardedRef}
        style={style}
        aria-level={node.level}
        aria-posinset={node.posInLevel}
        aria-setsize={node.levelSize}
        node={node}
        expandNode={expandNode}
        reloadTree={reloadTree}
        getDecorations={getDecorations}
        getActions={getActions}
        getLabel={getLabel}
        getSublabel={getSublabel}
        onNodeClick={onNodeClick}
        onNodeKeyDown={onNodeKeyDown}
        onLabelChanged={editingProps?.onLabelChanged}
      />
    );
  }),
);

function noopSelectNodes() {}
