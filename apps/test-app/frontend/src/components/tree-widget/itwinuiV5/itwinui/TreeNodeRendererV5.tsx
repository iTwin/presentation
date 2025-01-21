/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

// import "./TreeNodeRenderer.css";
import cx from "classnames";
import { ComponentPropsWithoutRef, forwardRef, ReactElement, RefAttributes, useRef } from "react";
import { IconButton, Spinner, Tree } from "@itwin/itwinui-react-v5/bricks";
import { HierarchyLevelDetails, isPresentationHierarchyNode, PresentationHierarchyNode } from "@itwin/presentation-hierarchies-react";
import { UseTreeResult } from "../UseTree";
import { useLocalizationContext } from "./LocalizationContext";
import { ErrorNodeLabel, ResultSetTooLargeNodeLabel, ResultSetTooLargeNodeLabelProps, useMergedRefs } from "./TreeNodeRendererV5Utils";
import { RenderedTreeNode } from "./TreeRendererV5";

// Icons don't seem to work with tree actions right now
const filterIcon = new URL("@itwin/itwinui-icons/filter.svg", import.meta.url).href;
// These icons have not been added yet
const SvgRemove = new URL("@itwin/itwinui-icons/remove.svg", import.meta.url).href;
const SvgFilterHollow = new URL("@itwin/itwinui/filterhollow.svg", import.meta.url).href;

/** @public */
type TreeNodeProps = ComponentPropsWithoutRef<typeof Tree.Item>;

/** @public */
interface TreeNodeRendererOwnProps {
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
  /** Tree node size. Should match the size passed to `TreeRenderer` component. */
  size?: "default" | "small";
}

/** @public */
type TreeNodeRendererProps = Pick<UseTreeResult, "expandNode"> &
  Partial<Pick<UseTreeResult, "getHierarchyLevelDetails">> &
  Omit<TreeNodeProps, "label" | "onExpanded" | "onSelected" | "icon"> &
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
      // isDisabled,
      getHierarchyLevelDetails,
      reloadTree,
      size,
      ...treeItemProps
    },
    forwardedRef,
  ) => {
    const { localizedStrings } = useLocalizationContext();
    const applyFilterButtonRef = useRef<HTMLButtonElement>(null);
    const nodeRef = useRef<HTMLDivElement>(null);
    const ref = useMergedRefs(forwardedRef, nodeRef);
    const isDisabled = false; // TODO: needs to be discused if the prop is still needed
    if ("type" in node && node.type === "ChildrenPlaceholder") {
      return <PlaceholderNode {...treeItemProps} ref={ref} size={size} />;
    }

    if (isPresentationHierarchyNode(node)) {
      return (
        <Tree.Item
          {...treeItemProps}
          ref={ref}
          selected={selected}
          aria-disabled={isDisabled}
          className={cx(treeItemProps.className, "stateless-tree-node", { filtered: node.isFiltered })}
          onClick={(event) => !isDisabled && onNodeClick?.(node, !selected, event)}
          onKeyDown={(event) => {
            // Ignore if it is called on the element inside, e.g. checkbox or expander
            if (!isDisabled && event.target === nodeRef.current) {
              onNodeKeyDown?.(node, !selected, event);
            }
          }}
          onExpandedChange={(isExpanded) => {
            expandNode(node.id, isExpanded);
          }}
          icon={getIcon ? getIcon(node) : undefined}
          label={getLabel ? getLabel(node) : node.label}
          expanded={node.isExpanded || node.children === true || node.children.length > 0 ? node.isExpanded : undefined}
          actions={
            <>
              {getHierarchyLevelDetails && node.isFiltered ? (
                <IconButton
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
                  ref={applyFilterButtonRef}
                  className="filtering-action-button"
                  label={localizedStrings.filterHierarchyLevel}
                  onClick={(e) => {
                    e.stopPropagation();
                    const hierarchyLevelDetails = getHierarchyLevelDetails?.(node.id);
                    hierarchyLevelDetails && onFilterClick(hierarchyLevelDetails);
                  }}
                  icon={node.isFiltered ? filterIcon : SvgFilterHollow}
                />
              ) : undefined}
            </>
          }
        >
          {treeItemProps.children}
        </Tree.Item>
      );
    }

    if (node.type === "ResultSetTooLarge") {
      return (
        <ResultSetTooLargeNode
          {...treeItemProps}
          ref={ref}
          limit={node.resultSetSizeLimit}
          onOverrideLimit={getHierarchyLevelDetails ? (limit) => getHierarchyLevelDetails(node.parentNodeId)?.setSizeLimit(limit) : undefined}
          onFilterClick={
            onFilterClick
              ? () => {
                  const hierarchyLevelDetails = getHierarchyLevelDetails?.(node.parentNodeId);
                  hierarchyLevelDetails && onFilterClick(hierarchyLevelDetails);
                }
              : undefined
          }
        />
      );
    }

    if (node.type === "NoFilterMatches") {
      return <Tree.Item {...treeItemProps} ref={ref} label={localizedStrings.noFilteredChildren} aria-disabled={true} />;
    }

    const onRetry = reloadTree ? () => reloadTree({ parentNodeId: node.parentNodeId, state: "reset" }) : undefined;
    return <Tree.Item {...treeItemProps} ref={ref} label={<ErrorNodeLabel message={node.message} onRetry={onRetry} />} aria-disabled={true} />;
  },
);
TreeNodeRenderer.displayName = "TreeNodeRenderer";

const PlaceholderNode = forwardRef<
  HTMLDivElement,
  Omit<TreeNodeProps, "onExpanded" | "label"> & {
    size?: "default" | "small";
  }
>(({ size, ...props }, forwardedRef) => {
  const { localizedStrings } = useLocalizationContext();
  return (
    <Tree.Item
      {...props}
      ref={forwardedRef}
      label={localizedStrings.loading}
      icon={
        <Spinner size="small" title={localizedStrings.loading} className={cx(props.className, { "stateless-tree-node-small-spinner": size === "small" })} />
      }
    />
  );
});
PlaceholderNode.displayName = "PlaceholderNode";

const ResultSetTooLargeNode = forwardRef<HTMLDivElement, Omit<TreeNodeProps, "onExpanded" | "label"> & ResultSetTooLargeNodeLabelProps>(
  ({ onFilterClick, onOverrideLimit, limit, ...props }, forwardedRef) => {
    return (
      <Tree.Item
        {...props}
        ref={forwardedRef}
        className="stateless-tree-node"
        label={<ResultSetTooLargeNodeLabel limit={limit} onFilterClick={onFilterClick} onOverrideLimit={onOverrideLimit} />}
      />
    );
  },
);
ResultSetTooLargeNode.displayName = "ResultSetTooLargeNode";
