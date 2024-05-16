/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./TreeNodeRenderer.css";
import cx from "classnames";
import { ComponentPropsWithoutRef, ReactElement } from "react";
import { SvgFilter, SvgFilterHollow, SvgRemove } from "@itwin/itwinui-icons-react";
import { Button, IconButton, ProgressRadial, TreeNode } from "@itwin/itwinui-react";
import { isPresentationHierarchyNode, PresentationHierarchyNode, PresentationTreeNode } from "./Types";
import { useTree } from "./UseTree";

interface TreeNodeRendererOwnProps {
  node: PresentationTreeNode;
  onFilterClick: (nodeId: string) => void;
  getIcon?: (node: PresentationHierarchyNode) => ReactElement | undefined;
  onNodeClick: (nodeId: string, isSelected: boolean, event: React.MouseEvent<HTMLElement, MouseEvent>) => void;
  onNodeKeyDown: (nodeId: string, isSelected: boolean, event: React.KeyboardEvent<HTMLElement>) => void;
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
  ...nodeProps
}: TreeNodeRendererProps) {
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
          className={cx("stateless-tree-node", { filtered: node.isFiltered })}
          label={node.label}
          onExpanded={(_, isExpanded) => {
            expandNode(node.id, isExpanded);
          }}
          icon={getIcon ? getIcon(node) : undefined}
        >
          {node.isFiltered ? (
            <IconButton
              className="filtering-action-button"
              styleType="borderless"
              size="small"
              title="Clear active filter"
              onClick={(e) => {
                setHierarchyLevelFilter(node.id, undefined);
                e.stopPropagation();
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
              title="Apply filter"
              onClick={(e) => {
                onFilterClick(node.id);
                e.stopPropagation();
              }}
            >
              {node.isFiltered ? <SvgFilter /> : <SvgFilterHollow />}
            </IconButton>
          ) : null}
        </TreeNode>
      </div>
    );
  }

  if (node.type === "ChildrenPlaceholder") {
    return <PlaceholderNode {...nodeProps} label={node.message} />;
  }

  if (node.type === "ResultSetTooLarge") {
    return <ResultSetTooLargeNode {...nodeProps} label={node.message} onRemoveLimit={() => setHierarchyLevelLimit(node.parentNodeId, "unbounded")} />;
  }
  return <TreeNode {...nodeProps} label={node.message} isDisabled={true} onExpanded={/* istanbul ignore next */ () => {}} />;
}

function PlaceholderNode(props: Omit<TreeNodeProps, "onExpanded">) {
  return <TreeNode {...props} icon={<ProgressRadial size="x-small" indeterminate />} onExpanded={/* istanbul ignore next */ () => {}}></TreeNode>;
}

function ResultSetTooLargeNode({ onRemoveLimit, ...props }: Omit<TreeNodeProps, "onExpanded"> & { onRemoveLimit: () => void }) {
  return (
    <TreeNode {...props} onExpanded={/* istanbul ignore next */ () => {}}>
      <Button
        styleType="borderless"
        size="small"
        onClick={(e) => {
          onRemoveLimit();
          e.stopPropagation();
        }}
      >
        Remove Limit
      </Button>
    </TreeNode>
  );
}

type TreeNodeProps = ComponentPropsWithoutRef<typeof TreeNode>;
