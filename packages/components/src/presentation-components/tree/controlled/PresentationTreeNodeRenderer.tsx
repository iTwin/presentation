/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import "./PresentationTreeNodeRenderer.scss";
import classnames from "classnames";
import { TreeNodeRenderer, TreeNodeRendererProps } from "@itwin/components-react";
import { TreeNode, UnderlinedButton } from "@itwin/core-react";
import { SvgCloseSmall, SvgFilter, SvgFilterHollow } from "@itwin/itwinui-icons-react";
import { ButtonGroup, IconButton, Text } from "@itwin/itwinui-react";
import { translate } from "../../common/Utils";
import { InfoTreeNodeItemType, isPresentationInfoTreeNodeItem, isPresentationTreeNodeItem } from "../PresentationTreeNodeItem";

/**
 * Props for [[PresentationTreeNodeRenderer]] component.
 * @beta
 */
export interface PresentationTreeNodeRendererProps extends TreeNodeRendererProps {
  onFilterClick: (nodeId: string) => void;
  onClearFilterClick: (nodeId: string) => void;
}

/**
 * Component for rendering tree nodes produced by [[PresentationTreeDataProvider]]. Additionally to the default
 * tree node renderer, it renders action buttons for filterable hierarchy levels and also correctly renders
 * nodes that carry info messages.
 * @beta
 */
export function PresentationTreeNodeRenderer(props: PresentationTreeNodeRendererProps) {
  const { onFilterClick, onClearFilterClick, ...restProps } = props;
  const nodeItem = props.node.item;

  if (isPresentationInfoTreeNodeItem(nodeItem)) {
    return (
      <TreeNode
        isLeaf={true}
        label={
          <span>
            <Text isMuted className="info-tree-node-item">
              {nodeItem.type === InfoTreeNodeItemType.ResultSetTooLarge && (
                <span>
                  <span>Provide </span>
                  <UnderlinedButton
                    onClick={() => {
                      if (nodeItem.parentId !== undefined) {
                        onFilterClick(nodeItem.parentId);
                      }
                    }}
                  >
                    {`${translate("tree.additional-filtering")}`}
                  </UnderlinedButton>
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
            styleType="borderless"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onClearFilterClick();
            }}
            title={translate("tree.clear-hierarchy-level-filter")}
          >
            <SvgCloseSmall />
          </IconButton>
        ) : null}
        <IconButton
          styleType="borderless"
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onFilterClick();
          }}
          title={translate("tree.filter-hierarchy-level")}
        >
          {isFiltered ? <SvgFilter /> : <SvgFilterHollow />}
        </IconButton>
      </ButtonGroup>
    </div>
  );
}
