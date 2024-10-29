/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
// WARNING: The order of imports in this file is important!

// setup chai
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import chaiJestSnapshot from "chai-jest-snapshot";
import chaiSubset from "chai-subset";
import sinonChai from "sinon-chai";
chai.use(chaiAsPromised);
chai.use(chaiJestSnapshot);
chai.use(sinonChai);
chai.use(chaiSubset);

// get rid of various xhr errors in the console
import globalJsdom from "global-jsdom";
import * as jsdom from "jsdom";
globalJsdom(undefined, {
  virtualConsole: new jsdom.VirtualConsole().sendTo(console, { omitJSDOMErrors: true }),
});

// polyfill ResizeObserver
global.ResizeObserver = class ResizeObserver {
  public observe() {}
  public unobserve() {}
  public disconnect() {}
};

// supply mocha hooks
import path from "path";
const { cleanup, configure } = await import("@testing-library/react");
export const mochaHooks = {
  beforeAll() {
    chaiJestSnapshot.resetSnapshotRegistry();
    getGlobalThis().IS_REACT_ACT_ENVIRONMENT = true;
  },
  beforeEach() {
    // enable strict mode for each test by default
    configure({ reactStrictMode: !process.env.DISABLE_STRICT_MODE });

    // set up snapshot name
    const currentTest = (this as unknown as Mocha.Context).currentTest!;
    const sourceFilePath = currentTest.file!.replace(`lib${path.sep}esm${path.sep}test`, `src${path.sep}test`).replace(/\.(jsx?|tsx?)$/, "");
    const snapPath = `${sourceFilePath}.snap`;
    chaiJestSnapshot.setFilename(snapPath);
    chaiJestSnapshot.setTestName(currentTest.fullTitle());
  },
  afterEach() {
    cleanup();
  },
  afterAll() {
    delete getGlobalThis().IS_REACT_ACT_ENVIRONMENT;
  },
};
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
