/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
const { execSync } = require("child_process");
const cpx = require("cpx2");

// gathers docs from all workspace packages to the root folder

// get all packages in pnpm workspace (this include root package)
const allWorkspacePackages = JSON.parse(execSync("pnpm list -r --depth -1 --only-projects --json", { encoding: "utf-8" }));

// get info about root package
const [{ name: workspaceRootName, path: workspaceRootPath }] = JSON.parse(execSync("pnpm list -w --only-projects --json", { encoding: "utf-8" }));

// filter out root package
const workspacePackages = allWorkspacePackages.filter(({ name }) => name !== workspaceRootName);

for (const package of workspacePackages) {
  // copy docs build from each package to the root
  cpx.copySync(`${package.path}/build/**`, `${workspaceRootPath}/build`);
}
