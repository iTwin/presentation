/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from "react";
import { BeEvent } from "@itwin/core-bentley";
import { groupUniqueFieldValues, loadUniqueFieldRawValues } from "./UniqueFieldValues.js";

import type { ReadonlyCalculatedField, ReadonlyPropertyField } from "@itwin/presentation-content";
import type { ECSchemaProvider, ECSqlQueryExecutor, IPrimitiveValueFormatter, Value } from "@itwin/presentation-shared";
import type { GetUniqueFieldValuesProps, UniqueFieldValue } from "./UniqueFieldValues.js";

/**
 * Return of a {@link useUniqueFieldValues}.
 *
 * @public
 */
export interface UseUniqueFieldValuesResult {
  /**
   * Loaded values, in the order their display value was first encountered. Empty until the first load
   * completes. While values are reformatted after `valueFormatter` changes, holds the previous values.
   */
  values: UniqueFieldValue[];
  /** Whether values are being loaded or reformatted. */
  isLoading: boolean;
}

/**
 * Props for {@link useUniqueFieldValues}.
 *
 * @public
 */
export type UseUniqueFieldValuesProps = GetUniqueFieldValuesProps;

/**
 * Loads a field's unique values for displaying in UI — typically to populate a filter builder's value
 * selector when an equality operator is picked.
 *
 * Raw values that format to the same display value are grouped together, so selecting a display value
 * gives the consumer every raw value needed to build a correct filter. See {@link UniqueFieldValue}.
 *
 * Raw values are reloaded whenever `imodelAccess` or `field` changes. Changing `valueFormatter` only
 * reformats and regroups the already loaded raw values. All props should be stable references (e.g.
 * memoized) to avoid reloading or reformatting on every render.
 *
 * @public
 */
export function useUniqueFieldValues({
  imodelAccess,
  field,
  valueFormatter,
}: UseUniqueFieldValuesProps): UseUniqueFieldValuesResult {
  const [loader] = useState(() => new UniqueFieldValuesLoader());
  const [state, setState] = useState<UseUniqueFieldValuesResult>({ values: [], isLoading: true });

  // Declared before the subscription below, so the loader has its inputs before values are first requested.
  useEffect(() => {
    loader.setIModelAccess(imodelAccess);
    loader.setField(field);
    loader.setValueFormatter(valueFormatter);
  }, [loader, imodelAccess, field, valueFormatter]);

  useEffect(() => {
    let latestRequest: object | undefined;
    const requestValues = async () => {
      const request = {};
      latestRequest = request;
      // Previous values stay visible while already loaded raw values are only being reformatted.
      const keepValues = loader.hasRawValues;
      setState((prev) => ({ values: keepValues ? prev.values : [], isLoading: true }));
      let values: UniqueFieldValue[];
      try {
        values = await loader.getValues();
      } catch {
        values = [];
      }
      // A superseded request rejects when its values get invalidated — only the latest one matters.
      if (request === latestRequest) {
        setState({ values, isLoading: false });
      }
    };
    const onValuesChanged = () => void requestValues();
    onValuesChanged();
    const removeListener = loader.onValuesChanged.addListener(onValuesChanged);
    return () => {
      removeListener();
      latestRequest = undefined;
      loader.cancel();
    };
  }, [loader]);

  return state;
}

/**
 * Loads and formats unique values of a field, keeping both raw and formatted values so that a changed
 * formatter only triggers reformatting rather than another query.
 *
 * Setters clear whatever stored values the change invalidates, cancel work in progress on them, and
 * raise {@link UniqueFieldValuesLoader.onValuesChanged}. Consumers react by calling
 * {@link UniqueFieldValuesLoader.getValues}, which redoes only the invalidated steps.
 */
class UniqueFieldValuesLoader {
  #imodelAccess?: ECSqlQueryExecutor & ECSchemaProvider;
  #field?: ReadonlyPropertyField | ReadonlyCalculatedField;
  #valueFormatter?: IPrimitiveValueFormatter;
  #rawValues?: CachedValues<Value[]>;
  #formattedValues?: CachedValues<UniqueFieldValue[]>;

