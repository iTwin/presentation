/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { execSync } from "child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import {
  LOCALIZATION_NAMESPACE,
  LOCALIZED_STRINGS,
} from "../presentation-hierarchies-react/internal/LocalizedStrings.js";

const localeContent = JSON.stringify(LOCALIZED_STRINGS, null, 2);

const localesFolder = "src/public/locales";
const outputFolder = `./${localesFolder}/en`;
const filePath = `${outputFolder}/${LOCALIZATION_NAMESPACE}.json`;

const localeFileExists = existsSync(filePath);

// clear output directory
rmSync(outputFolder, { recursive: true, force: true });

// create output directory if it does not exist
mkdirSync(outputFolder, { recursive: true });

writeFileSync(filePath, `${localeContent}\n`, { encoding: "utf-8" });

const gitStatus = execSync("git status --porcelain").toString();
const localesChanged = gitStatus.split("\n").some((line) => line.includes(localesFolder));

// if locale file exists before running the script and has changes after the script is run, it means that LOCALIZED_STRINGS were modified and the version should be bumped
if (localeFileExists && localesChanged) {
  execSync(`git restore ${localesFolder}`);
  throw new Error(`Locale file has changes. Bump locale file version and commit the changes to the locale file.`);
}

if (process.env.CI && localesChanged) {
  throw new Error(`Locale file has changes. Run "npm run build:locale" to update locale file and commit the changes.`);
}
