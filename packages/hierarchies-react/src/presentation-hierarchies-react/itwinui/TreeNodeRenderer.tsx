/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, forwardRef, LegacyRef, MutableRefObject, ReactElement, Ref, RefAttributes, useCallback, useRef } from "react";
import { Spinner, Tree } from "@itwin/itwinui-react/bricks";
import { isPresentationHierarchyNode, PresentationHierarchyNode } from "../TreeNode.js";
import { HierarchyLevelDetails, useTree } from "../UseTree.js";
import { useLocalizationContext } from "./LocalizationContext.js";
import { FilterActionButton, RemoveFilterActionButton } from "./TreeActionButtons.js";
import { TreeErrorRenderer } from "./TreeErrorRenderer.js";
import { RenderedTreeNode } from "./TreeRenderer.js";

/** @alpha */
type TreeNodeProps = Omit<ComponentPropsWithoutRef<typeof Tree.Item>, "actions">;

/** @alpha */
export interface TreeNodeRendererOwnProps {
  /** Node that is rendered. */
  node: RenderedTreeNode;
  /** Action to perform when the filter button is clicked for this node. */
  onFilterClick?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;
  /** Returns an icon or icon href for a given node. */
  getIcon?: (node: PresentationHierarchyNode) => string | ReactElement | undefined;
  /** Returns a label for a given node. */
  getLabel?: (node: PresentationHierarchyNode) => ReactElement | undefined;
  /** Returns sublabel for a given node. */
  getSublabel?: (node: PresentationHierarchyNode) => ReactElement | undefined;
  /** Action to perform when the node is clicked. */
  onNodeClick?: (node: PresentationHierarchyNode, isSelected: boolean, event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
  /** Action to perform when a key is pressed when the node is hovered on. */
  onNodeKeyDown?: (node: PresentationHierarchyNode, isSelected: boolean, event: React.KeyboardEvent<HTMLElement>) => void;
  /** A callback to reload a hierarchy level when an error occurs and `retry` button is clicked. */
  reloadTree?: (options: { parentNodeId: string | undefined; state: "reset" }) => void;
  /** CSS class name for the action buttons. */
  actionButtonsClassName?: string;
  /** Renderer for additional tree items actions */
  actionsRenderer?: (node: PresentationHierarchyNode) => ReactElement;
}

/** @alpha */
type TreeNodeRendererProps = Pick<ReturnType<typeof useTree>, "expandNode"> &
  Partial<Pick<ReturnType<typeof useTree>, "getHierarchyLevelDetails">> &
  Omit<TreeNodeProps, "label" | "icon"> &
  TreeNodeRendererOwnProps;

/**
 * A component that renders `RenderedTreeNode` using the `TreeNode` component from `@itwin/itwinui-react`.
 *
 * @see `TreeRenderer`
 * @see https://itwinui.bentley.com/docs/tree
 * @public
 */
export const TreeNodeRenderer: React.ForwardRefExoticComponent<TreeNodeRendererProps & RefAttributes<HTMLDivElement>> = forwardRef(
  (
    {
      node,
      expandNode,
      getIcon,
      getLabel,
      onFilterClick,
      onNodeClick,
      onNodeKeyDown,
      selected,
      getHierarchyLevelDetails,
      reloadTree,
      children,
      actionRenderers,
      ...treeItemProps
    },
    forwardedRef,
  ) => {
    const nodeRef = useRef<HTMLDivElement>(null);
    const ref = useMergedRefs(forwardedRef, nodeRef);

    if ("type" in node && node.type === "ChildrenPlaceholder") {
      return <PlaceholderNode {...treeItemProps} ref={ref} />;
    }

    if (!isPresentationHierarchyNode(node)) {
      return (
        <TreeErrorRenderer node={node} getHierarchyLevelDetails={getHierarchyLevelDetails} reloadTree={reloadTree} onFilterClick={onFilterClick} ref={ref} />
      );
    }

    const isDisabled = false;
    const ActionButtons = () => (
      <>
        {actionRenderers && actionRenderers(node)}
        <RemoveFilterActionButton node={node} getHierarchyLevelDetails={getHierarchyLevelDetails} />
        <FilterActionButton node={node} onClick={onFilterClick} getHierarchyLevelDetails={getHierarchyLevelDetails} />
      </>
    );

    return (
      <Tree.Item
        ref={ref}
        label={getLabel ? getLabel(node) : node.label}
        selected={selected}
        expanded={node.isExpanded || node.children === true || node.children.length > 0 ? node.isExpanded : undefined}
        aria-disabled={isDisabled}
        onExpandedChange={(isExpanded) => {
          expandNode(node.id, isExpanded);
        }}
        onClick={(event) => !isDisabled && onNodeClick?.(node, !selected, event)} // need a unified selection for mouse clicks and key down
        onKeyDown={(event) => {
          // Ignore if it is called on the element inside, e.g. checkbox or expander
          if (!isDisabled && event.target === nodeRef.current) {
            onNodeKeyDown?.(node, !selected, event);
          }
        }}
        icon={getIcon ? getIcon(node) : undefined}
        actions={<ActionButtons />}
      >
        {children}
      </Tree.Item>
    );
  },
);
TreeNodeRenderer.displayName = "TreeNodeRenderer";

const PlaceholderNode = forwardRef<HTMLDivElement, Omit<TreeNodeProps, "onExpanded" | "label">>(({ ...props }, forwardedRef) => {
  const { localizedStrings } = useLocalizationContext();
  return <Tree.Item {...props} ref={forwardedRef} label={localizedStrings.loading} icon={<Spinner size={"small"} title={localizedStrings.loading} />} />;
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
