/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./Tree.css";
import cx from "classnames";
import { ComponentPropsWithoutRef, ReactElement, useCallback } from "react";
import { SvgFilter, SvgFilterHollow, SvgRemove } from "@itwin/itwinui-icons-react";
import { Button, IconButton, ProgressRadial, Tree, TreeNode } from "@itwin/itwinui-react";
import { isPresentationHierarchyNode, PresentationHierarchyNode, PresentationTreeNode } from "./Types";
import { HierarchyLevelFilteringOptions, useTree } from "./UseTree";

interface TreeRendererProps extends Omit<ReturnType<typeof useTree>, "rootNodes" | "isLoading"> {
  rootNodes: PresentationTreeNode[];
  onFilterClick: (filteringInfo: HierarchyLevelFilteringOptions) => void;
  getIcon?: (node: PresentationHierarchyNode) => ReactElement | undefined;
}

export function TreeRenderer({
  rootNodes,
  expandNode,
  selectNode,
  isNodeSelected,
  setHierarchyLevelLimit,
  getHierarchyLevelFilteringOptions,
  removeHierarchyLevelFilter,
  onFilterClick,
  getIcon,
}: TreeRendererProps) {
  const nodeRenderer = useCallback<TreeProps<PresentationTreeNode>["nodeRenderer"]>(
    ({ node, ...restProps }) => {
      if (isPresentationHierarchyNode(node)) {
        return (
          <TreeNode
            {...restProps}
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
                onClick={(e) => {
                  removeHierarchyLevelFilter(node.id);
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
                onClick={(e) => {
                  const options = getHierarchyLevelFilteringOptions(node.id);
                  if (options) {
                    onFilterClick(options);
                  }
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
        return <PlaceholderNode {...restProps} label={node.message} />;
      }

      if (node.type === "ResultSetTooLarge") {
        return <ResultSetTooLargeNode {...restProps} label={node.message} onRemoveLimit={() => setHierarchyLevelLimit(node.parentNodeId, "unbounded")} />;
      }
      return <TreeNode {...restProps} label={node.message} isDisabled={true} onExpanded={() => {}} />;
    },
    [expandNode, selectNode, setHierarchyLevelLimit, getHierarchyLevelFilteringOptions, removeHierarchyLevelFilter, onFilterClick, getIcon],
  );

  const getNode = useCallback<TreeProps<PresentationTreeNode>["getNode"]>(
    (node) => {
      if (!isPresentationHierarchyNode(node)) {
        return {
          nodeId: node.id,
          node,
          hasSubNodes: false,
          isExpanded: false,
          isSelected: false,
          isDisabled: true,
        };
      }
      return {
        nodeId: node.id,
        node,
        hasSubNodes: node.children === true || node.children.length > 0,
        subNodes:
          // returns placeholder node to show as child while children is loading.
          node.children === true
            ? [
                {
                  id: `Loading-${node.id}`,
                  parentNodeId: node.id,
                  type: "ChildrenPlaceholder",
                  message: "Loading...",
                },
              ]
            : node.children,
        isExpanded: node.isExpanded,
        isSelected: isNodeSelected(node.id),
      };
    },
    [isNodeSelected],
  );

  return (
    <div
      style={{
        width: "100%",
        overflow: "auto",
      }}
    >
      <Tree<PresentationTreeNode> data={rootNodes} nodeRenderer={nodeRenderer} getNode={getNode} enableVirtualization={true} />
    </div>
  );
}

function PlaceholderNode(props: Omit<TreeNodeProps, "onExpanded">) {
  return <TreeNode {...props} icon={<ProgressRadial size="x-small" indeterminate />} onExpanded={() => {}}></TreeNode>;
}

function ResultSetTooLargeNode({ onRemoveLimit, ...props }: Omit<TreeNodeProps, "onExpanded"> & { onRemoveLimit: () => void }) {
  return (
    <TreeNode {...props} onExpanded={() => {}}>
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

type TreeProps<T> = ComponentPropsWithoutRef<typeof Tree<T>>;
type TreeNodeProps = ComponentPropsWithoutRef<typeof TreeNode>;
