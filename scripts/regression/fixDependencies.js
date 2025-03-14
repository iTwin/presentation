/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

// this script makes it easier to use workspace packages with locally built tarballs by moving
// direct workspace package dependencies to peerDependencies

"use strict";

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const packagesToUpdate = [
  {
    name: "@itwin/presentation-testing",
    dependencies: [
      {
        name: "@itwin/presentation-components",
        peerDependencyVersion: "^5.0.0",
      },
    ],
  },
  {
    name: "@itwin/presentation-components",
    dependencies: [
      {
        name: "@itwin/presentation-core-interop",
        peerDependencyVersion: "^1.0.0",
      },
    ],
  },
];

function forEachWorkspacePackage(callback) {
  const workspaceProjects = JSON.parse(execSync("pnpm -r list --depth -1 --json"));
  workspaceProjects.forEach((project) => {
    callback(project);
  });
}

forEachWorkspacePackage((project) => {
  const expectedChanges = packagesToUpdate.find((packageToUpdate) => packageToUpdate.name === project.name);
  if (!expectedChanges) {
    return;
  }

  const packageJsonPath = path.join(project.path, "package.json");
  const pkgJsonData = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: "utf8" }));

  expectedChanges.dependencies.forEach((dependency) => {
    if (pkgJsonData.dependencies[dependency.name]) {
      console.log(`Moving ${dependency.name} from dependencies to peerDependencies in ${pkgJsonData.name}`);
      pkgJsonData.devDependencies[dependency.name] = pkgJsonData.dependencies[dependency.name];
      pkgJsonData.peerDependencies[dependency.name] = dependency.peerDependencyVersion;
      delete pkgJsonData.dependencies[dependency.name];
    }
  });

  fs.writeFileSync(packageJsonPath, JSON.stringify(pkgJsonData, null, 2) + "\n", { encoding: "utf8" });
});
