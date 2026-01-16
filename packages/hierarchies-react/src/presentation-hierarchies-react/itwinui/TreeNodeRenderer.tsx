/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./TreeNodeRenderer.css";

import cx from "classnames";
import { ComponentPropsWithoutRef, forwardRef, LegacyRef, MutableRefObject, ReactElement, Ref, RefAttributes, useCallback, useEffect, useRef } from "react";
import { SvgFilter, SvgFilterHollow, SvgMore, SvgRemove } from "@itwin/itwinui-icons-react";
import { Anchor, ButtonGroup, DropdownMenu, Flex, IconButton, MenuItem, ProgressRadial, Text, TreeNode } from "@itwin/itwinui-react";
import { HierarchyNode } from "@itwin/presentation-hierarchies";
import { MAX_LIMIT_OVERRIDE } from "../internal/Utils.js";
import { isPresentationHierarchyNode, PresentationHierarchyNode } from "../TreeNode.js";
import { HierarchyLevelDetails, UseTreeResult } from "../UseTree.js";
import { useLocalizationContext } from "./LocalizationContext.js";
import { RenderedTreeNode } from "./TreeRenderer.js";

/** @public */
type TreeNodeProps = ComponentPropsWithoutRef<typeof TreeNode>;

/** @public */
export interface TreeNodeActionDefinition {
  label: string;
  icon: ReactElement;
  onClick: () => void;
}

/** @public */
interface TreeNodeRendererOwnProps {
  /** Node that is rendered. */
  node: RenderedTreeNode;
  /** Action to perform when the filter button is clicked for this node. */
  onFilterClick?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;
  /** Returns an icon for a given node. */
  getIcon?: (node: PresentationHierarchyNode) => ReactElement | undefined;
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
  /**
   * Configures filter buttons visibility.
   *
   * Options:
   * - `show-on-hover` - show filter buttons when hovering over node, or the node is in focus.
   * - `hide` - hide filter buttons, but will show them if the filter is applied.
   *
   * Default value: `show-on-hover`
   */
  filterButtonsVisibility?: "show-on-hover" | "hide";
  /**
   * Additional actions that should be rendered for specific hierarchy node.
   */
  getActions?: (node: PresentationHierarchyNode) => TreeNodeActionDefinition[];
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
      getSublabel,
      onFilterClick,
      onNodeClick,
      onNodeKeyDown,
      isSelected,
      isDisabled,
      actionButtonsClassName,
      getHierarchyLevelDetails,
      reloadTree,
      size,
      filterButtonsVisibility,
      getActions,
      ...treeNodeProps
    },
    forwardedRef,
  ) => {
    const { localizedStrings } = useLocalizationContext();
    if ("type" in node && node.type === "ChildrenPlaceholder") {
      return <PlaceholderNode {...treeNodeProps} ref={forwardedRef} size={size} />;
    }

    if (isPresentationHierarchyNode(node)) {
      return (
        <HierarchyNodeRenderer
          {...treeNodeProps}
          ref={forwardedRef}
          node={node}
          expandNode={expandNode}
          getIcon={getIcon}
          getLabel={getLabel}
          getSublabel={getSublabel}
          onFilterClick={onFilterClick}
          onNodeClick={onNodeClick}
          onNodeKeyDown={onNodeKeyDown}
          isSelected={isSelected}
          isDisabled={isDisabled}
          actionButtonsClassName={actionButtonsClassName}
          getHierarchyLevelDetails={getHierarchyLevelDetails}
          filterButtonsVisibility={filterButtonsVisibility}
          getActions={getActions}
        />
      );
    }

    if (node.type === "ResultSetTooLarge") {
      const hierarchyLevelDetails = getHierarchyLevelDetails?.(node.parentNodeId);
      const isFilterable =
        hierarchyLevelDetails?.hierarchyNode &&
        !HierarchyNode.isGroupingNode(hierarchyLevelDetails.hierarchyNode) &&
        hierarchyLevelDetails.hierarchyNode.supportsFiltering;
      return (
        <ResultSetTooLargeNode
          {...treeNodeProps}
          ref={forwardedRef}
          limit={node.resultSetSizeLimit}
          onOverrideLimit={hierarchyLevelDetails ? (limit) => hierarchyLevelDetails.setSizeLimit(limit) : undefined}
          onFilterClick={
            onFilterClick && hierarchyLevelDetails && isFilterable
              ? () => {
                  onFilterClick(hierarchyLevelDetails);
                }
              : undefined
          }
        />
      );
    }

    if (node.type === "NoFilterMatches") {
      return (
        <TreeNode
          {...treeNodeProps}
          className="stateless-tree-node"
          ref={forwardedRef}
          label={localizedStrings.noFilteredChildren}
          isDisabled={true}
          onExpanded={/* c8 ignore next */ () => {}}
        />
      );
    }

    const onRetry = reloadTree ? () => reloadTree({ parentNodeId: node.parentNodeId, state: "reset" }) : undefined;
    return (
      <TreeNode
        {...treeNodeProps}
        className="stateless-tree-node"
        ref={forwardedRef}
        label={<ErrorNodeLabel message={node.message} onRetry={onRetry} />}
        isDisabled={true}
        onExpanded={/* c8 ignore next */ () => {}}
      />
    );
  },
);
TreeNodeRenderer.displayName = "TreeNodeRenderer";

