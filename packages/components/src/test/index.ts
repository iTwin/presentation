/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import chaiJestSnapshot from "chai-jest-snapshot";
import chaiSubset from "chai-subset";
import globalJsdom from "global-jsdom";
import * as jsdom from "jsdom";
import path from "path";
import ResizeObserver from "resize-observer-polyfill";
import sinonChai from "sinon-chai";

// setup chai
chai.use(chaiAsPromised);
chai.use(chaiJestSnapshot);
chai.use(sinonChai);
chai.use(chaiSubset);

// get rid of various xhr errors in the console
globalJsdom(undefined, {
  virtualConsole: new jsdom.VirtualConsole().sendTo(console, { omitJSDOMErrors: true }),
});
global.ResizeObserver = ResizeObserver;

before(function () {
  chaiJestSnapshot.resetSnapshotRegistry();
  getGlobalThis().IS_REACT_ACT_ENVIRONMENT = true;
});

after(function () {
  delete require.cache[__filename];
  delete getGlobalThis().IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(function () {
  const currentTest = (this as unknown as Mocha.Context).currentTest!;

  // set up snapshot name
  const sourceFilePath = currentTest.file!.replace(`lib${path.sep}cjs${path.sep}test`, `src${path.sep}test`).replace(/\.(jsx?|tsx?)$/, "");
  const snapPath = `${sourceFilePath}.snap`;
  chaiJestSnapshot.setFilename(snapPath);
  chaiJestSnapshot.setTestName(currentTest.fullTitle());
});

function getGlobalThis(): typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean } {
  /* istanbul ignore else */
  if (typeof globalThis !== "undefined") {
    return globalThis;
  }
  /* istanbul ignore next */
  if (typeof self !== "undefined") {
    return self;
  }
  /* istanbul ignore next */
  if (typeof window !== "undefined") {
    return window;
  }
  /* istanbul ignore next */
  if (typeof global !== "undefined") {
    return global;
  }
  /* istanbul ignore next */
  throw new Error("unable to locate global object");
}
