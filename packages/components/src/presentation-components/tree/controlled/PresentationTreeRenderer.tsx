/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TreeModelSource, TreeNodeRendererProps, TreeRenderer, TreeRendererProps } from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { Presentation } from "@itwin/presentation-frontend";
import { convertToInstanceFilterDefinition } from "../../instance-filter-builder/InstanceFilterConverter";
import { PresentationInstanceFilterDialog } from "../../instance-filter-builder/PresentationInstanceFilterDialog";
import { PresentationInstanceFilterInfo } from "../../instance-filter-builder/Types";
import { IPresentationTreeDataProvider } from "../IPresentationTreeDataProvider";
import { FilterablePresentationTreeNodeItem, isFilterablePresentationTreeNodeItem, PresentationTreeNodeItem } from "../PresentationTreeNodeItem";
import { PresentationTreeNodeRenderer } from "./PresentationTreeNodeRenderer";
import { useHierarchyLevelFiltering } from "./UseHierarchyLevelFiltering";

/**
 * Props for [[PresentationTreeRenderer]] component.
 * @beta
 */
export interface PresentationTreeRendererProps extends TreeRendererProps {
  imodel: IModelConnection;
  modelSource: TreeModelSource;
  dataProvider: IPresentationTreeDataProvider;
}

/**
 * Tree renderer component that enables hierarchy level filtering in trees using [[PresentationTreeDataProvider]].
 * It renders tree nodes with action buttons for setting and clearing filters. [[PresentationInstanceFilterDialog]] is opened
 * for creating filters for hierarchy levels.
 * @beta
 */
export function PresentationTreeRenderer(props: PresentationTreeRendererProps) {
  const { imodel, modelSource, dataProvider, ...restProps } = props;
  const nodeLoader = restProps.nodeLoader;

  const { applyFilter, clearFilter } = useHierarchyLevelFiltering({ nodeLoader, modelSource });
  const [filterNode, setFilterNode] = useState<PresentationTreeNodeItem>();

  const filterableNodeRenderer = useCallback(
    (nodeProps: TreeNodeRendererProps) => {
      return (
        <PresentationTreeNodeRenderer
          {...nodeProps}
          onFilterClick={(node) => {
            setFilterNode(node);
          }}
          onClearFilterClick={clearFilter}
        />
      );
    },
    [clearFilter],
  );

  const divRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={divRef}>
      <TreeRenderer {...restProps} nodeRenderer={filterableNodeRenderer} />
      {divRef.current && filterNode && isFilterablePresentationTreeNodeItem(filterNode)
        ? createPortal(
            <TreeNodeFilterBuilderDialog
              imodel={imodel}
              dataProvider={dataProvider}
              onApply={(info) => {
                applyFilter(filterNode, info);
                setFilterNode(undefined);
              }}
              onClose={() => {
                setFilterNode(undefined);
              }}
              filterNode={filterNode}
            />,
            divRef.current.ownerDocument.body.querySelector(".iui-root") ?? divRef.current.ownerDocument.body,
          )
        : null}
    </div>
  );
}

interface TreeNodeFilterBuilderDialogProps {
  imodel: IModelConnection;
  dataProvider: IPresentationTreeDataProvider;
  filterNode: FilterablePresentationTreeNodeItem;
  onClose: () => void;
  onApply: (info: PresentationInstanceFilterInfo) => void;
}

function TreeNodeFilterBuilderDialog(props: TreeNodeFilterBuilderDialogProps) {
  const { onClose, onApply, imodel, filterNode, dataProvider } = props;
  const filteringInfo = filterNode.filtering;

  const getFilteredResultsCount = useCallback(
    async (filter: PresentationInstanceFilterInfo) => {
      const instanceFilter = await convertToInstanceFilterDefinition(filter.filter, imodel);
      return Presentation.presentation.getNodesCount({
        imodel,
        rulesetOrId: dataProvider.rulesetId,
        instanceFilter,
        parentKey: filterNode.key,
      });
    },
    [dataProvider, filterNode, imodel],
  );

  return (
    <PresentationInstanceFilterDialog
      isOpen={true}
      onClose={onClose}
      onApply={onApply}
      imodel={imodel}
      descriptor={filteringInfo.descriptor}
      initialFilter={filteringInfo.active}
      getFilteredResultsCount={getFilteredResultsCount}
    />
  );
}
