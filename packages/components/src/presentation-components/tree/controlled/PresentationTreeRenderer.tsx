/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AbstractTreeNodeLoaderWithProvider, TreeNodeRendererProps, TreeRenderer, TreeRendererProps, useDebouncedAsyncValue } from "@itwin/components-react";
import { Text } from "@itwin/itwinui-react";
import { NodeKey, PresentationError, PresentationStatus } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { translate } from "../../common/Utils";
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
          getTreeModel={props.visibleNodes.getModel}
          onFilterClick={(node) => {
            setFilterNode(node);
          }}
          onClearFilterClick={clearFilter}
        />
      );
    },
    [props.visibleNodes.getModel, clearFilter],
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
  const descriptorInputKeys = useMemo(() => [filterNode.key], [filterNode.key]);
  const imodel = dataProvider.imodel;

  return (
    <PresentationInstanceFilterDialog
      isOpen={true}
      onClose={onClose}
      onApply={onApply}
      imodel={imodel}
      descriptor={filteringInfo.descriptor}
      initialFilter={filteringInfo.active}
      descriptorInputKeys={descriptorInputKeys}
      filterResultsCountRenderer={(filter) => <MatchingInstancesCount dataProvider={dataProvider} filter={filter} parentKey={filterNode.key} />}
    />
  );
}

interface MatchingInstancesCountProps {
  filter: PresentationInstanceFilterInfo;
  dataProvider: IPresentationTreeDataProvider;
  parentKey: NodeKey;
}

function MatchingInstancesCount({ filter, dataProvider, parentKey }: MatchingInstancesCountProps) {
  const { value, inProgress } = useDebouncedAsyncValue(
    useCallback(async () => {
      const instanceFilter = await convertToInstanceFilterDefinition(filter.filter, dataProvider.imodel);

      try {
        const count = await Presentation.presentation.getNodesCount(dataProvider.createRequestOptions(parentKey, instanceFilter));
        return <>{`${translate("tree.filter-dialog.results-count")}: ${count}`}</>;
      } catch (e) {
        if (e instanceof PresentationError && e.errorNumber === PresentationStatus.ResultSetTooLarge) {
          return (
            <Text isMuted className="info-tree-node-item">
              {`${translate("tree.filter-dialog.results-count-too-large")}. ${translate("tree.filtering-needed")}`}
            </Text>
          );
        }
      }

      return undefined;
    }, [dataProvider, filter, parentKey]),
  );
  if (!value || inProgress) {
    return null;
  }
  return value;
}
