/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { MutableRefObject, useEffect } from "react";
import { RenderedItemsRange, Subscription, TreeModelSource } from "@itwin/components-react";
import { IModelApp } from "@itwin/core-frontend";
import { IModelHierarchyChangeEventArgs, Presentation } from "@itwin/presentation-frontend";
import { getRulesetId } from "../../common/Utils.js";
import { PresentationTreeDataProvider, PresentationTreeDataProviderProps } from "../DataProvider.js";
import { reloadTree } from "./TreeReloader.js";

/** @internal */
export interface ReloadedTree {
  modelSource: TreeModelSource;
  dataProvider: PresentationTreeDataProvider;
}

/** @internal */
export interface TreeReloadParams {
  dataProviderProps: PresentationTreeDataProviderProps;
  pageSize: number;
  modelSource: MutableRefObject<TreeModelSource | undefined>;
  onReload: (params: ReloadedTree) => void;
  renderedItems: MutableRefObject<RenderedItemsRange | undefined>;
}

/** @internal */
export function useTreeReload(params: TreeReloadParams) {
  useModelSourceUpdateOnIModelHierarchyUpdate(params);
  useModelSourceUpdateOnRulesetModification(params);
  useModelSourceUpdateOnRulesetVariablesChange(params);
  useModelSourceUpdateOnUnitSystemChange(params);
  useModelSourceUpdateOnBriefcaseUpdate(params);
}

function useModelSourceUpdateOnBriefcaseUpdate(params: TreeReloadParams): void {
  const { dataProviderProps, pageSize, modelSource, onReload, renderedItems } = params;

  useEffect(() => {
    if (!dataProviderProps.imodel.isBriefcaseConnection()) {
      return;
    }

    let subscription: Subscription | undefined;
    const reload = () => {
      const currentModelSource = modelSource?.current;
      if (!currentModelSource || !dataProviderProps.imodel.isBriefcaseConnection()) {
        return;
      }
      /* v8 ignore next -- @preserve */
      subscription?.unsubscribe();
      subscription = startTreeReload({
        dataProviderProps,
        pageSize,
        modelSource: currentModelSource,
        renderedItems: renderedItems.current,
        onReload,
      });
    };

    const removePullListener = dataProviderProps.imodel.txns.onChangesPulled.addListener(reload);
    const removePushListener = dataProviderProps.imodel.txns.onChangesPushed.addListener(reload);

    return () => {
      removePullListener();
      removePushListener();
      subscription?.unsubscribe();
    };
  }, [modelSource, pageSize, dataProviderProps, onReload, renderedItems]);
}

function useModelSourceUpdateOnIModelHierarchyUpdate(params: TreeReloadParams): void {
  const { dataProviderProps, pageSize, modelSource, onReload, renderedItems } = params;

  useEffect(() => {
    let subscription: Subscription | undefined;
    const removeListener = Presentation.presentation.onIModelHierarchyChanged.addListener(
      (args: IModelHierarchyChangeEventArgs) => {
        if (
          args.rulesetId !== getRulesetId(dataProviderProps.ruleset) ||
          args.imodelKey !== dataProviderProps.imodel.key
        ) {
          return;
        }

        const currentModelSource = modelSource?.current;
        if (!currentModelSource) {
          return;
        }

        /* v8 ignore next -- @preserve */
        subscription?.unsubscribe();
        subscription = startTreeReload({
          dataProviderProps,
          pageSize,
          modelSource: currentModelSource,
          renderedItems: renderedItems.current,
          onReload,
        });
      },
    );

    return () => {
      removeListener();
      subscription?.unsubscribe();
    };
  }, [modelSource, pageSize, dataProviderProps, onReload, renderedItems]);
}

function useModelSourceUpdateOnRulesetModification(params: TreeReloadParams): void {
  const { dataProviderProps, pageSize, modelSource, onReload, renderedItems } = params;

  useEffect(() => {
    let subscription: Subscription | undefined;
    const removeListener = Presentation.presentation.rulesets().onRulesetModified.addListener((modifiedRuleset) => {
      if (modifiedRuleset.id !== getRulesetId(dataProviderProps.ruleset)) {
        return;
      }

      const currentModelSource = modelSource?.current;
      if (!currentModelSource) {
        return;
      }

      // use ruleset id as only registered rulesets can be modified.
      /* v8 ignore next -- @preserve */
      subscription?.unsubscribe();
      subscription = startTreeReload({
        dataProviderProps: { ...dataProviderProps, ruleset: modifiedRuleset.id },
        pageSize,
        modelSource: currentModelSource,
        renderedItems: renderedItems.current,
        onReload,
      });
    });

    return () => {
      removeListener();
      subscription?.unsubscribe();
    };
  }, [dataProviderProps, modelSource, pageSize, onReload, renderedItems]);
}

function useModelSourceUpdateOnRulesetVariablesChange(params: TreeReloadParams): void {
  const { dataProviderProps, pageSize, modelSource, onReload, renderedItems } = params;

  useEffect(() => {
    let subscription: Subscription | undefined;
    const removeListener = Presentation.presentation
      .vars(getRulesetId(dataProviderProps.ruleset))
      .onVariableChanged.addListener(() => {
        const currentModelSource = modelSource?.current;
        if (!currentModelSource) {
          return;
        }

        // note: we should probably debounce these events while accumulating changed variables in case multiple vars are changed
        /* v8 ignore next -- @preserve */
        subscription?.unsubscribe();
        subscription = startTreeReload({
          dataProviderProps,
          pageSize,
          modelSource: currentModelSource,
          renderedItems: renderedItems.current,
          onReload,
        });
      });

    return () => {
      removeListener();
      subscription?.unsubscribe();
    };
  }, [dataProviderProps, modelSource, pageSize, onReload, renderedItems]);
}

function useModelSourceUpdateOnUnitSystemChange(params: TreeReloadParams): void {
  const { dataProviderProps, pageSize, modelSource, onReload, renderedItems } = params;

  useEffect(() => {
    let subscription: Subscription | undefined;
    const removeListener = IModelApp.quantityFormatter.onActiveFormattingUnitSystemChanged.addListener(() => {
      const currentModelSource = modelSource?.current;
      if (!currentModelSource) {
        return;
      }

      /* v8 ignore next -- @preserve */
      subscription?.unsubscribe();
      subscription = startTreeReload({
        dataProviderProps,
        pageSize,
        modelSource: currentModelSource,
        renderedItems: renderedItems.current,
        onReload,
      });
    });

    return () => {
      removeListener();
      subscription?.unsubscribe();
    };
  }, [dataProviderProps, modelSource, pageSize, onReload, renderedItems]);
}

function startTreeReload({
  dataProviderProps,
  modelSource,
  pageSize,
  renderedItems,
  onReload,
}: Omit<Required<TreeReloadParams>, "modelSource" | "renderedItems"> & {
  modelSource: TreeModelSource;
  renderedItems: RenderedItemsRange | undefined;
}): Subscription {
  const dataProvider = new PresentationTreeDataProvider(dataProviderProps);
  return reloadTree(modelSource.getModel(), dataProvider, pageSize, renderedItems).subscribe({
    next: (newModelSource) => onReload({ modelSource: newModelSource, dataProvider }),
  });
}
