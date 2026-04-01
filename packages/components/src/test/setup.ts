/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { afterAll, afterEach, beforeAll, beforeEach, chai } from "vitest";
import chaiAsPromised from "chai-as-promised";
import sinonChai from "sinon-chai";
import { cleanup, configure } from "@testing-library/react";

// Register chai plugins on Vitest's internal chai instance so that
// sinon-chai assertions (.to.be.calledOnce, etc.) and chai-as-promised
// (.to.eventually.*) work with expect() imported from "vitest".
chai.use(chaiAsPromised);
chai.use(sinonChai);

// Polyfill ResizeObserver — happy-dom does not provide it.
global.ResizeObserver = class ResizeObserver {
  public observe() {}
  public unobserve() {}
  public disconnect() {}
};

beforeAll(() => {
  getGlobalThis().IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  configure({ reactStrictMode: !process.env.DISABLE_STRICT_MODE });
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  delete getGlobalThis().IS_REACT_ACT_ENVIRONMENT;
});

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
