/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AbstractTreeNodeLoaderWithProvider, TreeNodeRendererProps, TreeRenderer, TreeRendererProps } from "@itwin/components-react";
import { Presentation } from "@itwin/presentation-frontend";
import { convertToInstanceFilterDefinition } from "../../instance-filter-builder/InstanceFilterConverter";
import { PresentationInstanceFilterDialog } from "../../instance-filter-builder/PresentationInstanceFilterDialog";
import { PresentationInstanceFilterInfo } from "../../instance-filter-builder/Types";
import { FilterablePresentationTreeNodeItem, isFilterablePresentationTreeNodeItem, PresentationTreeNodeItem } from "../PresentationTreeNodeItem";
import { PresentationTreeNodeRenderer } from "./PresentationTreeNodeRenderer";
import { useHierarchyLevelFiltering } from "./UseHierarchyLevelFiltering";
import { IPresentationTreeDataProvider } from "../IPresentationTreeDataProvider";

/**
 * Props for [[PresentationTreeRenderer]] component.
 * @beta
 */
export interface PresentationTreeRendererProps extends TreeRendererProps {
  nodeLoader: AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>;
}

/**
 * Tree renderer component that enables hierarchy level filtering in trees using [[PresentationTreeDataProvider]].
 * It renders tree nodes with action buttons for setting and clearing filters. [[PresentationInstanceFilterDialog]] is opened
 * for creating filters for hierarchy levels.
 * @beta
 */
export function PresentationTreeRenderer(props: PresentationTreeRendererProps) {
  const nodeLoader = props.nodeLoader;

  const { applyFilter, clearFilter } = useHierarchyLevelFiltering({ nodeLoader, modelSource: nodeLoader.modelSource });
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
      <TreeRenderer {...props} nodeRenderer={filterableNodeRenderer} />
      {divRef.current && filterNode && isFilterablePresentationTreeNodeItem(filterNode)
        ? createPortal(
            <TreeNodeFilterBuilderDialog
              dataProvider={nodeLoader.dataProvider}
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
  dataProvider: IPresentationTreeDataProvider;
  filterNode: FilterablePresentationTreeNodeItem;
  onClose: () => void;
  onApply: (info: PresentationInstanceFilterInfo) => void;
}

function TreeNodeFilterBuilderDialog(props: TreeNodeFilterBuilderDialogProps) {
  const { onClose, onApply, filterNode, dataProvider } = props;
  const filteringInfo = filterNode.filtering;
  const imodel = dataProvider.imodel;

  const getFilteredResultsCount = useCallback(
    async (filter: PresentationInstanceFilterInfo) => {
      const instanceFilter = await convertToInstanceFilterDefinition(filter.filter, imodel);
      return Presentation.presentation.getNodesCount(dataProvider.createRequestOptions(filterNode.key, instanceFilter));
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
