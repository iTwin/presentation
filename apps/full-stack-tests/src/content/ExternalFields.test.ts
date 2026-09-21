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
  getPropertyFieldsByName,
} from "./Utils.js";

import type { ContentConfiguration, ContentTarget } from "@itwin/presentation-content";
import type { InstanceKey, RelationshipPath, Value } from "@itwin/presentation-shared";
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
      "populates a many-valued related input with matching property fields: %s",
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
                      return { relatedProperties: [{ path, cardinalityHint: "many" }] };
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

    describe("Polymorphic external inputs", () => {
      let setup: Awaited<ReturnType<typeof createSetup>>;

      beforeAll(async () => {
        setup = await createSetup();
        return () => setup[Symbol.dispose]();
      });

      async function createSetup() {
        return buildTestECDb("Content Value population Polymorphic external inputs", async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="A">
                <ECCustomAttributes>
                  <ClassMap xmlns="ECDbMap.02.00.01"><MapStrategy>TablePerHierarchy</MapStrategy></ClassMap>
                </ECCustomAttributes>
                <ECProperty propertyName="Code" typeName="string" />
              </ECEntityClass>
              <ECEntityClass typeName="A1">
                <BaseClass>A</BaseClass>
              </ECEntityClass>
              <ECEntityClass typeName="B" modifier="Abstract">
                <ECCustomAttributes>
                  <ClassMap xmlns="ECDbMap.02.00.01"><MapStrategy>TablePerHierarchy</MapStrategy></ClassMap>
                </ECCustomAttributes>
                <ECProperty propertyName="Name" typeName="string" />
                <ECArrayProperty propertyName="Tags" typeName="string" />
              </ECEntityClass>
              <ECEntityClass typeName="B1">
                <BaseClass>B</BaseClass>
              </ECEntityClass>
              <ECEntityClass typeName="B2">
                <BaseClass>B</BaseClass>
              </ECEntityClass>
              <ECRelationshipClass typeName="Rel" strength="referencing" modifier="Abstract">
                <ECCustomAttributes>
                  <ClassMap xmlns="ECDbMap.02.00.01"><MapStrategy>TablePerHierarchy</MapStrategy></ClassMap>
                </ECCustomAttributes>
                <ECProperty propertyName="Mark" typeName="string" />
                <Source multiplicity="(0..*)" roleLabel="a" polymorphic="true"><Class class="A" /></Source>
                <Target multiplicity="(0..*)" roleLabel="b" polymorphic="true"><Class class="B" /></Target>
              </ECRelationshipClass>
              <ECRelationshipClass typeName="Rel1" strength="referencing" modifier="None">
                <BaseClass>Rel</BaseClass>
                <Source multiplicity="(0..*)" roleLabel="a" polymorphic="true"><Class class="A" /></Source>
                <Target multiplicity="(0..*)" roleLabel="b" polymorphic="true"><Class class="B" /></Target>
              </ECRelationshipClass>
              <ECRelationshipClass typeName="Rel2" strength="referencing" modifier="None">
                <BaseClass>Rel</BaseClass>
                <Source multiplicity="(0..*)" roleLabel="a" polymorphic="true"><Class class="A" /></Source>
                <Target multiplicity="(0..*)" roleLabel="b" polymorphic="true"><Class class="B" /></Target>
              </ECRelationshipClass>
            `,
          );
          const first = builder.insertInstance(s.items.A1.fullName, { code: "first" });
          const second = builder.insertInstance(s.items.A1.fullName, { code: "second" });
          const multiple = builder.insertInstance(s.items.A1.fullName, { code: "multiple" });
          const multipleSameVariant = builder.insertInstance(s.items.A1.fullName, { code: "multiple-same-variant" });
          const missingValue = builder.insertInstance(s.items.A1.fullName, { code: "null" });
          const empty = builder.insertInstance(s.items.A1.fullName, { code: "empty" });
          const b1 = builder.insertInstance(s.items.B1.fullName, { name: "first", tags: ["x", "y"] });
          const b2 = builder.insertInstance(s.items.B2.fullName, { name: "second", tags: ["z"] });
          const nullValue = builder.insertInstance(s.items.B1.fullName, { name: undefined });
          builder.insertRelationship(s.items.Rel1.fullName, first.id, b1.id, { mark: "r-first-b1" });
          builder.insertRelationship(s.items.Rel2.fullName, second.id, b2.id, { mark: "r-second-b2" });
          builder.insertRelationship(s.items.Rel1.fullName, multiple.id, b1.id, { mark: "r-multiple-b1" });
          builder.insertRelationship(s.items.Rel2.fullName, multiple.id, b2.id, { mark: "r-multiple-b2" });
          builder.insertRelationship(s.items.Rel1.fullName, multipleSameVariant.id, b1.id, {
            mark: "r-multipleSameVariant-b1",
          });
          builder.insertRelationship(s.items.Rel1.fullName, multipleSameVariant.id, nullValue.id, {
            mark: "r-multipleSameVariant-nullValue",
          });
          builder.insertRelationship(s.items.Rel1.fullName, missingValue.id, nullValue.id, {});
          const pathAB: RelationshipPath = [
            {
              sourceClassName: s.items.A.fullName,
              relationshipName: s.items.Rel.fullName,
              targetClassName: s.items.B.fullName,
            },
          ];
          return {
            schema: s,
            pathAB,
            first,
            second,
            multiple,
            multipleSameVariant,
            missingValue,
            empty,
            b1,
            b2,
            nullValue,
          };
        });
      }

      async function createTestProvider(props: {
        cardinalityHint?: "one" | "many";
        /**
         * Disjoint instance sets for the base-class target A and derived-class target A1, respectively.
         * All fixtures are A1 instances, so explicit IDs prevent the targets from overlapping while
         * testing how the declared A-based input path resolves for each source class.
         * Empty sets omit that target, allowing tests to isolate one source-root path.
         * Sorting by Code below also exercises globally sorted loading across both sources.
         */
        sourceInstances: [InstanceKey[], InstanceKey[]];
        imodelFieldsProviders?: ContentConfiguration["imodelFieldsProviders"];
      }) {
        const { cardinalityHint, sourceInstances, imodelFieldsProviders } = props;
        const { pathAB } = setup;
        const getValues = vi.fn(
          async ({
            items: batch,
          }: {
            items: Array<{ inputValues: { code: Value; name: Value; tags: Value; mark: Value; filteredName: Value } }>;
          }) => batch.map((item) => ({ echoed: JSON.stringify(item.inputValues) })),
        );
        const extProvider = defineExternalFieldsProvider({
          id: "poly_v1",
          fields: [{ id: "echoed", label: "Echoed", type: { kind: "primitive", type: "String" } }],
          inputs: {
            code: { propertyClassName: setup.schema.items.A.fullName, propertyName: "Code" },
            name: {
              propertyClassName: setup.schema.items.B.fullName,
              propertyName: "Name",
              path: pathAB,
              cardinalityHint,
            },
            tags: {
              propertyClassName: setup.schema.items.B.fullName,
              propertyName: "Tags",
              path: pathAB,
              cardinalityHint,
            },
            mark: {
              propertyClassName: setup.schema.items.Rel.fullName,
              propertyName: "Mark",
              path: pathAB,
              cardinalityHint,
            },
            filteredName: {
              propertyClassName: setup.schema.items.B.fullName,
              propertyName: "Name",
              path: [
                {
                  ...pathAB[0],
                  instanceFilter: {
                    expression: "this.Name = :name",
                    bindings: { name: { type: "string", value: "first" } },
                  },
                },
              ],
              cardinalityHint: "one",
            },
          },
          getValues,
        });
        const provider = await createProvider({
          imodelAccess: createContentIModelAccess(setup.ecdb),
          targets: [
            {
              primaryClass: setup.schema.items.A.fullName,
              instanceIds: sourceInstances[0].map((instance) => instance.id),
            },
            {
              primaryClass: setup.schema.items.A1.fullName,
              instanceIds: sourceInstances[1].map((instance) => instance.id),
            },
          ].filter((target) => target.instanceIds.length > 0),
          config: { externalFieldsProviders: [extProvider], imodelFieldsProviders },
        });
        const descriptor = await provider.getContentDescriptor();
        return {
          descriptor,
          getValues,
          getItems: async (
            sorting: NonNullable<Parameters<typeof provider.getItems>[0]>["sorting"] = [
              { field: getPropertyFieldByName(descriptor, "Code"), direction: "asc" },
            ],
          ) => collect(provider.getItems({ sorting })),
          getInputs: () => getValues.mock.calls.flatMap(([batch]) => batch.items.map((item) => item.inputValues)),
        };
      }

      it("returns scalar inputs for a one hint across concrete variants", async () => {
        const { descriptor, getItems, getInputs } = await createTestProvider({
          cardinalityHint: "one",
          // Each source supplies a different concrete path, but each primary reaches at most one instance.
          sourceInstances: [[setup.first], [setup.second]],
        });

        const items = await getItems();
        const inputs = getInputs();

        expect(items).toHaveLength(2);
        expect(inputs).toEqual([
          { code: "first", name: "first", tags: ["x", "y"], mark: "r-first-b1", filteredName: "first" },
          { code: "second", name: "second", tags: ["z"], mark: "r-second-b2", filteredName: undefined },
        ]);
        const [echoedField] = getExternalFields(descriptor);
        expect(items.map((item) => item.getValue(echoedField))).toEqual(inputs.map((input) => JSON.stringify(input)));
      });

      it("combines many-valued inputs with matching property field hints", async () => {
        const { descriptor, getItems, getInputs } = await createTestProvider({
          cardinalityHint: "many",
          sourceInstances: [[setup.multiple], []],
          imodelFieldsProviders: [
            defineIModelFieldsProvider({
              id: "related_v1",
              async getContribution() {
                return { relatedProperties: [{ path: setup.pathAB, cardinalityHint: "many" }] };
              },
            }),
          ],
        });

        const items = await getItems();
        const inputs = getInputs();

        expect(items).toHaveLength(1);
        expect(inputs).toEqual([
          {
            code: "multiple",
            name: expect.arrayContaining(["first", "second"]),
            tags: expect.arrayContaining([["x", "y"], ["z"]]),
            mark: expect.arrayContaining(["r-multiple-b1", "r-multiple-b2"]),
            filteredName: "first",
          },
        ]);
        const relatedFields = Object.values(descriptor.fields).filter(
          (field) => field.kind === "property" && field.pathFromTarget.length > 0,
        );
        expect(relatedFields.length).toBeGreaterThan(0);
        for (const field of relatedFields) {
          expect(field.kind === "property" && field.pathCardinality).toBe("many");
        }
        const [echoedField] = getExternalFields(descriptor);
        expect(items.map((item) => item.getValue(echoedField))).toEqual(inputs.map((input) => JSON.stringify(input)));
      });

      it("keeps one-valued property fields alongside many-valued external inputs for zero or one related instance", async () => {
        const { descriptor, getItems, getInputs } = await createTestProvider({
          cardinalityHint: "many",
          // Use one source-root path to distinguish an absent relationship from a related B1
          // whose scalar and EC array properties are null.
          sourceInstances: [[setup.first, setup.missingValue, setup.empty], []],
          imodelFieldsProviders: [
            defineIModelFieldsProvider({
              id: "related_v1",
              async getContribution() {
                return { relatedProperties: [{ path: setup.pathAB, cardinalityHint: "one" }] };
              },
            }),
          ],
        });
        const nameField = getPropertyFieldByName(descriptor, "Name");
        const tagsField = getPropertyFieldByName(descriptor, "Tags");
        expect(nameField.pathCardinality).toBe("one");
        expect(tagsField.pathCardinality).toBe("one");
        expect(nameField.type.kind).toBe("primitive");
        expect(tagsField.type.kind).toBe("array");

        const items = await getItems();
        expect(items.map((item) => item.primaryKey)).toEqual([setup.empty, setup.first, setup.missingValue]);
        expect(getInputs()).toEqual([
          { code: "empty", name: [], tags: [], mark: [], filteredName: undefined },
          { code: "first", name: ["first"], tags: [["x", "y"]], mark: ["r-first-b1"], filteredName: "first" },
          { code: "null", name: [undefined], tags: [undefined], mark: [undefined], filteredName: undefined },
        ]);
        expect(items.map((item) => item.getValue(nameField))).toEqual([undefined, "first", undefined]);
        expect(items.map((item) => item.getValue(tagsField))).toEqual([undefined, ["x", "y"], undefined]);
        expect(
          items.map((item) =>
            item.getRelatedInstances(nameField).map((entry) => [entry.key, entry.getValue(nameField)]),
          ),
        ).toEqual([[], [[setup.b1, "first"]], [[setup.nullValue, undefined]]]);
        expect(
          items.map((item) =>
            item.getRelatedInstances(tagsField).map((entry) => [entry.key, entry.getValue(tagsField)]),
          ),
        ).toEqual([[], [[setup.b1, ["x", "y"]]], [[setup.nullValue, undefined]]]);
        const [echoedField] = getExternalFields(descriptor);
        expect(items.map((item) => item.getValue(echoedField))).toEqual(
          getInputs().map((input) => JSON.stringify(input)),
        );
      });

      it("sorts by a one-valued property field while shared external inputs load many", async () => {
        const { descriptor, getItems, getInputs } = await createTestProvider({
          cardinalityHint: "many",
          // The primary with no relationship must remain in the sorted results.
          sourceInstances: [[setup.empty, setup.first], []],
          imodelFieldsProviders: [
            defineIModelFieldsProvider({
              id: "related_v1",
              async getContribution() {
                return { relatedProperties: [{ path: setup.pathAB, cardinalityHint: "one" }] };
              },
            }),
          ],
        });
        const nameField = getPropertyFieldByName(descriptor, "Name");
        expect(nameField.pathCardinality).toBe("one");

        const items = await getItems([{ field: nameField, direction: "desc" }]);

        expect(items.map((item) => item.primaryKey)).toEqual([setup.first, setup.empty]);
        expect(items.map((item) => item.getValue(nameField))).toEqual(["first", undefined]);
        expect(getInputs().map((input) => input.name)).toEqual([["first"], []]);
      });

      it("keeps one-valued external inputs alongside many-valued property fields for zero or one related instance", async () => {
        const { descriptor, getItems, getInputs } = await createTestProvider({
          cardinalityHint: "one",
          // One source supplies a populated B1, a null-valued B1, and an absent B1.
          sourceInstances: [[setup.first, setup.missingValue, setup.empty], []],
          imodelFieldsProviders: [
            defineIModelFieldsProvider({
              id: "related_v1",
              async getContribution() {
                return { relatedProperties: [{ path: setup.pathAB, cardinalityHint: "many" }] };
              },
            }),
          ],
        });
        const nameField = getPropertyFieldByName(descriptor, "Name");
        const tagsField = getPropertyFieldByName(descriptor, "Tags");
        expect(nameField.pathCardinality).toBe("many");
        expect(tagsField.pathCardinality).toBe("many");
        expect(nameField.type.kind).toBe("primitive");
        expect(tagsField.type.kind).toBe("array");

        const items = await getItems();
        expect(items.map((item) => item.primaryKey)).toEqual([setup.empty, setup.first, setup.missingValue]);
        expect(getInputs()).toEqual([
          { code: "empty", name: undefined, tags: undefined, mark: undefined, filteredName: undefined },
          { code: "first", name: "first", tags: ["x", "y"], mark: "r-first-b1", filteredName: "first" },
          { code: "null", name: undefined, tags: undefined, mark: undefined, filteredName: undefined },
        ]);
        expect(items.map((item) => item.getValue(nameField))).toEqual([[], ["first"], [undefined]]);
        expect(items.map((item) => item.getValue(tagsField))).toEqual([[], [["x", "y"]], [undefined]]);
        expect(
          items.map((item) =>
            item.getRelatedInstances(nameField).map((entry) => [entry.key, entry.getValue(nameField)]),
          ),
        ).toEqual([[], [[setup.b1, "first"]], [[setup.nullValue, undefined]]]);
        expect(
          items.map((item) =>
            item.getRelatedInstances(tagsField).map((entry) => [entry.key, entry.getValue(tagsField)]),
          ),
        ).toEqual([[], [[setup.b1, ["x", "y"]]], [[setup.nullValue, undefined]]]);
        const [echoedField] = getExternalFields(descriptor);
        expect(items.map((item) => item.getValue(echoedField))).toEqual(
          getInputs().map((input) => JSON.stringify(input)),
        );
      });

      it("keeps distinct property selections from two iModel providers in their own cardinality shapes", async () => {
        const { descriptor, getItems, getInputs } = await createTestProvider({
          cardinalityHint: "many",
          // The two providers select different properties on the same B1 path from one source.
          sourceInstances: [[setup.first], []],
          imodelFieldsProviders: [
            defineIModelFieldsProvider({
              id: "name_v1",
              async getContribution() {
                return {
                  relatedProperties: [
                    {
                      path: setup.pathAB,
                      cardinalityHint: "one",
                      properties: [{ stepIndex: 0, target: { select: { include: ["Name"] } } }],
                    },
                  ],
                };
              },
            }),
            defineIModelFieldsProvider({
              id: "tags_v1",
              async getContribution() {
                return {
                  relatedProperties: [
                    {
                      path: setup.pathAB,
                      cardinalityHint: "many",
                      properties: [{ stepIndex: 0, target: { select: { include: ["Tags"] } } }],
                    },
                  ],
                };
              },
            }),
          ],
        });
        const nameField = getPropertyFieldByName(descriptor, "Name");
        const tagsField = getPropertyFieldByName(descriptor, "Tags");
        expect(nameField.pathCardinality).toBe("one");
        expect(tagsField.pathCardinality).toBe("many");
        expect(nameField.type.kind).toBe("primitive");
        expect(tagsField.type.kind).toBe("array");

        const [item] = await getItems();
        expect(item.primaryKey).toEqual(setup.first);
        expect(item.getValue(nameField)).toBe("first");
        expect(item.getValue(tagsField)).toEqual([["x", "y"]]);
        expect(item.getRelatedInstances(nameField).map((entry) => [entry.key, entry.getValue(nameField)])).toEqual([
          [setup.b1, "first"],
        ]);
        expect(item.getRelatedInstances(tagsField).map((entry) => [entry.key, entry.getValue(tagsField)])).toEqual([
          [setup.b1, ["x", "y"]],
        ]);
        expect(getInputs()).toEqual([
          { code: "first", name: ["first"], tags: [["x", "y"]], mark: ["r-first-b1"], filteredName: "first" },
        ]);
      });

      it("keeps schema-inferred many inputs when each concrete property field declares one", async () => {
        const { descriptor, getItems, getInputs } = await createTestProvider({
          // One source reaches B1 and B2 through different concrete paths, so each field
          // still reaches at most one instance. The unhinted input must combine both variants.
          sourceInstances: [[setup.multiple], []],
          imodelFieldsProviders: [
            defineIModelFieldsProvider({
              id: "related_v1",
              async getContribution() {
                return { relatedProperties: [{ path: setup.pathAB, cardinalityHint: "one" }] };
              },
            }),
          ],
        });
        const nameFields = getPropertyFieldsByName(descriptor, "Name");
        const tagsFields = getPropertyFieldsByName(descriptor, "Tags");
        expect(nameFields).toHaveLength(2);
        expect(tagsFields).toHaveLength(2);
        expect([...nameFields, ...tagsFields].map((field) => field.pathCardinality)).toEqual([
          "one",
          "one",
          "one",
          "one",
        ]);

        const [item] = await getItems();
        expect(item.primaryKey).toEqual(setup.multiple);
        expect(getInputs()).toEqual([
          {
            code: "multiple",
            name: expect.arrayContaining(["first", "second"]),
            tags: expect.arrayContaining([["x", "y"], ["z"]]),
            mark: expect.arrayContaining(["r-multiple-b1", "r-multiple-b2"]),
            filteredName: "first",
          },
        ]);
        expect(nameFields.map((field) => item.getValue(field))).toEqual(expect.arrayContaining(["first", "second"]));
        expect(tagsFields.map((field) => item.getValue(field))).toEqual(expect.arrayContaining([["x", "y"], ["z"]]));
        expect(
          nameFields.flatMap((field) =>
            item.getRelatedInstances(field).map((entry) => [entry.key, entry.getValue(field)]),
          ),
        ).toEqual(
          expect.arrayContaining([
            [setup.b1, "first"],
            [setup.b2, "second"],
          ]),
        );
        expect(
          tagsFields.flatMap((field) =>
            item.getRelatedInstances(field).map((entry) => [entry.key, entry.getValue(field)]),
          ),
        ).toEqual(
          expect.arrayContaining([
            [setup.b1, ["x", "y"]],
            [setup.b2, ["z"]],
          ]),
        );
      });

      it("rejects multiple matches for a one-valued external input despite a many-valued property declaration", async () => {
        const { getItems, getValues } = await createTestProvider({
          cardinalityHint: "one",
          // The external input counts the B1/B2 union, not each concrete property field separately.
          sourceInstances: [[setup.multiple], []],
          imodelFieldsProviders: [
            defineIModelFieldsProvider({
              id: "related_v1",
              async getContribution() {
                return { relatedProperties: [{ path: setup.pathAB, cardinalityHint: "many" }] };
              },
            }),
          ],
        });

        await expect(getItems()).rejects.toThrow(/input "name".*more than one related instance/);
        expect(getValues).not.toHaveBeenCalled();
      });

      it("rejects multiple matches for a one-valued property field despite a many-valued external input declaration", async () => {
        const { descriptor, getItems, getValues } = await createTestProvider({
          cardinalityHint: "many",
          // Both targets are B1 over Rel1, so they belong to the same property field. One is null
          // and only the other matches filteredName, isolating the property field's one constraint.
          sourceInstances: [[setup.multipleSameVariant], []],
          imodelFieldsProviders: [
            defineIModelFieldsProvider({
              id: "related_v1",
              async getContribution() {
                return { relatedProperties: [{ path: setup.pathAB, cardinalityHint: "one" }] };
              },
            }),
          ],
        });
        expect(getPropertyFieldByName(descriptor, "Name").pathCardinality).toBe("one");
        expect(getPropertyFieldByName(descriptor, "Tags").pathCardinality).toBe("one");

        await expect(getItems()).rejects.toThrow(/Field ".*".*more than one related instance/);
        expect(getValues).not.toHaveBeenCalled();
      });

      it("infers many-valued inputs from schema multiplicity when no hint is supplied", async () => {
        const { descriptor, getItems, getInputs } = await createTestProvider({
          // Reuse the many/null/missing cases without a hint, so schema multiplicity must determine the shape.
          sourceInstances: [[setup.multiple], [setup.missingValue, setup.empty]],
        });

        const items = await getItems();
        const inputs = getInputs();

        expect(items).toHaveLength(3);
        expect(inputs).toEqual([
          { code: "empty", name: [], tags: [], mark: [], filteredName: undefined },
          {
            code: "multiple",
            name: expect.arrayContaining(["first", "second"]),
            tags: expect.arrayContaining([["x", "y"], ["z"]]),
            mark: expect.arrayContaining(["r-multiple-b1", "r-multiple-b2"]),
            filteredName: "first",
          },
          { code: "null", name: [undefined], tags: [undefined], mark: [undefined], filteredName: undefined },
        ]);
        const [echoedField] = getExternalFields(descriptor);
        expect(items.map((item) => item.getValue(echoedField))).toEqual(inputs.map((input) => JSON.stringify(input)));
      });

      it("rejects a one-valued external input when the same primary reaches both B1 and B2", async () => {
        const { getItems, getValues } = await createTestProvider({
          cardinalityHint: "one",
          // The input path is A --Rel--> B. Rel1/Rel2 derive from Rel, and B1/B2 derive from B.
          // This primary reaches one B1 through Rel1 and one B2 through Rel2.
          // The "one" hint applies to their combined count, not separately to each derived-class path.
          sourceInstances: [[setup.multiple], []],
        });

        await expect(getItems()).rejects.toThrow(/input "name".*more than one related instance/);
        expect(getValues).not.toHaveBeenCalled();
      });
    });

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
