/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { hashString } from "./Persistence.js";

import type { ImplementationName } from "./Persistence.js";

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

function hashDirectory(directory: string, extensions = [".ts"]): string {
  const contents = listFiles(directory)
    .filter((filePath) => extensions.some((extension) => filePath.endsWith(extension)))
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

export type ImplementationFingerprints = Record<ImplementationName, string>;

/** Fingerprints of implementations used for content scenarios and for property grid scenarios. */
export interface Fingerprints {
  content: ImplementationFingerprints;
  propertyGrid: ImplementationFingerprints;
}

export function getImplementationFingerprints(): Fingerprints {
  const repositoryDirectory = path.resolve(import.meta.dirname, "../../..");
  const packagesDirectory = path.join(repositoryDirectory, "packages");
  const legacyPackages = [
    getPackageVersion("@itwin/presentation-backend"),
    getPackageVersion("@itwin/presentation-common"),
  ];
  const newPackages = [
    hashDirectory(path.join(packagesDirectory, "content", "src")),
    hashDirectory(path.join(packagesDirectory, "core-interop", "src")),
    hashDirectory(path.join(packagesDirectory, "shared", "src")),
  ];
  return {
    content: {
      legacy: hashString([hashSourceFile("content/legacy/Adapter.ts"), ...legacyPackages].join(":")),
      new: hashString([hashSourceFile("content/new/Adapter.ts"), ...newPackages].join(":")),
    },
    propertyGrid: {
      legacy: hashString(
        [
          ...legacyPackages,
          hashSourceFile("property-grid/Capture.ts"),
          hashSourceFile("property-grid/legacy/Adapter.ts"),
          getPackageVersion("@itwin/presentation-frontend"),
          hashDirectory(path.join(packagesDirectory, "components", "src", "presentation-components"), [".ts", ".tsx"]),
          hashDirectory(path.join(packagesDirectory, "shared", "src")),
        ].join(":"),
      ),
      new: hashString(
        [
          ...newPackages,
          hashSourceFile("property-grid/Capture.ts"),
          hashSourceFile("property-grid/new/Adapter.ts"),
          hashString(
            fs.readFileSync(
              path.join(
                repositoryDirectory,
                "apps/test-app/frontend/src/components/content-properties-widget/TransformToPropertyRecord.ts",
              ),
              "utf8",
            ),
          ),
        ].join(":"),
      ),
    },
  };
}
