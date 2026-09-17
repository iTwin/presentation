/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createContentProvider,
  defineDescriptorTransformer,
  defineExternalFieldsProvider,
  defineIModelFieldsProvider,
  resolveContentSources,
} from "@itwin/presentation-content";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import {
  buildDescriptor,
  createContentIModelAccess,
  getExternalFields,
  getFieldById,
  getFieldCategory,
  getPropertyFieldByName,
} from "./Utils.js";

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

    it.each([false, true])(
      "populates a many-valued related input with conflicting property fields: %s",
      async (includePropertyFields) => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="C">
              <ECProperty propertyName="PropC" typeName="string" />
            </ECEntityClass>
            <ECRelationshipClass typeName="AtoC" strength="referencing" modifier="None">
              <Source multiplicity="(0..*)" roleLabel="a to c" polymorphic="true">
                <Class class="A" />
              </Source>
              <Target multiplicity="(0..*)" roleLabel="c to a" polymorphic="true">
                <Class class="C" />
              </Target>
            </ECRelationshipClass>
          `,
          );
          const related = builder.insertInstance(s.items.A.fullName, { propA: "related" });
          const unrelated = builder.insertInstance(s.items.A.fullName, { propA: "unrelated" });
          const c1 = builder.insertInstance(s.items.C.fullName, { propC: "first" });
          const c2 = builder.insertInstance(s.items.C.fullName, { propC: "second" });
          builder.insertRelationship(s.items.AtoC.fullName, related.id, c1.id);
          builder.insertRelationship(s.items.AtoC.fullName, related.id, c2.id);
          return { schema: s, related, unrelated, c1, c2 };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const path: RelationshipPath = [
          {
            sourceClassName: setup.schema.items.A.fullName,
            targetClassName: setup.schema.items.C.fullName,
            relationshipName: setup.schema.items.AtoC.fullName,
          },
        ];
        const getValues = vi.fn(async ({ items: batch }: { items: Array<{ inputValues: { names: string[] } }> }) =>
          batch.map((entry) => ({ joined: [...entry.inputValues.names].sort().join(",") })),
        );
        const extProvider = defineExternalFieldsProvider({
          id: "ext_v1",
          fields: [{ id: "joined", label: "Joined", type: { kind: "primitive", type: "String" } }],
          inputs: {
            names: {
              propertyClassName: setup.schema.items.C.fullName,
              propertyName: "PropC",
              path,
              cardinalityHint: "many",
            },
          },
          getValues,
        });
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
          config: {
            externalFieldsProviders: [extProvider],
            imodelFieldsProviders: includePropertyFields
              ? [
                  defineIModelFieldsProvider({
                    id: "related_v1",
                    async getContribution() {
                      return { relatedProperties: [{ path, cardinalityHint: "one" }] };
                    },
                  }),
                ]
              : [],
          },
        });
        const descriptor = await provider.getContentDescriptor();
        const [joinedField] = getExternalFields(descriptor);

        const items = await collect(provider.getItems());
        const [{ items: batchItems }] = getValues.mock.calls[0];
        const relatedIndex = items.findIndex((item) => item.primaryKey.id === setup.related.id);
        const unrelatedIndex = items.findIndex((item) => item.primaryKey.id === setup.unrelated.id);
        expect(batchItems[relatedIndex].inputValues.names).toHaveLength(2);
        expect(batchItems[unrelatedIndex].inputValues.names).toEqual([]);
        expect(items[relatedIndex].getValue(joinedField)).toBe("first,second");
        expect(items[unrelatedIndex].getValue(joinedField)).toBe("");
        if (includePropertyFields) {
          const relatedField = getPropertyFieldByName(descriptor, "PropC");
          expect(relatedField.pathCardinality).toBe("many");
          expect(items[relatedIndex].getValue(relatedField)).toEqual(expect.arrayContaining(["first", "second"]));
          expect(items[unrelatedIndex].getValue(relatedField)).toEqual([]);
          const relatedInstances = items[relatedIndex].getRelatedInstances(relatedField);
          expect(relatedInstances).toHaveLength(2);
          expect(relatedInstances.map((entry) => [entry.key, entry.getValue(relatedField)])).toEqual(
            expect.arrayContaining([
              [setup.c1, "first"],
              [setup.c2, "second"],
            ]),
          );
          expect(items[unrelatedIndex].getRelatedInstances(relatedField)).toEqual([]);
          expect(getPropertyFieldByName(descriptor, "PropA").pathCardinality).toBe("one");
        }
      },
    );

    it("leaves an unhinted scalar related input undefined for a primary with no related instance", async () => {
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
        const related = builder.insertInstance(s.items.A.fullName, { propA: "related" });
        const b = builder.insertInstance(s.items.B.fullName, { propB: "b-value" });
        builder.insertRelationship(s.items.AtoB.fullName, related.id, b.id);
        const unrelated = builder.insertInstance(s.items.A.fullName, { propA: "unrelated" });
        return { schema: s, related, unrelated };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const path: RelationshipPath = [
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.B.fullName,
          relationshipName: setup.schema.items.AtoB.fullName,
        },
      ];
      const getValues = vi.fn(
        async ({ items: batch }: { items: Array<{ inputValues: { propB: string | undefined } }> }) =>
          batch.map((entry) => ({ echoed: entry.inputValues.propB ?? "<none>" })),
      );
      const extProvider = defineExternalFieldsProvider({
        id: "ext_v1",
        fields: [{ id: "echoed", label: "Echoed", type: { kind: "primitive", type: "String" } }],
        // No `cardinalityHint` — the path is 1:1, so the value stays a scalar `Value`, not `Value[]`.
        inputs: { propB: { propertyClassName: setup.schema.items.B.fullName, propertyName: "PropB", path } },
        getValues,
      });
      const provider = await createProvider({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { externalFieldsProviders: [extProvider] },
      });
      const descriptor = await provider.getContentDescriptor();
      const [echoedField] = getExternalFields(descriptor);

      const items = await collect(provider.getItems());
      const [{ items: batchItems }] = getValues.mock.calls[0];
      const relatedIndex = items.findIndex((item) => item.primaryKey.id === setup.related.id);
      const unrelatedIndex = items.findIndex((item) => item.primaryKey.id === setup.unrelated.id);
      expect(batchItems[relatedIndex].inputValues.propB).toBe("b-value");
      expect(batchItems[unrelatedIndex].inputValues.propB).toBeUndefined();
      expect(items[relatedIndex].getValue(echoedField)).toBe("b-value");
      expect(items[unrelatedIndex].getValue(echoedField)).toBe("<none>");
    });

    it("throws when a provider returns a different number of value records than items", async () => {
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
        builder.insertInstance(s.items.A.fullName, { prop: "a1" });
        builder.insertInstance(s.items.A.fullName, { prop: "a2" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const extProvider = defineExternalFieldsProvider({
        id: "ext_v1",
        fields: [{ id: "status", label: "Status", type: { kind: "primitive", type: "String" } }],
        async getValues({ items: batch }) {
          // Wrong on purpose: returns one fewer record than the batch it was given.
          return batch.slice(1).map(() => ({ status: "x" }));
        },
      });
      const provider = await createProvider({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { externalFieldsProviders: [extProvider] },
      });

      await expect(collect(provider.getItems())).rejects.toThrow(
        'External fields provider "ext_v1" returned 1 value records for a batch of 2 items.',
      );
    });

    it("still calls the provider and populates the remaining field when a transformer removes only one of its fields", async () => {
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
      const getValues = vi.fn(async ({ items: batch }: { items: Array<{ inputValues: Record<string, never> }> }) =>
        batch.map(() => ({ kept: "kept-value", removed: "removed-value" })),
      );
      const extProvider = defineExternalFieldsProvider({
        id: "ext_v1",
        fields: [
          { id: "kept", label: "Kept", type: { kind: "primitive", type: "String" } },
          { id: "removed", label: "Removed", type: { kind: "primitive", type: "String" } },
        ],
        getValues,
      });
      const transformer = defineDescriptorTransformer({
        async transform({ descriptor: view }) {
          view.removeField("ext_v1:removed");
        },
      });
      const provider = await createProvider({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { externalFieldsProviders: [extProvider], descriptorTransformers: [transformer] },
      });
      const descriptor = await provider.getContentDescriptor();
      const external = getExternalFields(descriptor);
      expect(external.map((field) => field.label)).toEqual(["Kept"]);
      expect(getFieldById(descriptor, "ext_v1:removed")).toBeUndefined();

      const [item] = await collect(provider.getItems());
      expect(getValues).toHaveBeenCalledTimes(1);
      expect(item.getValue(external[0])).toBe("kept-value");
      expect(item.values["ext_v1:removed"]).toBeUndefined();
    });

    it("never calls the provider when a transformer removes all of its fields", async () => {
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
      const getValues = vi.fn(async ({ items: batch }: { items: Array<{ inputValues: Record<string, never> }> }) =>
        batch.map(() => ({ onlyField: "value" })),
      );
      const extProvider = defineExternalFieldsProvider({
        id: "ext_v1",
        fields: [{ id: "onlyField", label: "Only Field", type: { kind: "primitive", type: "String" } }],
        getValues,
      });
      const transformer = defineDescriptorTransformer({
        async transform({ descriptor: view }) {
          view.removeField("ext_v1:onlyField");
        },
      });
      const provider = await createProvider({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { externalFieldsProviders: [extProvider], descriptorTransformers: [transformer] },
      });
      const descriptor = await provider.getContentDescriptor();
      expect(getExternalFields(descriptor)).toEqual([]);

      const items = await collect(provider.getItems());
      expect(items).toHaveLength(1);
      expect(getValues).not.toHaveBeenCalled();
    });
  });
});
