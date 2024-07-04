/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const yargs = require("yargs");
const argv = yargs(process.argv).argv;

// parse args
const isCheck = "check" in argv;
const targets = argv.targets;
if (!targets) {
  console.error(
    `Fail! Please specify the "target" argument as a comma-separated list of paths to the target directories and files where extraction insertions need to be made.`,
  );
  process.exit(1);
}

// gather extractions from different packages into the workspace root
console.log(`Gathering extractions from different packages...`);
execSync(`node ${path.join(__dirname, "gatherDocs.js")}`, { stdio: "inherit", cwd: path.join(__dirname, "..") });

// set up constants
const extractionsDir = path.join(__dirname, "..", "build/docs/extract");
const extractionStart = "<!-- BEGIN EXTRACTION -->";
const extractionEnd = "<!-- END EXTRACTION -->";
const targetFileExtensions = [".ts", ".tsx", ".md"];
const re = /\[\[include:\s*([\w\d\._-]+)(,[\s]*([\w\d_]+))?\]\]/;
const reExtractionNameIndex = 1;
const reExtractionTypeIndex = 3;

const changedFiles = [];
targets.split(",").forEach((target) => {
  console.log(`Processing target "${target}"...`);
  const targetStat = fs.lstatSync(target);
  if (targetStat.isDirectory(target)) {
    fs.readdirSync(target, { recursive: true }).forEach((fileName) => {
      handleTargetFile(path.join(target, fileName));
    });
  } else if (targetStat.isFile(target)) {
    handleTargetFile(target);
  } else {
    console.error(`Fail! Target "${target}" is not a valid directory or file.`);
    process.exit(1);
  }

  if (isCheck) {
    const gitStatus = execSync(`git status --porcelain=v1 ${target}`, { encoding: "utf-8" });
    if (gitStatus) {
      changedFiles.push(gitStatus);
    }
  }
});

if (isCheck && changedFiles.length > 0) {
  console.error();
  console.error(`Fail! The following files have been modified:`);
  console.error(changedFiles.join(""));
  console.error(`You should run the "update-extractions" script and commit the changes.`);
  process.exit(1);
}

function handleTargetFile(targetFilePath) {
  const { ext } = path.parse(targetFilePath);
  if (!targetFileExtensions.includes(ext)) {
    return;
  }

  // read the target file and all insertions that need to be made
  const insertions = [];
  const content = fs.readFileSync(targetFilePath, { encoding: "utf8" });
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    const match = line.match(re);
    if (match) {
      const extractionName = match[reExtractionNameIndex];
      const extractionType = match[reExtractionTypeIndex];
      insertions.push({
        line: index,
        extraction: {
          name: extractionName,
          type: extractionType,
        },
      });
    }
  });
  if (insertions.length === 0) {
    return;
  }

  // sort insertions by line number in descending order, otherwise all line numbers will be off after we start splicing
  insertions.sort((a, b) => b.line - a.line);

  // handle each insertion
  insertions.forEach((insertion) => {
    const extractionPath = path.join(extractionsDir, insertion.extraction.name);
    if (!fs.existsSync(extractionPath)) {
      console.error(
        `Fail! Extraction file "${extractionPath}" does not exist (referenced from ${targetFilePath}). Did you run the "docs" script at where the extraction is defined?`,
      );
      process.exit(1);
    }

    let extractionContent = fs.readFileSync(extractionPath, { encoding: "utf8" }).trim();
    if (insertion.extraction.type) {
      extractionContent = `\`\`\`${insertion.extraction.type}\n${extractionContent}\n\`\`\``;
    }

    const nextLine = lines[insertion.line + 1];
    if (!nextLine.startsWith(extractionStart)) {
      lines.splice(insertion.line + 1, 0, extractionStart, extractionContent, extractionEnd);
      console.log(`Inserted extraction "${insertion.extraction.name}" at line ${insertion.line + 1} in file "${targetFilePath}".`);
    } else {
      let existingExtractionLinesCount = 0;
      let didFindExtractionEnd = false;
      for (let i = insertion.line + 2; i < lines.length; ++i) {
        if (lines[i].startsWith(extractionEnd)) {
          didFindExtractionEnd = true;
          break;
        }
        ++existingExtractionLinesCount;
      }
      if (!didFindExtractionEnd) {
        console.error(`Fail! Extraction end for "${insertion.extraction.name}" not found in file "${targetFilePath}".`);
        process.exit(1);
      }
      lines.splice(insertion.line + 2, existingExtractionLinesCount, extractionContent);
      console.log(`Updated extraction "${insertion.extraction.name}" at line ${insertion.line + 1} in file "${targetFilePath}".`);
    }
  });

  fs.writeFileSync(targetFilePath, lines.join("\n"));
}
