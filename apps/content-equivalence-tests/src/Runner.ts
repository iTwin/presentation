/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import fs from "node:fs";
import path from "node:path";
import { IModelHost, SnapshotDb } from "@itwin/core-backend";
import { Presentation } from "@itwin/presentation-backend";
import { getImplementationFingerprints, getSamplingImplementationFingerprint } from "./Fingerprints.js";
import { captureLegacy } from "./legacy/Adapter.js";
import { createCanonicalCapture as normalizeLegacyCapture } from "./legacy/Normalization.js";
import { captureNew } from "./new/Adapter.js";
import { createCanonicalCapture as normalizeNewCapture } from "./new/Normalization.js";
import { compareContentItems, compareDescriptors } from "./NormalizationCommon.js";
import {
  cachePath,
  CAPTURE_FORMAT_VERSION,
  hashFile,
  hashString,
  readCapture,
  shortFingerprint,
  stableStringify,
  writeJson,
} from "./Persistence.js";
import { selectSample } from "./Sampling.js";

import type { ResolvedIModelEntry, RuntimeConfiguration } from "./Configuration.js";
import type { LegacyCapture } from "./legacy/Adapter.js";
import type { NewCapture } from "./new/Adapter.js";
import type { CaptureEnvelope, CaptureMetadata, ImplementationName, Scenario } from "./Persistence.js";
import type { Sample } from "./Sampling.js";

export interface RunScenarioSummary {
  imodel: string;
  scenario: Scenario["id"];
  legacyCacheHit: boolean;
  newCacheHit: boolean;
  descriptorDifferences: number;
  valueDifferences: number;
  reportDirectory: string;
}

function openIModel(filePath: string): SnapshotDb {
  return SnapshotDb.openFile(filePath);
}

function shouldRefresh(config: RuntimeConfiguration, implementation: ImplementationName): boolean {
  return config.refresh === "all" || config.refresh === implementation;
}

function readReusableCapture<TCapture extends CaptureEnvelope>(
  filePath: string,
  expected: CaptureMetadata<TCapture["implementation"]>,
): TCapture | undefined {
  try {
    return readCapture<TCapture>(filePath, expected);
  } catch (error) {
    console.warn(error instanceof Error ? error.message : String(error));
    return undefined;
  }
}

function sampleCachePath(config: RuntimeConfiguration, imodelFingerprint: string, imodel: ResolvedIModelEntry): string {
  const samplingFingerprint = hashString(
    stableStringify({
      implementation: getSamplingImplementationFingerprint(),
      sampling: config.manifest.sampling,
      explicitKeys: imodel.instanceKeys ?? [],
    }),
  );
  return path.join(
    config.outputDirectory,
    "cache",
    `imodel-${shortFingerprint(imodelFingerprint)}`,
    "sampling",
    `sampling-${shortFingerprint(samplingFingerprint)}.json`,
  );
}