type HierarchyNodeRendererProps = Omit<TreeNodeRendererProps, "node" | "reloadTree" | "size"> & {
  node: PresentationHierarchyNode;
};

const HierarchyNodeRenderer = forwardRef<HTMLDivElement, HierarchyNodeRendererProps>(
  (
    {
      node,
      expandNode,
      getIcon,
      getLabel,
      getSublabel,
      onFilterClick,
      onNodeClick,
      onNodeKeyDown,
      isSelected,
      isDisabled,
      actionButtonsClassName,
      getHierarchyLevelDetails,
      filterButtonsVisibility,
      getActions,
      ...treeNodeProps
    },
    forwardedRef,
  ) => {
    const nodeRef = useRef<HTMLDivElement>(null);
    const ref = useMergedRefs(forwardedRef, nodeRef);

    return (
      <TreeNode
        {...treeNodeProps}
        ref={ref}
        isSelected={isSelected}
        isDisabled={isDisabled}
        className={cx(treeNodeProps.className, "stateless-tree-node", { filtered: node.isFiltered, selected: isSelected })}
        onClick={(event) => !isDisabled && onNodeClick?.(node, !isSelected, event)}
        onKeyDown={(event) => {
          // Ignore if it is called on the element inside, e.g. checkbox or expander
          if (!isDisabled && event.target === nodeRef.current) {
            onNodeKeyDown?.(node, !isSelected, event);
          }
        }}
        onExpanded={(_, isExpanded) => {
          expandNode(node.id, isExpanded);
        }}
        icon={getIcon ? getIcon(node) : undefined}
        label={getLabel ? getLabel(node) : node.label}
        sublabel={getSublabel ? getSublabel(node) : undefined}
        // TODO: review if this is needed when horizontal scroll is enabled back after fix for issue: https://github.com/iTwin/iTwinUI/issues/2330
        title={node.label}
        contentProps={{ className: "stateless-tree-node-content" }}
      >
        <TreeNodeActions
          node={node}
          getHierarchyLevelDetails={getHierarchyLevelDetails}
          onFilterClick={onFilterClick}
          filterButtonsVisibility={filterButtonsVisibility}
          actionButtonsClassName={actionButtonsClassName}
          getActions={getActions}
        />
      </TreeNode>
    );
  },
);
HierarchyNodeRenderer.displayName = "HierarchyNodeRenderer";

