/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContentProvider, defineIModelFieldsProvider, resolveContentSources } from "@itwin/presentation-content";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import {
  createContentIModelAccess,
  getCalculatedFieldByLabel,
  getPropertyFieldByName,
  getPropertyFieldsByName,
} from "./Utils.js";

import type { ContentConfiguration, ContentTarget } from "@itwin/presentation-content";
import type { InstanceKey, RelationshipPath } from "@itwin/presentation-shared";
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

function expectKeys(actual: InstanceKey[], expected: InstanceKey[]) {
  expect(actual).toHaveLength(expected.length);
  expect(actual).toEqual(expect.arrayContaining(expected));
}

describe("Content", () => {
  describe("getItems", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    describe("basics", () => {
      it("returns no items when the source class has no instances", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="A">
                <ECProperty propertyName="Prop" typeName="string" />
              </ECEntityClass>
            `,
          );
          return { schema };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
        });

        await expect(collect(provider.getItems())).resolves.toEqual([]);
      });

      it("loads an item per instance with its primary key and direct property values", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="A">
                <ECProperty propertyName="Name" typeName="string" />
                <ECProperty propertyName="Score" typeName="int" />
              </ECEntityClass>
            `,
          );
          const a1 = builder.insertInstance(schema.items.A.fullName, { name: "first", score: 1 });
          const a2 = builder.insertInstance(schema.items.A.fullName, { name: "second", score: 2 });
          return { schema, a1, a2 };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
        });
        const descriptor = await provider.getContentDescriptor();
        const nameField = getPropertyFieldByName(descriptor, "Name");
        const scoreField = getPropertyFieldByName(descriptor, "Score");

        const items = await collect(provider.getItems());
        expectKeys(
          items.map((item) => item.primaryKey),
          [setup.a1, setup.a2],
        );

        const byId = new Map(items.map((item) => [item.primaryKey.id, item]));
        expect(byId.get(setup.a1.id)!.getValue(nameField)).toBe("first");
        expect(byId.get(setup.a1.id)!.getValue(scoreField)).toBe(1);
        expect(byId.get(setup.a2.id)!.getValue(nameField)).toBe("second");
        expect(byId.get(setup.a2.id)!.getValue(scoreField)).toBe(2);
      });

      it("exposes the provider descriptor on every item", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="A">
                <ECProperty propertyName="Prop" typeName="string" />
              </ECEntityClass>
            `,
          );
          builder.insertInstance(schema.items.A.fullName, { prop: "x" });
          return { schema };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
        });
        const descriptor = await provider.getContentDescriptor();

        const [item] = await collect(provider.getItems());
        expect(item.descriptor).toBe(descriptor);
      });
    });

    describe("value decoding", () => {
      it("round-trips primitive property values", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEnumeration typeName="IntEnum" backingTypeName="int" isStrict="true">
                <ECEnumerator name="Red" value="1" displayLabel="Red" />
                <ECEnumerator name="Green" value="2" displayLabel="Green" />
              </ECEnumeration>
              <ECEnumeration typeName="StrEnum" backingTypeName="string" isStrict="true">
                <ECEnumerator name="A" value="a" displayLabel="AA" />
                <ECEnumerator name="B" value="b" displayLabel="BB" />
              </ECEnumeration>
              <ECEntityClass typeName="A">
                <ECProperty propertyName="StringProp" typeName="string" />
                <ECProperty propertyName="IntProp" typeName="int" />
                <ECProperty propertyName="DoubleProp" typeName="double" />
                <ECProperty propertyName="BoolProp" typeName="boolean" />
                <ECProperty propertyName="LongProp" typeName="long" />
                <ECProperty propertyName="DateTimeProp" typeName="dateTime" />
                <ECProperty propertyName="Point2dProp" typeName="point2d" />
                <ECProperty propertyName="Point3dProp" typeName="point3d" />
                <ECProperty propertyName="IntEnumProp" typeName="IntEnum" />
                <ECProperty propertyName="StrEnumProp" typeName="StrEnum" />
              </ECEntityClass>
            `,
          );
          builder.insertInstance(schema.items.A.fullName, {
            stringProp: "hello",
            intProp: 42,
            doubleProp: 3.5,
            boolProp: true,
            longProp: 12345,
            dateTimeProp: new Date("2021-01-01T00:00:00.000Z"),
            point2dProp: { x: 1, y: 2 },
            point3dProp: { x: 1, y: 2, z: 3 },
            intEnumProp: 2,
            strEnumProp: "b",
          });
          return { schema };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
        });
        const descriptor = await provider.getContentDescriptor();

        const [item] = await collect(provider.getItems());
        expect(item.getValue(getPropertyFieldByName(descriptor, "StringProp"))).toBe("hello");
        expect(item.getValue(getPropertyFieldByName(descriptor, "IntProp"))).toBe(42);
        expect(item.getValue(getPropertyFieldByName(descriptor, "DoubleProp"))).toBe(3.5);
        expect(item.getValue(getPropertyFieldByName(descriptor, "BoolProp"))).toBe(true);
        expect(item.getValue(getPropertyFieldByName(descriptor, "LongProp"))).toBe(12345);
        expect(item.getValue(getPropertyFieldByName(descriptor, "DateTimeProp"))).toContain("2021-01-01T00:00:00");
        const point2d = item.getValue(getPropertyFieldByName(descriptor, "Point2dProp")) as Record<string, number>;
        expect(Object.values(point2d)).toEqual([1, 2]);
        const point3d = item.getValue(getPropertyFieldByName(descriptor, "Point3dProp")) as Record<string, number>;
        expect(Object.values(point3d)).toEqual([1, 2, 3]);
        // Enumerations decode to their raw backing value.
        expect(item.getValue(getPropertyFieldByName(descriptor, "IntEnumProp"))).toBe(2);
        expect(item.getValue(getPropertyFieldByName(descriptor, "StrEnumProp"))).toBe("b");
      });

      it("omits null values so their fields decode to undefined", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="A">
                <ECProperty propertyName="Present" typeName="string" />
                <ECProperty propertyName="Absent" typeName="string" />
              </ECEntityClass>
            `,
          );
          builder.insertInstance(schema.items.A.fullName, { present: "value" });
          return { schema };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
        });
        const descriptor = await provider.getContentDescriptor();
        const presentField = getPropertyFieldByName(descriptor, "Present");
        const absentField = getPropertyFieldByName(descriptor, "Absent");

        const [item] = await collect(provider.getItems());
        expect(item.getValue(presentField)).toBe("value");
        expect(item.getValue(absentField)).toBeUndefined();
        expect(absentField.id in item.values).toBe(false);
      });

      it("leaves fields that don't apply to an item's class undefined", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="Base" modifier="Abstract">
                <ECProperty propertyName="Shared" typeName="string" />
              </ECEntityClass>
              <ECEntityClass typeName="Derived1">
                <BaseClass>Base</BaseClass>
                <ECProperty propertyName="Only1" typeName="string" />
              </ECEntityClass>
              <ECEntityClass typeName="Derived2">
                <BaseClass>Base</BaseClass>
                <ECProperty propertyName="Only2" typeName="string" />
              </ECEntityClass>
            `,
          );
          const d1 = builder.insertInstance(schema.items.Derived1.fullName, { shared: "s1", only1: "a" });
          const d2 = builder.insertInstance(schema.items.Derived2.fullName, { shared: "s2", only2: "b" });
          return { schema, d1, d2 };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.Base.fullName }],
        });
        const descriptor = await provider.getContentDescriptor();
        const only1 = getPropertyFieldByName(descriptor, "Only1");
        const only2 = getPropertyFieldByName(descriptor, "Only2");

        const items = await collect(provider.getItems());
        const byId = new Map(items.map((item) => [item.primaryKey.id, item]));
        expect(byId.get(setup.d1.id)!.getValue(only1)).toBe("a");
        expect(byId.get(setup.d1.id)!.getValue(only2)).toBeUndefined();
        expect(byId.get(setup.d2.id)!.getValue(only2)).toBe("b");
        expect(byId.get(setup.d2.id)!.getValue(only1)).toBeUndefined();
      });
    });

    describe("sources", () => {
      it("returns concrete polymorphic classes in primary keys", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="Base" modifier="Abstract">
                <ECProperty propertyName="Prop" typeName="string" />
              </ECEntityClass>
              <ECEntityClass typeName="Derived">
                <BaseClass>Base</BaseClass>
              </ECEntityClass>
            `,
          );
          const derived = builder.insertInstance(schema.items.Derived.fullName, { prop: "x" });
          return { schema, derived };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.Base.fullName }],
        });

        const items = await collect(provider.getItems());
        expectKeys(
          items.map((item) => item.primaryKey),
          [setup.derived],
        );
        expect(items[0].primaryKey.className).toBe(setup.schema.items.Derived.fullName);
      });

      it("enumerates multiple sources sequentially", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="A">
                <ECProperty propertyName="Prop" typeName="string" />
              </ECEntityClass>
              <ECEntityClass typeName="B">
                <ECProperty propertyName="Prop" typeName="string" />
              </ECEntityClass>
            `,
          );
          const a = builder.insertInstance(schema.items.A.fullName, { prop: "a" });
          const b = builder.insertInstance(schema.items.B.fullName, { prop: "b" });
          return { schema, a, b };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }, { primaryClass: setup.schema.items.B.fullName }],
        });

        const items = await collect(provider.getItems());
        expectKeys(
          items.map((item) => item.primaryKey),
          [setup.a, setup.b],
        );
      });

      it("returns a key more than once when configured sources overlap", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="Base" modifier="Abstract">
                <ECProperty propertyName="Prop" typeName="string" />
              </ECEntityClass>
              <ECEntityClass typeName="Derived">
                <BaseClass>Base</BaseClass>
              </ECEntityClass>
            `,
          );
          const derived = builder.insertInstance(schema.items.Derived.fullName, { prop: "x" });
          return { schema, derived };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        // `Base` (polymorphic) and `Derived` both select the same instance.
        const provider = await createProvider({
          imodelAccess,
          targets: [
            { primaryClass: setup.schema.items.Base.fullName },
            { primaryClass: setup.schema.items.Derived.fullName },
          ],
        });

        const items = await collect(provider.getItems());
        expect(items.map((item) => item.primaryKey.id)).toEqual([setup.derived.id, setup.derived.id]);
      });
    });

    describe("calculated fields", () => {
      it("computes calculated field values from a provider expression", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="A">
                <ECProperty propertyName="Prop" typeName="string" />
              </ECEntityClass>
            `,
          );
          builder.insertInstance(schema.items.A.fullName, { prop: "value" });
          return { schema };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const fieldsProvider = defineIModelFieldsProvider({
          id: "calc-provider_v1",
          async getContribution() {
            return {
              calculatedFields: [
                {
                  id: "calc1",
                  label: "Exclaimed",
                  expression: `this.Prop || '!'`,
                  type: { kind: "primitive", type: "String" },
                },
              ],
            };
          },
        });
        const config = { imodelFieldsProviders: [fieldsProvider] };
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
          config,
        });
        const descriptor = await provider.getContentDescriptor();
        const calcField = getCalculatedFieldByLabel(descriptor, "Exclaimed");

        const [item] = await collect(provider.getItems());
        expect(item.getValue(calcField)).toBe("value!");
      });

      it("computes calculated field values using bindings and a custom target alias", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="A">
                <ECProperty propertyName="FlowRate" typeName="double" />
              </ECEntityClass>
            `,
          );
          builder.insertInstance(schema.items.A.fullName, { flowRate: 2 });
          return { schema };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const fieldsProvider = defineIModelFieldsProvider({
          id: "calc-provider_v1",
          async getContribution() {
            return {
              calculatedFields: [
                {
                  id: "flow",
                  label: "Scaled",
                  expression: "e.FlowRate * :factor",
                  targetAlias: "e",
                  bindings: { factor: { type: "double", value: 10 } },
                  type: { kind: "primitive", type: "Double" },
                },
              ],
            };
          },
        });
        const config = { imodelFieldsProviders: [fieldsProvider] };
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
          config,
        });
        const descriptor = await provider.getContentDescriptor();
        const calcField = getCalculatedFieldByLabel(descriptor, "Scaled");

        const [item] = await collect(provider.getItems());
        expect(item.getValue(calcField)).toBe(20);
      });
    });

    describe("sorting", () => {
      async function buildScoreProvider() {
        const setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="A">
                <ECProperty propertyName="Score" typeName="int" />
                <ECProperty propertyName="Name" typeName="string" />
              </ECEntityClass>
            `,
          );
          const a1 = builder.insertInstance(schema.items.A.fullName, { score: 3, name: "c" });
          const a2 = builder.insertInstance(schema.items.A.fullName, { score: 1, name: "a" });
          const a3 = builder.insertInstance(schema.items.A.fullName, { score: 2, name: "b" });
          return { schema, a1, a2, a3 };
        });
        return setup;
      }

      it("orders items ascending by a property field", async () => {
        using setup = await buildScoreProvider();
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
        });
        const scoreField = getPropertyFieldByName(await provider.getContentDescriptor(), "Score");

        const items = await collect(provider.getItems({ sorting: [{ field: scoreField, direction: "asc" }] }));
        expect(items.map((item) => item.getValue(scoreField))).toEqual([1, 2, 3]);
      });

      it("orders items descending by a property field", async () => {
        using setup = await buildScoreProvider();
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
        });
        const scoreField = getPropertyFieldByName(await provider.getContentDescriptor(), "Score");

        const items = await collect(provider.getItems({ sorting: [{ field: scoreField, direction: "desc" }] }));
        expect(items.map((item) => item.getValue(scoreField))).toEqual([3, 2, 1]);
      });

      it("breaks ties on repeated sort values with a stable primary-key order", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="A">
                <ECProperty propertyName="Score" typeName="int" />
              </ECEntityClass>
            `,
          );
          const a1 = builder.insertInstance(schema.items.A.fullName, { score: 5 });
          const a2 = builder.insertInstance(schema.items.A.fullName, { score: 5 });
          const a3 = builder.insertInstance(schema.items.A.fullName, { score: 5 });
          return { schema, keys: [a1, a2, a3] };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
        });
        const scoreField = getPropertyFieldByName(await provider.getContentDescriptor(), "Score");

        const items = await collect(provider.getItems({ sorting: [{ field: scoreField, direction: "asc" }] }));
        const sortedIds = [...setup.keys.map((k) => k.id)].sort();
        expect(items.map((item) => item.primaryKey.id)).toEqual(sortedIds);
      });

      it("orders by multiple fields in order of precedence", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="A">
                <ECProperty propertyName="Bucket" typeName="int" />
                <ECProperty propertyName="Name" typeName="string" />
              </ECEntityClass>
            `,
          );
          builder.insertInstance(schema.items.A.fullName, { bucket: 1, name: "b" });
          builder.insertInstance(schema.items.A.fullName, { bucket: 1, name: "a" });
          builder.insertInstance(schema.items.A.fullName, { bucket: 2, name: "a" });
          return { schema };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
        });
        const descriptor = await provider.getContentDescriptor();
        const groupField = getPropertyFieldByName(descriptor, "Bucket");
        const nameField = getPropertyFieldByName(descriptor, "Name");

        const items = await collect(
          provider.getItems({
            sorting: [
              { field: groupField, direction: "asc" },
              { field: nameField, direction: "asc" },
            ],
          }),
        );
        expect(items.map((item) => [item.getValue(groupField), item.getValue(nameField)])).toEqual([
          [1, "a"],
          [1, "b"],
          [2, "a"],
        ]);
      });

      it("orders by a calculated field", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="A">
                <ECProperty propertyName="Score" typeName="int" />
              </ECEntityClass>
            `,
          );
          builder.insertInstance(schema.items.A.fullName, { score: 1 });
          builder.insertInstance(schema.items.A.fullName, { score: 2 });
          builder.insertInstance(schema.items.A.fullName, { score: 3 });
          return { schema };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const fieldsProvider = defineIModelFieldsProvider({
          id: "calc-provider_v1",
          async getContribution() {
            return {
              calculatedFields: [
                {
                  id: "neg",
                  label: "Negated",
                  expression: "this.Score * -1",
                  type: { kind: "primitive", type: "Integer" },
                },
              ],
            };
          },
        });
        const config = { imodelFieldsProviders: [fieldsProvider] };
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
          config,
        });
        const descriptor = await provider.getContentDescriptor();
        const calcField = getCalculatedFieldByLabel(descriptor, "Negated");

        const items = await collect(provider.getItems({ sorting: [{ field: calcField, direction: "asc" }] }));
        expect(items.map((item) => item.getValue(calcField))).toEqual([-3, -2, -1]);
      });

      it("orders items globally across multiple sorted sources", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="A">
                <ECProperty propertyName="Score" typeName="int" />
              </ECEntityClass>
              <ECEntityClass typeName="B">
                <ECProperty propertyName="Score" typeName="int" />
              </ECEntityClass>
            `,
          );
          const a1 = builder.insertInstance(schema.items.A.fullName, { score: 1 });
          const a3 = builder.insertInstance(schema.items.A.fullName, { score: 3 });
          const b2 = builder.insertInstance(schema.items.B.fullName, { score: 2 });
          const b4 = builder.insertInstance(schema.items.B.fullName, { score: 4 });
          return { schema, a1, a3, b2, b4 };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }, { primaryClass: setup.schema.items.B.fullName }],
        });
        const descriptor = await provider.getContentDescriptor();
        // Both classes declare their own `Score` field; sort by both so each source contributes its key.
        const scoreFields = getPropertyFieldsByName(descriptor, "Score");

        const items = await collect(
          provider.getItems({ sorting: scoreFields.map((field) => ({ field, direction: "asc" as const })) }),
        );
        expect(items.map((item) => item.primaryKey.id)).toEqual([setup.a1.id, setup.b2.id, setup.a3.id, setup.b4.id]);
      });

      it("orders items globally across more sources than a compound SELECT allows", async () => {
        // SQLite refuses a compound SELECT with more than 500 terms, so the key stream that interleaves the
        // sources has to nest its `UNION ALL` branches into groups.
        const sourceCount = 600;
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="Base" modifier="Abstract">
                <ECProperty propertyName="Score" typeName="int" />
              </ECEntityClass>
              ${new Array(sourceCount)
                .fill(0)
                .map(
                  (_, i) => `
                    <ECEntityClass typeName="D${i}">
                      <BaseClass>Base</BaseClass>
                    </ECEntityClass>
                  `,
                )
                .join("")}
            `,
          );
          for (let i = 0; i < sourceCount; ++i) {
            builder.insertInstance(schema.items[`D${i}`].fullName, { score: sourceCount - i });
          }
          return { schema };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: new Array(sourceCount)
            .fill(0)
            .map((_, i) => ({ primaryClass: setup.schema.items[`D${i}`].fullName })),
        });
        const scoreField = getPropertyFieldByName(await provider.getContentDescriptor(), "Score");

        const items = await collect(provider.getItems({ sorting: [{ field: scoreField, direction: "asc" }] }));
        expect(items.map((item) => item.getValue(scoreField))).toEqual(
          new Array(sourceCount).fill(0).map((_, i) => i + 1),
        );
      });
    });

    describe("filtering", () => {
      it("applies a value filter to restrict the returned items", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="A">
                <ECProperty propertyName="Score" typeName="int" />
              </ECEntityClass>
            `,
          );
          const a1 = builder.insertInstance(schema.items.A.fullName, { score: 1 });
          const a2 = builder.insertInstance(schema.items.A.fullName, { score: 2 });
          const a3 = builder.insertInstance(schema.items.A.fullName, { score: 3 });
          return { schema, a1, a2, a3 };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
        });
        const scoreField = getPropertyFieldByName(await provider.getContentDescriptor(), "Score");

        const items = await collect(
          provider.getItems({ filters: [{ field: scoreField, operator: "greater-than", value: 1 }] }),
        );
        expectKeys(
          items.map((item) => item.primaryKey),
          [setup.a2, setup.a3],
        );
      });

      it("combines filtering with sorting", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="A">
                <ECProperty propertyName="Score" typeName="int" />
              </ECEntityClass>
            `,
          );
          for (const score of [5, 1, 4, 2, 3]) {
            builder.insertInstance(schema.items.A.fullName, { score });
          }
          return { schema };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
        });
        const scoreField = getPropertyFieldByName(await provider.getContentDescriptor(), "Score");

        const items = await collect(
          provider.getItems({
            filters: [{ field: scoreField, operator: "less-than-or-equal", value: 3 }],
            sorting: [{ field: scoreField, direction: "desc" }],
          }),
        );
        expect(items.map((item) => item.getValue(scoreField))).toEqual([3, 2, 1]);
      });
    });

    describe("paging", () => {
      it("pages through more items than a single page holds without gaps or duplicates", async () => {
        const count = 1050; // exceeds the internal PAGE_SIZE of 1000
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="A">
                <ECProperty propertyName="Seq" typeName="int" />
              </ECEntityClass>
            `,
          );
          for (let i = 0; i < count; ++i) {
            builder.insertInstance(schema.items.A.fullName, { seq: i });
          }
          return { schema };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
        });
        const seqField = getPropertyFieldByName(await provider.getContentDescriptor(), "Seq");

        const items = await collect(provider.getItems({ sorting: [{ field: seqField, direction: "asc" }] }));
        expect(items).toHaveLength(count);
        expect(items.map((item) => item.getValue(seqField))).toEqual(Array.from({ length: count }, (_, i) => i));
        expect(new Set(items.map((item) => item.primaryKey.id)).size).toBe(count);
      });
    });

    describe("related properties", () => {
      it("stitches a single-step 1:1 related property value onto the item", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
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
          const a = builder.insertInstance(schema.items.A.fullName, { propA: "a" });
          const b = builder.insertInstance(schema.items.B.fullName, { propB: "related" });
          builder.insertRelationship(schema.items.AtoB.fullName, a.id, b.id);
          return { schema, a, b };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const path: RelationshipPath = [
          {
            sourceClassName: setup.schema.items.A.fullName,
            targetClassName: setup.schema.items.B.fullName,
            relationshipName: setup.schema.items.AtoB.fullName,
          },
        ];
        const fieldsProvider = defineIModelFieldsProvider({
          id: "provider_v1",
          async getContribution() {
            return { relatedProperties: [{ path }] };
          },
        });
        const config = { imodelFieldsProviders: [fieldsProvider] };
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
          config,
        });
        const descriptor = await provider.getContentDescriptor();
        const relatedField = getPropertyFieldByName(descriptor, "PropB");

        const [item] = await collect(provider.getItems());
        expect(item.primaryKey.id).toBe(setup.a.id);
        expect(item.getValue(relatedField)).toBe("related");
      });

      it("returns one item per primary when a 1:many related property is loaded", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schema = await importSchema(
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
          const a = builder.insertInstance(schema.items.A.fullName, { propA: "a" });
          const c1 = builder.insertInstance(schema.items.C.fullName, { propC: "shared" });
          const c2 = builder.insertInstance(schema.items.C.fullName, { propC: "shared" });
          builder.insertRelationship(schema.items.AtoC.fullName, a.id, c1.id);
          builder.insertRelationship(schema.items.AtoC.fullName, a.id, c2.id);
          return { schema, a };
        });
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const path: RelationshipPath = [
          {
            sourceClassName: setup.schema.items.A.fullName,
            targetClassName: setup.schema.items.C.fullName,
            relationshipName: setup.schema.items.AtoC.fullName,
          },
        ];
        const fieldsProvider = defineIModelFieldsProvider({
          id: "provider_v1",
          async getContribution() {
            return { relatedProperties: [{ path }] };
          },
        });
        const config = { imodelFieldsProviders: [fieldsProvider] };
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
          config,
        });

        // The anchor stays one row per primary even though the primary reaches many related instances.
        const descriptor = await provider.getContentDescriptor();
        const relatedField = getPropertyFieldByName(descriptor, "PropC");
        const items = await collect(provider.getItems());
        expect(items.map((item) => item.primaryKey.id)).toEqual([setup.a.id]);
        expect(items[0].getValue(relatedField)).toBe("shared");
      });
    });
  });
});
