/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { MockInstance, vi } from "vitest";

export function createStub<T extends (...args: any) => any>(): MockInstance<T> {
  return vi.fn<T>();
}