const PlaceholderNode = forwardRef<
  HTMLDivElement,
  Omit<TreeNodeProps, "onExpanded" | "label"> & {
    size?: "default" | "small";
  }
>(({ size, ...props }, forwardedRef) => {
  const { localizedStrings } = useLocalizationContext();
  return (
    <TreeNode
      {...props}
      ref={forwardedRef}
      className="stateless-tree-node"
      label={localizedStrings.loading}
      icon={
        <ProgressRadial
          size="x-small"
          indeterminate
          title={localizedStrings.loading}
          className={cx(props.className, { "stateless-tree-node-small-spinner": size === "small" })}
        />
      }
      onExpanded={/* c8 ignore next */ () => {}}
    />
  );
});
PlaceholderNode.displayName = "PlaceholderNode";

const ResultSetTooLargeNode = forwardRef<HTMLDivElement, Omit<TreeNodeProps, "onExpanded" | "label"> & ResultSetTooLargeNodeLabelProps>(
  ({ onFilterClick, onOverrideLimit, limit, ...props }, forwardedRef) => {
    return (
      <TreeNode
        {...props}
        ref={forwardedRef}
        className="stateless-tree-node"
        label={<ResultSetTooLargeNodeLabel limit={limit} onFilterClick={onFilterClick} onOverrideLimit={onOverrideLimit} />}
        onExpanded={/* c8 ignore next */ () => {}}
        isDisabled={true}
      />
    );
  },
);
ResultSetTooLargeNode.displayName = "ResultSetTooLargeNode";

function ErrorNodeLabel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { localizedStrings } = useLocalizationContext();
  return (
    <Flex flexDirection="row" gap="xs" title={message} alignItems="start">
      <Text>{message}</Text>
      {onRetry ? <Anchor onClick={onRetry}>{localizedStrings?.retry}</Anchor> : null}
    </Flex>
  );
}

function TreeNodeActions({
  node,
  getHierarchyLevelDetails,
  onFilterClick,
  filterButtonsVisibility,
  actionButtonsClassName,
  getActions,
}: Pick<
  HierarchyNodeRendererProps,
  "node" | "actionButtonsClassName" | "getHierarchyLevelDetails" | "filterButtonsVisibility" | "getActions" | "onFilterClick"
>) {
  const { localizedStrings } = useLocalizationContext();
  const applyFilterButtonRef = useRef<HTMLButtonElement>(null);
  const prevIsFiltered = useRef(node.isFiltered);
  useEffect(() => {
    // If the node is filtered, focus the apply filter button
    if (node.isFiltered && !prevIsFiltered.current) {
      applyFilterButtonRef.current?.focus();
    }
    prevIsFiltered.current = node.isFiltered;
  }, [node.isFiltered]);

  const additionalButtons = getActions ? getActions(node) : [];
  const isClearFilterVisible = getHierarchyLevelDetails && node.isFiltered;
  const isFilterVisible = onFilterClick && node.isFilterable && (filterButtonsVisibility !== "hide" || node.isFiltered);

  const renderAdditionalActions = () => {
    if (additionalButtons.length === 1) {
      const button = additionalButtons[0];
      return (
        <IconButton
          styleType="borderless"
          size="small"
          label={button.label}
          onClick={(e) => {
            e.stopPropagation();
            button.onClick();
          }}
        >
          {button.icon}
        </IconButton>
      );
    }

    if (additionalButtons.length > 1) {
      return (
        <DropdownMenu
          menuItems={(close) =>
            additionalButtons.map((button, index) => (
              <MenuItem
                key={index}
                startIcon={button.icon}
                onClick={() => {
                  button.onClick();
                  close();
                }}
              >
                {button.label}
              </MenuItem>
            ))
          }
        >
          <IconButton styleType="borderless" size="small" label={localizedStrings.more} onClick={(e) => e.stopPropagation()}>
            <SvgMore />
          </IconButton>
        </DropdownMenu>
      );
    }

    return null;
  };

  return (
    <ButtonGroup className={cx("action-buttons", actionButtonsClassName)}>
      {isClearFilterVisible ? (
        <IconButton
          styleType="borderless"
          size="small"
          label={localizedStrings.clearHierarchyLevelFilter}
          onClick={(e) => {
            e.stopPropagation();
            getHierarchyLevelDetails(node.id)?.setInstanceFilter(undefined);
            applyFilterButtonRef.current?.focus();
          }}
        >
          <SvgRemove />
        </IconButton>
      ) : null}
      {isFilterVisible ? (
        <IconButton
          ref={applyFilterButtonRef}
          styleType="borderless"
          size="small"
          label={localizedStrings.filterHierarchyLevel}
          onClick={(e) => {
            e.stopPropagation();
            const hierarchyLevelDetails = getHierarchyLevelDetails?.(node.id);
            hierarchyLevelDetails && onFilterClick(hierarchyLevelDetails);
          }}
        >
          {node.isFiltered ? <SvgFilter /> : <SvgFilterHollow />}
        </IconButton>
      ) : null}
      {renderAdditionalActions()}
    </ButtonGroup>
  );
}

