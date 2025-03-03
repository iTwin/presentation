/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

// this script setup `presentation-full-stack-tests` for running with older `itwinjs-core` or `appui` versions.
// it will modify package.json files for `presentation-full-stack-tests` and `presentation-test-utilities` to use specified versions

"use strict";

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const yargs = require("yargs");

// list of packages from `itwinjs-core`
const corePackages = [
  "@itwin/appui-abstract",
  "@itwin/core-backend",
  "@itwin/core-bentley",
  "@itwin/core-common",
  "@itwin/core-electron",
  "@itwin/core-frontend",
  "@itwin/core-geometry",
  "@itwin/core-i18n",
  "@itwin/core-orbitgt",
  "@itwin/core-quantity",
  "@itwin/ecschema-metadata",
  "@itwin/ecschema-rpcinterface-common",
  "@itwin/ecschema-rpcinterface-impl",
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

  if (coreVersion) {
    corePackages.forEach((packageName) => {
      overrides[packageName] = coreVersion;
    });
  }
  if (uiVersion) {
    uiPackages.forEach((packageName) => {
      overrides[packageName] = uiVersion;
    });
  }

  return overrides;
}

function overrideDevDeps(packageJsonPath, coreVersion, uiVersion) {
  const pkgJsonData = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: "utf8" }));
  if (!pkgJsonData) {
    throw new Error(`Failed to read package.json content at ${packagesJsonPath}`);
  }

  if (!pkgJsonData.devDependencies) {
    return;
  }

  const overrides = getOverrides(coreVersion, uiVersion);
  Object.entries(overrides).forEach(([packageName, version]) => {
    if (pkgJsonData.devDependencies[packageName]) {
      pkgJsonData.devDependencies[packageName] = version;
    }
  });

  fs.writeFileSync(packageJsonPath, JSON.stringify(pkgJsonData, undefined, 2), { encoding: "utf8" });
}

function forEachWorkspacePackage(callback) {
  const workspaceProjects = JSON.parse(execSync("pnpm -r list --depth -1 --json"));
  workspaceProjects.forEach((project) => {
    callback(project);
  });
}

const argv = yargs(process.argv).argv;
const coreVersion = argv.coreVersion;
const uiVersion = argv.uiVersion;

// list of packages that need to pull older version for tests to run
const usedPackages = ["presentation-full-stack-tests", "presentation-test-utilities"];

if (!coreVersion && uiVersion) {
  throw new Error("Argument --coreVersion or --uiVersion need to be provided.");
}

forEachWorkspacePackage((project) => {
  const packageJsonDir = path.join(project.path, "package.json");
  if (usedPackages.includes(project.name)) {
    overrideDevDeps(packageJsonDir, coreVersion, uiVersion);
  }
});
