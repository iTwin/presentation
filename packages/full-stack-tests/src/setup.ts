/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

// Node 15+ using MessageChannel prevents node.js process from exiting
// This becomes an issue when testing React code within JSDOM environment, as the test process cannot exit properly.
// https://github.com/facebook/react/issues/20756
// eslint-disable-next-line @typescript-eslint/naming-convention
const commonjsGlobal: { MessageChannel?: any } = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
if (commonjsGlobal.MessageChannel)
  delete commonjsGlobal.MessageChannel;

import * as chai from "chai";
import chaiJestSnapshot from "chai-jest-snapshot";
import { execFileSync } from "child_process";
import * as cpx from "cpx2";
import * as fs from "fs";
import jsdomGlobal from "jsdom-global";
import * as path from "path";
import sinonChai from "sinon-chai";

jsdomGlobal();

// eslint-disable-next-line no-console
console.log(`Backend PID: ${process.pid}`);

// setup chai
chai.use(chaiJestSnapshot);
chai.use(sinonChai);

before(function () {
  chaiJestSnapshot.resetSnapshotRegistry();

  cpx.copySync(`assets/**/*`, "lib/assets");
  copyITwinFrontendAssets("lib/public");
  pseudoLocalize("lib/public/locales");
});

beforeEach(function () {
  const currentTest = this.currentTest!;

  // set up snapshot name
  const sourceFilePath = currentTest.file?.replace("lib", "src").replace(/\.(jsx?|tsx?)$/, "");
  const snapPath = `${sourceFilePath}.snap`;
  chaiJestSnapshot.setFilename(snapPath);
  chaiJestSnapshot.setTestName(currentTest.fullTitle());
});

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
  const args = [
    betoolsPath,
    "pseudolocalize",
    "--englishDir",
    `${localesDir}/en`,
    "--out",
    `${localesDir}/en-PSEUDO`,
  ];
  try {
    execFileSync("node", args);
  } catch {
    throw new Error("Failed to pseudoLocalize localization files");
  }
}
