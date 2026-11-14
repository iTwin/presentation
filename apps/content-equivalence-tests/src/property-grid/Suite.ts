/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { loadOrCreateCapture, logProgress } from "../Runner.js";
import { captureLegacyPropertyGrid } from "./legacy/Adapter.js";
import { captureNewPropertyGrid } from "./new/Adapter.js";
import { comparePropertyGridItems, createCanonicalPropertyGridCapture } from "./Normalization.js";

import type { SampledElementsPropertyGridScenario } from "../Persistence.js";
import type { EquivalenceSuite, ScenarioProps, ScenarioResult } from "../Runner.js";
import type { PropertyGridCapture } from "./Capture.js";

async function runPropertyGridScenario(
  props: ScenarioProps<SampledElementsPropertyGridScenario>,
): Promise<ScenarioResult> {
  const { config, imodel, imodelFingerprint, fingerprints, scenario, signal, diagnostics } = props;
  const scenarioContext = `${imodel.name}/${scenario.id}`;
  const legacy = await loadOrCreateCapture<PropertyGridCapture<"legacy">, SampledElementsPropertyGridScenario>({
    config,
    imodel,
    imodelFingerprint,
    implementation: "legacy",
    implementationFingerprint: fingerprints.legacy,
    scenario,
    signal,
    diagnostics,
    createCapture: captureLegacyPropertyGrid,
  });
  const current = await loadOrCreateCapture<PropertyGridCapture<"new">, SampledElementsPropertyGridScenario>({
    config,
    imodel,
    imodelFingerprint,
    implementation: "new",
    implementationFingerprint: fingerprints.new,
    scenario,
    signal,
    diagnostics,
    createCapture: captureNewPropertyGrid,
  });
  signal.throwIfAborted();
  logProgress(scenarioContext, "Normalizing and comparing legacy and new property grid data.");
  const normalizedLegacy = createCanonicalPropertyGridCapture(legacy.capture);
  const normalizedNew = createCanonicalPropertyGridCapture(current.capture);
  return {
    captures: { legacy, new: current },
    normalized: { legacy: normalizedLegacy, new: normalizedNew },
    differences: comparePropertyGridItems(normalizedLegacy, normalizedNew, scenario.keys),
  };
}

/**
 * Compares property grid data created by `PresentationPropertyDataProvider` with the data the test app creates from
 * new-generation content.
 */
export const propertyGridSuite: EquivalenceSuite = {
  name: "property-grid",
  getFingerprints: (fingerprints) => fingerprints.propertyGrid,
  getScenarios: (sample) => (sample ? [{ id: "sampled-elements-property-grid", keys: sample.keys }] : []),
  runScenario: async (props) => {
    const { scenario } = props;
    if (scenario.id !== "sampled-elements-property-grid") {
      throw new Error(`Unexpected property grid scenario '${scenario.id}'.`);
    }
    return runPropertyGridScenario({ ...props, scenario });
  },
};
