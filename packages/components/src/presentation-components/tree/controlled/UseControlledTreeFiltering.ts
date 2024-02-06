/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { useCallback, useMemo } from "react";
import { of } from "rxjs";
import { Observable } from "rxjs/internal/Observable";
import {
  AbstractTreeNodeLoaderWithProvider,
  HighlightableTreeProps,
  LoadedNodeHierarchy,
  PagedTreeNodeLoader,
  TreeModelSource,
  useDebouncedAsyncValue,
} from "@itwin/components-react";
import { assert } from "@itwin/core-bentley";
import { FilteredPresentationTreeDataProvider } from "../FilteredDataProvider";
import { IFilteredPresentationTreeDataProvider, IPresentationTreeDataProvider } from "../IPresentationTreeDataProvider";

const FILTERED_DATA_PAGE_SIZE = 20;

class FilteringInProgressNodeLoader extends AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider> {
  constructor(dataProvider: IPresentationTreeDataProvider) {
    super(new TreeModelSource(), dataProvider);
  }

  protected load(): Observable<LoadedNodeHierarchy> {
    const loadedNodeHierarchy: LoadedNodeHierarchy = {
      hierarchyItems: [],
      offset: 0,
      parentId: "",
    };
    return of(loadedNodeHierarchy);
  }
}

/** @internal */
export interface UseFilteredNodeLoaderProps {
  dataProvider?: IPresentationTreeDataProvider;
  filter?: string;
}

/** @internal */
export function useFilteredNodeLoader({ dataProvider, filter }: UseFilteredNodeLoaderProps) {
  const { value, inProgress } = useFilteredProvider(dataProvider, filter);

  const filteredNodeLoader = useMemo(() => {
    if (!dataProvider) {
      return undefined;
    }
    if (inProgress) {
      return new FilteringInProgressNodeLoader(dataProvider);
    }
    if (!value) {
      return undefined;
    }
    return new PagedTreeNodeLoader(value.filteredProvider, new TreeModelSource(), FILTERED_DATA_PAGE_SIZE);
  }, [dataProvider, inProgress, value]);

  return {
    isFiltering: inProgress,
    filteredNodeLoader,
    ...value,
  };
}

/** @internal */
export function useNodeHighlightingProps(
  filter?: string,
  dataProvider?: IFilteredPresentationTreeDataProvider,
  activeMatchIndex?: number,
): HighlightableTreeProps | undefined {
  return useMemo(() => {
    if (!filter || !dataProvider) {
      return undefined;
    }

    const activeMatch = undefined !== activeMatchIndex ? dataProvider.getActiveMatch(activeMatchIndex) : undefined;
    return {
      searchText: filter,
      activeMatch,
    };
  }, [filter, dataProvider, activeMatchIndex]);
}

function useFilteredProvider(dataProvider?: IPresentationTreeDataProvider, filter?: string) {
  const getFilteredProvider = useCallback(async () => {
    assert(dataProvider !== undefined);
    assert(filter !== undefined);
    const filteredPaths = await dataProvider.getFilteredNodePaths(filter);
    const provider = new FilteredPresentationTreeDataProvider({
      parentDataProvider: dataProvider,
      filter,
      paths: filteredPaths,
    });
    return { filteredProvider: provider, matchesCount: provider.countFilteringResults(filteredPaths) };
  }, [dataProvider, filter]);
  return useDebouncedAsyncValue(filter && dataProvider ? getFilteredProvider : undefined);
}