interface ResultSetTooLargeNodeLabelProps {
  limit: number;
  onFilterClick?: () => void;
  onOverrideLimit?: (limit: number) => void;
}

function ResultSetTooLargeNodeLabel({ onFilterClick, onOverrideLimit, limit }: ResultSetTooLargeNodeLabelProps) {
  const { localizedStrings } = useLocalizationContext();
  const supportsFiltering = !!onFilterClick;
  const supportsLimitOverride = !!onOverrideLimit && limit < MAX_LIMIT_OVERRIDE;

  const limitExceededMessage = createLocalizedMessage(
    supportsFiltering ? localizedStrings.resultLimitExceededWithFiltering : localizedStrings.resultLimitExceeded,
    limit,
    onFilterClick,
  );
  const increaseLimitMessage = supportsLimitOverride
    ? createLocalizedMessage(
        supportsFiltering ? localizedStrings.increaseHierarchyLimitWithFiltering : localizedStrings.increaseHierarchyLimit,
        MAX_LIMIT_OVERRIDE,
        () => onOverrideLimit(MAX_LIMIT_OVERRIDE),
      )
    : { title: "", element: null };

  const title = `${limitExceededMessage.title} ${increaseLimitMessage.title}`;

  return (
    <Flex flexDirection="column" gap="3xs" title={title} alignItems="start">
      {limitExceededMessage.element}
      {increaseLimitMessage.element}
    </Flex>
  );
}

const LINK_TAG_REGEX = /<link>(.*?)<\/link>/;

function createLocalizedMessage(message: string, limit: number, onClick?: () => void) {
  const limitStr = limit.toLocaleString(undefined, { useGrouping: true });
  const messageWithLimit = message.replace("{{limit}}", limitStr);
  const match = messageWithLimit.match(LINK_TAG_REGEX);

  if (!match) {
    return {
      title: messageWithLimit,
      element: (
        <Text as="span" style={{ whiteSpace: "normal" }}>
          {messageWithLimit}
        </Text>
      ),
    };
  }

  const [fullText, innerText] = match;
  const [textBefore, textAfter] = messageWithLimit.split(fullText);

  return {
    title: messageWithLimit.replace(fullText, innerText),
    element: (
      <div>
        {textBefore ? (
          <Text as="span" style={{ whiteSpace: "normal" }}>
            {textBefore}
          </Text>
        ) : null}
        <Anchor
          style={{ whiteSpace: "normal" }}
          underline
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
        >
          {innerText}
        </Anchor>
        {textAfter ? (
          <Text as="span" style={{ whiteSpace: "normal" }}>
            {textAfter}
          </Text>
        ) : null}
      </div>
    ),
  };
}

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