function readSample(filePath: string): Sample | undefined {
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    return undefined;
  }
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8")) as Sample;
    if (!Array.isArray(value.keys) || typeof value.candidateCounts !== "object") {
      throw new Error("Unexpected sample shape.");
    }
    return value;
  } catch (error) {
    console.warn(
      `Ignoring invalid sample cache '${filePath}': ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

class BackendLifecycle {
  private constructor() {}

  public static async start(): Promise<BackendLifecycle> {
    const lifecycle = new BackendLifecycle();
    await lifecycle.start();
    return lifecycle;
  }

  private async start() {
    await IModelHost.startup({ profileName: "presentation-content-equivalence-tests" });
    Presentation.initialize();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    Presentation.terminate();
    await IModelHost.shutdown();
  }
}

async function loadOrCreateSample(props: {
  config: RuntimeConfiguration;
  imodel: ResolvedIModelEntry;
  imodelFingerprint: string;
}): Promise<Sample> {
  const filePath = sampleCachePath(props.config, props.imodelFingerprint, props.imodel);
  const cached = readSample(filePath);
  if (cached) {
    return cached;
  }
  const imodelDb = openIModel(props.imodel.path);
  try {
    const sample = await selectSample({
      imodel: imodelDb,
      sampling: props.config.manifest.sampling,
      explicitKeys: props.imodel.instanceKeys,
    });
    writeJson(filePath, sample);
    return sample;
  } finally {
    imodelDb.close();
  }
}

async function loadOrCreateCapture<TCapture extends CaptureEnvelope>(props: {
  config: RuntimeConfiguration;
  imodel: ResolvedIModelEntry;
  imodelFingerprint: string;
  implementation: TCapture["implementation"];
  implementationFingerprint: string;
  scenario: Scenario;
  createCapture: (props: {
    imodel: SnapshotDb;
    scenario: Scenario;
    implementationFingerprint: string;
    imodelFingerprint: string;
  }) => Promise<TCapture>;
}): Promise<{ capture: TCapture; cacheHit: boolean; filePath: string }> {
  const { config, implementation, implementationFingerprint, imodelFingerprint, scenario } = props;
  const filePath = cachePath({ config, imodelFingerprint, implementation, implementationFingerprint, scenario });
  const expected = {
    captureFormatVersion: CAPTURE_FORMAT_VERSION,
    implementation,
    implementationFingerprint,
    imodelFingerprint,
    scenario,
  };
  if (!shouldRefresh(config, implementation)) {
    const capture = readReusableCapture<TCapture>(filePath, expected);
    if (capture) {
      return { capture, cacheHit: true, filePath };
    }
  }

  const imodelDb = openIModel(props.imodel.path);
  try {
    const capture = await props.createCapture({
      imodel: imodelDb,
      scenario,
      implementationFingerprint,
      imodelFingerprint,
    });
    writeJson(filePath, capture);
    return { capture, cacheHit: false, filePath };
  } finally {
    imodelDb.close();
  }
}

function createRunDirectory(outputDirectory: string): string {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const runDirectory = path.join(outputDirectory, "runs", `${timestamp}-${process.pid}`);
  fs.mkdirSync(runDirectory, { recursive: true });
  return runDirectory;
}

export async function runEquivalence(config: RuntimeConfiguration): Promise<RunScenarioSummary[]> {
  await using _init = await BackendLifecycle.start();
  const fingerprints = getImplementationFingerprints();
  const runDirectory = createRunDirectory(config.outputDirectory);
  const summaries: RunScenarioSummary[] = [];
  const errors: string[] = [];

  writeJson(path.join(runDirectory, "run.json"), {
    manifestPath: config.manifestPath,
    manifest: config.manifest,
    refresh: config.refresh,
    implementationFingerprints: fingerprints,
  });

  for (const imodel of config.imodels) {
    const imodelDirectory = path.join(runDirectory, imodel.name);
    let imodelFingerprint: string;
    try {
      imodelFingerprint = await hashFile(imodel.path);
    } catch (error) {
      const message = `${imodel.name}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`;
      errors.push(message);
      writeJson(path.join(imodelDirectory, "error.json"), { message });
      continue;
    }

    // Sampling failure only rules out the "sampled-elements" scenario; the descriptor scenario needs no sample.
    let sample: Sample | undefined;
    try {
      sample = await loadOrCreateSample({ config, imodel, imodelFingerprint });
      writeJson(path.join(imodelDirectory, "sample.json"), sample);
    } catch (error) {
      const message = `${imodel.name}/sampling: ${
        error instanceof Error ? (error.stack ?? error.message) : String(error)
      }`;
      errors.push(message);
      writeJson(path.join(imodelDirectory, "sampling-error.json"), { message });
    }

    const scenarios: Scenario[] = [
      { id: "all-elements-descriptor" },
      ...(sample ? [{ id: "sampled-elements", keys: sample.keys } satisfies Scenario] : []),
    ];

    for (const scenario of scenarios) {
      const scenarioDirectory = path.join(imodelDirectory, scenario.id);
      try {
        const legacy = await loadOrCreateCapture<LegacyCapture>({
          config,
          imodel,
          imodelFingerprint,
          implementation: "legacy",
          implementationFingerprint: fingerprints.legacy,
          scenario,
          createCapture: captureLegacy,
        });
        const current = await loadOrCreateCapture<NewCapture>({
          config,
          imodel,
          imodelFingerprint,
          implementation: "new",
          implementationFingerprint: fingerprints.new,
          scenario,
          createCapture: captureNew,
        });
        const normalizedLegacy = normalizeLegacyCapture(legacy.capture);
        const normalizedNew = normalizeNewCapture(current.capture);

        let differences;
        if (scenario.id === "all-elements-descriptor") {
          if (normalizedLegacy.descriptor === undefined || normalizedNew.descriptor === undefined) {
            throw new Error("Expected descriptor-only canonical captures.");
          }
          differences = compareDescriptors(normalizedLegacy.descriptor, normalizedNew.descriptor);
        } else {
          if (normalizedLegacy.items === undefined || normalizedNew.items === undefined) {
            throw new Error("Expected canonical content items.");
          }
          differences = compareContentItems(normalizedLegacy.items, normalizedNew.items, scenario.keys);
        }

        writeJson(path.join(scenarioDirectory, "legacy.normalized.json"), normalizedLegacy);
        writeJson(path.join(scenarioDirectory, "new.normalized.json"), normalizedNew);
        writeJson(path.join(scenarioDirectory, "differences.json"), differences);
        writeJson(path.join(scenarioDirectory, "captures.json"), {
          legacy: { path: legacy.filePath, cacheHit: legacy.cacheHit },
          new: { path: current.filePath, cacheHit: current.cacheHit },
        });

        summaries.push({
          imodel: imodel.name,
          scenario: scenario.id,
          legacyCacheHit: legacy.cacheHit,
          newCacheHit: current.cacheHit,
          descriptorDifferences: differences.descriptorDifferences.length,
          valueDifferences: differences.valueDifferences.length,
          reportDirectory: scenarioDirectory,
        });
      } catch (error) {
        const message = `${imodel.name}/${scenario.id}: ${
          error instanceof Error ? (error.stack ?? error.message) : String(error)
        }`;
        errors.push(message);
        writeJson(path.join(scenarioDirectory, "error.json"), { message });
      }
    }
  }

  writeJson(path.join(runDirectory, "summary.json"), { summaries, errors });
  const mismatchCount = summaries.reduce(
    (sum, summary) => sum + summary.descriptorDifferences + summary.valueDifferences,
    0,
  );
  if (errors.length > 0 || mismatchCount > 0) {
    throw new Error(
      `Content equivalence failed with ${errors.length} execution error(s) and ${mismatchCount} difference(s). See '${runDirectory}'.`,
    );
  }
  return summaries;
}
