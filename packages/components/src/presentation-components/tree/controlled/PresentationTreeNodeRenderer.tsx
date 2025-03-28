/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */
/** @packageDocumentation
 * @module Tree
 */

import "./PresentationTreeNodeRenderer.scss";
import classnames from "classnames";
import { TreeNodeRenderer, TreeNodeRendererProps } from "@itwin/components-react";
import { TreeNode } from "@itwin/core-react";
import { SvgCloseSmall, SvgFilter, SvgFilterHollow } from "@itwin/itwinui-icons-react";
import { Anchor, ButtonGroup, IconButton, Text } from "@itwin/itwinui-react";
import { translate } from "../../common/Utils.js";
import { InfoTreeNodeItemType, isPresentationInfoTreeNodeItem, isPresentationTreeNodeItem } from "../PresentationTreeNodeItem.js";

/**
 * Props for [[PresentationTreeNodeRenderer]] component.
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export interface PresentationTreeNodeRendererProps extends TreeNodeRendererProps {
  onFilterClick: (nodeId: string) => void;
  onClearFilterClick: (nodeId: string) => void;
}

/**
 * Component for rendering tree nodes produced by [[PresentationTreeDataProvider]]. Additionally to the default
 * tree node renderer, it renders action buttons for filterable hierarchy levels and also correctly renders
 * nodes that carry info messages.
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export function PresentationTreeNodeRenderer(props: PresentationTreeNodeRendererProps) {
  const { onFilterClick, onClearFilterClick, ...restProps } = props;
  const nodeItem = props.node.item;

  if (isPresentationInfoTreeNodeItem(nodeItem)) {
    return (
      // `PresentationTreeNodeRenderer` is about to be deprecated itself, so no point in resolving the TreeNode deprecation

      <TreeNode
        isLeaf={true}
        label={
          <span>
            <Text isMuted className="info-tree-node-item">
              {nodeItem.type === InfoTreeNodeItemType.ResultSetTooLarge && (
                <span>
                  <span>{`${translate("tree.please-provide")} `}</span>
                  <Anchor
                    onClick={() => {
                      if (nodeItem.parentId !== undefined) {
                        onFilterClick(nodeItem.parentId);
                      }
                    }}
                  >
                    {`${translate("tree.additional-filtering")}`}
                  </Anchor>
                  <span> - </span>
                </span>
              )}
              <span>{nodeItem.message}</span>
            </Text>
          </span>
        }
        level={props.node.depth}
        isHoverDisabled={true}
      />
    );
  }

  if (isPresentationTreeNodeItem(nodeItem)) {
    // hide filtering buttons if filtering is disabled explicitly or node is not filtered and has no children
    const filteringDisabled = nodeItem.filtering === undefined || (nodeItem.filtering.active === undefined && props.node.numChildren === 0);
    return (
      <TreeNodeRenderer {...restProps} className={classnames("presentation-components-node", restProps.className)}>
        <PresentationTreeNodeActions
          isFiltered={nodeItem.filtering?.active !== undefined}
          filteringDisabled={filteringDisabled}
          onClearFilterClick={() => {
            onClearFilterClick(nodeItem.id);
          }}
          onFilterClick={() => {
            onFilterClick(nodeItem.id);
          }}
        />
      </TreeNodeRenderer>
    );
  }

  return <TreeNodeRenderer {...restProps} />;
}

interface PresentationTreeNodeActionsProps {
  onFilterClick: () => void;
  onClearFilterClick: () => void;
  filteringDisabled?: boolean;
  isFiltered?: boolean;
}

function PresentationTreeNodeActions(props: PresentationTreeNodeActionsProps) {
  const { onFilterClick, onClearFilterClick, filteringDisabled, isFiltered } = props;
  if (filteringDisabled) {
    return null;
  }

  return (
    <div className={classnames("presentation-components-node-action-buttons", isFiltered && "filtered")}>
      <ButtonGroup>
        {isFiltered ? (
          <IconButton
            className="presentation-components-node-action-button"
            styleType="borderless"
            size="small"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onClearFilterClick();
            }}
            label={translate("tree.clear-hierarchy-level-filter")}
          >
            <SvgCloseSmall />
          </IconButton>
        ) : null}
        <IconButton
          className="presentation-components-node-action-button"
          styleType="borderless"
          size="small"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onFilterClick();
          }}
          label={translate("tree.filter-hierarchy-level")}
        >
          {isFiltered ? <SvgFilter /> : <SvgFilterHollow />}
        </IconButton>
      </ButtonGroup>
    </div>
  );
}
