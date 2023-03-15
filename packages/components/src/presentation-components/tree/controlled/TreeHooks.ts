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
  MutableTreeModel, PagedTreeNodeLoader, RenderedItemsRange, TreeModel, TreeModelSource, usePagedTreeNodeLoader,
} from "@itwin/components-react";
import { IModelHierarchyChangeEventArgs, Presentation } from "@itwin/presentation-frontend";
import { RulesetRegistrationHelper } from "../../common/RulesetRegistrationHelper";
import { PresentationTreeDataProvider, PresentationTreeDataProviderProps } from "../DataProvider";
import { IPresentationTreeDataProvider } from "../IPresentationTreeDataProvider";
import { reloadTree } from "./TreeReloader";

/**
 * Properties for [[usePresentationTreeNodeLoader]] hook.
 * @public
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
   * Auto-update the hierarchy when ruleset, ruleset variables or data in the iModel changes. Cannot be used together
   * with `seedTreeModel`.
   * @alpha
   */
  enableHierarchyAutoUpdate?: boolean;

  /**
   * Initialize tree data with the provided tree model.
   */
  seedTreeModel?: TreeModel;
}

/**
 * Return type for [[usePresentationTreeNodeLoader]] hook.
 * @public
 */
export interface PresentationTreeNodeLoaderResult {
  /** Tree node loader to be used with a tree component */
  nodeLoader: PagedTreeNodeLoader<IPresentationTreeDataProvider>;

  /**
   * Callback for when rendered tree node item range changes. This property should be passed to
   * [ControlledTree]($components-react) when property `enableHierarchyAutoUpdate` is `true`.
   * @alpha
   */
  onItemsRendered: (items: RenderedItemsRange) => void;
}

/**
 * Custom hooks which creates PagedTreeNodeLoader with PresentationTreeDataProvider using
 * supplied imodel and ruleset.
 * @public
 */
export function usePresentationTreeNodeLoader(
  props: PresentationTreeNodeLoaderProps,
): PresentationTreeNodeLoaderResult {
  const dataProviderProps: PresentationTreeDataProviderProps = useMemo(
    () => ({
      imodel: props.imodel,
      ruleset: props.ruleset,
      pagingSize: props.pagingSize,
      appendChildrenCountForGroupingNodes: props.appendChildrenCountForGroupingNodes,
      dataSourceOverrides: props.dataSourceOverrides,
      ruleDiagnostics: props.ruleDiagnostics,
      devDiagnostics: props.devDiagnostics,
      customizeTreeNodeItem: props.customizeTreeNodeItem,
    }),
    [
      props.appendChildrenCountForGroupingNodes,
      props.dataSourceOverrides,
      props.devDiagnostics,
      props.imodel,
      props.pagingSize,
      props.ruleDiagnostics,
      props.ruleset,
      props.customizeTreeNodeItem,
    ],
  );

  const firstRenderRef = useRef(true);
  const [
    { modelSource, rulesetRegistration, dataProvider },
    setTreeNodeLoaderState,
  ] = useResettableState<TreeNodeLoaderState>(
    () => ({
      modelSource: new TreeModelSource(new MutableTreeModel(firstRenderRef.current ? props.seedTreeModel : undefined)),
      rulesetRegistration: new RulesetRegistrationHelper(dataProviderProps.ruleset),
      dataProvider: new PresentationTreeDataProvider({
        ...dataProviderProps,
        ruleset: typeof dataProviderProps.ruleset === "string"
          ? dataProviderProps.ruleset
          : /* istanbul ignore next */ dataProviderProps.ruleset.id,
      }),
    }),
    [dataProviderProps],
  );
  useEffect(() => { return () => rulesetRegistration.dispose(); }, [rulesetRegistration]);
  useEffect(() => { return () => dataProvider.dispose(); }, [dataProvider]);

  const nodeLoader = usePagedTreeNodeLoader(dataProvider, props.pagingSize, modelSource);

  const renderedItems = useRef<RenderedItemsRange | undefined>(undefined);
  // istanbul ignore next
  const onItemsRendered = useCallback((items: RenderedItemsRange) => { renderedItems.current = items; }, []);

  const params = {
    enable: !!props.enableHierarchyAutoUpdate,
    pageSize: props.pagingSize,
    modelSource,
    dataProviderProps,
    rulesetId: dataProvider.rulesetId,
    setTreeNodeLoaderState,
    renderedItems,
  };
  useModelSourceUpdateOnIModelHierarchyUpdate(params);
  useModelSourceUpdateOnRulesetModification(params);
  useModelSourceUpdateOnRulesetVariablesChange(params);

  firstRenderRef.current = false;
  return { nodeLoader, onItemsRendered };
}

interface TreeNodeLoaderState {
  modelSource: TreeModelSource;
  rulesetRegistration: RulesetRegistrationHelper;
  dataProvider: IPresentationTreeDataProvider;
}

/**
 * Resets state to `initialValue` when dependencies change. Avoid using in new places because this hook is only intended
 * for use in poorly designed custom hooks.
 */
