/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */
import { useCallback, useMemo, useState } from "react";
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
import { createInstanceFilterDefinition, PresentationInstanceFilterInfo } from "../../instance-filter-builder/PresentationFilterBuilder";
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
 * @public
 */
export interface PresentationTreeRendererProps extends Omit<TreeRendererProps, "nodeRenderer"> {
  nodeLoader: AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>;
  onFilterApplied?: () => void;
}

/**
 * Return type of [[useFilterablePresentationTree]] hook.
 * @public
 */
export interface FilterableTreeProps {
  onFilterClick: (nodeId: string) => void;
  onClearFilterClick: (nodeId: string) => void;
  filterDialog: React.ReactNode | null;
}

/**
 * Props for [[useFilterablePresentationTree]] hook.
 * @public
 */
export interface useFilterablePresentationTreeProps {
  nodeLoader: AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>;
  onFilterApplied?: () => void;
}

/**
 * Hook that enables hierarchy level filtering with action handlers for setting and clearing filters.
 * @public
 */
export function useFilterablePresentationTree({ nodeLoader, onFilterApplied }: useFilterablePresentationTreeProps): FilterableTreeProps {
  const { applyFilter, clearFilter } = useHierarchyLevelFiltering({ nodeLoader, modelSource: nodeLoader.modelSource });
  const [filterNode, setFilterNode] = useState<PresentationTreeNodeItem>();

  const filterDialog =
    filterNode && isFilterablePresentationTreeNodeItem(filterNode) ? (
      <TreeNodeFilterBuilderDialog
        dataProvider={nodeLoader.dataProvider}
        onApply={(info) => {
          if (info === undefined) {
            clearFilter(filterNode.id);
          } else {
            applyFilter(filterNode.id, info);
            onFilterApplied?.();
          }
          setFilterNode(undefined);
        }}
        onClose={() => {
          setFilterNode(undefined);
        }}
        filterNode={filterNode}
      />
    ) : null;

  return {
    onFilterClick: (nodeId: string) => {
      const node = nodeLoader.modelSource.getModel().getNode(nodeId);
      if (isTreeModelNode(node) && isPresentationTreeNodeItem(node.item)) {
        setFilterNode(node.item);
      }
    },
    onClearFilterClick: clearFilter,
    filterDialog,
  };
}

/**
 * Tree renderer component that enables hierarchy level filtering in trees using [[PresentationTreeDataProvider]].
 * It renders tree nodes with action buttons for setting and clearing filters. [[PresentationInstanceFilterDialog]] is opened
 * for creating filters for hierarchy levels.
 * @public
 */
export function PresentationTreeRenderer(props: PresentationTreeRendererProps) {
  const { onClearFilterClick, onFilterClick, filterDialog } = useFilterablePresentationTree({
    nodeLoader: props.nodeLoader,
    onFilterApplied: props.onFilterApplied,
  });
  const filterableNodeRenderer = (nodeProps: TreeNodeRendererProps) => {
    return <PresentationTreeNodeRenderer {...nodeProps} onFilterClick={onFilterClick} onClearFilterClick={onClearFilterClick} />;
  };

  return (
    <div>
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
  const imodel = dataProvider.imodel;

  const propertiesSource = useMemo(() => {
    if (typeof filteringInfo.descriptor === "function") {
      const descriptorGetter = filteringInfo.descriptor;
      return async () => {
        const descriptor = await descriptorGetter();
        return {
          descriptor,
          inputKeys: [filterNode.key],
        };
      };
    }

    return {
      descriptor: filteringInfo.descriptor,
      inputKeys: [filterNode.key],
    };
  }, [filteringInfo.descriptor, filterNode.key]);

  return (
    <PresentationInstanceFilterDialog
      {...restProps}
      isOpen={true}
      imodel={imodel}
      propertiesSource={propertiesSource}
      initialFilter={filteringInfo.active}
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
      const instanceFilter = await createInstanceFilterDefinition(filter, dataProvider.imodel);
      const requestOptions = dataProvider.createRequestOptions(parentKey, instanceFilter);

      try {
        const count = await Presentation.presentation.getNodesCount(requestOptions);
        return `${translate("tree.filter-dialog.results-count")}: ${count}`;
      } catch (e) {
        if (e instanceof PresentationError && e.errorNumber === PresentationStatus.ResultSetTooLarge) {
          // ResultSetTooLarge error can't occur if sizeLimit is undefined.
          return translate("tree.filter-dialog.result-limit-exceeded", { itemCount: requestOptions.sizeLimit!.toString() });
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
