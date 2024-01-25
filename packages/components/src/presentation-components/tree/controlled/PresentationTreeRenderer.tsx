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
import { PresentationInstanceFilter, PresentationInstanceFilterInfo } from "../../instance-filter-builder/PresentationFilterBuilder";
import { PresentationInstanceFilterDialog } from "../../instance-filter-builder/PresentationInstanceFilterDialog";
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
 * Return type of [[useFilterablePresentationTree]] hook.
 * @beta
 */
export interface FilterableTreeProps {
  onFilterClick: (nodeId: string) => void;
  onClearFilterClick: (nodeId: string) => void;
  /** Reference of the document body. Needs to be passed to the root of the tree for the filter dialog to be placed separately from the tree context. */
  containerRef: React.Ref<HTMLDivElement>;
  filterDialog: React.ReactPortal | null;
}

/**
 * Props for [[useFilterablePresentationTree]] hook.
 * @beta
 */
export interface useFilterablePresentationTreeProps {
  nodeLoader: AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>;
}

/**
 * Hook that enables hierarchy level filtering with action handlers for setting and clearing filters.
 * @beta
 */
export function useFilterablePresentationTree({ nodeLoader }: useFilterablePresentationTreeProps): FilterableTreeProps {
  const { applyFilter, clearFilter } = useHierarchyLevelFiltering({ nodeLoader, modelSource: nodeLoader.modelSource });
  const [filterNode, setFilterNode] = useState<PresentationTreeNodeItem>();

  const ref = useRef<HTMLDivElement>(null);

  const filterDialog =
    ref.current && filterNode && isFilterablePresentationTreeNodeItem(filterNode)
      ? createPortal(
          <TreeNodeFilterBuilderDialog
            dataProvider={nodeLoader.dataProvider}
            onApply={(info) => {
              info === undefined ? clearFilter(filterNode.id) : applyFilter(filterNode.id, info);
              setFilterNode(undefined);
            }}
            onClose={() => {
              setFilterNode(undefined);
            }}
            filterNode={filterNode}
          />,
          ref.current.ownerDocument.body.querySelector(".iui-root") ?? ref.current.ownerDocument.body,
        )
      : null;

  return {
    onFilterClick: (nodeId: string) => {
      const node = nodeLoader.modelSource.getModel().getNode(nodeId);
      if (isTreeModelNode(node) && isPresentationTreeNodeItem(node.item)) {
        setFilterNode(node.item);
      }
    },
    onClearFilterClick: clearFilter,
    containerRef: ref,
    filterDialog,
  };
}

/**
 * Tree renderer component that enables hierarchy level filtering in trees using [[PresentationTreeDataProvider]].
 * It renders tree nodes with action buttons for setting and clearing filters. [[PresentationInstanceFilterDialog]] is opened
 * for creating filters for hierarchy levels.
 * @beta
 */
export function PresentationTreeRenderer(props: PresentationTreeRendererProps) {
  const { onClearFilterClick, onFilterClick, containerRef, filterDialog } = useFilterablePresentationTree({ nodeLoader: props.nodeLoader });
  const filterableNodeRenderer = (nodeProps: TreeNodeRendererProps) => {
    return <PresentationTreeNodeRenderer {...nodeProps} onFilterClick={onFilterClick} onClearFilterClick={onClearFilterClick} />;
  };

  return (
    <div ref={containerRef}>
      <TreeRenderer {...props} nodeRenderer={filterableNodeRenderer} />
      {filterDialog}
    </div>
  );
}

interface TreeNodeFilterBuilderDialogProps {
  dataProvider: IPresentationTreeDataProvider;
  filterNode: FilterablePresentationTreeNodeItem;
  onClose: () => void;
  onApply: (info?: PresentationInstanceFilterInfo) => void;
}

function TreeNodeFilterBuilderDialog(props: TreeNodeFilterBuilderDialogProps) {
  const { filterNode, dataProvider, ...restProps } = props;
  const filteringInfo = filterNode.filtering;
  const descriptorInputKeys = useMemo(() => [filterNode.key], [filterNode.key]);
  const imodel = dataProvider.imodel;

  return (
    <PresentationInstanceFilterDialog
      {...restProps}
      isOpen={true}
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
      const instanceFilter = await PresentationInstanceFilter.toInstanceFilterDefinition(filter.filter, dataProvider.imodel, filter.usedClasses);
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
