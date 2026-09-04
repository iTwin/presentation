/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineIModelFieldsProvider, getDistinctFieldValues } from "@itwin/presentation-content";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import { buildDescriptor, createContentIModelAccess, getPropertyFieldByName } from "./Utils.js";

import type { RelationshipPath } from "@itwin/presentation-shared";

describe("Content", () => {
  describe("getDistinctFieldValues", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("returns distinct raw values for a direct primitive property", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Name" typeName="string" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.A.fullName, { name: "foo" });
        builder.insertInstance(s.items.A.fullName, { name: "bar" });
        builder.insertInstance(s.items.A.fullName, { name: "foo" });
        builder.insertInstance(s.items.A.fullName, { name: undefined });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });
      const field = getPropertyFieldByName(descriptor, "Name");

      const values = await collect(
        getDistinctFieldValues({ imodelAccess, targets: [{ primaryClass: setup.schema.items.A.fullName }], field }),
      );

      expect(values.slice().sort()).toEqual([undefined, "bar", "foo"].sort());
      expect(values).toHaveLength(3);
    });

    it("returns raw point values, de-duplicating structurally equal points", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Origin" typeName="point3d" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.A.fullName, { origin: { x: 1, y: 2, z: 3 } });
        builder.insertInstance(s.items.A.fullName, { origin: { x: 1, y: 2, z: 3 } });
        builder.insertInstance(s.items.A.fullName, { origin: { x: 4, y: 5, z: 6 } });
        builder.insertInstance(s.items.A.fullName, { origin: undefined });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });
      const field = getPropertyFieldByName(descriptor, "Origin");

      const values = await collect(
        getDistinctFieldValues({ imodelAccess, targets: [{ primaryClass: setup.schema.items.A.fullName }], field }),
      );

      expect(values).toHaveLength(3);
      expect(values).toContainEqual({ x: 1, y: 2, z: 3 });
      expect(values).toContainEqual({ x: 4, y: 5, z: 6 });
      expect(values).toContainEqual(undefined);
    });

    it("returns raw (unformatted) enum values, not display labels", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEnumeration typeName="IntEnum" backingTypeName="int" isStrict="true">
              <ECEnumerator name="Red" value="1" displayLabel="Red" />
              <ECEnumerator name="Green" value="2" displayLabel="Green" />
            </ECEnumeration>
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Color" typeName="IntEnum" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.A.fullName, { color: 1 });
        builder.insertInstance(s.items.A.fullName, { color: 2 });
        builder.insertInstance(s.items.A.fullName, { color: 1 });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });
      const field = getPropertyFieldByName(descriptor, "Color");

      const values = await collect(
        getDistinctFieldValues({ imodelAccess, targets: [{ primaryClass: setup.schema.items.A.fullName }], field }),
      );

      // Raw underlying enum backing values (`1`/`2`), not the `"Red"`/`"Green"` display labels.
      expect(values.slice().sort()).toEqual([1, 2]);
    });

    it("returns distinct values for a related property, joining through the relationship path", async () => {
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
        // Each `A` relates to two `B`s, and "shared" is reachable through both `A`s — so the result
        // exercises both multiple related values per instance and cross-instance de-duplication.
        const a1 = builder.insertInstance(s.items.A.fullName, { propA: "a1" });
        const a2 = builder.insertInstance(s.items.A.fullName, { propA: "a2" });
        const b1 = builder.insertInstance(s.items.B.fullName, { propB: "shared" });
        const b2 = builder.insertInstance(s.items.B.fullName, { propB: "unique1" });
        const b3 = builder.insertInstance(s.items.B.fullName, { propB: "unique2" });
        const b4 = builder.insertInstance(s.items.B.fullName, { propB: "shared" });
        builder.insertRelationship(s.items.AtoB.fullName, a1.id, b1.id);
        builder.insertRelationship(s.items.AtoB.fullName, a1.id, b2.id);
        builder.insertRelationship(s.items.AtoB.fullName, a2.id, b3.id);
        builder.insertRelationship(s.items.AtoB.fullName, a2.id, b4.id);
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
      const provider = defineIModelFieldsProvider({
        id: "provider_v1",
        async getContribution() {
          return { relatedProperties: [{ path }] };
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { imodelFieldsProviders: [provider] },
      });
      const field = getPropertyFieldByName(descriptor, "PropB");

      const values = await collect(
        getDistinctFieldValues({ imodelAccess, targets: [{ primaryClass: setup.schema.items.A.fullName }], field }),
      );

      expect(values.slice().sort()).toEqual(["shared", "unique1", "unique2"].sort());
    });

    it("applies value filters, restricting which rows contribute distinct values", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Name" typeName="string" />
              <ECProperty propertyName="Category" typeName="string" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.A.fullName, { name: "foo", category: "x" });
        builder.insertInstance(s.items.A.fullName, { name: "bar", category: "y" });
        builder.insertInstance(s.items.A.fullName, { name: "baz", category: "x" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });
      const nameField = getPropertyFieldByName(descriptor, "Name");
      const categoryField = getPropertyFieldByName(descriptor, "Category");

      const values = await collect(
        getDistinctFieldValues({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
          field: nameField,
          filters: [{ field: categoryField, operator: "is-equal", value: "x" }],
        }),
      );

      expect(values.slice().sort()).toEqual(["baz", "foo"].sort());
    });

    it("applies a value filter on a 1:many related path without duplicating or losing distinct values", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Name" typeName="string" />
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
        // `a1` has two related `B`s (a 1:many path): one matching the filter, one not. `a2`'s only
        // related `B` doesn't match; `a3` has no related `B` at all.
        const a1 = builder.insertInstance(s.items.A.fullName, { name: "first" });
        const a2 = builder.insertInstance(s.items.A.fullName, { name: "second" });
        builder.insertInstance(s.items.A.fullName, { name: "third" });
        const b1 = builder.insertInstance(s.items.B.fullName, { propB: "match" });
        const b2 = builder.insertInstance(s.items.B.fullName, { propB: "other" });
        const b3 = builder.insertInstance(s.items.B.fullName, { propB: "other" });
        builder.insertRelationship(s.items.AtoB.fullName, a1.id, b1.id);
        builder.insertRelationship(s.items.AtoB.fullName, a1.id, b2.id);
        builder.insertRelationship(s.items.AtoB.fullName, a2.id, b3.id);
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
      const provider = defineIModelFieldsProvider({
        id: "provider_v1",
        async getContribution() {
          return { relatedProperties: [{ path }] };
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { imodelFieldsProviders: [provider] },
      });
      const nameField = getPropertyFieldByName(descriptor, "Name");
      const propBField = getPropertyFieldByName(descriptor, "PropB");

      // Filtering the *selected direct property* by the 1:many related property: only `a1` has a
      // matching related instance, and the joined non-matching rows must not surface other names.
      const namesFilteredByRelated = await collect(
        getDistinctFieldValues({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
          field: nameField,
          filters: [{ field: propBField, operator: "is-equal", value: "match" }],
        }),
      );
      expect(namesFilteredByRelated).toEqual(["first"]);

      // Selecting and filtering the same 1:many related property: per-related-row evaluation keeps
      // exactly the matching values, once each despite multiple contributing rows.
      const relatedValues = await collect(
        getDistinctFieldValues({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
          field: propBField,
          filters: [{ field: propBField, operator: "is-not-null" }],
        }),
      );
      expect(relatedValues.slice().sort()).toEqual(["match", "other"].sort());
    });

    it("merges and de-duplicates distinct values across multiple targets", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Name" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <ECProperty propertyName="Name" typeName="string" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.A.fullName, { name: "shared" });
        builder.insertInstance(s.items.A.fullName, { name: "onlyA" });
        builder.insertInstance(s.items.B.fullName, { name: "shared" });
        builder.insertInstance(s.items.B.fullName, { name: "onlyB" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptorA = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });
      const descriptorB = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.B.fullName }],
      });
      const fieldA = getPropertyFieldByName(descriptorA, "Name");
      const fieldB = getPropertyFieldByName(descriptorB, "Name");

      // Both fields declare the same property name/type on their respective primary classes, so either
      // field's selector is structurally equivalent for this test's purposes — use field `A`'s to build
      // both targets' queries, since `getDistinctFieldValues` takes a single field across all targets.
      const values = await collect(
        getDistinctFieldValues({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName }, { primaryClass: setup.schema.items.B.fullName }],
          field: fieldA,
        }),
      );

      expect(values.slice().sort()).toEqual(["onlyA", "onlyB", "shared"].sort());
      expect(fieldB.propertyName).toBe(fieldA.propertyName);
    });

    it("scopes distinct values to specific target instance IDs", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Name" typeName="string" />
            </ECEntityClass>
          `,
        );
        const included = builder.insertInstance(s.items.A.fullName, { name: "included" });
        builder.insertInstance(s.items.A.fullName, { name: "excluded" });
        return { schema: s, includedId: included.id };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });
      const field = getPropertyFieldByName(descriptor, "Name");

      const values = await collect(
        getDistinctFieldValues({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.A.fullName, instanceIds: [setup.includedId] }],
          field,
        }),
      );

      expect(values).toEqual(["included"]);
    });
  });
});
