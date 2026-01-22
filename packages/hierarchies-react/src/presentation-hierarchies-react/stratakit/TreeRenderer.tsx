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
import { TreeNode } from "../TreeNode.js";
import { SelectionMode, useSelectionHandler } from "../UseSelectionHandler.js";
import { useEvent, useMergedRefs } from "../Utils.js";
import { FlatTreeItem, FlatTreeNodeItem, isPlaceholderItem, useErrorList, useFlatTreeItems } from "./FlatTreeNode.js";
import { LocalizationContextProvider } from "./LocalizationContext.js";
import { TreeErrorRenderer, TreeErrorRendererProps } from "./TreeErrorRenderer.js";
import { TreeNodeEditingProps, TreeNodeRenameContextProvider, useTreeNodeRenameContextValue } from "./TreeNodeRenameAction.js";
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
  getEditingProps?: (node: TreeNode) => TreeNodeEditingProps | undefined;

  /** Custom props for the root Tree component. */
  treeRootProps?: Partial<Omit<ComponentProps<typeof Tree.Root>, "style">>;

  /** A callback that returns tree item props for specific node. */
  getTreeItemProps?: (node: TreeNode) => Partial<Omit<StrataKitTreeItemProps, "selected" | "aria-level" | "aria-posinset" | "aria-setsize">>;

  /**
   * Callback that returns menu actions for tree item.
   * Must return an array of `<TreeActionBase />` or `<Divider />` elements.
   */
  getMenuActions?: (props: { targetNode: TreeNode; selectedNodes: TreeNode[] }) => ReactNode[];
  /**
   * Callback that returns inline actions for tree item.
   * Must return an array of `<TreeActionBase />` elements.
   * Max 2 items.
   */
  getInlineActions?: (props: { targetNode: TreeNode; selectedNodes: TreeNode[] }) => ReactNode[];
  /**
   * Callback that returns actions for tree item context menu.
   * Must return an array of `<TreeActionBase />` or `<Divider />` elements.
   */
  getContextMenuActions?: (props: { targetNode: TreeNode; selectedNodes: TreeNode[] }) => ReactNode[];
}

/** @alpha */
export interface StrataKitTreeRendererAttributes {
  /**
   * Opens rename mode for the first node that matches the given predicate. Node must be already loaded in the tree.
   * If the node is not visible (because its parent is collapsed), all parents will be expanded to make it visible and node will be scrolled into view.
   *
   * Returns "node-not-found" if no node matches the predicate, "success" if rename was initiated.
   */
  renameNode: (nodePredicate: (node: TreeNode) => boolean) => "node-not-found" | "success";
}

/** @alpha */
type StrataKitTreeRendererProps = TreeRendererProps &
  Pick<TreeErrorRendererProps, "filterHierarchyLevel"> &
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
    filterHierarchyLevel,
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

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    getItemKey: useCallback((index: number) => flatItems[index].id, [flatItems]),
    estimateSize: () => 28,
    overscan: 10,
  });
  const items = virtualizer.getVirtualItems();
  const expandAndScrollToNode = useExpandAndScrollToNode({ rootNodes, flatItems, expandNode, virtualizer });

  const renameContext = useTreeNodeRenameContextValue({
    getEditingProps,
  });
  useImperativeHandle(forwardedRef, () => ({
    renameNode: (nodePredicate) =>
      expandAndScrollToNode({
        nodePredicate,
        onComplete: (targetNode) => {
          // give time to scroll node into view before starting rename
          requestAnimationFrame(() => renameContext.startRename(targetNode));
        },
      }),
  }));

  const cancelRename = renameContext.cancelRename;
  const isScrolling = virtualizer.isScrolling;
  useEffect(() => {
    if (isScrolling) {
      // cancel rename when scroll is initiated
      cancelRename();
    }
  }, [isScrolling, cancelRename]);

  const errorRendererProps: TreeErrorRendererProps = {
    treeLabel,
    errorList,
    scrollToNode: (node) => expandAndScrollToNode({ nodePredicate: (n) => n.id === node.id }),
    getHierarchyLevelDetails,
    filterHierarchyLevel,
    reloadTree: useCallback<TreeErrorRendererProps["reloadTree"]>(({ parentNodeId }) => reloadTree({ parentNodeId, state: "reset" }), [reloadTree]),
  };

  const getSelectedNodes = useMemo(() => {
    let calculatedSelectedNodes: TreeNode[];
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

function useExpandAndScrollToNode({
  rootNodes,
  flatItems,
  expandNode,
  virtualizer,
}: Pick<StrataKitTreeRendererProps, "rootNodes" | "expandNode"> & {
  flatItems: ReturnType<typeof useFlatTreeItems>;
  virtualizer: Pick<ReturnType<typeof useVirtualizer>, "scrollToIndex">;
}) {
  const expandToNode = (nodePredicate: (node: TreeNode) => boolean) => {
    const pathToNode = findPathToNode(rootNodes, nodePredicate);
    if (!pathToNode) {
      return undefined;
    }
    const targetNode = pathToNode.pop()!;
    const collapsedNodes = pathToNode.filter((pathNode) => !pathNode.isExpanded);
    collapsedNodes.forEach((node) => expandNode(node.id, true));
    return { targetNode, didExpand: collapsedNodes.length > 0 };
  };

  const scrollToNode = useRef<{ id: string; onScrollComplete?: () => void } | undefined>(undefined);
  useEffect(() => {
    if (scrollToNode.current === undefined) {
      return;
    }
    const targetNodeId = scrollToNode.current.id;
    const index = flatItems.findIndex((flatItem) => flatItem.id === targetNodeId);
    if (index === -1) {
      return;
    }
    virtualizer.scrollToIndex(index, { align: "auto" });
    scrollToNode.current.onScrollComplete?.();
    scrollToNode.current = undefined;
  }, [flatItems, virtualizer]);

  return ({ nodePredicate, onComplete }: { nodePredicate: (node: TreeNode) => boolean; onComplete?: (targetNode: TreeNode) => void }) => {
    const expandResult = expandToNode(nodePredicate);
    if (!expandResult) {
      return "node-not-found";
    }

    const { targetNode, didExpand } = expandResult;
    if (didExpand) {
      scrollToNode.current = {
        id: targetNode.id,
        onScrollComplete: onComplete ? () => onComplete(targetNode) : undefined,
      };
    } else {
      const index = flatItems.findIndex((flatItem) => flatItem.id === targetNode.id);
      virtualizer.scrollToIndex(index, { align: "auto" });
      onComplete?.(targetNode);
    }
    return "success";
  };
}

function findPathToNode(rootNodes: TreeNode[], nodePredicate: (node: TreeNode) => boolean): TreeNode[] | undefined {
  for (const parent of rootNodes) {
    if (nodePredicate(parent)) {
      return [parent];
    }
    if (parent.children && parent.children !== true) {
      const childPath = findPathToNode(parent.children, nodePredicate);
      if (childPath) {
        return [parent, ...childPath];
      }
    }
  }
  return undefined;
}

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
  getSelectedNodes: () => TreeNode[];
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
