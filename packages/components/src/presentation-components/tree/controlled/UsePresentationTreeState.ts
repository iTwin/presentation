/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */
/** @packageDocumentation
 * @module Tree
 */

import "../../common/DisposePolyfill.js";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MutableTreeModel, PagedTreeNodeLoader, TreeEventHandler, TreeModelSource } from "@itwin/components-react";
import { PresentationTreeDataProvider } from "../DataProvider.js";
import { ReportingTreeNodeLoader } from "../ReportingTreeNodeLoader.js";
import { useFilteredNodeLoader, useNodeHighlightingProps } from "./UseControlledTreeFiltering.js";
import { useTreeReload } from "./UseTreeReload.js";

import type { AbstractTreeNodeLoaderWithProvider, HighlightableTreeProps, RenderedItemsRange, TreeModel } from "@itwin/components-react";
import type { PresentationTreeDataProviderProps } from "../DataProvider.js";
import type { IFilteredPresentationTreeDataProvider, IPresentationTreeDataProvider } from "../IPresentationTreeDataProvider.js";
import type { ReloadedTree } from "./UseTreeReload.js";

/**
 * Properties for [[usePresentationTreeState]] hook.
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export interface UsePresentationTreeStateProps<TEventHandler extends TreeEventHandler = TreeEventHandler> extends PresentationTreeDataProviderProps {
  /**
   * Number of nodes in a single page. The created loader always requests at least
   * a page of nodes, so it should be optimized for usability vs performance (using
   * smaller pages gives better responsiveness, but makes overall performance
   * slightly worse).
   *
   * Note: The prop is already defined in `PresentationTreeDataProviderProps` but specified here again to make it required.
   */
  pagingSize: number;

  /**
   * Initialize tree data with the provided tree model.
   */
  seedTreeModel?: TreeModel;

  /**
   * Factory function for creating custom tree events handler. Defaults to creating [TreeEventHandler]($components-react).
   *
   * Note: Must be memoized.
   */
  eventHandlerFactory?: (props: PresentationTreeEventHandlerProps) => TEventHandler | undefined;

  /**
   * Parameters for filtering tree.
   */
  filteringParams?: {
    /** Filter text. */
    filter: string;
    /** Current active filter match. It is used to create [HighlightableTreeNodeProps]($components-react) for highlighting and stepping through filter matches. */
    activeMatchIndex?: number;
  };

  /**
   * Callback for when a tree node is loaded.
   */
  onNodeLoaded?: (props: {
    /** ID of the loaded node, `root` if it is the root. */
    node: string;
    /** Duration how long the load took in milliseconds. */
    duration: number;
  }) => void;

  /**
   * Callback for when the hierarchy limit is exceeded while loading nodes.
   */
  onHierarchyLimitExceeded?: () => void;
}

/**
 * Return type of [[usePresentationTreeState]] hook.
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export interface UsePresentationTreeStateResult<TEventHandler extends TreeEventHandler = TreeEventHandler> {
  /** Tree node loader to be used with a tree component. */
  nodeLoader: AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>;
  /** Event handler to be used with a tree component. */
  eventHandler: TEventHandler;
  /**
   * Callback for when rendered tree node item range changes. This property should be passed to
   * [ControlledTree]($components-react).
   */
  onItemsRendered: (items: RenderedItemsRange) => void;
  /**
   * Information about filtering applied on tree.
   */
  filteringResult?: {
    /** Specifies whether filtering is in progress or not. */
    isFiltering: boolean;
    /** Filtered data provider used when loading nodes. */
    filteredProvider?: IFilteredPresentationTreeDataProvider;
    /** Props for highlighting filter matches in node label. */
    highlightProps?: HighlightableTreeProps;
    /** Total count of filter matches. */
    matchesCount?: number;
  };
}

/**
 * Props passed to [[UsePresentationTreeStateProps.eventHandlerFactory]] when creating event handler.
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export interface PresentationTreeEventHandlerProps {
  /** Node loader used to load nodes. */
  nodeLoader: AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>;
  /** Model source containing tree model. */
  modelSource: TreeModelSource;
}

interface TreeStateProps extends PresentationTreeDataProviderProps {
  pagingSize: number;
  treeModel?: TreeModel;
}

interface UseTreeStateProps {
  treeStateProps: TreeStateProps;
  onNodeLoaded?: (callbackProps: { node: string; duration: number }) => void;
  onHierarchyLimitExceeded?: () => void;
}

interface TreeState {
  dataProvider: PresentationTreeDataProvider;
  nodeLoader: PagedTreeNodeLoader<PresentationTreeDataProvider>;
}

