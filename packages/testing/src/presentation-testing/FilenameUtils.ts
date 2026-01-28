/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { tmpdir } from "os";
import path from "path";
import sanitize from "sanitize-filename";
import { IModelJsFs } from "@itwin/core-backend";

import type { LocalFileName } from "@itwin/core-common";

const defaultTestOutputDir = tmpdir();
let testOutputDir: string | undefined;

/**
 * Get the output directory used by `setupOutputFileLocation` utility.
 * @public
 */
export function getTestOutputDir() {
  return testOutputDir ?? defaultTestOutputDir;
}

/**
 * Set the output directory used by `setupOutputFileLocation` utility.
 * @public
 */
export function setTestOutputDir(directoryPath: string | undefined) {
  testOutputDir = directoryPath;
}

/**
 * Prepare for an output file path by:
 * - Resolving the output file name under the known test output directory (see `getTestOutputDir` & `setTestOutputDir`).
 * - Making sure the output directories exist.
 * - Removing a previous copy of the output file.
 *
 * @param fileName Name of output file. The actual file name may get modified to fit within the file system limits.
 *
 * @public
 */
export function setupOutputFileLocation(fileName: string): LocalFileName {
  const outputDirectoryPath = getTestOutputDir();
  !IModelJsFs.existsSync(outputDirectoryPath) && IModelJsFs.mkdirSync(outputDirectoryPath);
  const outputFilePath = limitFilePathLength(path.join(outputDirectoryPath, fileName));
  IModelJsFs.existsSync(outputFilePath) && IModelJsFs.unlinkSync(outputFilePath);
  return outputFilePath;
}

/**
 * An utility to create a valid file name from any string. Sanitizes all invalid characters,
 * replaces spaces with `-`, makes everything lower case.
 *
 * @public
 */
export function createFileNameFromString(str: string) {
  return sanitize(str.replace(/[ ]+/g, "-").replaceAll("`", "").replaceAll("'", "")).toLocaleLowerCase();
}

/**
 * `itwinjs-core` creates some accompanying files for each iModels and their names are formed by appending
 * a suffix to iModel file name. This constant should account for the maximum suffix length.
 * @internal
 */
export const FILE_PATH_RESERVED_CHARACTERS = 13;

/**
 * An utility to make sure file path is shorter than 260 characters.
 *
 * 1. Takes a full file path, splits into directory and file name parts.
 * 2. If the path is already short enough, returns it.
 * 3. Else, calculates tha max allowed file name length, and shortens the file name by replacing the middle part with `...`.
 * 4. Joins back the directory with the shortened file name and returns it.
 *
 * @public
 */
export function limitFilePathLength(filePath: string) {
  const { dir, name, ext } = path.parse(filePath);
  const THREE_DOTS_LENGTH = 3;

  let allowedFileNameLength = 260 - FILE_PATH_RESERVED_CHARACTERS - (dir.length + 1) - ext.length;
  if (name.length <= allowedFileNameLength) {
    return filePath;
  }

  allowedFileNameLength -= THREE_DOTS_LENGTH;
  if (allowedFileNameLength <= 0) {
    throw new Error(`File path "${filePath}" is too long.`);
  }

  const pieceLength = allowedFileNameLength / 2;
  const shortenedName = `${name.slice(0, Math.ceil(pieceLength))}...${name.slice(Math.ceil(name.length - pieceLength))}`;
  return path.join(dir, `${shortenedName}${ext}`);
}
