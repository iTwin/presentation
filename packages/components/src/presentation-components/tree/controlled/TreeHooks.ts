/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Subscription } from "rxjs/internal/Subscription";
import {
  AbstractTreeNodeLoaderWithProvider,
  MutableTreeModel,
  PagedTreeNodeLoader,
  RenderedItemsRange,
  TreeModel,
  TreeModelSource,
  usePagedTreeNodeLoader,
} from "@itwin/components-react";
import { IModelApp } from "@itwin/core-frontend";
import { IModelHierarchyChangeEventArgs, Presentation } from "@itwin/presentation-frontend";
import { PresentationTreeDataProvider, PresentationTreeDataProviderProps } from "../DataProvider";
import { IPresentationTreeDataProvider } from "../IPresentationTreeDataProvider";
import { reloadTree } from "./TreeReloader";
import { useFilteredNodeLoader, useNodeHighlightingProps } from "./UseControlledTreeFiltering";

/**
 * Properties for [[usePresentationTreeNodeLoader]] hook.
 * @public
 * @deprecated in 4.x. This hook is not compatible with React 18 `StrictMode`. Use [[usePresentationTreeState]] instead.
 */
export interface PresentationTreeNodeLoaderProps extends PresentationTreeDataProviderProps {
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
   * Initialize tree data with the provided tree model.
   */
  seedTreeModel?: TreeModel;
}

/**
 * Return type for [[usePresentationTreeNodeLoader]] hook.
 * @public
 * @deprecated in 4.x. This hook is not compatible with React 18 `StrictMode`. Use [[usePresentationTreeState]] instead.
 */
export interface PresentationTreeNodeLoaderResult {
  /** Tree node loader to be used with a tree component */
  nodeLoader: PagedTreeNodeLoader<IPresentationTreeDataProvider>;

  /**
   * Callback for when rendered tree node item range changes. This property should be passed to
   * [ControlledTree]($components-react).
   */
  onItemsRendered: (items: RenderedItemsRange) => void;
}

/**
 * Custom hooks which creates PagedTreeNodeLoader with PresentationTreeDataProvider using
 * supplied imodel and ruleset.
 * @public
 * @deprecated in 4.x. This hook is not compatible with React 18 `StrictMode`. Use [[usePresentationTreeState]] instead.
 */
// eslint-disable-next-line deprecation/deprecation
export function usePresentationTreeNodeLoader(props: PresentationTreeNodeLoaderProps): PresentationTreeNodeLoaderResult {
  const { seedTreeModel, ...rest } = props;

  const firstRenderRef = useRef(true);
  const treeNodeLoaderStateProps: TreeNodeLoaderStateProps = useMemo(
    () => ({ ...rest, seedTreeModel: firstRenderRef.current ? seedTreeModel : undefined }),
    Object.values(rest), // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [{ modelSource, dataProvider }, setState] = useState<TreeNodeLoaderState>(() => ({
    modelSource: new TreeModelSource(new MutableTreeModel(treeNodeLoaderStateProps.seedTreeModel)),
    dataProvider: new PresentationTreeDataProvider({ ...treeNodeLoaderStateProps }),
  }));

  useEffect(() => {
    const provider = new PresentationTreeDataProvider({ ...treeNodeLoaderStateProps });
    setState({
      modelSource: new TreeModelSource(new MutableTreeModel(treeNodeLoaderStateProps.seedTreeModel)),
      dataProvider: provider,
    });
    return () => {
      provider.dispose();
    };
  }, [treeNodeLoaderStateProps]);

  const nodeLoader = usePagedTreeNodeLoader(dataProvider, rest.pagingSize, modelSource);

  const renderedItems = useRef<RenderedItemsRange | undefined>(undefined);
  // istanbul ignore next
  const onItemsRendered = useCallback((items: RenderedItemsRange) => {
    renderedItems.current = items;
  }, []);

  const params = {
    pageSize: rest.pagingSize,
    modelSource,
    dataProviderProps: treeNodeLoaderStateProps,
    rulesetId: dataProvider.rulesetId,
    setTreeNodeLoaderState: setState,
    renderedItems,
  };
  useModelSourceUpdateOnIModelHierarchyUpdate(params);
  useModelSourceUpdateOnRulesetModification(params);
  useModelSourceUpdateOnRulesetVariablesChange(params);
  useModelSourceUpdateOnUnitSystemChange(params);

  firstRenderRef.current = false;
  return { nodeLoader, onItemsRendered };
}

/**
 * Parameters for [[useControlledPresentationTreeFiltering]] hook
 * @public
 */
export interface ControlledPresentationTreeFilteringProps {
  nodeLoader: AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>;
  filter?: string;
  activeMatchIndex?: number;
}

/**
 * A custom hook that creates filtered model source and node loader for supplied filter.
 * If filter string is not provided or filtering is still in progress it returns supplied
 * model source and node loader.
 *
 * @public
 */
