/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

"use strict";

const { execSync } = require("child_process");
const fs = require("fs");
const cpx = require("cpx2");
const path = require("path");

// gathers tarballs from all workspace packages to the root folder
const [{ name: workspaceRootName, path: workspaceRootPath }] = JSON.parse(execSync("pnpm list -w --only-projects --json", { encoding: "utf-8" }));

const targetDir = path.join(workspaceRootPath, "built-packages");
fs.mkdirSync(targetDir, { recursive: true });

// copy tarballs from workspace packages
forEachWorkspacePackage((project) => {
  const tarballPath = path.join(project.path, "*.tgz");
  cpx.copySync(tarballPath, targetDir);
});

function forEachWorkspacePackage(callback) {
  const workspaceProjects = JSON.parse(execSync("pnpm -r list --depth -1 --json"));
  workspaceProjects.forEach((project) => {
    if (project.name === workspaceRootName) {
      return;
    }
    callback(project);
  });
}
