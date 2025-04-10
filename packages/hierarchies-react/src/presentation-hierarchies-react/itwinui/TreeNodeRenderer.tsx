/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  ComponentPropsWithoutRef,
  FC,
  forwardRef,
  LegacyRef,
  memo,
  MutableRefObject,
  PropsWithRef,
  ReactElement,
  ReactNode,
  Ref,
  RefAttributes,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { Spinner, Tree } from "@itwin/itwinui-react/bricks";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { useTree, UseTreeResult } from "../UseTree.js";
import { ErrorNode, FlatNode, FlatTreeNode, isPlaceholderNode } from "./FlatTreeNode.js";
import { useLocalizationContext } from "./LocalizationContext.js";
import { TreeActionButton, TreeItemAction } from "./TreeActionButton.js";

const refreshSvg = new URL("@itwin/itwinui-icons/refresh.svg", import.meta.url).href;

/** @alpha */
type TreeNodeProps = ComponentPropsWithoutRef<typeof Tree.Item>;

/** @alpha */
export interface TreeNodeRendererOwnProps {
  /** Node that is rendered. */
  node: FlatTreeNode;
  /** Returns a label for a given node. */
  getLabel?: (node: PresentationHierarchyNode) => ReactElement | undefined;
  /** Returns sublabel for a given node. */
  getSublabel?: (node: PresentationHierarchyNode) => ReactElement | undefined;
  /** Action to perform when the node is clicked. */
  onNodeClick?: (node: PresentationHierarchyNode, isSelected: boolean, event: React.MouseEvent<HTMLElement>) => void;
  /** Action to perform when a key is pressed when the node is hovered on. */
  onNodeKeyDown?: (node: PresentationHierarchyNode, isSelected: boolean, event: React.KeyboardEvent<HTMLElement>) => void;
  /**
   * Used to render elements between expander and label.
   * E.g. icons, color picker, etc.
   */
  getDecorations?: (node: PresentationHierarchyNode) => ReactNode;
  /** Specifies if tree item is selected. */
  selected?: boolean;
  /** Actions for tree item. */
  actions?: Array<(node: PresentationHierarchyNode) => TreeItemAction>;
  /** Specifies if tree item has error. */
  error?: ErrorNode;
}

/** @alpha */
type TreeNodeRendererProps = Pick<ReturnType<typeof useTree>, "expandNode"> &
  Partial<Pick<ReturnType<typeof useTree>, "getHierarchyLevelDetails">> &
  Omit<
    TreeNodeProps,
    "actions" | "aria-level" | "aria-posinset" | "aria-setsize" | "label" | "icon" | "expanded" | "selected" | "unstable_decorations" | "error"
  > &
  Partial<Pick<UseTreeResult, "reloadTree">> &
  TreeNodeRendererOwnProps;

/**
 * A component that renders `RenderedTreeNode` using the `TreeNode` component from `@itwin/itwinui-react`.
 *
 * @see `TreeRenderer`
 * @see https://itwinui.bentley.com/docs/tree
 * @public
 */
export const TreeNodeRenderer: FC<PropsWithRef<TreeNodeRendererProps & RefAttributes<HTMLElement>>> = memo(
  forwardRef<HTMLElement, TreeNodeRendererProps>(function TreeNodeRenderer(
    { node, selected, actions, error, expandNode, getLabel, getSublabel, getDecorations, reloadTree, onNodeClick, onNodeKeyDown, ...treeItemProps },
    forwardedRef,
  ) {
    if (isPlaceholderNode(node)) {
      return <PlaceholderNode {...treeItemProps} ref={forwardedRef} level={node.level} />;
    }

    return (
      <HierarchyNode
        {...treeItemProps}
        ref={forwardedRef}
        node={node}
        selected={selected}
        actions={actions}
        error={error}
        expandNode={expandNode}
        getLabel={getLabel}
        getSublabel={getSublabel}
        getDecorations={getDecorations}
        onNodeKeyDown={onNodeKeyDown}
        onNodeClick={onNodeClick}
        reloadTree={reloadTree}
      />
    );
  }),
);

