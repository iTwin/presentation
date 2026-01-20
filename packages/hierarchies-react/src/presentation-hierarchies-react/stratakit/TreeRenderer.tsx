/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  ComponentProps,
  ComponentPropsWithoutRef,
  CSSProperties,
  FC,
  forwardRef,
  memo,
  PropsWithoutRef,
  ReactElement,
  ReactNode,
  RefAttributes,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { Tree } from "@stratakit/structures";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TreeRendererProps } from "../Renderers.js";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { SelectionMode, useSelectionHandler } from "../UseSelectionHandler.js";
import { useEvent, useMergedRefs } from "../Utils.js";
import { ErrorItem, findPathToNode, FlatTreeItem, FlatTreeNodeItem, isPlaceholderItem, useErrorList, useFlatTreeItems } from "./FlatTreeNode.js";
import { LocalizationContextProvider } from "./LocalizationContext.js";
import { TreeErrorRenderer, TreeErrorRendererProps } from "./TreeErrorRenderer.js";
import { TreeNodeRenameContextProvider, useTreeNodeRenameContextValue } from "./TreeNodeRenameAction.js";
import { PlaceholderNode, StrataKitTreeItemProps, StrataKitTreeNodeRenderer, TreeNodeRendererProps } from "./TreeNodeRenderer.js";

/** @alpha */
interface TreeRendererOwnProps {
  id?: string;
  /**
   * A user friendly display label of the tree. Should be unique within the consuming application,
   * as it's used for accessibility purposes.
   */
  treeLabel: string;
  /** Active selection mode used by the tree. Defaults to `"single"`. */
  selectionMode?: SelectionMode;
  /** A render function for errors' display component. Defaults to `<TreeErrorRenderer />`. */
  errorRenderer?: (props: TreeErrorRendererProps) => ReactElement;
  /** Props that defines if current node supports editing. */
  getEditingProps?: (node: PresentationHierarchyNode) => {
    /**
     * A callback that is invoked when node label is changed. Should be used together
     * with `<RenameAction />` to enter label editing mode. Node label is not editable
     * when this is not supplied.
     */
    onLabelChanged?: (newLabel: string) => void;
  };

  /** Custom props for the root Tree component. */
  treeRootProps?: Partial<Omit<ComponentProps<typeof Tree.Root>, "style">>;

  /** A callback that returns tree item props for specific node. */
  getTreeItemProps?: (node: PresentationHierarchyNode) => Partial<Omit<StrataKitTreeItemProps, "selected" | "aria-level" | "aria-posinset" | "aria-setsize">>;

  /**
   * Callback that returns menu actions for tree item.
   * Must return an array of `<TreeActionBase />` or `<Divider />` elements.
   */
  getMenuActions?: (props: { targetNode: PresentationHierarchyNode; selectedNodes: PresentationHierarchyNode[] }) => ReactNode[];
  /**
   * Callback that returns inline actions for tree item.
   * Must return an array of `<TreeActionBase />` elements.
   * Max 2 items.
   */
  getInlineActions?: (props: { targetNode: PresentationHierarchyNode; selectedNodes: PresentationHierarchyNode[] }) => ReactNode[];
  /**
   * Callback that returns actions for tree item context menu.
   * Must return an array of `<TreeActionBase />` or `<Divider />` elements.
   */
  getContextMenuActions?: (props: { targetNode: PresentationHierarchyNode; selectedNodes: PresentationHierarchyNode[] }) => ReactNode[];
}

/** @alpha */
export interface StrataKitTreeRendererAttributes {
  /**
   * Opens rename mode for the first node that matches the given predicate. Node must be already loaded in the tree.
   * If the node is not visible (because its parent is collapsed), all parents will be expanded to make it visible and node will be scrolled into view.
   *
   * Returns "node-not-found" if no node matches the predicate, "success" if rename was initiated.
   */
  renameNode: (predicate: (node: PresentationHierarchyNode) => boolean) => "node-not-found" | "success";
}

/** @alpha */
type StrataKitTreeRendererProps = TreeRendererProps &
  Pick<TreeErrorRendererProps, "onFilterClick"> &
  TreeRendererOwnProps &
  ComponentPropsWithoutRef<typeof LocalizationContextProvider>;

/**
 * A component that renders a tree using the `Tree` component from `@itwin/itwinui-react`. The tree nodes
 * are rendered using `TreeNodeRenderer` component from this package.
 *
 * @see https://itwinui.bentley.com/docs/tree
 * @alpha
 */
