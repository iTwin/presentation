/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
const { spawn, handleInterrupts } = require("@itwin/build-tools/scripts/utils/simpleSpawn");
const argv = require("yargs").argv;
const fs = require("node:fs");
const path = require("node:path");

if (argv.entry === undefined) {
  console.log("No argument found");
  return;
}

const isCI = process.env.TF_BUILD;
const entryPointFileName = argv.entry;
const missingTagsLevel = argv.missingTags ?? "error";
const incompatibleTagsLevel = argv.ignoreIncompatibleTags ?? "error";

const apiReportFolder = argv.apiReportFolder ?? "./api";
const apiReportTempFolder = argv.apiReportTempFolder ?? "./api/temp";

const config = {
  $schema: "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
  projectFolder: "../../",
  compiler: {
    tsconfigFilePath: "<projectFolder>/tsconfig.json",
  },
  mainEntryPointFilePath: `${entryPointFileName}.d.ts`,
  apiReport: {
    enabled: true,
    reportFolder: path.resolve(apiReportFolder),
    reportTempFolder: path.resolve(apiReportTempFolder),
    includeForgottenExports: true,
  },
  docModel: {
    enabled: false,
  },
  dtsRollup: {
    enabled: false,
  },
  tsdocMetadata: {
    enabled: false,
  },
  messages: {
    tsdocMessageReporting: {
      default: {
        logLevel: "none",
      },
    },
    extractorMessageReporting: {
      default: {
        logLevel: "error",
        addToApiReportFile: false,
      },
      "ae-incompatible-release-tags": {
        logLevel: incompatibleTagsLevel,
        addToApiReportFile: false,
      },
      "ae-missing-release-tag": {
        logLevel: missingTagsLevel,
        addToApiReportFile: false,
      },
      "ae-internal-missing-underscore": {
        logLevel: "none",
        addToApiReportFile: false,
      },
      "ae-forgotten-export": {
        logLevel: "none",
        addToApiReportFile: false,
      },
      "ae-unresolved-inheritdoc-reference": {
        logLevel: "error",
        addToApiReportFile: true,
      },
      "ae-unresolved-inheritdoc-base": {
        logLevel: "error",
        addToApiReportFile: true,
      },
    },
  },
};

if (!fs.existsSync("lib")) {
  process.stderr.write("`lib` folder not found. Build the package(s) before running `extract-api`");
  process.exit(1);
}

const configFileName = `lib/cjs/${entryPointFileName}.json`;
fs.writeFileSync(configFileName, JSON.stringify(config, null, 2));

const args = ["run", "-c", configFileName];
if (!isCI) {
  args.push("-l");
}

spawn(require.resolve(".bin/api-extractor"), args).then((code) => {
  if (fs.existsSync(configFileName)) {
    fs.unlinkSync(configFileName);
  }

  if (code || isCI) {
    process.exit(code);
  }

  const extractSummaryArgs = [
    require.resolve("@itwin/build-tools/scripts/extract-api-summary"),
    "--apiSignature",
    path.resolve(path.join(apiReportFolder, `${entryPointFileName}.api.md`)),
    "--outDir",
    path.resolve(apiReportFolder),
  ];

  spawn("node", extractSummaryArgs).then((code) => {
    process.exit(code);
  });
});

handleInterrupts();
