/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./TreeNodeRenderer.css";
import cx from "classnames";
import { ComponentPropsWithoutRef, ReactElement, useRef } from "react";
import { SvgFilter, SvgFilterHollow, SvgRemove } from "@itwin/itwinui-icons-react";
import { Anchor, ButtonGroup, Flex, IconButton, ProgressRadial, Text, TreeNode } from "@itwin/itwinui-react";
import { MAX_LIMIT_OVERRIDE } from "../internal/Utils";
import { isPresentationHierarchyNode, PresentationHierarchyNode } from "../TreeNode";
import { HierarchyLevelDetails, useTree } from "../UseTree";
import { useLocalizationContext } from "./LocalizationContext";
import { RenderedTreeNode } from "./TreeRenderer";

type TreeNodeProps = ComponentPropsWithoutRef<typeof TreeNode>;

interface TreeNodeRendererOwnProps {
  node: RenderedTreeNode;
  onFilterClick?: (hierarchyLevelDetails: HierarchyLevelDetails) => void;
  getIcon?: (node: PresentationHierarchyNode) => ReactElement | undefined;
  getLabel?: (node: PresentationHierarchyNode) => ReactElement | undefined;
  getSublabel?: (node: PresentationHierarchyNode) => ReactElement | undefined;
  onNodeClick?: (node: PresentationHierarchyNode, isSelected: boolean, event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
  onNodeKeyDown?: (node: PresentationHierarchyNode, isSelected: boolean, event: React.KeyboardEvent<HTMLElement>) => void;
  actionButtonsClassName?: string;
}

type TreeNodeRendererProps = Pick<ReturnType<typeof useTree>, "expandNode"> &
  Partial<Pick<ReturnType<typeof useTree>, "getHierarchyLevelDetails">> &
  Omit<TreeNodeProps, "label" | "onExpanded" | "onSelected" | "icon"> &
  TreeNodeRendererOwnProps;

/**
 * A component that renders `RenderedTreeNode` using the `TreeNode` component from `@itwin/itwinui-react`.
 *
 * @see `TreeRenderer`
 * @see https://itwinui.bentley.com/docs/tree
 * @beta
 */
export function TreeNodeRenderer({
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
  nodeProps,
  ...treeNodeProps
}: TreeNodeRendererProps) {
  const { localizedStrings } = useLocalizationContext();
  const nodeRef = useRef<HTMLDivElement>(null);

  if ("type" in node && node.type === "ChildrenPlaceholder") {
    return <PlaceholderNode {...treeNodeProps} />;
  }

  if (isPresentationHierarchyNode(node)) {
    return (
      <TreeNode
        {...treeNodeProps}
        nodeProps={{
          ...nodeProps,
          ref: nodeRef,
          tabIndex: nodeProps?.tabIndex ?? 0,
          onClick: (event) => !isDisabled && onNodeClick?.(node, !isSelected, event),
          onKeyDown: (event) => {
            // Ignore if it is called on the element inside, e.g. checkbox or expander
            if (!isDisabled && event.target === nodeRef.current) {
              onNodeKeyDown?.(node, !isSelected, event);
            }
          },
        }}
        isSelected={isSelected}
        isDisabled={isDisabled}
        className={cx(treeNodeProps.className, "stateless-tree-node", { filtered: node.isFiltered })}
        onExpanded={(_, isExpanded) => {
          expandNode(node.id, isExpanded);
        }}
        icon={getIcon ? getIcon(node) : undefined}
        label={getLabel ? getLabel(node) : node.label}
        sublabel={getSublabel ? getSublabel(node) : undefined}
      >
        <ButtonGroup className={cx("action-buttons", actionButtonsClassName)}>
          {getHierarchyLevelDetails && node.isFiltered ? (
            <IconButton
              className="filtering-action-button"
              styleType="borderless"
              size="small"
              title={localizedStrings.clearHierarchyLevelFilter}
              onClick={(e) => {
                e.stopPropagation();
                getHierarchyLevelDetails(node.id)?.setInstanceFilter(undefined);
              }}
            >
              <SvgRemove />
            </IconButton>
          ) : null}
          {onFilterClick && node.isFilterable ? (
            <IconButton
              className="filtering-action-button"
              styleType="borderless"
              size="small"
              title={localizedStrings.filterHierarchyLevel}
              onClick={(e) => {
                e.stopPropagation();
                const hierarchyLevelDetails = getHierarchyLevelDetails?.(node.id);
                hierarchyLevelDetails && onFilterClick(hierarchyLevelDetails);
              }}
            >
              {node.isFiltered ? <SvgFilter /> : <SvgFilterHollow />}
            </IconButton>
          ) : null}
        </ButtonGroup>
      </TreeNode>
    );
  }

  if (node.type === "ResultSetTooLarge") {
    return (
      <ResultSetTooLargeNode
        {...treeNodeProps}
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
    return <TreeNode {...treeNodeProps} label={localizedStrings.noFilteredChildren} isDisabled={true} onExpanded={/* istanbul ignore next */ () => {}} />;
  }

  return <TreeNode {...treeNodeProps} label={node.message} isDisabled={true} onExpanded={/* istanbul ignore next */ () => {}} />;
}

function PlaceholderNode(props: Omit<TreeNodeProps, "onExpanded" | "label">) {
  const { localizedStrings } = useLocalizationContext();
  return (
    <TreeNode
      {...props}
      label={localizedStrings.loading}
      icon={<ProgressRadial size="x-small" indeterminate title={localizedStrings.loading} />}
      onExpanded={/* istanbul ignore next */ () => {}}
    ></TreeNode>
  );
}

function ResultSetTooLargeNode({
  onFilterClick,
  onOverrideLimit,
  limit,
  ...props
}: Omit<TreeNodeProps, "onExpanded" | "label"> & ResultSetTooLargeNodeLabelProps) {
  return (
    <TreeNode
      {...props}
      className="stateless-tree-node"
      label={<ResultSetTooLargeNodeLabel limit={limit} onFilterClick={onFilterClick} onOverrideLimit={onOverrideLimit} />}
      onExpanded={/* istanbul ignore next */ () => {}}
    />
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

function createLocalizedMessage(message: string, limit: number, onClick?: () => void) {
  const limitStr = limit.toLocaleString(undefined, { useGrouping: true });
  const messageWithLimit = message.replace("{{limit}}", limitStr);
  const exp = new RegExp("<link>(.*)</link>");
  const match = messageWithLimit.match(exp);

  if (!match) {
    return {
      title: messageWithLimit,
      element: (
        <Flex flexDirection="row" gap="3xs">
          <Text>{messageWithLimit}</Text>
        </Flex>
      ),
    };
  }

  const [fullText, innerText] = match;
  const [textBefore, textAfter] = messageWithLimit.split(fullText);

  return {
    title: messageWithLimit.replace(fullText, innerText),
    element: (
      <Flex flexDirection="row" gap="3xs">
        {textBefore ? <Text>{textBefore}</Text> : null}
        <Anchor
          underline
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
        >
          {innerText}
        </Anchor>
        {textAfter ? <Text>{textAfter}</Text> : null}
      </Flex>
    ),
  };
}
