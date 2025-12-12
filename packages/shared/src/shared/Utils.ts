/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";

/**
 * An utility to parse schema and class names from full class name, where
 * schema and class names are separated by either `:` or `.`.
 * @public
 */
export function parseFullClassName(fullClassName: string) {
  const [schemaName, className] = fullClassName.split(/[\.:]/);
  assert(!!schemaName && !!className, "Invalid full class name");
  return { schemaName, className };
}

/**
 * An utility to normalize full class name from either `SchemaName:ClassName` or
 * `SchemaName.ClassName` to always use the dot format.
 * @public
 */
export function normalizeFullClassName(fullClassName: string): string {
  const colonPos = fullClassName.indexOf(":");
  if (-1 === colonPos) {
    assert(fullClassName.indexOf(".") !== -1, "Invalid full class name");
    return fullClassName;
  }
  const schemaName = fullClassName.slice(0, colonPos);
  const className = fullClassName.slice(colonPos + 1);
  return `${schemaName}.${className}`;
}

/**
 * An utility that compares two full class names in a case insensitive way, ignoring different
 * supported schema-class name separators (`.` or `:`).
 * @public
 */
export function compareFullClassNames(lhs: string, rhs: string): number {
  const parsed = {
    lhs: parseFullClassName(lhs),
    rhs: parseFullClassName(rhs),
  };
  const schemaCompare = parsed.lhs.schemaName.toLocaleLowerCase().localeCompare(parsed.rhs.schemaName.toLocaleLowerCase());
  if (schemaCompare !== 0) {
    return schemaCompare;
  }
  return parsed.lhs.className.toLocaleLowerCase().localeCompare(parsed.rhs.className.toLocaleLowerCase());
}

/**
 * An utility to remove all extra whitespace from a given string.
 * @public
 */
export function trimWhitespace(str: string): string;
/**
 * An utility to remove all extra whitespace from a given string.
 * @public
 */
export function trimWhitespace(str: string | undefined): string | undefined;
/** @public */
export function trimWhitespace(str: string | undefined): string | undefined {
  /* c8 ignore next 3 */
  if (!str) {
    return str;
  }
  return str
    .replaceAll(/\s+/gm, " ") // replace all consecutive spaces with a single space
    .replaceAll(/\(\s+/g, "(") // remove spaces after opening parentheses
    .replaceAll(/\s+\)/g, ")") // remove spaces before closing parentheses
    .replaceAll(/\s+,/g, ",") // remove spaces before comma
    .trim(); // remove spaces from beginning and end of the string
}

/**
 * An utility that returns a promise that immediately resolves. Awaiting on the returned
 * promise releases the main thread and allows other tasks to run.
 *
 * @public
 */
export async function releaseMainThread() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/**
 * An utility that returns a `releaseMainThread` promise if the given amount of time has passed since the handler
 * was created or the main thread was last released using this handler. Otherwise, returns `undefined`.
 *
 * Example:
 * ```ts
 * const releaseMainThread = createMainThreadReleaseOnTimePassedHandler();
 * for (const value of someVeryLargeArray) {
 *   await releaseMainThread();
 *   // do something with value
 * }
 * ```
 *
 * @param releaseOnTimePassed The amount of time in milliseconds after which the main thread should be released. Defaults to `40` ms.
 * @public
 */
export function createMainThreadReleaseOnTimePassedHandler(releaseOnTimePassed = 40) {
  let start = Date.now();
  return (): Promise<void> | undefined => {
    const elapsed = Date.now() - start;
    if (elapsed < releaseOnTimePassed) {
      return undefined;
    }
    return releaseMainThread().then(() => {
      start = Date.now();
    });
  };
}

/**
 * An utility to convert a julian day format to `Date`.
 * @public
 */
export function julianToDateTime(julianDate: number): Date {
  const millis = (julianDate - 2440587.5) * 86400000;
  return new Date(millis);
}
