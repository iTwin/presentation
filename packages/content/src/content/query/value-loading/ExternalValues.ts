/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { forkJoin, from, map } from "rxjs";
import { assert } from "@itwin/core-bentley";
import { getRelatedSelectorValues } from "./RowDecoder.js";

import type { Observable } from "rxjs";
import type { Value } from "@itwin/presentation-shared";
import type { ExternalProviderPlan } from "../../definition-building/ExternalProviders.js";
import type { ExternalFieldsProvider } from "../../extensions/ExternalFieldsProvider.js";
import type { ContentDescriptor } from "../../model/ContentDescriptor.js";
import type { GroupValues } from "./RowDecoder.js";

/**
 * Populates one page's worth of rows with external field values, keyed by field ID and aligned by
 * row index with the given rows.
 */
export type ExternalValuePopulator = (rows: ReadonlyArray<GroupValues>) => Observable<Array<Record<string, Value>>>;

/**
 * Builds a page-scoped populator that calls every configured external fields provider with a page's
 * pre-extracted input values and merges the results back by row index. Returns `undefined` when there
 * is nothing to do — no providers configured and no external fields declared, or every provider's
 * declared fields were removed from the descriptor (by a descriptor transformer) — so callers can skip
 * the enrichment step entirely.
 *
 * @throws if the descriptor declares an external field that no configured provider populates — a
 * misconfigured registration (missing or mismatched provider) rather than something a page can recover
 * from.
 */
export function createExternalValuePopulator(props: {
  descriptor: ContentDescriptor;
  plans: ExternalProviderPlan[];
}): ExternalValuePopulator | undefined {
  const { descriptor, plans } = props;
  assertEveryExternalFieldIsProvided({ descriptor, plans });
  if (plans.length === 0) {
    return undefined;
  }
  return (rows) =>
    forkJoin(plans.map((plan) => populateFromProvider({ plan, rows }))).pipe(
      map((perProvider) => mergeRows({ rowCount: rows.length, perProvider })),
    );
}

function assertEveryExternalFieldIsProvided(props: {
  descriptor: ContentDescriptor;
  plans: ExternalProviderPlan[];
}): void {
  const { descriptor, plans } = props;
  const populatedFieldIds = new Set(plans.flatMap((plan) => plan.outputs.map((output) => output.fieldId)));
  const unprovidedFieldIds = Object.values(descriptor.fields)
    .filter((field) => field.kind === "external" && !populatedFieldIds.has(field.id))
    .map((field) => field.id);
  if (unprovidedFieldIds.length > 0) {
    throw new Error(
      `No external fields provider is registered to populate field(s): ${unprovidedFieldIds.map((id) => `"${id}"`).join(", ")}.`,
    );
  }
}

function populateFromProvider(props: {
  plan: ExternalProviderPlan;
  rows: ReadonlyArray<GroupValues>;
}): Observable<Array<Record<string, Value>>> {
  const { plan, rows } = props;
  const items = rows.map((row) => ({
    inputValues: Object.fromEntries(
      plan.inputs.map((input) => [input.key, readInputValue({ input, row, providerId: plan.provider.id })]),
    ),
  }));
  return from(plan.provider.getValues({ items })).pipe(
    map((records) => {
      if (records.length !== items.length) {
        throw new Error(
          `External fields provider "${plan.provider.id}" returned ${records.length} value records for a batch of ${items.length} items.`,
        );
      }
      return records.map((record) => {
        const values: Record<string, Value> = {};
        for (const { localId, fieldId } of plan.outputs) {
          const value = record[localId];
          if (value !== undefined) {
            values[fieldId] = value;
          }
        }
        return values;
      });
    }),
  );
}

function readInputValue(props: {
  input: ExternalProviderPlan["inputs"][number];
  row: GroupValues;
  providerId: ExternalFieldsProvider["id"];
}): Value {
  const { input, row, providerId } = props;
  if (input.selectors.length === 1 && input.selectors[0].pathKey === undefined) {
    // A direct input reads the primary instance's one entry, preserving native EC arrays inside it.
    return row.selectorValues.get(input.selectors[0].selectorId)?.[0];
  }

  // Combine all resolved paths, keeping one value per related instance, including missing property values.
  const values: Value[] = [];
  for (const { selectorId, pathKey } of input.selectors) {
    assert(pathKey !== undefined, `Missing resolved path for external input "${input.key}".`);
    for (const value of getRelatedSelectorValues({ values: row, selectorId, pathKey })) {
      values.push(value);
    }
  }
  if (input.cardinality === "many") {
    // A many-valued input requires an array even when there are zero or one related instances.
    return values;
  }
  // A one-valued input permits at most one instance across all paths, even if its property value is missing.
  if (values.length > 1) {
    throw new Error(
      `External fields provider "${providerId}" input "${input.key}" has more than one related instance across its resolved paths despite "one" input cardinality.`,
    );
  }
  // Return the single property's value as-is, or undefined when no related instance exists.
  return values[0];
}

function mergeRows(props: {
  rowCount: number;
  /** One entry per provider, each holding one values record per row (aligned by index with the page's rows). */
  perProvider: Array<Array<Record<string, Value>>>;
}): Array<Record<string, Value>> {
  const { rowCount, perProvider } = props;
  const merged: Array<Record<string, Value>> = Array.from({ length: rowCount }, () => ({}));
  for (const providerRows of perProvider) {
    for (const [index, values] of providerRows.entries()) {
      Object.assign(merged[index], values);
    }
  }
  return merged;
}
