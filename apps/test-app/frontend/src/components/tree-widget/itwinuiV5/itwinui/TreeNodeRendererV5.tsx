/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ComponentPropsWithoutRef, forwardRef, LegacyRef, MutableRefObject, ReactElement, Ref, RefAttributes, useCallback, useRef } from "react";
import { IconButton, Spinner, Tree } from "@itwin/itwinui-react-v5/bricks";
import { HierarchyLevelDetails, isPresentationHierarchyNode, PresentationHierarchyNode, useTree } from "@itwin/presentation-hierarchies-react";
import { useLocalizationContext } from "./LocalizationContext";
import { TreeErrorRenderer } from "./TreeErrorRendererV5";
import { RenderedTreeNode } from "./TreeRendererV5";

// Icons don't seem to work with tree actions right now
const filterIcon = new URL("@itwin/itwinui-icons/filter.svg", import.meta.url).href;
// These icons have not been added yet
const SvgRemove = new URL("@itwin/itwinui-icons/remove.svg", import.meta.url).href;
// const SvgFilterHollow = new URL("@itwin/itwinui/filterhollow.svg", import.meta.url).href;

/** @public */
type TreeNodeProps = ComponentPropsWithoutRef<typeof Tree.Item>;

/** @public */
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
}

/** @public */
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
      ...treeItemProps
    },
    forwardedRef,
  ) => {
    const nodeRef = useRef<HTMLDivElement>(null);
    const ref = useMergedRefs(forwardedRef, nodeRef);
    const { localizedStrings } = useLocalizationContext();
    const applyFilterButtonRef = useRef<HTMLButtonElement>(null);

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
        {getHierarchyLevelDetails && node.isFiltered ? (
          <IconButton
            style={{ position: "relative" }} // for button to work, should be fixed by kiwi
            className="filtering-action-button"
            label={localizedStrings.clearHierarchyLevelFilter}
            onClick={(e) => {
              e.stopPropagation();
              getHierarchyLevelDetails(node.id)?.setInstanceFilter(undefined);
              applyFilterButtonRef.current?.focus();
            }}
            icon={SvgRemove}
          />
        ) : null}
        {onFilterClick && node.isFilterable ? (
          <IconButton
            style={{ position: "relative" }} // for icons to be visible, should be fixed by kiwi
            ref={applyFilterButtonRef}
            className="filtering-action-button"
            label={localizedStrings.filterHierarchyLevel}
            onClick={(e) => {
              e.stopPropagation();
              const hierarchyLevelDetails = getHierarchyLevelDetails?.(node.id);
              hierarchyLevelDetails && onFilterClick(hierarchyLevelDetails);
            }}
            icon={node.isFiltered ? filterIcon : filterIcon} // currently base filter icon is hollow
          />
        ) : undefined}
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
