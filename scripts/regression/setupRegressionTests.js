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

const argv = yargs(process.argv).argv;
const coreVersion = argv.coreVersion;
const uiVersion = argv.uiVersion;
const localPackagesPath = argv.localPackagesPath;

if (!coreVersion && uiVersion) {
  throw new Error("Argument --coreVersion or --uiVersion need to be provided.");
}

// list of packages that need to pull older version of itwinjs-core and appUi for tests to run
const usedPackages = ["presentation-full-stack-tests", "presentation-test-utilities"];
// override versions
forEachWorkspacePackage((project) => {
  const packageJsonPath = path.join(project.path, "package.json");
  if (usedPackages.includes(project.name)) {
    updatePackageJson(packageJsonPath, [
      (pkgJsonData) => overrideDevDeps(pkgJsonData, coreVersion, uiVersion),
      (pkgJsonData) => useLocalTarballs(pkgJsonData, localPackagesPath),
    ]);
  }
});

const patchPath = require.resolve("./full-stack-tests.patch");
// path known build issues do to newer types used in full stack tests
execSync(`git apply ${patchPath}`);

function updatePackageJson(packageJsonPath, updates) {
  const pkgJsonData = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: "utf8" }));
  if (!pkgJsonData) {
    throw new Error(`Failed to read package.json content at ${packagesJsonPath}`);
  }

  if (!pkgJsonData.devDependencies) {
    return;
  }

  for (const update of updates) {
    update(pkgJsonData);
  }

  fs.writeFileSync(packageJsonPath, JSON.stringify(pkgJsonData, undefined, 2) + "\n", { encoding: "utf8" });
}

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

function overrideDevDeps(pkgJsonData, coreVersion, uiVersion) {
  const overrides = getOverrides(coreVersion, uiVersion);
  Object.entries(overrides).forEach(([packageName, version]) => {
    if (pkgJsonData.devDependencies[packageName]) {
      pkgJsonData.devDependencies[packageName] = version;
    }
  });
}

function useLocalTarballs(pkgJsonData, localPackagesPath) {
  const packageNameRegex = /^itwin-([\w-]+)-[\d]+.[\d]+.[\d]+.tgz$/;
  const localPackages = fs.readdirSync(localPackagesPath);
  console.log(`Found local tarballs: ${localPackages.join(", ")}`);
  localPackages.forEach((localPackage) => {
    const match = localPackage.match(packageNameRegex);
    if (!match || !match[1]) {
      return;
    }
    const packageName = match[1];
    const fullName = `@itwin/${packageName}`;
    if (pkgJsonData.devDependencies[fullName]) {
      const tarBallPath = `file:${path.join("../../", localPackagesPath, localPackage)}`;
      console.log(`Using local tarball for ${fullName} at ${tarBallPath}`);
      pkgJsonData.devDependencies[fullName] = tarBallPath;
    }
  });
}

function forEachWorkspacePackage(callback) {
  const workspaceProjects = JSON.parse(execSync("pnpm -r list --depth -1 --json"));
  workspaceProjects.forEach((project) => {
    callback(project);
  });
}
