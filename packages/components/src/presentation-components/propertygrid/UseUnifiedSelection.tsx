/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyGrid
 */

import { useEffect, useState } from "react";
import { from, map, Subject, switchMap, takeLast } from "rxjs";
import { IModelConnection } from "@itwin/core-frontend";
import { KeySet } from "@itwin/presentation-common";
import { createIModelKey } from "@itwin/presentation-core-interop";
import { SelectionStorage } from "@itwin/unified-selection";
import { createKeySetFromSelectables } from "../common/Utils.js";
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
   */
  selectionStorage: SelectionStorage;
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

/**
 * A React hook that adds unified selection functionality to the provided data provider.
 * @public
 */
export function usePropertyDataProviderWithUnifiedSelection(
  props: PropertyDataProviderWithUnifiedSelectionProps,
): UsePropertyDataProviderWithUnifiedSelectionResult {
  const { dataProvider, selectionStorage } = props;
  const { imodel, rulesetId } = dataProvider;
  const requestedContentInstancesLimit =
    props.requestedContentInstancesLimit ?? DEFAULT_REQUESTED_CONTENT_INSTANCES_LIMIT;
  const [numSelectedElements, setNumSelectedElements] = useState(0);

  useEffect(() => {
    function onSelectionChanged(newSelection: KeySet) {
      setNumSelectedElements(newSelection.size);
      dataProvider.keys = isOverLimit(newSelection.size, requestedContentInstancesLimit) ? new KeySet() : newSelection;
    }
    return initUnifiedSelectionFromStorage({ imodel, selectionStorage, onSelectionChanged });
  }, [dataProvider, imodel, rulesetId, requestedContentInstancesLimit, selectionStorage]);

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
    .subscribe({ next: onSelectionChanged });
  const removeSelectionChangesListener = selectionStorage.selectionChangeEvent.addListener((args) => {
    const isMyIModel = args.imodelKey === imodelKey;
    isMyIModel && update.next(args.level);
  });

  from(selectionStorage.getSelectionLevels({ imodelKey }))
    .pipe(takeLast(1))
    .subscribe({ next: (level) => update.next(level) });

  return () => {
    removeSelectionChangesListener();
    subscription.unsubscribe();
  };
}

function isOverLimit(numSelectedElements: number, limit: number): boolean {
  return numSelectedElements > limit;
}
