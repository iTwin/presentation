/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { compareContentItems, compareDescriptors } from "../NormalizationCommon.js";
import { loadOrCreateCapture, logProgress, openIModel } from "../Runner.js";
import { captureLegacy } from "./legacy/Adapter.js";
import { createCanonicalCapture as normalizeLegacyCapture } from "./legacy/Normalization.js";
import { captureNew } from "./new/Adapter.js";
import { createCanonicalCapture as normalizeNewCapture } from "./new/Normalization.js";

import type { Scenario } from "../Persistence.js";
import type { EquivalenceSuite, ScenarioProps, ScenarioResult } from "../Runner.js";
import type { LegacyCapture } from "./legacy/Adapter.js";
import type { NewCapture } from "./new/Adapter.js";

async function runContentScenario(props: ScenarioProps<Scenario>): Promise<ScenarioResult> {
  const { config, imodel, imodelFingerprint, fingerprints, scenario, signal, diagnostics } = props;
  const scenarioContext = `${imodel.name}/${scenario.id}`;
  const legacy = await loadOrCreateCapture<LegacyCapture, Scenario>({
    config,
    imodel,
    imodelFingerprint,
    implementation: "legacy",
    implementationFingerprint: fingerprints.legacy,
    scenario,
    signal,
    diagnostics,
    createCapture: captureLegacy,
  });
  const current = await loadOrCreateCapture<NewCapture, Scenario>({
    config,
    imodel,
    imodelFingerprint,
    implementation: "new",
    implementationFingerprint: fingerprints.new,
    scenario,
    signal,
    diagnostics,
    createCapture: captureNew,
  });
  signal.throwIfAborted();
  logProgress(scenarioContext, "Normalizing legacy and new captures.");
  const imodelDb = openIModel(imodel.path);
  let normalizedLegacy, normalizedNew;
  try {
    const imodelAccess = { ...createECSchemaProvider(imodelDb), ...createECSqlQueryExecutor(imodelDb) };
    normalizedLegacy = await normalizeLegacyCapture(legacy.capture, imodelAccess);
    signal.throwIfAborted();
    normalizedNew = await normalizeNewCapture(current.capture, imodelAccess, imodelDb.schemaContext);
    signal.throwIfAborted();
  } finally {
    imodelDb.close();
  }

  logProgress(scenarioContext, "Comparing normalized content.");
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
  return {
    captures: { legacy, new: current },
    normalized: { legacy: normalizedLegacy, new: normalizedNew },
    differences,
  };
}

/** Compares content descriptors and raw values of the legacy and new content APIs. */
export const contentSuite: EquivalenceSuite = {
  name: "content",
  getFingerprints: (fingerprints) => fingerprints.content,
  getScenarios: (sample) => [
    { id: "all-elements-descriptor" },
    ...(sample ? [{ id: "sampled-elements", keys: sample.keys } satisfies Scenario] : []),
  ],
  runScenario: async (props) => {
    const { scenario } = props;
    if (scenario.id === "sampled-elements-property-grid") {
      throw new Error(`Unexpected content scenario '${scenario.id}'.`);
    }
    return runContentScenario({ ...props, scenario });
  },
};
