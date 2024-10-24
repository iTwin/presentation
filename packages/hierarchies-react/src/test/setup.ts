/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
// WARNING: The order of imports in this file is important!

// setup chai
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import chaiSubset from "chai-subset";
import sinonChai from "sinon-chai";
chai.use(chaiAsPromised);
chai.use(sinonChai);
chai.use(chaiSubset);

// get rid of various xhr errors in the console
import globalJsdom from "global-jsdom";
import * as jsdom from "jsdom";
globalJsdom(undefined, {
  virtualConsole: new jsdom.VirtualConsole().sendTo(console, { omitJSDOMErrors: true }),
});

// make stubbing workspace package exports possible
import m from "module";
import { execSync } from "node:child_process";
const workspacePackages = getPaths(execSync("pnpm -r list --depth -1 --json", { encoding: "utf-8" }));
const root = workspacePackages.shift() as string;
const packagePaths = workspacePackages.map((path) => path.substring(root.length + 1));
function getPaths(json: string) {
  return (JSON.parse(json) as Array<{ path: string }>).map((pkg) => pkg.path);
}
const originalCompile = (m as any).prototype._compile;
(m as any).prototype._compile = function (content: any, filename: any) {
  // Obtain exports from the loaded script
  originalCompile.call(this, content, filename);

  if (!packagePaths.find((workspacePkgPath) => filename.includes(workspacePkgPath))) {
    return;
  }

  // Process the exports if and only if a plain object was exported
  const exportsIsPlainObject = Object.getPrototypeOf(this.exports) === Object.prototype;
  const exportsIsSettable = Object.getOwnPropertyDescriptor(this, "exports")?.configurable;
  if (exportsIsPlainObject && exportsIsSettable) {
    // Make properties writable
    const relaxedExports: any = {};
    for (const [key, value] of Object.entries(this.exports)) {
      relaxedExports[key] = value;
    }

    // Object.entries does not list non-enumerable properties
    for (const key of Object.getOwnPropertyNames(this.exports)) {
      if (!(key in relaxedExports)) {
        Object.defineProperty(relaxedExports, key, { configurable: true, enumerable: false, writable: true, value: this.exports[key] });
      }
    }

    this.exports = relaxedExports;
  }
};

// supply mocha hooks
import { cleanup } from "@testing-library/react";
export const mochaHooks = {
  beforeAll() {
    getGlobalThis().IS_REACT_ACT_ENVIRONMENT = true;
  },
  beforeEach() {},
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
