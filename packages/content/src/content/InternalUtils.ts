/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass } from "@itwin/presentation-shared";

import type { EC, ECSchemaProvider, ECSqlBinding } from "@itwin/presentation-shared";

/**
 * Prefix applied to internally generated ECSQL binding names
 * to avoid collisions with consumer-supplied filter bindings.
 *
 * @internal
 */
export const ECSQL_PREFIX = "pres_";

/**
 * Alias assigned to the primary (target) class in generated content queries. Matches the default
 * `primaryClassAlias` / `targetAlias` of the public `instanceFilter` / calculated-field APIs, so
 * consumer-authored expressions referencing `this.` resolve against the same alias.
 *
 * @internal
 */
export const PRIMARY_CLASS_ALIAS = "this";

/**
 * Rewrites references to `fromAlias` within a consumer-authored ECSQL expression to the query's actual
 * `toAlias`, handling both the bracketed (`[fromAlias].`) and bare (`fromAlias.`) forms. Only alias
 * references followed by a member access (a `.`) are rewritten; a bare occurrence not followed by `.`
 * is left untouched. Used to bind an expression's chosen alias (an instance filter's
 * `primaryClassAlias` or a calculated field's `targetAlias`) to {@link PRIMARY_CLASS_ALIAS}.
 *
 * @internal
 */
export function substituteExpressionAlias(props: { expression: string; fromAlias: string; toAlias: string }): string {
  const pattern = new RegExp(`(?:\\[${props.fromAlias}\\]|\\b${props.fromAlias})\\.`, "g");
  return props.expression.replace(pattern, `[${props.toAlias}].`);
}

/**
 * Gets the entry for `key` from `map`, or inserts and returns `createFunc()` when absent.
 * Accepts any map-like object — both `Map` and `WeakMap` satisfy the structural constraint.
 *
 * @internal
 */
export function getOrCreate<TKey, TValue>({
  map,
  key,
  createFunc,
}: {
  map: { get(key: TKey): TValue | undefined; set(key: TKey, value: TValue): unknown };
  key: TKey;
  createFunc: () => TValue;
}): TValue {
  let entry = map.get(key);
  if (entry === undefined) {
    entry = createFunc();
    map.set(key, entry);
  }
  return entry;
}

/**
 * Returns whether a schema version is at or above a `read.write.minor` version (inclusive).
 * Comparison order is write, then read, then minor.
 *
 * @internal
 */
export function isSchemaVersionAtLeast(version: EC.SchemaVersion, minVersion: string): boolean {
  const [minRead, minWrite, minMinor] = minVersion.split(".").map(Number);
  if (version.write !== minWrite) {
    return version.write > minWrite;
  }
  if (version.read !== minRead) {
    return version.read > minRead;
  }
  return version.minor >= minMinor;
}

/**
 * Returns whether a schema version is below a `read.write.minor` version (exclusive).
 * Comparison order is write, then read, then minor.
 *
 * @internal
 */
export function isSchemaVersionBelow(version: EC.SchemaVersion, maxVersion: string): boolean {
  const [maxRead, maxWrite, maxMinor] = maxVersion.split(".").map(Number);
  if (version.write !== maxWrite) {
    return version.write < maxWrite;
  }
  if (version.read !== maxRead) {
    return version.read < maxRead;
  }
  return version.minor < maxMinor;
}

/**
 * Runs `expand` over every input in parallel and concatenates the resulting arrays into a single
 * flat array (preserving input order). A concise replacement for `(await Promise.all(...)).flat()`.
 *
 * @internal
 */
export async function collectInParallel<TInput, TOutput>({
  inputs,
  expand,
}: {
  inputs: readonly TInput[];
  expand: (input: TInput) => Promise<TOutput[]>;
}): Promise<TOutput[]> {
  return (await Promise.all(inputs.map(expand))).flat();
}

/**
 * Produces a stable JSON representation with recursively sorted object keys, so key order does not
 * affect the result. Useful for hashing or structural equality comparisons of plain data.
 *
 * @internal
 */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

/**
 * Resolves a class's display label (its label, else its name).
 *
 * @internal
 */
export async function getClassLabel({
  imodelAccess,
  className,
}: {
  imodelAccess: ECSchemaProvider;
  className: EC.FullClassNameDotNotation;
}): Promise<string> {
  const ecClass = await getClass(imodelAccess, className);
  return ecClass.label ?? ecClass.name;
}

/**
 * Merges `source` ECSQL bindings into `target` in place. A binding name may repeat only with an
 * identical value (harmless — e.g. a shared join prefix or a repeated selector contributing the same
 * binding); the same name reused with a *different* value is a real conflict that would misbind the
 * query, so it throws.
 *
 * @internal
 */
export function mergeBindings(
  target: Record<string, ECSqlBinding>,
  source: Record<string, ECSqlBinding> | undefined,
): void {
  if (!source) {
    return;
  }
  for (const [name, binding] of Object.entries(source)) {
    if (name in target && stableStringify(target[name]) !== stableStringify(binding)) {
      throw new Error(`Duplicate ECSQL binding name "${name}" with different values.`);
    }
    target[name] = binding;
  }
}