/**
 * Custom hook that creates and manages state for [ControlledTree]($components-react) component based on presentation data.
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export function usePresentationTreeState<TEventHandler extends TreeEventHandler = TreeEventHandler>({
  onHierarchyLimitExceeded,
  onNodeLoaded,
  eventHandlerFactory,
  seedTreeModel,
  filteringParams,
  ...dataProviderProps
}: UsePresentationTreeStateProps<TEventHandler>): UsePresentationTreeStateResult<TEventHandler> | undefined {
  const firstRenderRef = useRef(true);
  const treeStateProps = useMemo(
    (): TreeStateProps => ({
      ...dataProviderProps,
      treeModel: firstRenderRef.current ? seedTreeModel : undefined,
    }),
    Object.values(dataProviderProps), // eslint-disable-line react-hooks/exhaustive-deps
  );

  const { state, onReload } = useTreeState({ treeStateProps, onNodeLoaded, onHierarchyLimitExceeded });
  const renderedItems = useRef<RenderedItemsRange | undefined>(undefined);
  /* c8 ignore next 3 */
  const onItemsRendered = useCallback((items: RenderedItemsRange) => {
    renderedItems.current = items;
  }, []);

  useTreeReload({
    pageSize: dataProviderProps.pagingSize,
    modelSource: state?.nodeLoader.modelSource,
    dataProviderProps: treeStateProps,
    ruleset: dataProviderProps.ruleset,
    onReload,
    renderedItems,
  });

  const filteredTree = usePresentationTreeFiltering({
    dataProvider: state?.nodeLoader.dataProvider,
    filter: filteringParams?.filter,
    activeMatchIndex: filteringParams?.activeMatchIndex,
  });
  const activeNodeLoader = filteredTree?.filteredNodeLoader ?? state?.nodeLoader;
  const eventHandler = useEventHandler(eventHandlerFactory, activeNodeLoader);

  firstRenderRef.current = false;
  if (!activeNodeLoader || !eventHandler) {
    return undefined;
  }

  return {
    nodeLoader: activeNodeLoader,
    eventHandler,
    onItemsRendered,
    filteringResult: filteredTree
      ? {
          isFiltering: filteredTree.isFiltering,
          filteredProvider: filteredTree.filteredProvider,
          highlightProps: filteredTree.highlightProps,
          matchesCount: filteredTree.matchesCount,
        }
      : undefined,
  };
}

interface PresentationTreeFilteringProps {
  dataProvider?: IPresentationTreeDataProvider;
  filter?: string;
  activeMatchIndex?: number;
}

function useTreeState(props: UseTreeStateProps) {
  const [state, setState] = useState<TreeState>();
  const onNodeLoadedRef = useLatest(props.onNodeLoaded);
  const onHierarchyLimitExceededRef = useLatest(props.onHierarchyLimitExceeded);
  const prevStateRef = useLatest(state);

  useEffect(() => {
    const { treeModel, ...providerProps } = props.treeStateProps;
    const modelSource = new TreeModelSource(new MutableTreeModel(treeModel));
    const dataProvider = new PresentationTreeDataProvider({ ...providerProps, onHierarchyLimitExceeded: () => onHierarchyLimitExceededRef.current?.() });
    const pagedLoader = new PagedTreeNodeLoader(dataProvider, modelSource, providerProps.pagingSize);
    const nodeLoader = new ReportingTreeNodeLoader(pagedLoader, (nodeLoadedProps) => onNodeLoadedRef.current?.(nodeLoadedProps));

    const newState = {
      modelSource,
      nodeLoader,
      dataProvider,
    };
    setState(newState);

    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      prevStateRef.current?.dataProvider[Symbol.dispose]();
    };
  }, [props.treeStateProps, onNodeLoadedRef, onHierarchyLimitExceededRef, prevStateRef]);

  const onReload = useCallback(
    (reloadedTree: ReloadedTree) => {
      prevStateRef.current?.dataProvider[Symbol.dispose]();

      const { modelSource, dataProvider } = reloadedTree;
      const pagedLoader = new PagedTreeNodeLoader(dataProvider, modelSource, dataProvider.pagingSize!);
      const nodeLoader = new ReportingTreeNodeLoader(pagedLoader, (nodeLoadedProps) => onNodeLoadedRef.current?.(nodeLoadedProps));
      setState({ dataProvider, nodeLoader });
    },
    [onNodeLoadedRef, prevStateRef],
  );

  return { state, onReload };
}

function useEventHandler<TEventHandler extends TreeEventHandler>(
  factory?: (params: PresentationTreeEventHandlerProps) => TEventHandler | undefined,
  nodeLoader?: AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>,
) {
  const [state, setState] = useState<TEventHandler>();

  useEffect(() => {
    if (!nodeLoader) {
      return;
    }
    const params: PresentationTreeEventHandlerProps = { modelSource: nodeLoader.modelSource, nodeLoader };
    const newHandler = factory ? factory(params) : new TreeEventHandler(params);
    setState(newHandler as TEventHandler);

    return () => {
      newHandler?.dispose();
    };
  }, [factory, nodeLoader]);

  return state;
}

function usePresentationTreeFiltering({ activeMatchIndex, ...rest }: PresentationTreeFilteringProps) {
  const { filteredNodeLoader, filteredProvider, isFiltering, matchesCount } = useFilteredNodeLoader(rest);
  const highlightProps = useNodeHighlightingProps(rest.filter, filteredProvider, activeMatchIndex);
  return rest.filter && rest.dataProvider
    ? {
        highlightProps,
        filteredNodeLoader,
        filteredProvider,
        isFiltering,
        matchesCount,
      }
    : undefined;
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}
