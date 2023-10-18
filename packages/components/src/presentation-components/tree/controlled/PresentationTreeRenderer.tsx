/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AbstractTreeNodeLoaderWithProvider,
  isTreeModelNode,
  TreeNodeRendererProps,
  TreeRenderer,
  TreeRendererProps,
  useDebouncedAsyncValue,
} from "@itwin/components-react";
import { NodeKey, PresentationError, PresentationStatus } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { translate } from "../../common/Utils";
import { convertToInstanceFilterDefinition } from "../../instance-filter-builder/InstanceFilterConverter";
import { PresentationInstanceFilterDialog } from "../../instance-filter-builder/PresentationInstanceFilterDialog";
import { PresentationInstanceFilterInfo } from "../../instance-filter-builder/Types";
import { IPresentationTreeDataProvider } from "../IPresentationTreeDataProvider";
import {
  FilterablePresentationTreeNodeItem,
  isFilterablePresentationTreeNodeItem,
  isPresentationTreeNodeItem,
  PresentationTreeNodeItem,
} from "../PresentationTreeNodeItem";
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
          onFilterClick={(nodeId) => {
            const node = nodeLoader.modelSource.getModel().getNode(nodeId);
            if (isTreeModelNode(node) && isPresentationTreeNodeItem(node.item)) {
              setFilterNode(node.item);
            }
          }}
          onClearFilterClick={clearFilter}
        />
      );
    },
    [clearFilter, nodeLoader.modelSource],
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
                applyFilter(filterNode.id, info);
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
      const requestOptions = dataProvider.createRequestOptions(parentKey, instanceFilter);

      try {
        const count = await Presentation.presentation.getNodesCount(requestOptions);
        return `${translate("tree.filter-dialog.results-count")}: ${count}`;
      } catch (e) {
        if (e instanceof PresentationError && e.errorNumber === PresentationStatus.ResultSetTooLarge) {
          // ResultSetTooLarge error can't occur if sizeLimit is undefined.
          return `${translate("tree.filter-dialog.result-limit-exceeded")} ${requestOptions.sizeLimit!}. ${translate("tree.please-provide")} ${translate(
            "tree.additional-filtering",
          )}.`;
        }
      }

      return undefined;
    }, [dataProvider, filter, parentKey]),
  );
  if (!value || inProgress) {
    return null;
  }
  return <>{value}</>;
}
