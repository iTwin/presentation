/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as chai from "chai";
import chaiSubset from "chai-subset";
import globalJsdom from "global-jsdom";
import * as jsdom from "jsdom";
import m from "module";
import { execSync } from "node:child_process";
import sinonChai from "sinon-chai";

// setup chai
chai.use(sinonChai);
chai.use(chaiSubset);

const workspacePackages = getPaths(execSync("pnpm -r list --depth -1 --json", { encoding: "utf-8" }));
const root = workspacePackages.shift() as string;
const packagePaths = workspacePackages.map((path) => path.substring(root.length + 1));

function getPaths(json: string) {
  return (JSON.parse(json) as Array<{ path: string }>).map((pkg) => pkg.path);
}

// The following makes stubbing workspace package exports possible
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
