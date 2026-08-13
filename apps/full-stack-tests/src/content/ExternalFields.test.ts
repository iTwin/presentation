/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineExternalFieldsProvider } from "@itwin/presentation-content";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import { buildDescriptor, createContentIModelAccess, getExternalFields, getFieldCategory } from "./Utils.js";

describe("Content", () => {
  describe("External fields", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("adds an external field declared by a provider to the descriptor", async () => {
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
      const provider = defineExternalFieldsProvider({
        id: "ext_v1",
        fields: [{ id: "ext1", label: "External Field", type: { kind: "primitive", type: "String" } }],
        async getValues() {
          return [];
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { externalFieldsProviders: [provider] },
      });

      const external = getExternalFields(descriptor);
      expect(external).toHaveLength(1);
      expect(external[0].label).toBe("External Field");
      expect(external[0].providerId).toBe("ext_v1");
    });

    it("assigns a provider category to an external field", async () => {
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
      const provider = defineExternalFieldsProvider({
        id: "ext_v1",
        categories: { extCat: { id: "extCat", label: "External Category" } },
        fields: [
          { id: "ext1", label: "External Field", type: { kind: "primitive", type: "String" }, categoryId: "extCat" },
        ],
        async getValues() {
          return [];
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { externalFieldsProviders: [provider] },
      });

      const external = getExternalFields(descriptor);
      expect(external).toHaveLength(1);
      expect(external[0].categoryId).toBe("extCat");
      expect(getFieldCategory(descriptor, external[0])?.label).toBe("External Category");
    });
  });
});
