/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyGrid
 */

import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import { from, map, Subject, switchMap, takeLast } from "rxjs";
import { IModelConnection } from "@itwin/core-frontend";
import { KeySet } from "@itwin/presentation-common";
import { createIModelKey } from "@itwin/presentation-core-interop";
import { Presentation, SelectionChangeEventArgs, SelectionHandler } from "@itwin/presentation-frontend";
import { SelectionStorage } from "@itwin/unified-selection";
import { createKeySetFromSelectables, safeDispose } from "../common/Utils.js";
import { IPresentationPropertyDataProvider } from "./DataProvider.js";

const DEFAULT_REQUESTED_CONTENT_INSTANCES_LIMIT = 100;

/**
 * Props for the [[usePropertyDataProviderWithUnifiedSelection]] hook
 * @public
 */
export interface PropertyDataProviderWithUnifiedSelectionProps {
  /** The data provider used by the property grid. */
  dataProvider: IPresentationPropertyDataProvider;

  /**
   * Maximum number of instances to request content for.
   *
   * When the number of selected instances is higher than this value, `dataProvider.keys` is set to an
   * empty [KeySet]($presentation-common) and the result of the hook has `isOverLimit = true`.
   *
   * Defaults to `100`.
   */
  requestedContentInstancesLimit?: number;

  /**
   * Unified selection storage to use for listening and getting active selection.
   *
   * When not specified, the deprecated `SelectionManager` from `@itwin/presentation-frontend` package
   * is used.
   */
  selectionStorage?: SelectionStorage;
}

/**
 * [[usePropertyDataProviderWithUnifiedSelection]] return type.
 * @public
 */
export interface UsePropertyDataProviderWithUnifiedSelectionResult {
  /** Whether selected element count is exceeding the limit. */
  isOverLimit: boolean;
  /** Selected element count. */
  numSelectedElements: number;
}

const SelectionHandlerContext = createContext<SelectionHandler | undefined>(undefined);

/** @internal */
export function SelectionHandlerContextProvider({ selectionHandler, children }: PropsWithChildren<{ selectionHandler: SelectionHandler }>) {
  return <SelectionHandlerContext.Provider value={selectionHandler}>{children}</SelectionHandlerContext.Provider>;
}

/** @internal */
export function useSelectionHandlerContext() {
  return useContext(SelectionHandlerContext);
}

/**
 * A React hook that adds unified selection functionality to the provided data provider.
 * @public
 */
export function usePropertyDataProviderWithUnifiedSelection(
  props: PropertyDataProviderWithUnifiedSelectionProps,
): UsePropertyDataProviderWithUnifiedSelectionResult {
  const { dataProvider, selectionStorage } = props;
  const { imodel, rulesetId } = dataProvider;
  const requestedContentInstancesLimit = props.requestedContentInstancesLimit ?? DEFAULT_REQUESTED_CONTENT_INSTANCES_LIMIT;
  const [numSelectedElements, setNumSelectedElements] = useState(0);

  const suppliedSelectionHandler = useSelectionHandlerContext();

  useEffect(() => {
    function onSelectionChanged(newSelection: KeySet) {
      setNumSelectedElements(newSelection.size);
      dataProvider.keys = isOverLimit(newSelection.size, requestedContentInstancesLimit) ? new KeySet() : newSelection;
    }
    if (selectionStorage) {
      return initUnifiedSelectionFromStorage({ imodel, selectionStorage, onSelectionChanged });
    }
    return initUnifiedSelectionFromPresentationFrontend({
      imodel,
      rulesetId,
      suppliedSelectionHandler,
      onSelectionChanged,
    });
  }, [dataProvider, imodel, rulesetId, requestedContentInstancesLimit, suppliedSelectionHandler, selectionStorage]);

  return { isOverLimit: isOverLimit(numSelectedElements, requestedContentInstancesLimit), numSelectedElements };
}

function initUnifiedSelectionFromStorage({
  imodel,
  selectionStorage,
  onSelectionChanged,
}: {
  imodel: IModelConnection;
  selectionStorage: SelectionStorage;
  onSelectionChanged: (newSelection: KeySet) => void;
}) {
  const imodelKey = createIModelKey(imodel);
  const update = new Subject<number>();
  const subscription = update
    .pipe(
      map((level) => selectionStorage.getSelection({ imodelKey, level })),
      switchMap(async (selectables) => createKeySetFromSelectables(selectables)),
    )
    .subscribe({
      next: onSelectionChanged,
    });
  const removeSelectionChangesListener = selectionStorage.selectionChangeEvent.addListener((args) => {
    const isMyIModel = args.imodelKey === imodelKey;
    isMyIModel && update.next(args.level);
  });

  from(selectionStorage.getSelectionLevels({ imodelKey }))
    .pipe(takeLast(1))
    .subscribe({
      next: (level) => update.next(level),
    });

  return () => {
    removeSelectionChangesListener();
    subscription.unsubscribe();
  };
}

function initUnifiedSelectionFromPresentationFrontend({
  suppliedSelectionHandler,
  imodel,
  rulesetId,
  onSelectionChanged,
}: {
  suppliedSelectionHandler?: SelectionHandler;
  imodel: IModelConnection;
  rulesetId: string;
  onSelectionChanged: (newSelection: KeySet) => void;
}) {
  const updateProviderSelection = (selectionHandler: SelectionHandler, selectionLevel?: number) => {
    const selection = getSelectedKeys(selectionHandler, selectionLevel);
    selection && onSelectionChanged(selection);
  };

  /* c8 ignore start */
  const handler =
    suppliedSelectionHandler ??
    new SelectionHandler({
      manager: Presentation.selection,
      name: "PropertyGrid",
      imodel,
      rulesetId,
    });
  /* c8 ignore end */

  handler.onSelect = (evt: SelectionChangeEventArgs): void => {
    updateProviderSelection(handler, evt.level);
  };

  updateProviderSelection(handler);
  return () => {
    safeDispose(handler);
  };
}

function getSelectedKeys(selectionHandler: SelectionHandler, selectionLevel?: number): KeySet | undefined {
  if (undefined === selectionLevel) {
    const availableLevels = selectionHandler.getSelectionLevels();
    if (0 === availableLevels.length) {
      return undefined;
    }
    selectionLevel = availableLevels[availableLevels.length - 1];
  }

  for (let i = selectionLevel; i >= 0; i--) {
    const selection = selectionHandler.getSelection(i);
    if (!selection.isEmpty) {
      return new KeySet(selection);
    }
  }
  return new KeySet();
}

function isOverLimit(numSelectedElements: number, limit: number): boolean {
  return numSelectedElements > limit;
}
