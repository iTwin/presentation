/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert } from "@itwin/core-bentley";

/**
 * An utility to parse schema and class names from full class name, where
 * schema and class names are separated by either `:` or `.`.
 * @beta
 */
export function parseFullClassName(fullClassName: string) {
  const [schemaName, className] = fullClassName.split(/[\.:]/);
  assert(!!schemaName && !!className, "Invalid full class name");
  return { schemaName, className };
}

/**
 * An utility to normalize full class name from either `SchemaName:ClassName` or
 * `SchemaName.ClassName` to always use the dot format.
 * @beta
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
 * An utility to remove all extra whitespace from a given string.
 * @beta
 */
export function trimWhitespace(str: string): string;
/**
 * An utility to remove all extra whitespace from a given string.
 * @beta
 */
export function trimWhitespace(str: string | undefined): string | undefined;
/** @beta */
export function trimWhitespace(str: string | undefined): string | undefined {
  // istanbul ignore next
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