export const StrataKitTreeRenderer: FC<PropsWithoutRef<StrataKitTreeRendererProps> & RefAttributes<StrataKitTreeRendererAttributes>> = forwardRef<
  StrataKitTreeRendererAttributes,
  StrataKitTreeRendererProps
>(function StrataKitTreeRenderer(props, forwardedRef) {
  const {
    id,
    rootNodes,
    selectNodes,
    selectionMode,
    expandNode,
    treeLabel,
    localizedStrings,
    getHierarchyLevelDetails,
    onFilterClick,
    reloadTree,
    isNodeSelected,
    errorRenderer,
    treeRootProps,
    getContextMenuActions,
    getEditingProps,
    getInlineActions,
    getMenuActions,
    getTreeItemProps,
  } = props;
  const { onNodeClick, onNodeKeyDown } = useSelectionHandler({
    rootNodes,
    selectNodes: selectNodes ?? noopSelectNodes,
    selectionMode: selectionMode ?? "single",
  });
  const flatItems = useFlatTreeItems(rootNodes);
  const errorList = useErrorList(rootNodes);

  const scrollToNode = useRef<{ id: string; action?: () => void } | undefined>(undefined);
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    getItemKey: useCallback((index: number) => flatItems[index].id, [flatItems]),
    estimateSize: () => 28,
    overscan: 10,
  });

  const items = virtualizer.getVirtualItems();

  const scrollToElement = useCallback(
    ({ errorNode, expandTo }: ErrorItem) => {
      const index = flatItems.findIndex((flatItem) => flatItem.id === errorNode.id);
      if (index === -1) {
        expandTo((nodeId) => expandNode(nodeId, true));
        scrollToNode.current = { id: errorNode.id };
        return;
      }
      virtualizer.scrollToIndex(index, { align: "end" });
    },
    [expandNode, flatItems, virtualizer],
  );

  useEffect(() => {
    if (scrollToNode.current === undefined) {
      return;
    }
    const targetNodeId = scrollToNode.current.id;
    const index = flatItems.findIndex((flatItem) => flatItem.id === targetNodeId);
    if (index === -1) {
      return;
    }
    virtualizer.scrollToIndex(index, { align: "end" });
    scrollToNode.current.action?.();
    scrollToNode.current = undefined;
  }, [flatItems, virtualizer]);

  const renameContext = useTreeNodeRenameContextValue({
    getEditingProps,
  });

  useImperativeHandle(forwardedRef, () => ({
    renameNode: (predicate) => {
      const pathToNode = findPathToNode(rootNodes, predicate);
      if (!pathToNode) {
        return "node-not-found";
      }
      const targetNode = pathToNode.pop()!;
      const collapsedNodes = pathToNode.filter((pathNode) => !pathNode.isExpanded);
      if (collapsedNodes.length > 0) {
        collapsedNodes.forEach((node) => expandNode(node.id, true));
        scrollToNode.current = {
          id: targetNode.id,
          action: () => {
            renameContext.startRename(targetNode);
          },
        };
      } else {
        renameContext.startRename(targetNode);
      }
      return "success";
    },
  }));

  const errorRendererProps: TreeErrorRendererProps = {
    treeLabel,
    errorList,
    scrollToElement,
    getHierarchyLevelDetails,
    onFilterClick,
    reloadTree,
  };

  const getSelectedNodes = useMemo(() => {
    let calculatedSelectedNodes: PresentationHierarchyNode[];
    return () => {
      if (calculatedSelectedNodes === undefined) {
        calculatedSelectedNodes = flatItems
          .filter((item): item is FlatTreeNodeItem => !isPlaceholderItem(item) && isNodeSelected?.(item.id))
          .map((item) => item.node);
      }
      return calculatedSelectedNodes;
    };
  }, [flatItems, isNodeSelected]);

  return (
    <LocalizationContextProvider localizedStrings={localizedStrings}>
      {errorRenderer ? errorRenderer(errorRendererProps) : <TreeErrorRenderer {...errorRendererProps} />}
      <div id={id} style={{ height: "100%", width: "100%", overflowY: "auto" }} ref={parentRef}>
        <Tree.Root
          {...treeRootProps}
          style={{ height: virtualizer.getTotalSize(), minHeight: "100%", width: "100%", position: "relative", overflow: "hidden" }}
        >
          <TreeNodeRenameContextProvider value={renameContext}>
            {items.map((virtualizedItem) => {
              const item = flatItems[virtualizedItem.index];
              const selected = isNodeSelected?.(item.id) ?? false;
              return (
                <VirtualTreeItem
                  ref={virtualizer.measureElement}
                  key={virtualizedItem.key}
                  data-index={virtualizedItem.index}
                  start={virtualizedItem.start}
                  item={item}
                  selected={selected}
                  expandNode={expandNode}
                  reloadTree={reloadTree}
                  onNodeClick={onNodeClick}
                  onNodeKeyDown={onNodeKeyDown}
                  getSelectedNodes={getSelectedNodes}
                  getContextMenuActions={getContextMenuActions}
                  getInlineActions={getInlineActions}
                  getMenuActions={getMenuActions}
                  getTreeItemProps={getTreeItemProps}
                />
              );
            })}
          </TreeNodeRenameContextProvider>
        </Tree.Root>
      </div>
    </LocalizationContextProvider>
  );
});

