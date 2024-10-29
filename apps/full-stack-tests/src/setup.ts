/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
// WARNING: The order of imports in this file is important!

// setup chai
import * as chai from "chai";
import chaiJestSnapshot from "chai-jest-snapshot";
import chaiSubset from "chai-subset";
import sinonChai from "sinon-chai";
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
import { cleanup } from "@testing-library/react";
export const mochaHooks = {
  beforeAll() {
    chaiJestSnapshot.resetSnapshotRegistry();
    getGlobalThis().IS_REACT_ACT_ENVIRONMENT = true;
  },
  beforeEach() {
    // set up snapshot name
    const currentTest = (this as unknown as Mocha.Context).currentTest!;
    const sourceFilePath = currentTest.file!.replace("lib", "src").replace(/\.(jsx?|tsx?)$/, "");
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
