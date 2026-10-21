/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";

beforeAll(() => {
  getGlobalThis().IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  cleanup();
});

function getGlobalThis(): typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean } {
  return globalThis;
}
