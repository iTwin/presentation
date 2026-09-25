/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { hashString } from "./Persistence.js";

const require = createRequire(import.meta.url);

function getPackageVersion(packageName: string): string {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version?: unknown };
  if (typeof packageJson.version !== "string") {
    throw new Error(`Package '${packageName}' does not have a valid version.`);
  }
  return packageJson.version;
}

function listFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function hashDirectory(directory: string): string {
  const contents = listFiles(directory)
    .filter((filePath) => filePath.endsWith(".ts"))
    .sort()
    .map((filePath) => `${path.relative(directory, filePath)}\0${fs.readFileSync(filePath, "utf8")}`)
    .join("\0");
  return hashString(contents);
}

function hashSourceFile(fileName: string): string {
  return hashString(fs.readFileSync(path.join(import.meta.dirname, fileName), "utf8"));
}

export function getSamplingImplementationFingerprint(): string {
  return hashSourceFile("Sampling.ts");
}

export function getImplementationFingerprints(): Record<"legacy" | "new", string> {
  const packagesDirectory = path.resolve(import.meta.dirname, "../../../packages");
  return {
    legacy: hashString(
      [
        hashSourceFile("legacy/Adapter.ts"),
        getPackageVersion("@itwin/presentation-backend"),
        getPackageVersion("@itwin/presentation-common"),
      ].join(":"),
    ),
    new: hashString(
      [
        hashSourceFile("new/Adapter.ts"),
        hashDirectory(path.join(packagesDirectory, "content", "src")),
        hashDirectory(path.join(packagesDirectory, "core-interop", "src")),
        hashDirectory(path.join(packagesDirectory, "shared", "src")),
      ].join(":"),
    ),
  };
}