  /** Raised when stored values get invalidated and {@link UniqueFieldValuesLoader.getValues} should be called again. */
  public readonly onValuesChanged = new BeEvent<() => void>();

  /** Whether raw values are loaded, meaning {@link UniqueFieldValuesLoader.getValues} only needs to format them. */
  public get hasRawValues(): boolean {
    return this.#rawValues?.values !== undefined;
  }

  public setIModelAccess(imodelAccess: ECSqlQueryExecutor & ECSchemaProvider): void {
    if (imodelAccess !== this.#imodelAccess) {
      this.#imodelAccess = imodelAccess;
      this.#invalidate("raw");
    }
  }

  public setField(field: ReadonlyPropertyField | ReadonlyCalculatedField): void {
    if (field !== this.#field) {
      this.#field = field;
      this.#invalidate("raw");
    }
  }

  public setValueFormatter(valueFormatter: IPrimitiveValueFormatter | undefined): void {
    if (valueFormatter !== this.#valueFormatter) {
      this.#valueFormatter = valueFormatter;
      this.#invalidate("formatted");
    }
  }

  /**
   * Returns formatted and grouped values, loading raw values only if they aren't loaded yet. Rejects if
   * the values get invalidated or {@link UniqueFieldValuesLoader.cancel} is called before they're ready.
   */
  public async getValues(): Promise<UniqueFieldValue[]> {
    const field = this.#field;
    if (!field) {
      throw new Error("Field must be set before getting unique values.");
    }
    if (!this.#formattedValues) {
      const rawValues = this.#getRawValues(field);
      const valueFormatter = this.#valueFormatter;
      this.#formattedValues = createCachedValues(async (abortSignal) =>
        groupUniqueFieldValues({ field, rawValues: await rawValues, valueFormatter, abortSignal }),
      );
    }
    return this.#formattedValues.promise;
  }

  /** Cancels work in progress. Values that aren't loaded yet are loaded on the next {@link UniqueFieldValuesLoader.getValues} call. */
  public cancel(): void {
    if (this.#rawValues && !this.#rawValues.values) {
      this.#clear("raw");
    } else if (this.#formattedValues && !this.#formattedValues.values) {
      this.#clear("formatted");
    }
  }

  async #getRawValues(field: ReadonlyPropertyField | ReadonlyCalculatedField): Promise<Value[]> {
    const imodelAccess = this.#imodelAccess;
    if (!imodelAccess) {
      throw new Error("iModel access must be set before getting unique values.");
    }
    if (!this.#rawValues) {
      this.#rawValues = createCachedValues(async (abortSignal) =>
        loadUniqueFieldRawValues({ imodelAccess, field, abortSignal }),
      );
    }
    return this.#rawValues.promise;
  }

  #invalidate(what: "raw" | "formatted") {
    this.#clear(what);
    this.onValuesChanged.raiseEvent();
  }

  #clear(what: "raw" | "formatted") {
    this.#formattedValues?.controller.abort();
    this.#formattedValues = undefined;
    if (what === "raw") {
      this.#rawValues?.controller.abort();
      this.#rawValues = undefined;
    }
  }
}

/** Values being loaded by a cancellable operation, with `values` set once the operation completes. */
interface CachedValues<T> {
  promise: Promise<T>;
  controller: AbortController;
  values?: T;
}

function createCachedValues<T>(load: (abortSignal: AbortSignal) => Promise<T>): CachedValues<T> {
  const controller = new AbortController();
  const entry: CachedValues<T> = { promise: load(controller.signal), controller };
  // The handler also prevents an unhandled rejection when values get invalidated with nobody awaiting them.
  entry.promise.then(
    (values) => {
      entry.values = values;
    },
    () => {},
  );
  return entry;
}