const HierarchyNode = memo(
  forwardRef<HTMLElement, Omit<TreeNodeRendererProps, "node"> & { node: FlatNode }>(function HierarchyNode(
    { node, selected, actions, error, expandNode, getLabel, getSublabel, onNodeClick, onNodeKeyDown, getDecorations, reloadTree, ...treeItemProps },
    forwardedRef,
  ) {
    const nodeRef = useRef<HTMLElement>(null);
    const ref = useMergedRefs(forwardedRef, nodeRef);
    const { localizedStrings } = useLocalizationContext();

    const nodeActions = useMemo(() => {
      const actionButtons: ReactElement[] = [];
      if (error && error.error.type === "Unknown" && reloadTree) {
        actionButtons.push(
          <TreeActionButton
            label={localizedStrings.retry}
            action={() => reloadTree({ parentNodeId: node.id, state: "reset" })}
            show={true}
            icon={refreshSvg}
          />,
        );
      }

      if (!actions || actions.length === 0) {
        return actionButtons;
      }

      actionButtons.push(
        ...actions.map((action, index) => {
          const actionInfo = action(node);
          return <TreeActionButton key={index} {...actionInfo} />;
        }),
      );

      return actionButtons;
    }, [actions, error, node, reloadTree, localizedStrings]);

    const isDisabled = treeItemProps["aria-disabled"] === true;
    return (
      <Tree.Item
        {...treeItemProps}
        ref={ref}
        aria-level={node.level}
        aria-posinset={node.posInLevel}
        aria-setsize={node.levelSize}
        label={useMemo(() => (getLabel ? getLabel(node) : node.label), [getLabel, node])}
        description={useMemo(() => (getSublabel ? getSublabel(node) : undefined), [getSublabel, node])}
        selected={selected}
        expanded={node.isExpanded || node.children === true || node.children.length > 0 ? node.isExpanded : undefined}
        onExpandedChange={useCallback(
          (isExpanded: boolean) => {
            expandNode(node.id, isExpanded);
          },
          [node, expandNode],
        )}
        onClick={useCallback<Required<TreeNodeProps>["onClick"]>(
          (event) => {
            !isDisabled && onNodeClick?.(node, !selected, event);
          },
          [node, isDisabled, selected, onNodeClick],
        )}
        onKeyDown={useCallback<Required<TreeNodeProps>["onKeyDown"]>(
          (event) => {
            // Ignore if it is called on the element inside, e.g. checkbox or expander
            if (!isDisabled && event.target === nodeRef.current) {
              onNodeKeyDown?.(node, !selected, event);
            }
          },
          [onNodeKeyDown, selected, isDisabled, node],
        )}
        actions={nodeActions}
        unstable_decorations={useMemo(() => getDecorations && getDecorations(node), [getDecorations, node])}
        error={!!error}
      />
    );
  }),
);

const PlaceholderNode = memo(
  forwardRef<
    HTMLElement,
    Omit<TreeNodeProps, "onExpanded" | "label" | "actions" | "aria-level" | "aria-posinset" | "aria-setsize" | "icon"> & { level: number }
  >(function PlaceholderNode({ level, ...props }, forwardedRef) {
    const { localizedStrings } = useLocalizationContext();
    return (
      <Tree.Item
        {...props}
        aria-level={level}
        aria-posinset={1}
        aria-setsize={1}
        ref={forwardedRef}
        label={localizedStrings.loading}
        icon={<Spinner size={"small"} title={localizedStrings.loading} />}
      />
    );
  }),
);

function useMergedRefs<T>(...refs: ReadonlyArray<Ref<T> | LegacyRef<T> | undefined | null>) {
  return useCallback(
    (instance: T | null) => {
      refs.forEach((ref) => {
        if (typeof ref === "function") {
          ref(instance);
        } else if (ref) {
          (ref as MutableRefObject<T | null>).current = instance;
        }
      });
    }, // eslint-disable-next-line react-hooks/exhaustive-deps
    [...refs],
  );
}
