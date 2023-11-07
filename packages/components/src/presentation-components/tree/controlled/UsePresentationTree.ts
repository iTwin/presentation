/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AbstractTreeNodeLoaderWithProvider, HighlightableTreeNodeProps, MutableTreeModel, PagedTreeNodeLoader, RenderedItemsRange, TreeEventHandler,
  TreeModel, TreeModelSource,
} from "@itwin/components-react";
import { PresentationTreeDataProvider, PresentationTreeDataProviderProps } from "../DataProvider";
import { IFilteredPresentationTreeDataProvider } from "../FilteredDataProvider";
import { IPresentationTreeDataProvider } from "../IPresentationTreeDataProvider";
import { useFilteredNodeLoader, useNodeHighlightingProps } from "./UseControlledTreeFiltering";
import { ReloadedTree, useTreeReload } from "./UseTreeReload";

/**
 * Properties for [[usePresentationTreeNodeLoader]] hook.
 * @public
 */
export interface UsePresentationTreeProps<TEventHandler extends TreeEventHandler = TreeEventHandler> extends PresentationTreeDataProviderProps {
  /**
   * Number of nodes in a single page. The created loader always requests at least
   * a page nodes, so it should be optimized for usability vs performance (using
   * smaller pages gives better responsiveness, but makes overall performance
   * slightly worse).
   *
   * Note: The prop is already defined in `PresentationTreeDataProviderProps` but specified here again to make it required.
   */
  pagingSize: number;

  /**
   * Auto-update the hierarchy when ruleset, ruleset variables or data in the iModel changes. Cannot be used together
   * with `seedTreeModel`.
   * @alpha
   */
  enableHierarchyAutoUpdate?: boolean;

  /**
   * Initialize tree data with the provided tree model.
   */
  seedTreeModel?: TreeModel;

  /**
   * Factory function for creating custom tree events handler.
   *
   * Note: Must be memoized.
   */
  eventHandlerFactory?: (props: TreeEventHandlerProps) => TEventHandler | undefined;

  /**
   * Parameters for filtering tree.
   */
  filteringParams?: {
    /** Filter text. */
    filter: string;
    /** Current active filter match. It is used to create [HighlightableTreeNodeProps]($components-react) for highlighting and stepping through filter matches. */
    activeMatchIndex?: number;
  };
}

/**
 * Return type of [[usePresentationTree]] hook.
 * @public
 */
export interface UsePresentationTreeResult<TEventHandler extends TreeEventHandler = TreeEventHandler> {
  /** Tree node loader to be used with a tree component. */
  nodeLoader: AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>;
  /** Event handler to be used with a tree component. */
  eventHandler: TEventHandler;
  /**
   * Callback for when rendered tree node item range changes. This property should be passed to
   * [ControlledTree]($components-react) when property `enableHierarchyAutoUpdate` is `true`.
   * @alpha
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
    highlightProps?: HighlightableTreeNodeProps;
    /** Total count of filter matches. */
    matchesCount?: number;
  };
}

/**
 * Props passed to [[UsePresentationTreeProps.eventHandlerFactory]] when creating event handler.
 * @public
 */
export interface TreeEventHandlerProps {
  /** Node loader used to load nodes. */
  nodeLoader: AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>;
  /** Model source containing tree model. */
  modelSource: TreeModelSource;
}

interface TreeStateProps extends PresentationTreeDataProviderProps {
  pagingSize: number;
  treeModel?: TreeModel;
}

interface TreeState {
  dataProvider: PresentationTreeDataProvider;
  nodeLoader: AbstractTreeNodeLoaderWithProvider<PresentationTreeDataProvider>;
}

/**
 * Custom hooks that creates and manages state for [ControlledTree]($components-react) component based on presentation data.
 * @public
 */
export function usePresentationTree<TEventHandler extends TreeEventHandler = TreeEventHandler>({
  eventHandlerFactory,
  seedTreeModel,
  enableHierarchyAutoUpdate,
  filteringParams,
  ...dataProviderProps
}: UsePresentationTreeProps<TEventHandler>): UsePresentationTreeResult<TEventHandler> | undefined {
  const firstRenderRef = useRef(true);
  const treeStateProps = useMemo(
    (): TreeStateProps => ({ ...dataProviderProps, treeModel: firstRenderRef.current ? seedTreeModel : undefined }),
    Object.values(dataProviderProps), // eslint-disable-line react-hooks/exhaustive-deps
  );

  const { state, onReload } = useTreeState(treeStateProps);

  const renderedItems = useRef<RenderedItemsRange | undefined>(undefined);
  // istanbul ignore next
  const onItemsRendered = useCallback((items: RenderedItemsRange) => {
    renderedItems.current = items;
  }, []);

  useTreeReload({
    enable: !!enableHierarchyAutoUpdate,
    pageSize: dataProviderProps.pagingSize,
    modelSource: state?.nodeLoader.modelSource,
    dataProviderProps: treeStateProps,
    rulesetId: state?.dataProvider.rulesetId,
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

function useTreeState(props: TreeStateProps) {
  const [state, setState] = useState<TreeState>();
  const prevStateRef = useRef(state);
  useEffect(() => {
    prevStateRef.current = state;
  }, [state]);

  useEffect(() => {
    const { treeModel, ...providerProps } = props;
    const modelSource = new TreeModelSource(new MutableTreeModel(treeModel));
    const dataProvider = new PresentationTreeDataProvider(providerProps);
    const nodeLoader = new PagedTreeNodeLoader(dataProvider, modelSource, providerProps.pagingSize);

    const newState = {
      modelSource,
      nodeLoader,
      dataProvider,
    };
    setState(newState);

    return () => {
      prevStateRef.current?.dataProvider.dispose();
    };
  }, [props]);

  const onReload = useCallback((reloadedTree: ReloadedTree) => {
    prevStateRef.current?.dataProvider.dispose();

    const { modelSource, dataProvider } = reloadedTree;
    const nodeLoader = new PagedTreeNodeLoader(dataProvider, modelSource, dataProvider.pagingSize!);
    setState({ dataProvider, nodeLoader });
  }, []);

  return { state, onReload };
}

function useEventHandler<TEventHandler extends TreeEventHandler>(
  factory?: (params: TreeEventHandlerProps) => TEventHandler | undefined,
  nodeLoader?: AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>,
) {
  const [state, setState] = useState<TEventHandler>();

  useEffect(() => {
    if (!nodeLoader) {
      return;
    }
    const params: TreeEventHandlerProps = { modelSource: nodeLoader.modelSource, nodeLoader };
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
