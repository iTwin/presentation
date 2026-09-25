/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import fs from "node:fs";
import path from "node:path";
import { Id64 } from "@itwin/core-bentley";

import type { EC, InstanceKey } from "@itwin/presentation-shared";

const DEFAULT_OUTPUT_DIRECTORY = "output";
const MANIFEST_FILE_NAME = "imodels.json";
const REFRESH_MODES = new Set<RefreshMode>(["none", "legacy", "new", "all"]);

type RefreshMode = "legacy" | "new" | "all" | "none";

export interface SamplingOptions {
  perClass: number;
  seed: number;
}

interface IModelManifestEntry {
  name: string;
  path: string;
  instanceKeys?: InstanceKey[];
}

interface EquivalenceManifest {
  sampling: SamplingOptions;
  imodels: IModelManifestEntry[];
}

export interface ResolvedIModelEntry extends IModelManifestEntry {
  path: string;
}

export interface RuntimeConfiguration {
  manifestPath: string;
  outputDirectory: string;
  refresh: RefreshMode;
  manifest: EquivalenceManifest;
  imodels: ResolvedIModelEntry[];
}

function requireObject(value: unknown, description: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${description} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function parseSampling(value: unknown): SamplingOptions {
  const sampling = requireObject(value, "Manifest 'sampling'");
  if (!Number.isInteger(sampling.perClass) || Number(sampling.perClass) <= 0) {
    throw new Error("Manifest 'sampling.perClass' must be a positive integer.");
  }
  if (!Number.isInteger(sampling.seed)) {
    throw new Error("Manifest 'sampling.seed' must be an integer.");
  }
  return { perClass: Number(sampling.perClass), seed: Number(sampling.seed) };
}

function parseIModel(value: unknown, index: number): IModelManifestEntry {
  const entry = requireObject(value, `Manifest 'imodels[${index}]'`);
  if (typeof entry.name !== "string" || entry.name.trim().length === 0) {
    throw new Error(`Manifest 'imodels[${index}].name' must be a non-empty string.`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry.name) || entry.name.includes("..")) {
    throw new Error(
      `Manifest 'imodels[${index}].name' may contain only letters, numbers, periods, underscores, and hyphens.`,
    );
  }
  if (typeof entry.path !== "string" || entry.path.trim().length === 0) {
    throw new Error(`Manifest 'imodels[${index}].path' must be a non-empty string.`);
  }
  if (entry.instanceKeys !== undefined && !Array.isArray(entry.instanceKeys)) {
    throw new Error(`Manifest 'imodels[${index}].instanceKeys' must be an array.`);
  }
  const instanceKeys = entry.instanceKeys?.map((keyValue, keyIndex) => {
    const key = requireObject(keyValue, `Manifest 'imodels[${index}].instanceKeys[${keyIndex}]'`);
    if (typeof key.className !== "string" || key.className.length === 0) {
      throw new Error(`Explicit instance key ${keyIndex} for '${String(entry.name)}' has an invalid className.`);
    }
    if (typeof key.id !== "string" || !Id64.isValidId64(key.id)) {
      throw new Error(`Explicit instance key ${keyIndex} for '${String(entry.name)}' has an invalid id.`);
    }
    const className = key.className.replace(":", ".");
    if (!className.includes(".")) {
      throw new Error(`Explicit instance key ${keyIndex} for '${String(entry.name)}' has an invalid className.`);
    }
    return { className: className as EC.FullClassNameDotNotation, id: Id64.fromJSON(key.id) };
  });
  return { name: entry.name.trim(), path: entry.path, instanceKeys };
}

function parseManifest(value: unknown): EquivalenceManifest {
  const manifest = requireObject(value, "Manifest");
  if (!Array.isArray(manifest.imodels) || manifest.imodels.length === 0) {
    throw new Error("Manifest 'imodels' must be a non-empty array.");
  }
  const imodels = manifest.imodels.map(parseIModel);
  const names = new Set<string>();
  const paths = new Set<string>();
  for (const imodel of imodels) {
    if (names.has(imodel.name)) {
      throw new Error(`Manifest contains duplicate iModel name '${imodel.name}'.`);
    }
    if (paths.has(imodel.path)) {
      throw new Error(`Manifest contains duplicate iModel path '${imodel.path}'.`);
    }
    names.add(imodel.name);
    paths.add(imodel.path);
  }
  return { sampling: parseSampling(manifest.sampling), imodels };
}

export function loadRuntimeConfiguration(): RuntimeConfiguration {
  const manifestPath = path.resolve(import.meta.dirname, "..", MANIFEST_FILE_NAME);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read iModel manifest '${manifestPath}'.`, { cause: error });
  }
  const manifest = parseManifest(parsed);
  const manifestDirectory = path.dirname(manifestPath);
  const imodels = manifest.imodels.map((entry) => {
    const resolvedPath = path.resolve(manifestDirectory, entry.path);
    if (!fs.statSync(resolvedPath, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`iModel '${entry.name}' does not exist at '${resolvedPath}'.`);
    }
    return { ...entry, path: resolvedPath };
  });
  const resolvedPaths = new Set<string>();
  for (const imodel of imodels) {
    if (resolvedPaths.has(imodel.path)) {
      throw new Error(`Manifest contains duplicate resolved iModel path '${imodel.path}'.`);
    }
    resolvedPaths.add(imodel.path);
  }

  const refresh = (process.env.CONTENT_EQUIVALENCE_REFRESH ?? "none") as RefreshMode;
  if (!REFRESH_MODES.has(refresh)) {
    throw new Error("CONTENT_EQUIVALENCE_REFRESH must be one of: none, legacy, new, all.");
  }

  return {
    manifestPath,
    outputDirectory: path.resolve(
      process.env.CONTENT_EQUIVALENCE_OUTPUT ?? path.join(import.meta.dirname, "..", DEFAULT_OUTPUT_DIRECTORY),
    ),
    refresh,
    manifest,
    imodels,
  };
}