export function useControlledPresentationTreeFiltering(props: ControlledPresentationTreeFilteringProps) {
  const { filteredNodeLoader, filteredProvider, isFiltering, matchesCount } = useFilteredNodeLoader({
    dataProvider: props.nodeLoader.dataProvider,
    filter: props.filter,
  });
  const nodeHighlightingProps = useNodeHighlightingProps(props.filter, filteredProvider, props.activeMatchIndex);
  return {
    nodeHighlightingProps,
    filteredNodeLoader: filteredNodeLoader || props.nodeLoader,
    filteredModelSource: filteredNodeLoader?.modelSource || props.nodeLoader.modelSource,
    isFiltering,
    matchesCount,
  };
}
type TreeNodeLoaderStateProps = PresentationTreeDataProviderProps & { seedTreeModel?: TreeModel };

interface TreeNodeLoaderState {
  modelSource: TreeModelSource;
  dataProvider: IPresentationTreeDataProvider;
}

interface UpdateParams {
  dataProviderProps: PresentationTreeDataProviderProps;
  rulesetId: string;
  pageSize: number;
  modelSource: TreeModelSource;
  setTreeNodeLoaderState: React.Dispatch<React.SetStateAction<TreeNodeLoaderState>>;
  renderedItems: React.MutableRefObject<RenderedItemsRange | undefined>;
}

function useModelSourceUpdateOnIModelHierarchyUpdate(params: UpdateParams): void {
  const { dataProviderProps, rulesetId, pageSize, modelSource, setTreeNodeLoaderState, renderedItems } = params;

  useEffect(() => {
    let subscription: Subscription | undefined;
    const removeListener = Presentation.presentation.onIModelHierarchyChanged.addListener((args: IModelHierarchyChangeEventArgs) => {
      if (args.rulesetId !== rulesetId || args.imodelKey !== dataProviderProps.imodel.key) {
        return;
      }

      subscription = startTreeReload({ dataProviderProps, rulesetId, pageSize, modelSource, renderedItems, setTreeNodeLoaderState });
    });

    return () => {
      removeListener();
      subscription?.unsubscribe();
    };
  }, [modelSource, pageSize, dataProviderProps, rulesetId, setTreeNodeLoaderState, renderedItems]);
}

function useModelSourceUpdateOnRulesetModification(params: UpdateParams): void {
  const { dataProviderProps, rulesetId, pageSize, modelSource, setTreeNodeLoaderState, renderedItems } = params;

  useEffect(() => {
    let subscription: Subscription | undefined;
    const removeListener = Presentation.presentation.rulesets().onRulesetModified.addListener((ruleset) => {
      if (ruleset.id !== rulesetId) {
        return;
      }

      subscription = startTreeReload({ dataProviderProps, rulesetId, pageSize, modelSource, renderedItems, setTreeNodeLoaderState });
    });

    return () => {
      removeListener();
      subscription?.unsubscribe();
    };
  }, [dataProviderProps, rulesetId, modelSource, pageSize, setTreeNodeLoaderState, renderedItems]);
}

function useModelSourceUpdateOnRulesetVariablesChange(params: UpdateParams): void {
  const { dataProviderProps, pageSize, rulesetId, modelSource, setTreeNodeLoaderState, renderedItems } = params;

  useEffect(() => {
    let subscription: Subscription | undefined;
    const removeListener = Presentation.presentation.vars(rulesetId).onVariableChanged.addListener(() => {
      // note: we should probably debounce these events while accumulating changed variables in case multiple vars are changed
      subscription = startTreeReload({ dataProviderProps, rulesetId, pageSize, modelSource, renderedItems, setTreeNodeLoaderState });
    });

    return () => {
      removeListener();
      subscription?.unsubscribe();
    };
  }, [dataProviderProps, modelSource, pageSize, rulesetId, setTreeNodeLoaderState, renderedItems]);
}

function useModelSourceUpdateOnUnitSystemChange(params: UpdateParams): void {
  const { dataProviderProps, pageSize, rulesetId, modelSource, setTreeNodeLoaderState, renderedItems } = params;

  useEffect(() => {
    let subscription: Subscription | undefined;
    const removeListener = IModelApp.quantityFormatter.onActiveFormattingUnitSystemChanged.addListener(() => {
      subscription = startTreeReload({ dataProviderProps, rulesetId, pageSize, modelSource, renderedItems, setTreeNodeLoaderState });
    });

    return () => {
      removeListener();
      subscription?.unsubscribe();
    };
  }, [dataProviderProps, modelSource, pageSize, rulesetId, setTreeNodeLoaderState, renderedItems]);
}

function startTreeReload({ dataProviderProps, rulesetId, modelSource, pageSize, renderedItems, setTreeNodeLoaderState }: UpdateParams): Subscription {
  const dataProvider = new PresentationTreeDataProvider({ ...dataProviderProps, ruleset: rulesetId });
  return reloadTree(modelSource.getModel(), dataProvider, pageSize, renderedItems.current).subscribe({
    next: (newModelSource) =>
      setTreeNodeLoaderState({
        modelSource: newModelSource,
        dataProvider,
      }),
  });
}
