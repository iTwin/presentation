/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { forkJoin, from, map } from "rxjs";
import { computePropertySelectorId } from "../../definition-building/ValueSelector.js";

import type { Observable } from "rxjs";
import type { Value } from "@itwin/presentation-shared";
import type { ExternalFieldsProvider, InputPropertyDeclaration } from "../../extensions/ExternalFieldsProvider.js";
import type { ContentDescriptor } from "../../model/ContentDescriptor.js";

/**
 * Populates one page's worth of rows with external field values, keyed by field ID and aligned by
 * row index with the given rows.
 */
export type ExternalValuePopulator = (
  rows: ReadonlyArray<{ selectorValues: Map<string, Value> }>,
) => Observable<Array<Record<string, Value>>>;

/** A provider's declared fields and inputs, resolved against one descriptor. */
interface ProviderPlan {
  provider: ExternalFieldsProvider;
  /** Input key -> the selector its value is read from. */
  inputs: Array<{ key: string; selectorId: string; cardinalityHint?: "one" | "many" }>;
  /** Provider-local field id -> descriptor (global) field id, restricted to fields still in the descriptor. */
  outputs: Array<{ localId: string; fieldId: string }>;
}

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
  providers?: ExternalFieldsProvider[];
  prepared?: ProviderPlan[];
}): ExternalValuePopulator | undefined {
  const { descriptor, providers = [], prepared } = props;
  const plans =
    prepared ??
    providers
      .map((provider) => createProviderPlan({ descriptor, provider }))
      .filter((plan): plan is ProviderPlan => plan !== undefined);
  assertEveryExternalFieldIsProvided({ descriptor, plans });
  if (plans.length === 0) {
    return undefined;
  }
  return (rows) =>
    forkJoin(plans.map((plan) => populateFromProvider({ plan, rows }))).pipe(
      map((perProvider) => mergeRows({ rowCount: rows.length, perProvider })),
    );
}

function assertEveryExternalFieldIsProvided(props: { descriptor: ContentDescriptor; plans: ProviderPlan[] }): void {
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

function createProviderPlan(props: {
  descriptor: ContentDescriptor;
  provider: ExternalFieldsProvider;
}): ProviderPlan | undefined {
  const { descriptor, provider } = props;
  const outputs = provider.fields
    .map((declaration) => ({ localId: declaration.id, fieldId: `${provider.id}:${declaration.id}` }))
    .filter((output) => output.fieldId in descriptor.fields);
  if (outputs.length === 0) {
    return undefined;
  }
  const inputs: ProviderPlan["inputs"] = [];
  if (provider.inputs) {
    const entries: ReadonlyArray<[string, InputPropertyDeclaration]> = Object.entries(provider.inputs);
    for (const [key, declaration] of entries) {
      inputs.push({
        key,
        selectorId: computePropertySelectorId({
          propertyClassName: declaration.propertyClassName,
          propertyName: declaration.propertyName,
          pathFromTarget: declaration.path,
        }),
        cardinalityHint: declaration.cardinalityHint,
      });
    }
  }
  return { provider, inputs, outputs };
}

function populateFromProvider(props: {
  plan: ProviderPlan;
  rows: ReadonlyArray<{ selectorValues: Map<string, Value> }>;
}): Observable<Array<Record<string, Value>>> {
  const { plan, rows } = props;
  const items = rows.map((row) => ({
    inputValues: Object.fromEntries(
      plan.inputs.map(({ key, selectorId, cardinalityHint }) => {
        const value = row.selectorValues.get(selectorId);
        return [key, value ?? (cardinalityHint === "many" ? [] : undefined)];
      }),
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
