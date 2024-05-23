/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./TreeNodeRenderer.css";
import cx from "classnames";
import { ComponentPropsWithoutRef, ReactElement } from "react";
import { SvgFilter, SvgFilterHollow, SvgRemove } from "@itwin/itwinui-icons-react";
import { Anchor, ButtonGroup, Flex, IconButton, ProgressRadial, Text, TreeNode } from "@itwin/itwinui-react";
import { MAX_LIMIT_OVERRIDE } from "../internal/Utils";
import { isPresentationHierarchyNode, PresentationHierarchyNode } from "../TreeNode";
import { useTree } from "../UseTree";
import { useLocalizationContext } from "./LocalizationContext";
import { RenderedTreeNode } from "./TreeRenderer";

type TreeNodeProps = ComponentPropsWithoutRef<typeof TreeNode>;

interface TreeNodeRendererOwnProps {
  node: RenderedTreeNode;
  onFilterClick?: (nodeId: string | undefined) => void;
  getIcon?: (node: PresentationHierarchyNode) => ReactElement | undefined;
  onNodeClick?: (nodeId: string, isSelected: boolean, event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
  onNodeKeyDown?: (nodeId: string, isSelected: boolean, event: React.KeyboardEvent<HTMLElement>) => void;
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
  onFilterClick,
  onNodeClick,
  onNodeKeyDown,
  isSelected,
  isDisabled,
  actionButtonsClassName,
  getHierarchyLevelDetails,
  ...nodeProps
}: TreeNodeRendererProps) {
  const { localizedStrings } = useLocalizationContext();
  if ("type" in node && node.type === "ChildrenPlaceholder") {
    return <PlaceholderNode {...nodeProps} />;
  }

  if (isPresentationHierarchyNode(node)) {
    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div
        onClick={(event) => !isDisabled && onNodeClick?.(node.id, !isSelected, event)}
        onKeyDown={(event) => {
          // Ignore if it is called on the element inside, e.g. checkbox or expander
          if (!isDisabled && event.target instanceof HTMLElement && event.target.classList.contains("stateless-tree-node")) {
            onNodeKeyDown?.(node.id, !isSelected, event);
          }
        }}
      >
        <TreeNode
          {...nodeProps}
          isSelected={isSelected}
          isDisabled={isDisabled}
          className={cx(nodeProps.className, "stateless-tree-node", { filtered: node.isFiltered })}
          label={node.label}
          onExpanded={(_, isExpanded) => {
            expandNode(node.id, isExpanded);
          }}
          icon={getIcon ? getIcon(node) : undefined}
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
                  onFilterClick(node.id);
                }}
              >
                {node.isFiltered ? <SvgFilter /> : <SvgFilterHollow />}
              </IconButton>
            ) : null}
          </ButtonGroup>
        </TreeNode>
      </div>
    );
  }

  if (node.type === "ResultSetTooLarge") {
    return (
      <ResultSetTooLargeNode
        {...nodeProps}
        limit={node.resultSetSizeLimit}
        onOverrideLimit={getHierarchyLevelDetails ? (limit) => getHierarchyLevelDetails(node.parentNodeId)?.setSizeLimit(limit) : undefined}
        onFilterClick={
          onFilterClick
            ? () => {
                onFilterClick(node.parentNodeId);
              }
            : undefined
        }
      />
    );
  }

  if (node.type === "NoFilterMatches") {
    return <TreeNode {...nodeProps} label={localizedStrings.noFilteredChildren} isDisabled={true} onExpanded={/* istanbul ignore next */ () => {}} />;
  }

  return <TreeNode {...nodeProps} label={node.message} isDisabled={true} onExpanded={/* istanbul ignore next */ () => {}} />;
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
