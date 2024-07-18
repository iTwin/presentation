/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { MutableRefObject, useEffect } from "react";
import { RenderedItemsRange, Subscription, TreeModelSource } from "@itwin/components-react";
import { IModelApp } from "@itwin/core-frontend";
import { Ruleset } from "@itwin/presentation-common";
import { IModelHierarchyChangeEventArgs, Presentation } from "@itwin/presentation-frontend";
import { getRulesetId } from "../../common/Utils";
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
  ruleset: string | Ruleset;
  modelSource?: TreeModelSource;
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
  const { dataProviderProps, ruleset, pageSize, modelSource, onReload, renderedItems } = params;

  useEffect(() => {
    if (!modelSource || !dataProviderProps.imodel.isBriefcaseConnection()) {
      return;
    }

    let subscription: Subscription | undefined;
    const removeListener = dataProviderProps.imodel.txns.onChangesApplied.addListener(() => {
      subscription?.unsubscribe();
      subscription = startTreeReload({ dataProviderProps, ruleset, pageSize, modelSource, renderedItems, onReload });
    });

    return () => {
      removeListener();
      subscription?.unsubscribe();
    };
  }, [modelSource, pageSize, dataProviderProps, ruleset, onReload, renderedItems]);
}

function useModelSourceUpdateOnIModelHierarchyUpdate(params: TreeReloadParams): void {
  const { dataProviderProps, ruleset, pageSize, modelSource, onReload, renderedItems } = params;

  useEffect(() => {
    if (!modelSource) {
      return;
    }

    let subscription: Subscription | undefined;
    const removeListener = Presentation.presentation.onIModelHierarchyChanged.addListener((args: IModelHierarchyChangeEventArgs) => {
      if (args.rulesetId !== getRulesetId(ruleset) || args.imodelKey !== dataProviderProps.imodel.key) {
        return;
      }

      subscription?.unsubscribe();
      subscription = startTreeReload({ dataProviderProps, ruleset, pageSize, modelSource, renderedItems, onReload });
    });

    return () => {
      removeListener();
      subscription?.unsubscribe();
    };
  }, [modelSource, pageSize, dataProviderProps, ruleset, onReload, renderedItems]);
}

function useModelSourceUpdateOnRulesetModification(params: TreeReloadParams): void {
  const { dataProviderProps, ruleset, pageSize, modelSource, onReload, renderedItems } = params;

  useEffect(() => {
    if (!modelSource) {
      return;
    }

    let subscription: Subscription | undefined;
    const removeListener = Presentation.presentation.rulesets().onRulesetModified.addListener((modifiedRuleset) => {
      if (modifiedRuleset.id !== getRulesetId(ruleset)) {
        return;
      }

      // use ruleset id as only registered rulesets can be modified.
      subscription?.unsubscribe();
      subscription = startTreeReload({ dataProviderProps, ruleset: modifiedRuleset.id, pageSize, modelSource, renderedItems, onReload });
    });

    return () => {
      removeListener();
      subscription?.unsubscribe();
    };
  }, [dataProviderProps, ruleset, modelSource, pageSize, onReload, renderedItems]);
}

function useModelSourceUpdateOnRulesetVariablesChange(params: TreeReloadParams): void {
  const { dataProviderProps, pageSize, ruleset, modelSource, onReload, renderedItems } = params;

  useEffect(() => {
    if (!modelSource) {
      return;
    }

    let subscription: Subscription | undefined;
    const removeListener = Presentation.presentation.vars(getRulesetId(ruleset)).onVariableChanged.addListener(() => {
      // note: we should probably debounce these events while accumulating changed variables in case multiple vars are changed
      subscription?.unsubscribe();
      subscription = startTreeReload({ dataProviderProps, ruleset, pageSize, modelSource, renderedItems, onReload });
    });

    return () => {
      removeListener();
      subscription?.unsubscribe();
    };
  }, [dataProviderProps, modelSource, pageSize, ruleset, onReload, renderedItems]);
}

function useModelSourceUpdateOnUnitSystemChange(params: TreeReloadParams): void {
  const { dataProviderProps, pageSize, ruleset, modelSource, onReload, renderedItems } = params;

  useEffect(() => {
    if (!modelSource) {
      return;
    }

    let subscription: Subscription | undefined;
    const removeListener = IModelApp.quantityFormatter.onActiveFormattingUnitSystemChanged.addListener(() => {
      subscription?.unsubscribe();
      subscription = startTreeReload({ dataProviderProps, ruleset, pageSize, modelSource, renderedItems, onReload });
    });

    return () => {
      removeListener();
      subscription?.unsubscribe();
    };
  }, [dataProviderProps, modelSource, pageSize, ruleset, onReload, renderedItems]);
}

function startTreeReload({ dataProviderProps, ruleset, modelSource, pageSize, renderedItems, onReload }: Required<TreeReloadParams>): Subscription {
  const dataProvider = new PresentationTreeDataProvider({ ...dataProviderProps, ruleset });
  return reloadTree(modelSource.getModel(), dataProvider, pageSize, renderedItems.current).subscribe({
    next: (newModelSource) =>
      onReload({
        modelSource: newModelSource,
        dataProvider,
      }),
  });
}
