/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createIModelContentConfiguration } from "../../../content/extensions/presentation-rules/EmbeddedRulesets.js";

import type { EC, ECSchemaProvider, ECSqlQueryExecutor, ECSqlQueryRow } from "@itwin/presentation-shared";
import type { Ruleset } from "../../../content/extensions/presentation-rules/PresentationRules.js";

/** Builds an `imodelAccess` stub whose `PresentationRules.Ruleset` table returns the given rulesets. */
function createIModelAccess(props: {
  rulesets?: Ruleset[];
  /** When set, the ruleset-reading query throws this error. */
  queryError?: Error;
  /** Schema names present in the iModel (with versions). */
  schemas?: Map<string, EC.SchemaVersion>;
}): ECSqlQueryExecutor & ECSchemaProvider {
  const { rulesets = [], queryError, schemas } = props;
  return {
    createQueryReader: (): AsyncIterableIterator<ECSqlQueryRow> => {
      return (async function* (): AsyncGenerator<ECSqlQueryRow> {
        if (queryError !== undefined) {
          throw queryError;
        }
        for (const ruleset of rulesets) {
          yield [JSON.stringify({ jsonProperties: ruleset })];
        }
      })();
    },
    getSchema: async (name: string) => {
      const version = schemas?.get(name);
      return version ? ({ name, version } as unknown as EC.Schema) : undefined;
    },
    classDerivesFrom: async () => false,
  };
}

const supplemental: Pick<Ruleset, "id" | "supplementationInfo"> = {
  id: "test-ruleset",
  supplementationInfo: { supplementationPurpose: "test" },
};

