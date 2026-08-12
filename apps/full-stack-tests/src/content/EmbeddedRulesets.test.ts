/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createIModelContentConfiguration } from "@itwin/presentation-content";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import {
  buildDescriptor,
  createContentIModelAccess,
  getCalculatedFields,
  getPropertyFieldByName,
  getRelatedPropertyFields,
} from "./Utils.js";

import type { ECDbBuilder } from "../ECDbUtils.js";

/**
 * Imports the `PresentationRules`-named schema holding the `Ruleset` class that
 * `createIModelContentConfiguration` reads embedded configuration from, and inserts a ruleset row.
 * The reader expects `JsonProperties` to hold `JSON.stringify({ jsonProperties: <ruleset> })`.
 */
async function insertEmbeddedRuleset(builder: ECDbBuilder, ruleset: object) {
  await importSchema(
    { schemaName: "PresentationRules", schemaAlias: "pr", schemaVersion: "1.0.0" },
    builder,
    `
      <ECEntityClass typeName="Ruleset">
        <ECProperty propertyName="JsonProperties" typeName="string" />
      </ECEntityClass>
    `,
  );
  builder.insertInstance("PresentationRules.Ruleset", { jsonProperties: JSON.stringify({ jsonProperties: ruleset }) });
}

describe("Content", () => {
  describe("Embedded rulesets", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("applies calculated property rules", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Prop" typeName="string" />
            </ECEntityClass>
          `,
        );
        await insertEmbeddedRuleset(builder, {
          id: "test",
          supplementationInfo: { supplementationPurpose: "test" },
          rules: [
            {
              ruleType: "ContentModifier",
              class: { schemaName: s.schemaName, className: "A" },
              calculatedProperties: [{ label: "EmbeddedCalc", value: `this.Prop` }],
            },
          ],
        });
        builder.insertInstance(s.items.A.fullName, { prop: "x" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const config = await createIModelContentConfiguration({ imodelAccess });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config,
      });

      const calc = getCalculatedFields(descriptor).find((f) => f.label === "EmbeddedCalc");
      expect(calc).toBeDefined();
    });

    it("applies property override rules", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Prop" typeName="string" />
            </ECEntityClass>
          `,
        );
        await insertEmbeddedRuleset(builder, {
          id: "test",
          supplementationInfo: { supplementationPurpose: "test" },
          rules: [
            {
              ruleType: "ContentModifier",
              class: { schemaName: s.schemaName, className: "A" },
              propertyOverrides: [{ name: "Prop", labelOverride: "Overridden Label" }],
            },
          ],
        });
        builder.insertInstance(s.items.A.fullName, { prop: "x" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const config = await createIModelContentConfiguration({ imodelAccess });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config,
      });

      expect(getPropertyFieldByName(descriptor, "Prop").label).toBe("Overridden Label");
    });

    it("applies related properties rules", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <ECProperty propertyName="PropB" typeName="string" />
            </ECEntityClass>
            <ECRelationshipClass typeName="AtoB" strength="referencing" modifier="None">
              <Source multiplicity="(0..*)" roleLabel="a to b" polymorphic="true">
                <Class class="A" />
              </Source>
              <Target multiplicity="(0..*)" roleLabel="b to a" polymorphic="true">
                <Class class="B" />
              </Target>
            </ECRelationshipClass>
          `,
        );
        await insertEmbeddedRuleset(builder, {
          id: "test",
          supplementationInfo: { supplementationPurpose: "test" },
          rules: [
            {
              ruleType: "ContentModifier",
              class: { schemaName: s.schemaName, className: "A" },
              relatedProperties: [
                {
                  propertiesSource: [
                    { relationship: { schemaName: s.schemaName, className: "AtoB" }, direction: "Forward" },
                  ],
                },
              ],
            },
          ],
        });
        const a = builder.insertInstance(s.items.A.fullName, { propA: "a" });
        const b = builder.insertInstance(s.items.B.fullName, { propB: "b" });
        builder.insertRelationship(s.items.AtoB.fullName, a.id, b.id);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const config = await createIModelContentConfiguration({ imodelAccess });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config,
      });

      const propB = getRelatedPropertyFields(descriptor).find((f) => f.propertyName === "PropB");
      expect(propB).toBeDefined();
      expect(propB!.pathFromTarget).toHaveLength(1);
    });

    it("applies a nested-content override when applyOnNestedContent is set", async () => {
      using setup = await buildTestECDb(async (builder) => {
        const s = await importSchema(
          { schemaName: "TestDomain", schemaAlias: "td", schemaVersion: "1.2.3" },
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <ECProperty propertyName="PropB" typeName="string" />
            </ECEntityClass>
            <ECRelationshipClass typeName="AtoB" strength="referencing" modifier="None">
              <Source multiplicity="(0..*)" roleLabel="a to b" polymorphic="true">
                <Class class="A" />
              </Source>
              <Target multiplicity="(0..*)" roleLabel="b to a" polymorphic="true">
                <Class class="B" />
              </Target>
            </ECRelationshipClass>
          `,
        );
        await insertEmbeddedRuleset(builder, {
          id: "test",
          supplementationInfo: { supplementationPurpose: "test" },
          rules: [
            {
              ruleType: "ContentModifier",
              class: { schemaName: "TestDomain", className: "A" },
              relatedProperties: [
                {
                  propertiesSource: [
                    { relationship: { schemaName: "TestDomain", className: "AtoB" }, direction: "Forward" },
                  ],
                },
              ],
            },
            {
              ruleType: "ContentModifier",
              class: { schemaName: "TestDomain", className: "B" },
              applyOnNestedContent: true,
              propertyOverrides: [{ name: "PropB", labelOverride: "Nested Override" }],
            },
          ],
        });
        const a = builder.insertInstance(s.items.A.fullName, { propA: "a" });
        const b = builder.insertInstance(s.items.B.fullName, { propB: "b" });
        builder.insertRelationship(s.items.AtoB.fullName, a.id, b.id);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const config = await createIModelContentConfiguration({ imodelAccess });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config,
      });

      const propB = getRelatedPropertyFields(descriptor).find((f) => f.propertyName === "PropB");
      expect(propB).toBeDefined();
      expect(propB!.label).toBe("Nested Override");
    });

    it("ignores a non-supplemental ruleset", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Prop" typeName="string" />
            </ECEntityClass>
          `,
        );
        await insertEmbeddedRuleset(builder, {
          id: "test",
          // No supplementationInfo → not supplemental → ignored.
          rules: [
            {
              ruleType: "ContentModifier",
              class: { schemaName: s.schemaName, className: "A" },
              calculatedProperties: [{ label: "EmbeddedCalc", value: `this.Prop` }],
            },
          ],
        });
        builder.insertInstance(s.items.A.fullName, { prop: "x" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const config = await createIModelContentConfiguration({ imodelAccess });
      expect(config.imodelFieldsProviders ?? []).toHaveLength(0);

      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config,
      });
      expect(getCalculatedFields(descriptor)).toHaveLength(0);
    });
  });
});
