/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from "react";
import { getUniqueFieldValues } from "./UniqueFieldValues.js";

import type { GetUniqueFieldValuesProps, UniqueFieldValue } from "./UniqueFieldValues.js";

/**
 * Return of a {@link useUniqueFieldValues}.
 *
 * @public
 */
export interface UseUniqueFieldValuesResult {
  /** Loaded values, in the order their display value was first encountered. Empty until the load completes. */
  values: UniqueFieldValue[];
  /** Whether a load is in progress. */
  isLoading: boolean;
}

/**
 * Props for {@link useUniqueFieldValues}.
 *
 * @public
 */
export type UseUniqueFieldValuesProps = GetUniqueFieldValuesProps;

const INITIAL_STATE: UseUniqueFieldValuesResult = { values: [], isLoading: false };

/**
 * Loads a field's unique values for displaying in UI — typically to populate a filter builder's value
 * selector when an equality operator is picked.
 *
 * Raw values that format to the same display value are grouped together, so selecting a display value
 * gives the consumer every raw value needed to build a correct filter. See {@link UniqueFieldValue}.
 *
 * Values are reloaded whenever any of the props change, so `targets` and `valueFormatter` should be
 * stable references (e.g. memoized) to avoid reloading on every render.
 *
 * @public
 */
export function useUniqueFieldValues({
  imodelAccess,
  field,
  valueFormatter,
}: UseUniqueFieldValuesProps): UseUniqueFieldValuesResult {
  const [state, setState] = useState<UseUniqueFieldValuesResult>(INITIAL_STATE);

  useEffect(() => {
    const controller = new AbortController();
    setState({ ...INITIAL_STATE, isLoading: true });
    const loadValues = async () => {
      try {
        const result = await getUniqueFieldValues({
          imodelAccess,
          field,
          valueFormatter,
          abortSignal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setState({ values: result.values, isLoading: false });
        }
      } catch {
        if (!controller.signal.aborted) {
          setState({ ...INITIAL_STATE });
        }
      }
    };

    void loadValues();
    return () => {
      controller.abort();
    };
  }, [imodelAccess, field, valueFormatter]);

  return state;
}
