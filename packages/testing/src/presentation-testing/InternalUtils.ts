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
 * @param fileName Name of output file. The actual file name may get modified to fit within the file system limits.
 * @internal
 */
export function setupOutputFileLocation(fileName: string): LocalFileName {
  const outputDirectoryPath = getTestOutputDir();
  !IModelJsFs.existsSync(outputDirectoryPath) && IModelJsFs.mkdirSync(outputDirectoryPath);

  const outputFilePath = limitFilePathLength(path.join(outputDirectoryPath, `${fileName}.bim`));
  IModelJsFs.existsSync(outputFilePath) && IModelJsFs.unlinkSync(outputFilePath);
  return outputFilePath;
}

/** @internal */
export function createFileNameFromString(str: string) {
  return sanitize(str.replace(/[ ]+/g, "-").replaceAll("`", "").replaceAll("'", "")).toLocaleLowerCase();
}

/** @internal */
export function limitFilePathLength(filePath: string) {
  const { dir, name, ext } = path.parse(filePath);

  const allowedFileNameLength = 260 - 12 - 1 - (dir.length + 1) - ext.length;
  if (allowedFileNameLength <= 0) {
    throw new Error(`File path "${filePath}" is too long.`);
  }
  if (name.length < allowedFileNameLength) {
    return filePath;
  }

  const pieceLength = (allowedFileNameLength - 3) / 2;
  const shortenedName = `${name.slice(0, pieceLength)}...${name.slice(name.length - pieceLength)}`;
  return path.join(dir, `${shortenedName}${ext}`);
}
