/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./TreeNodeRenderer.css";
import cx from "classnames";
import { SvgFilter, SvgFilterHollow, SvgRemove } from "@itwin/itwinui-icons-react";
import { Button, IconButton, ProgressRadial, TreeNode } from "@itwin/itwinui-react";
import { ComponentPropsWithoutRef, ReactElement } from "react";
import { isPresentationHierarchyNode, PresentationHierarchyNode, PresentationTreeNode } from "./Types";
import { useTree } from "./UseTree";

interface TreeNodeRendererOwnProps {
  node: PresentationTreeNode;
  onFilterClick: (nodeId: string) => void;
  getIcon?: (node: PresentationHierarchyNode) => ReactElement | undefined;
}

type TreeNodeRendererProps = Pick<ReturnType<typeof useTree>, "expandNode" | "selectNode" | "setHierarchyLevelFilter" | "setHierarchyLevelLimit"> &
  Omit<TreeNodeProps, "label" | "onExpanded" | "onSelected" | "icon"> &
  TreeNodeRendererOwnProps;

/** @beta */
export function TreeNodeRenderer({
  node,
  expandNode,
  selectNode,
  getIcon,
  setHierarchyLevelFilter,
  onFilterClick,
  setHierarchyLevelLimit,
  ...nodeProps
}: TreeNodeRendererProps) {
  if (isPresentationHierarchyNode(node)) {
    return (
      <TreeNode
        {...nodeProps}
        className={cx("stateless-tree-node", { filtered: node.isFiltered })}
        label={node.label}
        onExpanded={(_, isExpanded) => {
          expandNode(node.id, isExpanded);
        }}
        onSelected={(_, isSelected) => {
          selectNode(node.id, isSelected);
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
