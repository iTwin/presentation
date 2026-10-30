/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import fs from "node:fs";
import path from "node:path";
import { SnapshotDb } from "@itwin/core-backend";
import { getImplementationFingerprints, getSamplingImplementationFingerprint } from "./Fingerprints.js";
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
import type { Fingerprints, ImplementationFingerprints } from "./Fingerprints.js";
import type { ComparisonResult } from "./NormalizationCommon.js";
import type {
  CaptureDiagnostics,
  CaptureEnvelope,
  CaptureMetadata,
  ImplementationName,
  EquivalenceScenario,
} from "./Persistence.js";
import type { Sample } from "./Sampling.js";

export interface ScenarioResult {
  captures: Record<ImplementationName, { filePath: string; cacheHit: boolean }>;
  normalized: Record<ImplementationName, unknown>;
  differences: ComparisonResult;
}

export interface ScenarioProps<TScenario extends EquivalenceScenario = EquivalenceScenario> {
  config: RuntimeConfiguration;
  imodel: ResolvedIModelEntry;
  imodelFingerprint: string;
  fingerprints: ImplementationFingerprints;
  scenario: TScenario;
  signal: AbortSignal;
  diagnostics: Map<ImplementationName, CaptureDiagnostics>;
}

/**
 * A set of scenarios run by one Vitest project. Property grid scenarios need a DOM, so they run separately from content
 * scenarios, and the runner doesn't import either of them.
 */
export interface EquivalenceSuite {
  name: string;
  /** Selects fingerprints of the implementations the suite's scenarios capture with. */
  getFingerprints: (fingerprints: Fingerprints) => ImplementationFingerprints;
  /** Returns the scenarios to run. `sample` is `undefined` when sampling fails. */
  getScenarios: (sample: Sample | undefined) => EquivalenceScenario[];
  runScenario: (props: ScenarioProps) => Promise<ScenarioResult>;
}

export interface RunScenarioSummary {
  imodel: string;
  scenario: EquivalenceScenario["id"];
  legacyCacheHit: boolean;
  newCacheHit: boolean;
  descriptorDifferences: number;
  valueDifferences: number;
  reportDirectory: string;
}

export function openIModel(filePath: string): SnapshotDb {
  return SnapshotDb.openFile(filePath);
}

class ScenarioTimeoutError extends Error {
  public constructor(timeoutMs: number) {
    super(`Scenario exceeded its time limit of ${timeoutMs / 60_000} minute(s).`);
    this.name = "ScenarioTimeoutError";
  }
}

function shouldRefresh(config: RuntimeConfiguration, implementation: ImplementationName): boolean {
  return config.refresh === "all" || config.refresh === implementation;
}

