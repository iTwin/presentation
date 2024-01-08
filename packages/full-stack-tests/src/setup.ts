/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as chai from "chai";
import chaiJestSnapshot from "chai-jest-snapshot";
import chaiSubset from "chai-subset";
import { execFileSync } from "child_process";
import * as cpx from "cpx2";
import * as fs from "fs";
import globalJsdom from "global-jsdom";
import * as jsdom from "jsdom";
import * as path from "path";
import ResizeObserver from "resize-observer-polyfill";
import sinonChai from "sinon-chai";
import sourceMapSupport from "source-map-support";

// eslint-disable-next-line no-console
console.log(`Backend PID: ${process.pid}`);

// see https://github.com/babel/babel/issues/4605
sourceMapSupport.install({
  environment: "node",
});

// get rid of various xhr errors in the console
globalJsdom(undefined, {
  virtualConsole: new jsdom.VirtualConsole().sendTo(console, { omitJSDOMErrors: true }),
});
global.ResizeObserver = ResizeObserver;

// setup chai
chai.use(chaiJestSnapshot);
chai.use(sinonChai);
chai.use(chaiSubset);

before(function () {
  chaiJestSnapshot.resetSnapshotRegistry();

  cpx.copySync(`assets/**/*`, "lib/assets");
  copyITwinFrontendAssets("lib/public");
  pseudoLocalize("lib/public/locales");

  getGlobalThis().IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(function () {
  const currentTest = this.currentTest!;

  // set up snapshot name
  const sourceFilePath = currentTest.file!.replace("lib", "src").replace(/\.(jsx?|tsx?)$/, "");
  const snapPath = `${sourceFilePath}.snap`;
  chaiJestSnapshot.setFilename(snapPath);
  chaiJestSnapshot.setTestName(currentTest.fullTitle());
});

after(function () {
  delete getGlobalThis().IS_REACT_ACT_ENVIRONMENT;
});

// eslint-disable-next-line @typescript-eslint/naming-convention
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

function copyITwinFrontendAssets(outputDir: string) {
  const iTwinPackagesPath = "node_modules/@itwin";
  fs.readdirSync(iTwinPackagesPath)
    .map((packageName) => {
      const packagePath = path.resolve(iTwinPackagesPath, packageName);
      return path.join(packagePath, "lib", "public");
    })
    .filter((assetsPath) => fs.existsSync(assetsPath))
    .forEach((src) => {
      cpx.copySync(`${src}/**/*`, outputDir);
    });
}

function pseudoLocalize(localesDir: string) {
  const betoolsPath = path.resolve("node_modules", "@itwin", "build-tools", "bin", "betools.js");
  const args = [betoolsPath, "pseudolocalize", "--englishDir", `${localesDir}/en`, "--out", `${localesDir}/en-PSEUDO`];
  try {
    execFileSync("node", args);
  } catch {
    throw new Error("Failed to pseudoLocalize localization files");
  }
}
