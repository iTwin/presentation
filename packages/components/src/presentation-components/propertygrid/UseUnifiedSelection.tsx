/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyGrid
 */

import { useEffect, useState } from "react";
import { KeySet } from "@itwin/presentation-common";
import { Presentation, SelectionChangeEventArgs, SelectionHandler } from "@itwin/presentation-frontend";
import { IPresentationPropertyDataProvider } from "./DataProvider";

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

  /** @internal */
  selectionHandler?: SelectionHandler;
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
  const { dataProvider, selectionHandler: suppliedSelectionHandler } = props;
  const { imodel, rulesetId } = dataProvider;
  const requestedContentInstancesLimit = props.requestedContentInstancesLimit ?? DEFAULT_REQUESTED_CONTENT_INSTANCES_LIMIT;

  const [numSelectedElements, setNumSelectedElements] = useState(0);

  useEffect(() => {
    const updateProviderSelection = (selectionHandler: SelectionHandler, selectionLevel?: number) => {
      const selection = getSelectedKeys(selectionHandler, selectionLevel);
      if (selection) {
        setNumSelectedElements(selection.size);
        dataProvider.keys = isOverLimit(selection.size, requestedContentInstancesLimit) ? new KeySet() : selection;
      }
    };

    // istanbul ignore next
    const handler =
      suppliedSelectionHandler ??
      new SelectionHandler({
        manager: Presentation.selection,
        name,
        imodel,
        rulesetId,
      });

    handler.onSelect = (evt: SelectionChangeEventArgs): void => {
      updateProviderSelection(handler, evt.level);
    };

    updateProviderSelection(handler);
    return () => {
      handler.dispose();
    };
  }, [dataProvider, imodel, rulesetId, requestedContentInstancesLimit, suppliedSelectionHandler]);

  return { isOverLimit: isOverLimit(numSelectedElements, requestedContentInstancesLimit), numSelectedElements };
}

const name = `PropertyGrid`;

function getSelectedKeys(selectionHandler: SelectionHandler, selectionLevel?: number): KeySet | undefined {
  if (undefined === selectionLevel) {
    const availableLevels = selectionHandler.getSelectionLevels();
    if (0 === availableLevels.length) return undefined;
    selectionLevel = availableLevels[availableLevels.length - 1];
  }

  for (let i = selectionLevel; i >= 0; i--) {
    const selection = selectionHandler.getSelection(i);
    if (!selection.isEmpty) return new KeySet(selection);
  }
  return new KeySet();
}

function isOverLimit(numSelectedElements: number, limit: number): boolean {
  return numSelectedElements > limit;
}
