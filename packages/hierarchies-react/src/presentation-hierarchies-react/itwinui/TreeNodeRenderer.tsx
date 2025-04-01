/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  ComponentPropsWithoutRef,
  forwardRef,
  ForwardRefExoticComponent,
  LegacyRef,
  MutableRefObject,
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
import { useTree } from "../UseTree.js";
import { FlatTreeNode, isPlaceholderNode } from "./FlatTreeNode.js";
import { useLocalizationContext } from "./LocalizationContext.js";
import { TreeActionButton, TreeItemAction } from "./TreeActionButton.js";

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
  onNodeClick?: (node: PresentationHierarchyNode, isSelected: boolean, event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
  /** Action to perform when a key is pressed when the node is hovered on. */
  onNodeKeyDown?: (node: PresentationHierarchyNode, isSelected: boolean, event: React.KeyboardEvent<HTMLElement>) => void;
  /**
   * Actions for tree item.
   */
  actions?: Array<(node: PresentationHierarchyNode) => TreeItemAction>;
  /**
   * Used to render elements between expander and label.
   * E.g. icons, color picker, etc.
   */
  getDecorations?: (node: PresentationHierarchyNode) => ReactNode;
  /**
   * Used to determine if node contains errors.
   */
  hasError?: (node: PresentationHierarchyNode) => boolean;
}

/** @alpha */
type TreeNodeRendererProps = Pick<ReturnType<typeof useTree>, "expandNode" | "isNodeSelected"> &
  Partial<Pick<ReturnType<typeof useTree>, "getHierarchyLevelDetails">> &
  Omit<TreeNodeProps, "actions" | "aria-level" | "aria-posinset" | "aria-setsize" | "label" | "icon" | "expanded" | "selected" | "unstable_decorations"> &
  TreeNodeRendererOwnProps;

/**
 * A component that renders `RenderedTreeNode` using the `TreeNode` component from `@itwin/itwinui-react`.
 *
 * @see `TreeRenderer`
 * @see https://itwinui.bentley.com/docs/tree
 * @public
 */
export const TreeNodeRenderer: ForwardRefExoticComponent<TreeNodeRendererProps & RefAttributes<HTMLElement>> = forwardRef(
  (
    { node, expandNode, getLabel, getSublabel, onNodeClick, onNodeKeyDown, isNodeSelected, actions, getDecorations, hasError, ...treeItemProps },
    forwardedRef,
  ) => {
    const nodeRef = useRef<HTMLElement>(null);
    const ref = useMergedRefs(forwardedRef, nodeRef);

    const error = useMemo(() => {
      return !isPlaceholderNode(node) ? hasError?.(node) : false;
    }, [hasError, node]);

    if (isPlaceholderNode(node)) {
      return <PlaceholderNode {...treeItemProps} level={node.level} ref={ref} />;
    }

    const getActions = () => {
      if (!actions || actions.length === 0) {
        return undefined;
      }

      return actions.map((action, index) => {
        const actionInfo = action(node);
        return <TreeActionButton key={index} {...actionInfo} />;
      });
    };

    const selected = isNodeSelected(node.id);
    return (
      <Tree.Item
        {...treeItemProps}
        ref={ref}
        aria-level={node.level}
        aria-posinset={node.posInLevel}
        aria-setsize={node.levelSize}
        label={getLabel ? getLabel(node) : node.label}
        description={getSublabel ? getSublabel(node) : undefined}
        selected={selected}
        expanded={node.isExpanded || node.children === true || node.children.length > 0 ? node.isExpanded : undefined}
        onExpandedChange={(isExpanded) => {
          expandNode(node.id, isExpanded);
        }}
        onClick={(event) => {
          !treeItemProps["aria-disabled"] && onNodeClick?.(node, !selected, event);
        }}
        onKeyDown={(event) => {
          // Ignore if it is called on the element inside, e.g. checkbox or expander
          if (!treeItemProps["aria-disabled"] && event.target === nodeRef.current) {
            onNodeKeyDown?.(node, !selected, event);
          }
        }}
        actions={getActions()}
        unstable_decorations={getDecorations && getDecorations(node)}
        error={error}
      />
    );
  },
);
TreeNodeRenderer.displayName = "TreeNodeRenderer";

const PlaceholderNode = forwardRef<
  HTMLDivElement,
  Omit<TreeNodeProps, "onExpanded" | "label" | "actions" | "aria-level" | "aria-posinset" | "aria-setsize" | "icon"> & { level: number }
>(({ level, ...props }, forwardedRef) => {
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
});
PlaceholderNode.displayName = "PlaceholderNode";

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
