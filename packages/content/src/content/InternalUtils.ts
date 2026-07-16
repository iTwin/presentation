/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass } from "@itwin/presentation-shared";

import type { EC, ECSchemaProvider } from "@itwin/presentation-shared";

/**
 * Prefix applied to internally generated ECSQL binding names
 * to avoid collisions with consumer-supplied filter bindings.
 *
 * @internal
 */
export const ECSQL_PREFIX = "pres_";

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
  className: EC.FullClassName;
}): Promise<string> {
  const ecClass = await getClass(imodelAccess, className);
  return ecClass.label ?? ecClass.name;
}
