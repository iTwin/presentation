/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @internal */
export function julianToDateTime(julianDate: number): Date {
  const millis = (julianDate - 2440587.5) * 86400000;
  return new Date(millis);
}
