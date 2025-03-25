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
const YAML = require("yaml");

const argv = yargs(process.argv).argv;
const coreVersion = argv.coreVersion;
const uiVersion = argv.uiVersion;
const localPackagesPath = argv.localPackagesPath;
// list of packages that need to pull older version of itwinjs-core and appUi for tests to run
const usedPackages = ["presentation-full-stack-tests", "presentation-test-utilities"];

if (!coreVersion && !uiVersion) {
  throw new Error("Argument --coreVersion or --uiVersion need to be provided.");
}

const [{ name: workspaceRootName, path: workspaceRootPath }] = JSON.parse(execSync("pnpm list -w --only-projects --json", { encoding: "utf-8" }));

const { corePackages, uiPackages } = parseWorkspaceFile(workspaceRootPath);

// override versions
forEachWorkspacePackage((project) => {
  if (usedPackages.includes(project.name)) {
    const packageJsonPath = path.join(project.path, "package.json");
    updatePackageJson(packageJsonPath, [
      (pkgJsonData) => overrideDevDeps(pkgJsonData, coreVersion, uiVersion),
      (pkgJsonData) => useLocalTarballs(pkgJsonData, localPackagesPath),
    ]);
  }
});

if (coreVersion) {
  applyGitPatch(`core-${coreVersion}.patch`);
}
if (uiVersion) {
  applyGitPatch(`ui-${uiVersion}.patch`);
}

function updatePackageJson(packageJsonPath, updates) {
  const pkgJsonData = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: "utf8" }));
  if (!pkgJsonData) {
    throw new Error(`Failed to read package.json content at ${packagesJsonPath}`);
  }

  if (!pkgJsonData.devDependencies) {
    console.log(`No devDependencies found for '${pkgJsonData.name}'`);
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
  if (coreVersion) {
    console.log(`Overriding '${pkgJsonData.name}' package 'itwinjs-core' devDependencies to version: ${coreVersion}`);
  }
  if (uiVersion) {
    console.log(`Overriding '${pkgJsonData.name}' package 'appui' devDependencies to version: ${uiVersion}`);
  }
  Object.entries(overrides).forEach(([packageName, version]) => {
    if (pkgJsonData.devDependencies[packageName]) {
      pkgJsonData.devDependencies[packageName] = version;
    }
  });
}

function useLocalTarballs(pkgJsonData, localPackagesPath) {
  if (!localPackagesPath) {
    console.log("No local packages path provided, skipping local tarballs");
    return;
  }

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
    if (project.name === workspaceRootName) {
      return;
    }
    callback(project);
  });
}

function parseWorkspaceFile(workspaceRoot) {
  const workspaceFile = fs.readFileSync(path.join(workspaceRoot, "pnpm-workspace.yaml"), "utf8");
  const workspace = YAML.parse(workspaceFile);
  if (workspace.catalogs["itwinjs-core"] === undefined) {
    throw new Error("Catalog 'itwinjs-core' not found in workspace file. Please check the workspace file or update this script.");
  }

  if (workspace.catalogs["appui"] === undefined) {
    throw new Error("Catalog 'appui' not found in workspace file. Please check the workspace file or update this script.");
  }

  // list of packages from `itwinjs-core`
  const corePackages = Object.keys(workspace.catalogs["itwinjs-core-dev"]).filter((dep) => dep.startsWith("@itwin"));
  // list of packages from `appui`
  const uiPackages = Object.keys(workspace.catalogs["appui"]).filter((dep) => dep.startsWith("@itwin"));
  return { corePackages, uiPackages };
}

function applyGitPatch(patchFile) {
  try {
    const patchPath = require.resolve(`./${patchFile}`);
    // patch known build issues in full stack tests due to older types from itwinjs-core
    execSync(`git apply ${patchPath}`);
    console.log(`Applied patch file: ${patchFile}`);
  } catch (e) {
    console.log(`Could not find patch file: ${patchFile}`);
  }
}