type VirtualTreeItemProps = Omit<HierarchyNodeItemProps, "item"> & {
  start: number;
  "data-index": number;
  item: FlatTreeItem;
};

const VirtualTreeItem = memo(
  forwardRef<HTMLElement, VirtualTreeItemProps>(function VirtualTreeItem({ start, item, ...props }, forwardedRef) {
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

    if (isPlaceholderItem(item)) {
      return <PlaceholderNode ref={forwardedRef} data-index={props["data-index"]} style={style} aria-level={item.level} aria-posinset={1} aria-setsize={1} />;
    }

    return <HierarchyNodeItem {...props} ref={forwardedRef} style={style} item={item} />;
  }),
);

type HierarchyNodeItemProps = {
  item: FlatTreeNodeItem;
  style?: CSSProperties;
  getSelectedNodes: () => PresentationHierarchyNode[];
} & Pick<TreeNodeRendererProps, "expandNode" | "reloadTree" | "selected"> &
  Pick<TreeRendererOwnProps, "getContextMenuActions" | "getInlineActions" | "getMenuActions" | "getTreeItemProps"> &
  Pick<ReturnType<typeof useSelectionHandler>, "onNodeClick" | "onNodeKeyDown">;

const HierarchyNodeItem = memo(
  forwardRef<HTMLElement, HierarchyNodeItemProps>(function HierarchyNodeItem(
    { item, selected, getTreeItemProps, onNodeClick, onNodeKeyDown, getSelectedNodes, getMenuActions, getInlineActions, getContextMenuActions, ...rest },
    forwardedRef,
  ) {
    const nodeRef = useRef<HTMLElement>(null);
    const node = item.node;
    const treeItemProps = getTreeItemProps?.(node);

    const isDisabled = treeItemProps?.["aria-disabled"] === true;
    const nodeActions = useMemo(
      () => ({
        menuActions: getMenuActions ? getMenuActions({ targetNode: node, selectedNodes: getSelectedNodes() }) : undefined,
        inlineActions: getInlineActions ? getInlineActions({ targetNode: node, selectedNodes: getSelectedNodes() }) : undefined,
        contextMenuActions: getContextMenuActions ? getContextMenuActions({ targetNode: node, selectedNodes: getSelectedNodes() }) : undefined,
      }),
      [node, getMenuActions, getInlineActions, getContextMenuActions, getSelectedNodes],
    );

    const onClick = useEvent<Required<TreeNodeRendererProps>["onClick"]>((e) => {
      if (treeItemProps?.onClick) {
        treeItemProps.onClick(e);
      }
      if (isDisabled) {
        return;
      }
      onNodeClick?.(node, !selected, e);
    });
    const onKeyDown = useEvent<Required<TreeNodeRendererProps>["onKeyDown"]>((e) => {
      if (treeItemProps?.onKeyDown) {
        treeItemProps.onKeyDown(e);
      }
      // Ignore if it is called on the element inside, e.g. checkbox or expander
      if (isDisabled || e.target !== nodeRef.current) {
        return;
      }
      onNodeKeyDown?.(node, !selected, e);
    });

    const ref = useMergedRefs(forwardedRef, nodeRef);
    return (
      <StrataKitTreeNodeRenderer
        {...treeItemProps}
        {...rest}
        {...nodeActions}
        ref={ref}
        aria-level={item.level}
        aria-posinset={item.posInLevel}
        aria-setsize={item.levelSize}
        node={item.node}
        selected={selected}
        onClick={onClick}
        onKeyDown={onKeyDown}
      />
    );
  }),
);

function noopSelectNodes() {}