describe("createIModelContentConfiguration", () => {
  it("returns an empty configuration when the ruleset class does not exist", async () => {
    const config = await createIModelContentConfiguration({
      imodelAccess: createIModelAccess({
        queryError: new Error("ECClass 'PresentationRules.Ruleset' does not exist or could not be loaded."),
      }),
    });
    expect(config.imodelFieldsProviders).to.deep.equal([]);
    expect(config.descriptorTransformers).to.deep.equal([]);
  });

  it("propagates unexpected query errors", async () => {
    const error = new Error("database is locked");
    await expect(
      createIModelContentConfiguration({ imodelAccess: createIModelAccess({ queryError: error }) }),
    ).rejects.toThrow(error);
  });

  it("returns an empty configuration when there are no embedded rulesets", async () => {
    const config = await createIModelContentConfiguration({ imodelAccess: createIModelAccess({ rulesets: [] }) });
    expect(config.imodelFieldsProviders).to.deep.equal([]);
    expect(config.descriptorTransformers).to.deep.equal([]);
  });

  it("ignores non-supplemental rulesets", async () => {
    const rulesets: Ruleset[] = [
      { id: "primary", rules: [{ ruleType: "ContentModifier", calculatedProperties: [{ label: "X", value: "1" }] }] },
    ];
    const config = await createIModelContentConfiguration({ imodelAccess: createIModelAccess({ rulesets }) });
    expect(config.imodelFieldsProviders).to.deep.equal([]);
    expect(config.descriptorTransformers).to.deep.equal([]);
  });

  it("processes supplemental rulesets with no schema requirements", async () => {
    const rulesets: Ruleset[] = [
      { ...supplemental, rules: [{ ruleType: "ContentModifier", calculatedProperties: [{ label: "X", value: "1" }] }] },
    ];
    const config = await createIModelContentConfiguration({ imodelAccess: createIModelAccess({ rulesets }) });
    expect(config.imodelFieldsProviders).to.have.length(1);
    expect(config.descriptorTransformers).to.have.length(1);
  });

  it("skips rulesets whose `requiredSchemas` are not met by the iModel", async () => {
    const rulesets: Ruleset[] = [
      {
        ...supplemental,
        requiredSchemas: [{ name: "MissingSchema" }],
        rules: [{ ruleType: "ContentModifier", calculatedProperties: [{ label: "X", value: "1" }] }],
      },
    ];
    const config = await createIModelContentConfiguration({
      imodelAccess: createIModelAccess({ rulesets, schemas: new Map() }),
    });
    expect(config.imodelFieldsProviders).to.deep.equal([]);
    expect(config.descriptorTransformers).to.deep.equal([]);
  });

  it("processes rulesets whose `requiredSchemas` are met by the iModel", async () => {
    const rulesets: Ruleset[] = [
      {
        ...supplemental,
        requiredSchemas: [{ name: "PresentSchema" }],
        rules: [{ ruleType: "ContentModifier", calculatedProperties: [{ label: "X", value: "1" }] }],
      },
    ];
    const config = await createIModelContentConfiguration({
      imodelAccess: createIModelAccess({
        rulesets,
        schemas: new Map([["PresentSchema", { read: 1, write: 0, minor: 0 }]]),
      }),
    });
    expect(config.imodelFieldsProviders).to.have.length(1);
    expect(config.descriptorTransformers).to.have.length(1);
  });

  it("skips rulesets whose legacy `supportedSchemas` are not met by the iModel", async () => {
    const rulesets: Ruleset[] = [
      {
        ...supplemental,
        supportedSchemas: { schemaNames: ["MissingSchema"] },
        rules: [{ ruleType: "ContentModifier", calculatedProperties: [{ label: "X", value: "1" }] }],
      },
    ];
    const config = await createIModelContentConfiguration({
      imodelAccess: createIModelAccess({ rulesets, schemas: new Map() }),
    });
    expect(config.imodelFieldsProviders).to.deep.equal([]);
    expect(config.descriptorTransformers).to.deep.equal([]);
  });

  it("processes rulesets whose legacy `supportedSchemas` are met by the iModel", async () => {
    const rulesets: Ruleset[] = [
      {
        ...supplemental,
        supportedSchemas: { schemaNames: ["PresentSchema"] },
        rules: [{ ruleType: "ContentModifier", calculatedProperties: [{ label: "X", value: "1" }] }],
      },
    ];
    const config = await createIModelContentConfiguration({
      imodelAccess: createIModelAccess({
        rulesets,
        schemas: new Map([["PresentSchema", { read: 1, write: 0, minor: 0 }]]),
      }),
    });
    expect(config.imodelFieldsProviders).to.have.length(1);
    expect(config.descriptorTransformers).to.have.length(1);
  });

  it("ignores rules that are not content modifiers", async () => {
    const rulesets: Ruleset[] = [
      {
        ...supplemental,
        rules: [
          { ruleType: "RootNodes" },
          { ruleType: "ContentModifier", calculatedProperties: [{ label: "X", value: "1" }] },
          { ruleType: "InstanceLabelOverride" },
        ],
      },
    ];
    const config = await createIModelContentConfiguration({ imodelAccess: createIModelAccess({ rulesets }) });
    expect(config.imodelFieldsProviders).to.have.length(1);
    expect(config.descriptorTransformers).to.have.length(1);
  });

  it("produces one fields provider and one descriptor transformer per content modifier rule", async () => {
    const rulesets: Ruleset[] = [
      {
        ...supplemental,
        rules: [
          { ruleType: "ContentModifier", calculatedProperties: [{ label: "A", value: "1" }] },
          { ruleType: "ContentModifier", propertyOverrides: [{ name: "Prop", isReadOnly: true }] },
        ],
      },
      { ...supplemental, rules: [{ ruleType: "ContentModifier", propertyCategories: [{ id: "cat", label: "Cat" }] }] },
    ];
    const config = await createIModelContentConfiguration({ imodelAccess: createIModelAccess({ rulesets }) });
    expect(config.imodelFieldsProviders).to.have.length(3);
    expect(config.descriptorTransformers).to.have.length(3);
  });

  it("delegates to the factories, propagating rule priority onto the produced extensions", async () => {
    const rulesets: Ruleset[] = [
      {
        ...supplemental,
        rules: [{ ruleType: "ContentModifier", priority: 42, propertyOverrides: [{ name: "Prop", isReadOnly: true }] }],
      },
    ];
    const config = await createIModelContentConfiguration({ imodelAccess: createIModelAccess({ rulesets }) });
    expect(config.imodelFieldsProviders?.[0].priority).to.equal(42);
    expect(config.descriptorTransformers?.[0].priority).to.equal(42);
  });
});
