/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { KeySet } from "@itwin/presentation-common";
import { DEFAULT_PROPERTY_GRID_RULESET, PresentationPropertyDataProvider } from "@itwin/presentation-components";
import { createECSchemaProvider } from "@itwin/presentation-core-interop";
import { mapConcurrently } from "../../Concurrency.js";
import { getLegacyHiddenProperties } from "../../LegacyHiddenProperties.js";
import { capturePropertyData, createPropertyGridCapture } from "../Capture.js";
import { InProcessIModelConnection } from "../Frontend.js";

import type { IModelDb } from "@itwin/core-backend";
import type { Content, Field, PageOptions, Rule, Ruleset } from "@itwin/presentation-common";
import type { PresentationPropertyDataProviderProps } from "@itwin/presentation-components";
import type { ECSchemaProvider } from "@itwin/presentation-shared";
import type { LegacyHiddenProperties } from "../../LegacyHiddenProperties.js";
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
/** Hides fields of properties that the new pipeline doesn't show, the same way the content suite's legacy normalization drops them. */
class LegacyPropertyDataProvider extends PresentationPropertyDataProvider {
  readonly #schemaProvider: ECSchemaProvider;
  #hiddenProperties: LegacyHiddenProperties | undefined;

  constructor(props: PresentationPropertyDataProviderProps & { schemaProvider: ECSchemaProvider }) {
    super(props);
    this.#schemaProvider = props.schemaProvider;
  }

  public override async getContent(pageOptions?: PageOptions): Promise<Content | undefined> {
    const content = await super.getContent(pageOptions);
    if (content) {
      this.#hiddenProperties = await getLegacyHiddenProperties([content.descriptor.toJSON()], this.#schemaProvider);
    }
    return content;
  }

  protected override isFieldHidden(field: Field): boolean {
    if (super.isFieldHidden(field)) {
      return true;
    }
    const hiddenProperties = this.#hiddenProperties;
    // Merged fields stay visible while any of their properties is visible.
    return (
      hiddenProperties !== undefined &&
      field.isPropertiesField() &&
      field.properties.every(({ property }) => hiddenProperties.has(property.classInfo.name, property.name))
    );
  }
}

export async function captureLegacyPropertyGrid(props: {
  imodel: IModelDb;
  signal: AbortSignal;
  scenario: SampledElementsPropertyGridScenario;
  implementationFingerprint: string;
  imodelFingerprint: string;
}): Promise<PropertyGridCapture<"legacy">> {
  const { scenario, signal } = props;
  const imodel = new InProcessIModelConnection(props.imodel);
  const schemaProvider = createECSchemaProvider(props.imodel);
  try {
    const items = await mapConcurrently({
      items: scenario.keys,
      concurrency: 4,
      callback: async (key) => {
        using provider = new LegacyPropertyDataProvider({
          imodel,
          ruleset,
          disableFavoritesCategory: true,
          schemaProvider,
        });
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
