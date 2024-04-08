/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as chai from "chai";
import chaiSubset from "chai-subset";
import globalJsdom from "global-jsdom";
import * as jsdom from "jsdom";
import sinonChai from "sinon-chai";

// setup chai
chai.use(sinonChai);
chai.use(chaiSubset);

// get rid of various xhr errors in the console
globalJsdom(undefined, {
  virtualConsole: new jsdom.VirtualConsole().sendTo(console, { omitJSDOMErrors: true }),
});

before(function () {
  getGlobalThis().IS_REACT_ACT_ENVIRONMENT = true;
});

after(function () {
  delete getGlobalThis().IS_REACT_ACT_ENVIRONMENT;
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
