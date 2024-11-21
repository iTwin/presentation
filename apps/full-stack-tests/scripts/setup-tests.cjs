/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
const { execFileSync } = require("child_process");
const cpx = require("cpx2");
const fs = require("fs");
const path = require("path");

const libDir = "./lib";
const cacheDir = path.join(libDir, ".cache");
fs.mkdirSync(cacheDir, { recursive: true });

cpx.copySync(`assets/**/*`, path.join(libDir, "assets"));
copyITwinFrontendAssets("lib/public");
pseudoLocalize("lib/public/locales");

function copyITwinFrontendAssets(outputDir) {
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

function pseudoLocalize(localesDir) {
  const betoolsPath = path.resolve("node_modules", "@itwin", "build-tools", "bin", "betools.js");
  const args = [betoolsPath, "pseudolocalize", "--englishDir", `${localesDir}/en`, "--out", `${localesDir}/en-PSEUDO`];
  try {
    execFileSync("node", args);
  } catch {
    throw new Error("Failed to pseudoLocalize localization files");
  }
}
