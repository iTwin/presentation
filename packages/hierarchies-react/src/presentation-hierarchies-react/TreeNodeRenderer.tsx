/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./TreeNodeRenderer.css";
import cx from "classnames";
import { ComponentPropsWithoutRef, ReactElement } from "react";
import { SvgFilter, SvgFilterHollow, SvgRemove } from "@itwin/itwinui-icons-react";
import { Anchor, ButtonGroup, Flex, IconButton, ProgressRadial, Text, TreeNode } from "@itwin/itwinui-react";
import { MAX_LIMIT_OVERRIDE } from "./internal/Utils";
import { useLocalizationContext } from "./LocalizationContext";
import { isPresentationHierarchyNode, PresentationHierarchyNode, PresentationTreeNode } from "./Types";
import { useTree } from "./UseTree";

type TreeNodeProps = ComponentPropsWithoutRef<typeof TreeNode>;

interface TreeNodeRendererOwnProps {
  node: PresentationTreeNode;
  onFilterClick: (nodeId: string | undefined) => void;
  getIcon?: (node: PresentationHierarchyNode) => ReactElement | undefined;
  onNodeClick: (nodeId: string, isSelected: boolean, event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
  onNodeKeyDown: (nodeId: string, isSelected: boolean, event: React.KeyboardEvent<HTMLElement>) => void;
  actionButtonsClassName?: string;
}

type TreeNodeRendererProps = Pick<ReturnType<typeof useTree>, "expandNode" | "setHierarchyLevelFilter" | "setHierarchyLevelLimit"> &
  Omit<TreeNodeProps, "label" | "onExpanded" | "onSelected" | "icon"> &
  TreeNodeRendererOwnProps;

/** @beta */
export function TreeNodeRenderer({
  node,
  expandNode,
  getIcon,
  setHierarchyLevelFilter,
  onFilterClick,
  onNodeClick,
  onNodeKeyDown,
  setHierarchyLevelLimit,
  isSelected,
  isDisabled,
  actionButtonsClassName,
  ...nodeProps
}: TreeNodeRendererProps) {
  const { localization } = useLocalizationContext();
  if (isPresentationHierarchyNode(node)) {
    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div
        onClick={(event) => !isDisabled && onNodeClick(node.id, !isSelected, event)}
        onKeyDown={(event) => {
          // Ignore if it is called on the element inside, e.g. checkbox or expander
          if (!isDisabled && event.target instanceof HTMLElement && event.target.classList.contains("stateless-tree-node")) {
            onNodeKeyDown(node.id, !isSelected, event);
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
            {node.isFiltered ? (
              <IconButton
                className="filtering-action-button"
                styleType="borderless"
                size="small"
                title={localization.clearHierarchyLevelFilter}
                onClick={(e) => {
                  e.stopPropagation();
                  setHierarchyLevelFilter(node.id, undefined);
                }}
              >
                <SvgRemove />
              </IconButton>
            ) : null}
            {node.isFilterable ? (
              <IconButton
                className="filtering-action-button"
                styleType="borderless"
                size="small"
                title={localization.filterHierarchyLevel}
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

  if (node.type === "ChildrenPlaceholder") {
    return <PlaceholderNode {...nodeProps} />;
  }

  if (node.type === "ResultSetTooLarge") {
    return (
      <ResultSetTooLargeNode
        {...nodeProps}
        limit={node.resultSetSizeLimit}
        onOverrideLimit={(limit) => setHierarchyLevelLimit(node.parentNodeId, limit)}
        onFilterClick={() => {
          onFilterClick(node.parentNodeId);
        }}
      />
    );
  }

  if (node.type === "NoFilterMatchingNodes") {
    return <NoFilterMatchingNode {...nodeProps} />;
  }
  return <TreeNode {...nodeProps} label={node.message} isDisabled={true} onExpanded={/* istanbul ignore next */ () => {}} />;
}

function PlaceholderNode(props: Omit<TreeNodeProps, "onExpanded" | "label">) {
  const { localization } = useLocalizationContext();
  return (
    <TreeNode
      {...props}
      label={localization.loading}
      icon={<ProgressRadial size="x-small" indeterminate />}
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
  onFilterClick: () => void;
  onOverrideLimit: (limit: number) => void;
}

function ResultSetTooLargeNodeLabel({ onFilterClick, onOverrideLimit, limit }: ResultSetTooLargeNodeLabelProps) {
  const { localization } = useLocalizationContext();
  return (
    <Flex
      flexDirection="column"
      gap="3xs"
      title={`${localization.pleaseProvide} ${localization.additionalFiltering} - ${localization.resultLimitExceeded} ${limit}. ${localization.increaseHierarchyLimit}`}
      alignItems="start"
    >
      <Flex flexDirection="row" gap="3xs">
        <Text>{localization.pleaseProvide}</Text>
        <Anchor
          underline
          onClick={(e) => {
            e.stopPropagation();
            onFilterClick();
          }}
        >
          {localization.additionalFiltering}
        </Anchor>
        <Text>{`- ${localization.resultLimitExceeded} ${limit}.`}</Text>
      </Flex>
      {limit < MAX_LIMIT_OVERRIDE ? (
        <Flex flexDirection="row" gap="3xs">
          <Anchor
            underline
            onClick={(e) => {
              e.stopPropagation();
              onOverrideLimit(MAX_LIMIT_OVERRIDE);
            }}
          >
            {`${localization.increaseHierarchyLimitTo} ${MAX_LIMIT_OVERRIDE}`}
          </Anchor>
        </Flex>
      ) : null}
    </Flex>
  );
}

function NoFilterMatchingNode(props: Omit<TreeNodeProps, "onExpanded" | "label">) {
  const { localization } = useLocalizationContext();
  return <TreeNode {...props} label={localization.noFilteredChildren} isDisabled={true} onExpanded={/* istanbul ignore next */ () => {}} />;
}