function useResettableState<T>(initialValue: () => T, dependencies: unknown[]): [T, React.Dispatch<React.SetStateAction<T>>] {
  const stateRef = useRef<T>() as React.MutableRefObject<T>;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => stateRef.current = initialValue(), dependencies);

  const [_, setState] = useState({});
  const setNewStateRef = useRef((action: T | ((previousState: T) => T)) => {
    const newState = action instanceof Function ? action(stateRef.current) : /* istanbul ignore next */ action;
    // istanbul ignore else
    if (newState !== stateRef.current) {
      stateRef.current = newState;
      setState({});
    }
  });
  return [stateRef.current, setNewStateRef.current];
}

function useModelSourceUpdateOnIModelHierarchyUpdate(params: {
  enable: boolean;
  dataProviderProps: PresentationTreeDataProviderProps;
  rulesetId: string;
  pageSize: number;
  modelSource: TreeModelSource;
  setTreeNodeLoaderState: React.Dispatch<React.SetStateAction<TreeNodeLoaderState>>;
  renderedItems: React.MutableRefObject<RenderedItemsRange | undefined>;
}): void {
  const { enable, dataProviderProps, rulesetId, pageSize, modelSource, setTreeNodeLoaderState, renderedItems } = params;

  useEffect(
    () => {
      if (!enable) {
        return;
      }

      let subscription: Subscription | undefined;
      const removeListener = Presentation.presentation.onIModelHierarchyChanged.addListener(
        async (args: IModelHierarchyChangeEventArgs) => {
          if (args.rulesetId !== rulesetId || args.imodelKey !== dataProviderProps.imodel.key) {
            return;
          }

          const dataProvider = new PresentationTreeDataProvider({ ...dataProviderProps, ruleset: rulesetId });
          subscription = reloadTree(modelSource.getModel(), dataProvider, pageSize, renderedItems.current).subscribe({
            next: (newModelSource) => setTreeNodeLoaderState((prevState) => ({
              modelSource: newModelSource,
              rulesetRegistration: prevState.rulesetRegistration,
              dataProvider,
            })),
          });
        },
      );

      return () => {
        removeListener();
        subscription?.unsubscribe();
      };
    },
    [modelSource, enable, pageSize, dataProviderProps, rulesetId, setTreeNodeLoaderState, renderedItems],
  );
}

function useModelSourceUpdateOnRulesetModification(params: {
  enable: boolean;
  dataProviderProps: PresentationTreeDataProviderProps;
  rulesetId: string;
  pageSize: number;
  modelSource: TreeModelSource;
  setTreeNodeLoaderState: React.Dispatch<React.SetStateAction<TreeNodeLoaderState>>;
  renderedItems: React.MutableRefObject<RenderedItemsRange | undefined>;
}): void {
  const { enable, dataProviderProps, rulesetId, pageSize, modelSource, setTreeNodeLoaderState, renderedItems } = params;

  useEffect(
    () => {
      if (!enable) {
        return;
      }

      let subscription: Subscription | undefined;
      const removeListener = Presentation.presentation.rulesets().onRulesetModified.addListener((ruleset) => {
        if (ruleset.id !== rulesetId) {
          return;
        }

        const dataProvider = new PresentationTreeDataProvider({ ...dataProviderProps, ruleset: rulesetId });
        subscription = reloadTree(modelSource.getModel(), dataProvider, pageSize, renderedItems.current).subscribe({
          next: (newModelSource) => setTreeNodeLoaderState((prevState) => ({
            modelSource: newModelSource,
            rulesetRegistration: prevState.rulesetRegistration,
            dataProvider,
          })),
        });
      });

      return () => {
        removeListener();
        subscription?.unsubscribe();
      };
    },
    [dataProviderProps, rulesetId, enable, modelSource, pageSize, setTreeNodeLoaderState, renderedItems],
  );
}

function useModelSourceUpdateOnRulesetVariablesChange(params: {
  enable: boolean;
  dataProviderProps: PresentationTreeDataProviderProps;
  rulesetId: string;
  pageSize: number;
  modelSource: TreeModelSource;
  setTreeNodeLoaderState: React.Dispatch<React.SetStateAction<TreeNodeLoaderState>>;
  renderedItems: React.MutableRefObject<RenderedItemsRange | undefined>;
}): void {
  const { enable, dataProviderProps, pageSize, rulesetId, modelSource, setTreeNodeLoaderState, renderedItems } = params;

  useEffect(
    () => {
      if (!enable) {
        return;
      }

      let subscription: Subscription | undefined;
      const removeListener = Presentation.presentation.vars(rulesetId).onVariableChanged.addListener(() => {
        // note: we should probably debounce these events while accumulating changed variables in case multiple vars are changed
        const dataProvider = new PresentationTreeDataProvider({ ...dataProviderProps, ruleset: rulesetId });
        subscription = reloadTree(modelSource.getModel(), dataProvider, pageSize, renderedItems.current).subscribe({
          next: (newModelSource) => setTreeNodeLoaderState((prevState) => ({
            modelSource: newModelSource,
            rulesetRegistration: prevState.rulesetRegistration,
            dataProvider,
          })),
        });
      });

      return () => {
        removeListener();
        subscription?.unsubscribe();
      };
    },
    [dataProviderProps, enable, modelSource, pageSize, rulesetId, setTreeNodeLoaderState, renderedItems],
  );
}
