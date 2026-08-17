/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineIModelFieldsProvider } from "@itwin/presentation-content";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import {
  buildDescriptor,
  createContentIModelAccess,
  getCalculatedFieldByLabel,
  getCalculatedFields,
  getFieldCategory,
} from "./Utils.js";

describe("Content", () => {
  describe("Calculated properties", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("adds a calculated field declared by a provider", async () => {
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
        builder.insertInstance(s.items.A.fullName, { prop: "x" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const provider = defineIModelFieldsProvider({
        id: "calc-provider_v1",
        async getContribution() {
          return {
            calculatedFields: [
              {
                id: "calc1",
                label: "My Calculated",
                expression: `this.Prop || '!'`,
                type: { kind: "primitive", type: "String" },
              },
            ],
          };
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(getCalculatedFields(descriptor)).toHaveLength(1);
      const field = getCalculatedFieldByLabel(descriptor, "My Calculated");
      expect(field.id).toBe("calc-provider_v1:calc1");
      expect(field.expression).toContain("Prop");
      expect(field.type).toMatchObject({ kind: "primitive", type: "String" });
    });

    it("assigns a provider category to a calculated field", async () => {
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
        builder.insertInstance(s.items.A.fullName, { prop: "x" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const provider = defineIModelFieldsProvider({
        id: "calc-provider_v1",
        async getContribution() {
          return {
            categories: { myCat: { id: "myCat", label: "Calc Category" } },
            calculatedFields: [
              {
                id: "calc1",
                label: "My Calculated",
                expression: `this.Prop`,
                type: { kind: "primitive", type: "String" },
                categoryId: "myCat",
              },
            ],
          };
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { imodelFieldsProviders: [provider] },
      });

      const field = getCalculatedFieldByLabel(descriptor, "My Calculated");
      expect(field.categoryId).toBe("myCat");
      expect(getFieldCategory(descriptor, field)?.label).toBe("Calc Category");
    });

    it("declares a calculated field with a custom target alias, bindings, and a non-string type", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="FlowRate" typeName="double" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.A.fullName, { flowRate: 1.5 });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const provider = defineIModelFieldsProvider({
        id: "calc-provider_v1",
        async getContribution() {
          return {
            calculatedFields: [
              {
                id: "flow",
                label: "Flow (GPM)",
                expression: "e.FlowRate * :factor",
                targetAlias: "e",
                bindings: { factor: { type: "double", value: 15850.3 } },
                type: { kind: "primitive", type: "Double" },
              },
            ],
          };
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(getCalculatedFields(descriptor)).toHaveLength(1);
      const field = getCalculatedFieldByLabel(descriptor, "Flow (GPM)");
      expect(field.id).toBe("calc-provider_v1:flow");
      expect(field.targetAlias).toBe("e");
      expect(field.bindings).toEqual({ factor: { type: "double", value: 15850.3 } });
      expect(field.type).toMatchObject({ kind: "primitive", type: "Double" });
      expect(field.expression).toContain("FlowRate");
    });
  });
});
