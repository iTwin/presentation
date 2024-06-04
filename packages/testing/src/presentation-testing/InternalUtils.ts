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

/**
 * `itwinjs-core` creates some accompanying files for each iModels and their names are formed by appending
 * a suffix to iModel file name. This constant should account for the maximum suffix length.
 * @internal
 */
export const FILE_PATH_RESERVED_CHARACTERS = 13;

/** @internal */
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
