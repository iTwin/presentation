/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createContentProvider,
  defineExternalFieldsProvider,
  resolveContentSources,
} from "@itwin/presentation-content";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import { buildDescriptor, createContentIModelAccess, getExternalFields, getFieldCategory } from "./Utils.js";

import type { ContentConfiguration, ContentTarget } from "@itwin/presentation-content";
import type { RelationshipPath } from "@itwin/presentation-shared";
import type { ContentIModelAccess } from "./Utils.js";

/** Builds a provider wired for the given targets/config (running both pipeline stages). */
async function createProvider(props: {
  imodelAccess: ContentIModelAccess;
  targets: ContentTarget[];
  config?: ContentConfiguration;
}) {
  const sources = await resolveContentSources(props);
  return createContentProvider({ imodelAccess: props.imodelAccess, sources, config: props.config });
}

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

  describe("Value population", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("populates an external field from a direct property input for every instance", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Code" typeName="string" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.A.fullName, { code: "A1" });
        builder.insertInstance(s.items.A.fullName, { code: "A2" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const extProvider = defineExternalFieldsProvider({
        id: "ext_v1",
        fields: [{ id: "status", label: "Status", type: { kind: "primitive", type: "String" } }],
        inputs: { code: { propertyClassName: setup.schema.items.A.fullName, propertyName: "Code" } },
        async getValues({ items: batch }: { items: Array<{ inputValues: { code: string } }> }) {
          return batch.map((entry) => ({ status: `${entry.inputValues.code}!` }));
        },
      });
      const provider = await createProvider({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { externalFieldsProviders: [extProvider] },
      });
      const descriptor = await provider.getContentDescriptor();
      const [statusField] = getExternalFields(descriptor);

      const items = await collect(provider.getItems());
      expect(items.map((item) => item.getValue(statusField))).toEqual(expect.arrayContaining(["A1!", "A2!"]));
    });

    it("populates an external field whose input is a related property", async () => {
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
              <Target multiplicity="(0..1)" roleLabel="b to a" polymorphic="true">
                <Class class="B" />
              </Target>
            </ECRelationshipClass>
          `,
        );
        const a = builder.insertInstance(s.items.A.fullName, { propA: "a1" });
        const b = builder.insertInstance(s.items.B.fullName, { propB: "b1" });
        builder.insertRelationship(s.items.AtoB.fullName, a.id, b.id);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const path: RelationshipPath = [
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.B.fullName,
          relationshipName: setup.schema.items.AtoB.fullName,
        },
      ];
      const extProvider = defineExternalFieldsProvider({
        id: "ext_v1",
        fields: [{ id: "combined", label: "Combined", type: { kind: "primitive", type: "String" } }],
        inputs: {
          propA: { propertyClassName: setup.schema.items.A.fullName, propertyName: "PropA" },
          propB: { propertyClassName: setup.schema.items.B.fullName, propertyName: "PropB", path },
        },
        async getValues({ items: batch }: { items: Array<{ inputValues: { propA: string; propB: string } }> }) {
          return batch.map((entry) => ({ combined: `${entry.inputValues.propA}+${entry.inputValues.propB}` }));
        },
      });
      const provider = await createProvider({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { externalFieldsProviders: [extProvider] },
      });
      const descriptor = await provider.getContentDescriptor();
      const [combinedField] = getExternalFields(descriptor);

      const [item] = await collect(provider.getItems());
      expect(item.getValue(combinedField)).toBe("a1+b1");
    });
  });
});
