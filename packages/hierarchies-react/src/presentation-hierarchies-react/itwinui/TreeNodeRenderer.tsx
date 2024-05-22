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
  if ("type" in node && node.type === "ChildrenPlaceholder") {
    return <PlaceholderNode {...nodeProps} label={null} />;
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
                title="Clear active filter"
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
                title="Apply filter"
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
    return <TreeNode {...nodeProps} label="No child nodes match current filter" isDisabled={true} onExpanded={/* istanbul ignore next */ () => {}} />;
  }

  return <TreeNode {...nodeProps} label={node.message} isDisabled={true} onExpanded={/* istanbul ignore next */ () => {}} />;
}

function PlaceholderNode(props: Omit<TreeNodeProps, "onExpanded">) {
  return (
    <TreeNode {...props} icon={<ProgressRadial size="x-small" indeterminate title="Loading..." />} onExpanded={/* istanbul ignore next */ () => {}}></TreeNode>
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
  const supportsLimitOverride = !!onOverrideLimit && limit < MAX_LIMIT_OVERRIDE;
  const supportsFiltering = !!onFilterClick;
  const currLimitStr = limit.toLocaleString(undefined, { useGrouping: true });
  const maxLimitOverrideStr = MAX_LIMIT_OVERRIDE.toLocaleString(undefined, { useGrouping: true });
  const title = `${supportsFiltering ? `Please provide additional filtering - there` : `There`} are more items than allowed limit of ${currLimitStr}.${
    supportsLimitOverride ? ` ${supportsFiltering ? "Or, increase" : "Increase"} the hierarchy level size limit to ${maxLimitOverrideStr}.` : ""
  }`;
  return (
    <Flex flexDirection="column" gap="3xs" title={title} alignItems="start">
      {supportsFiltering ? (
        <Flex flexDirection="row" gap="3xs">
          <Text>Please provide</Text>
          <Anchor
            underline
            onClick={(e) => {
              e.stopPropagation();
              onFilterClick();
            }}
          >
            additional filtering
          </Anchor>
          <Text>- there are more items than allowed limit of {currLimitStr}.</Text>
        </Flex>
      ) : (
        <Text>There are more items than allowed limit of {currLimitStr}.</Text>
      )}
      {supportsLimitOverride ? (
        <Flex flexDirection="row" gap="3xs">
          {supportsFiltering ? <Text>Or,</Text> : null}
          <Anchor
            underline
            onClick={(e) => {
              e.stopPropagation();
              onOverrideLimit(MAX_LIMIT_OVERRIDE);
            }}
          >
            {supportsFiltering ? "increase" : "Increase"} hierarchy level size limit to {maxLimitOverrideStr}.
          </Anchor>
        </Flex>
      ) : null}
    </Flex>
  );
}
