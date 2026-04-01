/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup, configure } from "@testing-library/react";

// polyfill ResizeObserver
global.ResizeObserver = class ResizeObserver {
  public observe() {}
  public unobserve() {}
  public disconnect() {}
};

// eslint-disable-next-line @typescript-eslint/naming-convention
function getGlobalThis(): typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean } {
  if (typeof globalThis !== "undefined") {
    return globalThis;
  }
  if (typeof self !== "undefined") {
    return self;
  }
  if (typeof window !== "undefined") {
    return window;
  }
  if (typeof global !== "undefined") {
    return global;
  }
  throw new Error("unable to locate global object");
}

beforeAll(() => {
  configure({ reactStrictMode: !process.env.DISABLE_STRICT_MODE });
  getGlobalThis().IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  delete getGlobalThis().IS_REACT_ACT_ENVIRONMENT;
});
