/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * The script downloads datasets for the benchmark tests and adds their paths to given csv file
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const yargs = require("yargs");
const argv = yargs(process.argv).argv;

const datasetsDirPath = argv.datasetsDir;
const datasetsCsvPath = argv.csv;

if (!fs.existsSync(datasetsDirPath)) {
  fs.mkdirSync(datasetsDirPath);
}

const datasets = [["Baytown", "https://github.com/imodeljs/desktop-starter/raw/master/assets/Baytown.bim"]].map((entry) => [
  ...entry,
  path.join(datasetsDirPath, `${entry[0]}.bim`),
]);
datasets.forEach(([name, downloadUrl, localPath]) => {
  if (!fs.existsSync(localPath)) {
    console.log(`Downloading "${name}" iModel from "${downloadUrl}"...`);
    execSync(`curl --location --fail --silent --output ${localPath} ${downloadUrl}`);
  }
});

const datasetLocalPaths = datasets.map(([_, __, localPath]) => path.resolve(localPath));
fs.writeFileSync(datasetsCsvPath, datasetLocalPaths.join("\n"));
console.log(`Saved ${datasetLocalPaths.length} dataset paths to "${datasetsCsvPath}".`);
