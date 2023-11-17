/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { useEffect } from "react";
import { RenderedItemsRange, Subscription, TreeModelSource } from "@itwin/components-react";
import { IModelApp } from "@itwin/core-frontend";
import { IModelHierarchyChangeEventArgs, Presentation } from "@itwin/presentation-frontend";
import { PresentationTreeDataProvider, PresentationTreeDataProviderProps } from "../DataProvider";
import { reloadTree } from "./TreeReloader";

/** @internal */
export interface ReloadedTree {
  modelSource: TreeModelSource;
  dataProvider: PresentationTreeDataProvider;
}

/** @internal */
export interface TreeReloadParams {
  dataProviderProps: PresentationTreeDataProviderProps;
  pageSize: number;
  rulesetId?: string;
  modelSource?: TreeModelSource;
  onReload: (params: ReloadedTree) => void;
  renderedItems: React.MutableRefObject<RenderedItemsRange | undefined>;
}

/** @internal */
export function useTreeReload(params: TreeReloadParams & { enable: boolean }) {
  useModelSourceUpdateOnIModelHierarchyUpdate(params);
  useModelSourceUpdateOnRulesetModification(params);
  useModelSourceUpdateOnRulesetVariablesChange(params);
  useModelSourceUpdateOnUnitSystemChange(params);
}

function useModelSourceUpdateOnIModelHierarchyUpdate(params: TreeReloadParams & { enable: boolean }): void {
  const { enable, dataProviderProps, rulesetId, pageSize, modelSource, onReload, renderedItems } = params;

  useEffect(() => {
    if (!enable || !rulesetId || !modelSource) {
      return;
    }

    let subscription: Subscription | undefined;
    const removeListener = Presentation.presentation.onIModelHierarchyChanged.addListener((args: IModelHierarchyChangeEventArgs) => {
      if (args.rulesetId !== rulesetId || args.imodelKey !== dataProviderProps.imodel.key) {
        return;
      }

      subscription = startTreeReload({ dataProviderProps, rulesetId, pageSize, modelSource, renderedItems, onReload });
    });

    return () => {
      removeListener();
      subscription?.unsubscribe();
    };
  }, [modelSource, enable, pageSize, dataProviderProps, rulesetId, onReload, renderedItems]);
}

function useModelSourceUpdateOnRulesetModification(params: TreeReloadParams & { enable: boolean }): void {
  const { enable, dataProviderProps, rulesetId, pageSize, modelSource, onReload, renderedItems } = params;

  useEffect(() => {
    if (!enable || !rulesetId || !modelSource) {
      return;
    }

    let subscription: Subscription | undefined;
    const removeListener = Presentation.presentation.rulesets().onRulesetModified.addListener((ruleset) => {
      if (ruleset.id !== rulesetId) {
        return;
      }

      subscription = startTreeReload({ dataProviderProps, rulesetId, pageSize, modelSource, renderedItems, onReload });
    });

    return () => {
      removeListener();
      subscription?.unsubscribe();
    };
  }, [dataProviderProps, rulesetId, enable, modelSource, pageSize, onReload, renderedItems]);
}

function useModelSourceUpdateOnRulesetVariablesChange(params: TreeReloadParams & { enable: boolean }): void {
  const { enable, dataProviderProps, pageSize, rulesetId, modelSource, onReload, renderedItems } = params;

  useEffect(() => {
    if (!enable || !rulesetId || !modelSource) {
      return;
    }

    let subscription: Subscription | undefined;
    const removeListener = Presentation.presentation.vars(rulesetId).onVariableChanged.addListener(() => {
      // note: we should probably debounce these events while accumulating changed variables in case multiple vars are changed
      subscription = startTreeReload({ dataProviderProps, rulesetId, pageSize, modelSource, renderedItems, onReload });
    });

    return () => {
      removeListener();
      subscription?.unsubscribe();
    };
  }, [dataProviderProps, enable, modelSource, pageSize, rulesetId, onReload, renderedItems]);
}

function useModelSourceUpdateOnUnitSystemChange(params: TreeReloadParams): void {
  const { dataProviderProps, pageSize, rulesetId, modelSource, onReload, renderedItems } = params;

  useEffect(() => {
    if (!rulesetId || !modelSource) {
      return;
    }

    let subscription: Subscription | undefined;
    const removeListener = IModelApp.quantityFormatter.onActiveFormattingUnitSystemChanged.addListener(() => {
      subscription = startTreeReload({ dataProviderProps, rulesetId, pageSize, modelSource, renderedItems, onReload });
    });

    return () => {
      removeListener();
      subscription?.unsubscribe();
    };
  }, [dataProviderProps, modelSource, pageSize, rulesetId, onReload, renderedItems]);
}

function startTreeReload({ dataProviderProps, rulesetId, modelSource, pageSize, renderedItems, onReload }: Required<TreeReloadParams>): Subscription {
  const dataProvider = new PresentationTreeDataProvider({ ...dataProviderProps, ruleset: rulesetId });
  return reloadTree(modelSource.getModel(), dataProvider, pageSize, renderedItems.current).subscribe({
    next: (newModelSource) =>
      onReload({
        modelSource: newModelSource,
        dataProvider,
      }),
  });
}
