/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * This is an utility `Omit` type which works with union types.
 * @beta
 */
export type OmitOverUnion<T, K extends PropertyKey> = T extends T ? Omit<T, K> : never;

/** @internal */
export function trimWhitespace(str: string): string;
/** @internal */
export function trimWhitespace(str: string | undefined): string | undefined;
/** @internal */
export function trimWhitespace(str: string | undefined): string | undefined {
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
