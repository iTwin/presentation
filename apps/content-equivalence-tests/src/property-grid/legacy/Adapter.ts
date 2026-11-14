/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { KeySet } from "@itwin/presentation-common";
import { DEFAULT_PROPERTY_GRID_RULESET, PresentationPropertyDataProvider } from "@itwin/presentation-components";
import { mapConcurrently } from "../../Concurrency.js";
import { capturePropertyData, createPropertyGridCapture } from "../Capture.js";
import { InProcessIModelConnection } from "../Frontend.js";

import type { IModelDb } from "@itwin/core-backend";
import type { Rule, Ruleset } from "@itwin/presentation-common";
import type { SampledElementsPropertyGridScenario } from "../../Persistence.js";
import type { PropertyGridCapture } from "../Capture.js";

/** Same rules as the content suite's legacy adapter adds, to align legacy content with the new implementation. */
const supplementalRules: Rule[] = [
  {
    ruleType: "ContentModifier",
    class: { schemaName: "BisCore", className: "DefinitionElement" },
    propertyOverrides: [{ name: "IsPrivate", isDisplayed: false }],
  },
];

const ruleset: Ruleset = {
  id: "content-output-equivalence-property-grid",
  rules: [...supplementalRules, ...DEFAULT_PROPERTY_GRID_RULESET.rules],
};

/** Creates property grid data for each sampled element using `PresentationPropertyDataProvider`. */
export async function captureLegacyPropertyGrid(props: {
  imodel: IModelDb;
  signal: AbortSignal;
  scenario: SampledElementsPropertyGridScenario;
  implementationFingerprint: string;
  imodelFingerprint: string;
}): Promise<PropertyGridCapture<"legacy">> {
  const { scenario, signal } = props;
  const imodel = new InProcessIModelConnection(props.imodel);
  try {
    const items = await mapConcurrently({
      items: scenario.keys,
      concurrency: 4,
      callback: async (key) => {
        using provider = new PresentationPropertyDataProvider({ imodel, ruleset, disableFavoritesCategory: true });
        provider.keys = new KeySet([{ className: key.className.replace(".", ":"), id: key.id }]);
        return { primaryKey: key, data: await capturePropertyData(await provider.getData()) };
      },
      signal,
    });
    return createPropertyGridCapture({ ...props, implementation: "legacy", items });
  } finally {
    await imodel.close();
  }
}
