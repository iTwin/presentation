/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

// script that sets overrides for `@itwin` package versions.
// this allows to test our packages with various supported versions of `@itwin` packages

"use strict";

const fs = require("fs");
const path = require("path");
const yargs = require("yargs");

// list of packages from `itwinjs-core`
const corePackages = [
  "@itwin/appui-abstract",
  "@itwin/build-tools",
  "@itwin/core-backend",
  "@itwin/core-bentley",
  "@itwin/core-common",
  "@itwin/core-electron",
  "@itwin/core-frontend",
  "@itwin/core-geometry",
  "@itwin/core-i18n",
  "@itwin/core-orbitgt",
  "@itwin/core-quantity",
  "@itwin/eslint-plugin",
  "@itwin/express-server",
  "@itwin/presentation-backend",
  "@itwin/presentation-common",
  "@itwin/presentation-frontend",
  "@itwin/webgl-compatibility",
];

// list of packages from `appui`
const uiPackages = ["@itwin/core-react", "@itwin/components-react", "@itwin/imodel-components-react"];

function getOverrides(coreVersion, uiVersion) {
  const overrides = {};

  corePackages.forEach((packageName) => {
    overrides[packageName] = coreVersion;
  });
  uiPackages.forEach((packageName) => {
    overrides[packageName] = uiVersion;
  });

  return overrides;
}

function override(packageJsonPath, coreVersion, uiVersion) {
  const pkgJsonData = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: "utf8" }));
  if (!pkgJsonData) {
    throw new Error(`Failed to read package.json content at ${packagesJsonPath}`);
  }

  pkgJsonData.pnpm = { overrides: getOverrides(coreVersion, uiVersion) };
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkgJsonData, undefined, 2), { encoding: "utf8" });
}

const argv = yargs(process.argv).argv;
const packageJsonPath = require.resolve(argv.packageJson ?? "../package.json");
const coreVersion = argv.coreVersion;
const uiVersion = argv.uiVersion;

if (!coreVersion) {
  throw new Error("Argument --coreVersion was not provided.");
}

if (!uiVersion) {
  throw new Error("Argument --uiVersion was not provided.");
}

override(packageJsonPath, coreVersion, uiVersion);