export function logProgress(context: string, message: string): void {
  console.info(`[${new Date().toISOString()}] [${context}] ${message}`);
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

async function loadOrCreateSample(props: {
  config: RuntimeConfiguration;
  imodel: ResolvedIModelEntry;
  imodelFingerprint: string;
}): Promise<Sample> {
  const context = `${props.imodel.name}/sampling`;
  const filePath = sampleCachePath(props.config, props.imodelFingerprint, props.imodel);
  logProgress(context, "Checking sample cache.");
  const cached = readSample(filePath);
  if (cached) {
    logProgress(context, `Using cached sample with ${cached.keys.length} keys from '${filePath}'.`);
    return cached;
  }
  logProgress(context, "No valid cached sample; selecting instance keys.");
  const imodelDb = openIModel(props.imodel.path);
  try {
    const sample = await selectSample({
      imodel: imodelDb,
      sampling: props.config.manifest.sampling,
      explicitKeys: props.imodel.instanceKeys,
    });
    writeJson(filePath, sample);
    logProgress(context, `Saved sample with ${sample.keys.length} keys to '${filePath}'.`);
    return sample;
  } finally {
    imodelDb.close();
  }
}

export async function loadOrCreateCapture<
  TCapture extends CaptureEnvelope,
  TScenario extends EquivalenceScenario = EquivalenceScenario,
>(props: {
  config: RuntimeConfiguration;
  imodel: ResolvedIModelEntry;
  imodelFingerprint: string;
  implementation: TCapture["implementation"];
  implementationFingerprint: string;
  scenario: TScenario;
  signal: AbortSignal;
  /** Collects diagnostics reported by `createCapture`, keyed by implementation. */
  diagnostics: Map<ImplementationName, CaptureDiagnostics>;
  createCapture: (props: {
    imodel: SnapshotDb;
    signal: AbortSignal;
    onDiagnostics?: (diagnostics: CaptureDiagnostics) => void;
    scenario: TScenario;
    implementationFingerprint: string;
    imodelFingerprint: string;
  }) => Promise<TCapture>;
}): Promise<{ capture: TCapture; cacheHit: boolean; filePath: string }> {
  const { config, implementation, implementationFingerprint, imodelFingerprint, scenario } = props;
  const context = `${props.imodel.name}/${scenario.id}/${implementation}`;
  const filePath = cachePath({ config, imodelFingerprint, implementation, implementationFingerprint, scenario });
  const expected = {
    captureFormatVersion: CAPTURE_FORMAT_VERSION,
    implementation,
    implementationFingerprint,
    imodelFingerprint,
    scenario,
  };
  if (!shouldRefresh(config, implementation)) {
    logProgress(context, "Checking capture cache.");
    const capture = readReusableCapture<TCapture>(filePath, expected);
    if (capture) {
      logProgress(context, `Using cached capture from '${filePath}'.`);
      return { capture, cacheHit: true, filePath };
    }
    logProgress(context, "No valid cached capture; generating content.");
  } else {
    logProgress(context, "Refresh requested; generating content.");
  }

  props.signal.throwIfAborted();
  const imodelDb = openIModel(props.imodel.path);
  try {
    // The capture must settle before the iModel closes, so time limits only stop work cooperatively.
    const capture = await props.createCapture({
      imodel: imodelDb,
      signal: props.signal,
      onDiagnostics: (diagnostics) => props.diagnostics.set(implementation, diagnostics),
      scenario,
      implementationFingerprint,
      imodelFingerprint,
    });
    writeJson(filePath, capture);
    logProgress(context, `Saved generated capture to '${filePath}'.`);
    return { capture, cacheHit: false, filePath };
  } finally {
    imodelDb.close();
  }
}

export function createEquivalenceRun(config: RuntimeConfiguration, suite: EquivalenceSuite) {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const runDirectory = path.join(config.outputDirectory, "runs", `${timestamp}-${process.pid}-${suite.name}`);
  fs.mkdirSync(runDirectory, { recursive: true });
  const fingerprints = suite.getFingerprints(getImplementationFingerprints());
  writeJson(path.join(runDirectory, "run.json"), {
    suite: suite.name,
    manifestPath: config.manifestPath,
    manifest: config.manifest,
    refresh: config.refresh,
    implementationFingerprints: fingerprints,
  });
  return { suite, runDirectory, fingerprints, summaries: [] as RunScenarioSummary[], errors: [] as string[] };
}

export async function runEquivalence(
  config: RuntimeConfiguration,
  imodel: ResolvedIModelEntry,
  run: ReturnType<typeof createEquivalenceRun>,
): Promise<RunScenarioSummary[]> {
  const context = imodel.name;
  const { runDirectory, fingerprints } = run;
  logProgress(context, `Writing reports to '${runDirectory}'.`);
  const summaries: RunScenarioSummary[] = [];
  const errors: string[] = [];
  const imodelDirectory = path.join(runDirectory, imodel.name);

  try {
    logProgress(imodel.name, "Hashing iModel file.");
    const imodelFingerprint = await hashFile(imodel.path);

    // Sampling failure only rules out the sampled scenarios; the descriptor scenario needs no sample.
    let sample: Sample | undefined;
    try {
      sample = await loadOrCreateSample({ config, imodel, imodelFingerprint });
      writeJson(path.join(imodelDirectory, "sample.json"), sample);
    } catch (error) {
      const message = `${imodel.name}/sampling: ${
        error instanceof Error ? (error.stack ?? error.message) : String(error)
      }`;
      console.error(message);
      errors.push(message);
      writeJson(path.join(imodelDirectory, "sampling-error.json"), { message });
    }

    const scenarios = run.suite.getScenarios(sample);

    for (const scenario of scenarios) {
      const scenarioContext = `${imodel.name}/${scenario.id}`;
      const scenarioDirectory = path.join(imodelDirectory, scenario.id);
      const controller = new AbortController();
      const { scenarioTimeoutMs } = config;
      const timer =
        scenarioTimeoutMs !== undefined
          ? setTimeout(() => {
              logProgress(scenarioContext, "Time limit reached; canceling running work.");
              controller.abort(new ScenarioTimeoutError(scenarioTimeoutMs));
            }, scenarioTimeoutMs)
          : undefined;
      const diagnostics = new Map<ImplementationName, CaptureDiagnostics>();
      try {
        const { captures, normalized, differences } = await run.suite.runScenario({
          config,
          imodel,
          imodelFingerprint,
          fingerprints,
          scenario,
          signal: controller.signal,
          diagnostics,
        });

        writeJson(path.join(scenarioDirectory, "legacy.normalized.json"), normalized.legacy);
        writeJson(path.join(scenarioDirectory, "new.normalized.json"), normalized.new);
        writeJson(path.join(scenarioDirectory, "differences.json"), differences);
        writeJson(path.join(scenarioDirectory, "captures.json"), {
          legacy: { path: captures.legacy.filePath, cacheHit: captures.legacy.cacheHit },
          new: { path: captures.new.filePath, cacheHit: captures.new.cacheHit },
        });

        logProgress(
          scenarioContext,
          `Comparison complete: ${differences.descriptorDifferences.length} descriptor difference(s), ${differences.valueDifferences.length} value difference(s).`,
        );
        summaries.push({
          imodel: imodel.name,
          scenario: scenario.id,
          legacyCacheHit: captures.legacy.cacheHit,
          newCacheHit: captures.new.cacheHit,
          descriptorDifferences: differences.descriptorDifferences.length,
          valueDifferences: differences.valueDifferences.length,
          reportDirectory: scenarioDirectory,
        });
      } catch (error) {
        const failure = controller.signal.aborted ? controller.signal.reason : error;
        const message = `${imodel.name}/${scenario.id}: ${
          failure instanceof Error ? (failure.stack ?? failure.message) : String(failure)
        }${[...diagnostics.values()].map(({ failureSummary }) => (failureSummary ? `\n${failureSummary}` : "")).join("")}`;
        console.error(message);
        errors.push(message);
        writeJson(path.join(scenarioDirectory, "error.json"), { message });
      } finally {
        clearTimeout(timer);
        for (const [implementation, { details }] of diagnostics) {
          writeJson(path.join(scenarioDirectory, `${implementation}.diagnostics.json`), details);
        }
      }
    }
  } catch (error) {
    const message = `${imodel.name}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`;
    console.error(message);
    errors.push(message);
    writeJson(path.join(imodelDirectory, "error.json"), { message });
  }

  run.summaries.push(...summaries);
  run.errors.push(...errors);
  writeJson(path.join(runDirectory, "summary.json"), { summaries: run.summaries, errors: run.errors });
  const mismatchCount = summaries.reduce(
    (sum, summary) => sum + summary.descriptorDifferences + summary.valueDifferences,
    0,
  );
  logProgress(
    context,
    `Finished ${summaries.length} scenario(s) with ${errors.length} execution error(s) and ${mismatchCount} difference(s). Reports: '${runDirectory}'.`,
  );
  if (errors.length > 0 || mismatchCount > 0) {
    throw new Error(
      `Content equivalence failed with ${errors.length} execution error(s) and ${mismatchCount} difference(s). See '${runDirectory}'.`,
    );
  }
  return summaries;
}
