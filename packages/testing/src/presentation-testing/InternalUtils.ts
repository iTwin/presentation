/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { tmpdir } from "os";
import path from "path";
import sanitize from "sanitize-filename";
import { IModelJsFs } from "@itwin/core-backend";
import { LocalFileName } from "@itwin/core-common";

const defaultTestOutputDir = tmpdir();
let testOutputDir: string | undefined;

/** @internal */
export function getTestOutputDir() {
  return testOutputDir ?? defaultTestOutputDir;
}

/** @internal */
export function setTestOutputDir(directoryPath: string | undefined) {
  testOutputDir = directoryPath;
}

/**
 * Prepare for an output file by:
 * - Resolving the output file name under the known test output directory
 * - Making directories as necessary
 * - Removing a previous copy of the output file
 * @param fileName Name of output file
 * @internal
 */
export function setupOutputFileLocation(fileName: string): LocalFileName {
  const outputDirectoryPath = getTestOutputDir();
  !IModelJsFs.existsSync(outputDirectoryPath) && IModelJsFs.mkdirSync(outputDirectoryPath);

  const outputFile = path.join(outputDirectoryPath, `${fileName}.bim`);
  IModelJsFs.existsSync(outputFile) && IModelJsFs.unlinkSync(outputFile);
  return outputFile;
}

/** @internal */
export function createFileNameFromString(str: string) {
  return sanitize(str.replace(/[ ]+/g, "-").replaceAll("`", "").replaceAll("'", "")).toLocaleLowerCase();
}
