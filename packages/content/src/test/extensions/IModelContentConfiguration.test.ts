/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { MODEL_SOURCE_CATEGORY_ID } from "../../content/extensions/biscore/BisCoreFieldsProviders.js";
import { createIModelContentConfiguration } from "../../content/extensions/IModelContentConfiguration.js";

import type { EC, ECSchemaProvider, ECSqlQueryExecutor, ECSqlQueryRow } from "@itwin/presentation-shared";
import type { Ruleset } from "../../content/extensions/presentation-rules/PresentationRules.js";

/** Builds an `imodelAccess` stub with the supplied embedded rulesets and BisCore schema version. */
function createIModelAccess(props?: {
  bisCoreVersion?: EC.SchemaVersion;
  rulesets?: Ruleset[];
}): ECSqlQueryExecutor & ECSchemaProvider {
  return {
    createQueryReader: (): AsyncIterableIterator<ECSqlQueryRow> => {
      return (async function* (): AsyncGenerator<ECSqlQueryRow> {
        if (props?.rulesets === undefined) {
          throw new Error("ECClass 'PresentationRules.Ruleset' does not exist or could not be loaded.");
        }
        for (const ruleset of props.rulesets) {
          yield [JSON.stringify({ jsonProperties: ruleset })];
        }
      })();
    },
    getSchema: async (name: string) =>
      name === "BisCore" && props?.bisCoreVersion ? { name, version: props.bisCoreVersion } : undefined,
    classDerivesFrom: async (derived: string, base: string) => derived === base,
  } as unknown as ECSqlQueryExecutor & ECSchemaProvider;
}

describe("createIModelContentConfiguration", () => {
  it("combines BisCore's and the embedded configuration's fields providers and descriptor transformers", async () => {
    const imodelAccess = createIModelAccess();
    const config = await createIModelContentConfiguration({ imodelAccess });

    // BisCore contributes two fields providers (`biscore-aspects_v1`, `biscore-fields_v1`) and two
    // descriptor transformers; the embedded-rulesets configuration contributes none here, since no
    // embedded rulesets exist in this stub iModel.
    expect(config.imodelFieldsProviders?.map((provider) => provider.id)).to.deep.equal([
      "biscore-aspects_v1",
      "biscore-fields_v1",
    ]);
    expect(config.descriptorTransformers?.length).to.equal(3);
  });

  it("includes fields providers and descriptor transformers from embedded supplemental rulesets", async () => {
    const imodelAccess = createIModelAccess({
      rulesets: [
        {
          id: "embedded-content-modifier",
          supplementationInfo: { supplementationPurpose: "test" },
          rules: [
            {
              ruleType: "ContentModifier",
              calculatedProperties: [{ label: "Calculated", value: "1" }],
              propertyOverrides: [{ name: "CodeValue", labelOverride: "Custom Code" }],
            },
          ],
        },
      ],
    });
    const config = await createIModelContentConfiguration({ imodelAccess });

    expect(config.imodelFieldsProviders).to.have.length(3);
    expect(config.descriptorTransformers).to.have.length(4);
    expect(config.imodelFieldsProviders![2].id).to.match(/^FieldsProviderFromContentModifierRule_/);
  });

  it("forwards localizedStrings overrides to the BisCore configuration", async () => {
    const imodelAccess = createIModelAccess({ bisCoreVersion: { read: 1, write: 0, minor: 2 } });
    const config = await createIModelContentConfiguration({
      imodelAccess,
      localizedStrings: { modelSource: "Custom Model Source" },
    });

    const [, fieldsProvider] = config.imodelFieldsProviders!;
    const contribution = await fieldsProvider.getContribution({
      imodelAccess,
      target: { primaryClass: "BisCore.Element" },
    });
    expect(contribution!.categories![MODEL_SOURCE_CATEGORY_ID].label).to.equal("Custom Model Source");
  });
});
