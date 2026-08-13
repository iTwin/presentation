/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { execFileSync } from "child_process";
import cpx from "cpx2";
import fs from "fs";
import path from "path";

const outDir = "./build";
const cacheDir = path.join(outDir, ".cache");

export async function setup() {
  fs.mkdirSync(cacheDir, { recursive: true });
  copyITwinFrontendAssets(path.join(outDir, "public"));
  pseudoLocalize(path.join(outDir, "public/locales"));
}

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
  // cspell:disable-next-line
  const args = [betoolsPath, "pseudolocalize", "--englishDir", `${localesDir}/en`, "--out", `${localesDir}/en-PSEUDO`];
  try {
    execFileSync("node", args);
  } catch {
    throw new Error("Failed to pseudoLocalize localization files");
  }
}
