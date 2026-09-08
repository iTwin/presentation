/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createBisCoreContentConfiguration } from "../../../content/extensions/biscore/BisCoreContentConfiguration.js";
import {
  createBisCoreAspectsFieldsProvider,
  createBisCoreFieldsProvider,
} from "../../../content/extensions/biscore/BisCoreFieldsProviders.js";
import { DEFAULT_BIS_CORE_LOCALIZED_STRINGS } from "../../../content/extensions/biscore/BisCoreLocalizedStrings.js";

import type { ECSchemaProvider } from "@itwin/presentation-shared";
import type { ContentTarget } from "../../../content/ContentTarget.js";

describe("createBisCoreContentConfiguration", () => {
  it("returns the BisCore fields providers and descriptor transformers", () => {
    const config = createBisCoreContentConfiguration();
    expect(config.imodelFieldsProviders.map((provider) => provider.id)).to.deep.equal([
      createBisCoreAspectsFieldsProvider().id,
      createBisCoreFieldsProvider(DEFAULT_BIS_CORE_LOCALIZED_STRINGS).id,
    ]);
    expect(config.descriptorTransformers.length).to.deep.equal(3);
  });

  it("forwards localizedStrings overrides to the fields provider", async () => {
    const imodelAccess: ECSchemaProvider = {
      getSchema: async () => undefined,
      classDerivesFrom: async (derived: string, base: string) => derived === base,
    };
    const target: ContentTarget = { primaryClass: "BisCore.Element" };

    const config = createBisCoreContentConfiguration({ localizedStrings: { modelSource: "Custom Source Label" } });
    const [, fieldsProvider] = config.imodelFieldsProviders;
    const contribution = await fieldsProvider.getContribution({ imodelAccess, target });

    expect(contribution!.categories!.model_source.label).to.equal("Custom Source Label");
    // Unrelated strings still fall back to their English defaults.
    expect(contribution!.categories!.source_information.label).to.equal("Source Information");
  });
});
