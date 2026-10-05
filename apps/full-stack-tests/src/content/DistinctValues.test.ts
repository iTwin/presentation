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

      const values = await collect(getDistinctFieldValues({ imodelAccess, field }));

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

      const values = await collect(getDistinctFieldValues({ imodelAccess, field }));

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

      const values = await collect(getDistinctFieldValues({ imodelAccess, field }));

      // Raw underlying enum backing values (`1`/`2`), not the `"Red"`/`"Green"` display labels.
      expect(values.slice().sort()).toEqual([1, 2]);
    });

    it("returns navigation values with their target instances' keys and labels", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECNavigationProperty propertyName="NavToB" relationshipName="AtoB" direction="Forward" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <ECCustomAttributes>
                <ClassMap xmlns="ECDbMap.02.00.01">
                  <MapStrategy>TablePerHierarchy</MapStrategy>
                </ClassMap>
              </ECCustomAttributes>
              <ECProperty propertyName="Label" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="BSub">
              <BaseClass>B</BaseClass>
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
        // Two different target instances, of different classes, sharing the same label.
        const b = builder.insertInstance(s.items.B.fullName, { label: "shared" });
        const bSub = builder.insertInstance(s.items.BSub.fullName, { label: "shared" });
        builder.insertInstance(s.items.A.fullName, { "NavToB.Id": b.id });
        builder.insertInstance(s.items.A.fullName, { "NavToB.Id": bSub.id });
        // A second reference to the same target instance, plus one without a navigation value at all.
        builder.insertInstance(s.items.A.fullName, { "NavToB.Id": b.id });
        builder.insertInstance(s.items.A.fullName);
        return { schema: s, bId: b.id, bSubId: bSub.id };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });
      const field = getPropertyFieldByName(descriptor, "NavToB");

      const values = await collect(
        getDistinctFieldValues({
          imodelAccess,
          field,
          labelsFactory: { createSelectClause: async ({ classAlias }) => `[${classAlias}].[Label]` },
        }),
      );

      // Same-labeled instances are separate entries (de-duplication is by target instance id), the
      // subclass instance resolves through the polymorphic join, and the NULL navigation value comes
      // through as `undefined`.
      expect(values).toHaveLength(3);
      expect(values).toContainEqual({
        key: { className: setup.schema.items.B.fullName, id: setup.bId },
        label: "shared",
      });
      expect(values).toContainEqual({
        key: { className: setup.schema.items.BSub.fullName, id: setup.bSubId },
        label: "shared",
      });
      expect(values).toContainEqual(undefined);
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

      const values = await collect(getDistinctFieldValues({ imodelAccess, field }));

      expect(values.slice().sort()).toEqual(["shared", "unique1", "unique2"].sort());
    });

    it("merges and de-duplicates distinct values across the field's multiple resolved classes", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="Base">
              <ECCustomAttributes>
                <ClassMap xmlns="ECDbMap.02.00.01">
                  <MapStrategy>TablePerHierarchy</MapStrategy>
                </ClassMap>
              </ECCustomAttributes>
              <ECProperty propertyName="Name" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="A">
              <BaseClass>Base</BaseClass>
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <BaseClass>Base</BaseClass>
            </ECEntityClass>
          `,
        );
        // `Name` is declared on the base class, but instances only exist for the two sibling
        // subclasses — with "shared" reachable through both.
        builder.insertInstance(s.items.A.fullName, { name: "shared" });
        builder.insertInstance(s.items.A.fullName, { name: "onlyA" });
        builder.insertInstance(s.items.B.fullName, { name: "shared" });
        builder.insertInstance(s.items.B.fullName, { name: "onlyB" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.Base.fullName }],
      });
      const field = getPropertyFieldByName(descriptor, "Name");
      // The field's resolved classes span both sibling subclasses — no explicit multi-target caller
      // input is needed to drive the one-query-per-class merge below.
      expect(field.primaryClassNames).toEqual([setup.schema.items.A.fullName, setup.schema.items.B.fullName]);

      const values = await collect(getDistinctFieldValues({ imodelAccess, field }));

      expect(values.slice().sort()).toEqual(["onlyA", "onlyB", "shared"].sort());
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
        getDistinctFieldValues({ imodelAccess, field, instanceFiltering: { ids: [setup.includedId] } }),
      );

      expect(values).toEqual(["included"]);
    });

    it("scopes distinct values using an instance filter expression", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Name" typeName="string" />
              <ECProperty propertyName="Included" typeName="boolean" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.A.fullName, { name: "included", included: true });
        builder.insertInstance(s.items.A.fullName, { name: "excluded", included: false });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });
      const field = getPropertyFieldByName(descriptor, "Name");

      const values = await collect(
        getDistinctFieldValues({ imodelAccess, field, instanceFiltering: { filter: { expression: `this.Included` } } }),
      );

      expect(values).toEqual(["included"]);
    });

    it("returns distinct values for a property defined only on a derived class, when the content target is the base class", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="ASub">
              <BaseClass>A</BaseClass>
              <ECProperty propertyName="PropASub" typeName="string" />
            </ECEntityClass>
          `,
        );
        // A plain `A` instance (no `ASub`-specific data at all) alongside `ASub` instances that
        // exercise both a `PropASub` value that's absent and a value duplicated across instances.
        builder.insertInstance(s.items.A.fullName, { propA: "base-only" });
        builder.insertInstance(s.items.ASub.fullName, { propA: "sub1", propASub: "foo" });
        builder.insertInstance(s.items.ASub.fullName, { propA: "sub2", propASub: "bar" });
        builder.insertInstance(s.items.ASub.fullName, { propA: "sub3", propASub: "foo" });
        builder.insertInstance(s.items.ASub.fullName, { propA: "sub4" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      // The content target is the *base* class `A`, even though `PropASub` is only declared on the
      // derived `ASub`.
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });
      const field = getPropertyFieldByName(descriptor, "PropASub");
      expect(field.primaryClassNames).toEqual([setup.schema.items.ASub.fullName]);

      const values = await collect(getDistinctFieldValues({ imodelAccess, field }));

      expect(values.slice().sort()).toEqual([undefined, "bar", "foo"].sort());
      expect(values).toHaveLength(3);
    });

    it("returns distinct values for a related property reached through instances of derived classes, when the content target is the base class", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECCustomAttributes>
                <ClassMap xmlns="ECDbMap.02.00.01">
                  <MapStrategy>TablePerHierarchy</MapStrategy>
                </ClassMap>
              </ECCustomAttributes>
            </ECEntityClass>
            <ECEntityClass typeName="A1">
              <BaseClass>A</BaseClass>
            </ECEntityClass>
            <ECEntityClass typeName="A2">
              <BaseClass>A</BaseClass>
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
        // `A` has no direct instances of its own — it's only ever reached through the derived `A1`/`A2`
        // — and each relates to a `B`, with "foo" reachable through both derived classes.
        const a1 = builder.insertInstance(s.items.A1.fullName);
        const a2 = builder.insertInstance(s.items.A2.fullName);
        const b1 = builder.insertInstance(s.items.B.fullName, { propB: "foo" });
        const b2 = builder.insertInstance(s.items.B.fullName, { propB: "bar" });
        const b3 = builder.insertInstance(s.items.B.fullName, { propB: "foo" });
        builder.insertRelationship(s.items.AtoB.fullName, a1.id, b1.id);
        builder.insertRelationship(s.items.AtoB.fullName, a1.id, b2.id);
        builder.insertRelationship(s.items.AtoB.fullName, a2.id, b3.id);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      // The relationship path is declared from the *base* class `A`, so the related property is only
      // ever reached through its derived `A1`/`A2` instances.
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
      expect(field.primaryClassNames).toEqual([setup.schema.items.A1.fullName, setup.schema.items.A2.fullName]);

      const values = await collect(getDistinctFieldValues({ imodelAccess, field }));

      expect(values.slice().sort()).toEqual(["bar", "foo"].sort());
    });

    it("returns distinct values for a base-declared property when instances exist at multiple levels of a derived chain", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="Base">
              <ECCustomAttributes>
                <ClassMap xmlns="ECDbMap.02.00.01">
                  <MapStrategy>TablePerHierarchy</MapStrategy>
                </ClassMap>
              </ECCustomAttributes>
              <ECProperty propertyName="PropBase" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="Derived">
              <BaseClass>Base</BaseClass>
            </ECEntityClass>
            <ECEntityClass typeName="A1">
              <BaseClass>Derived</BaseClass>
            </ECEntityClass>
            <ECEntityClass typeName="A2">
              <BaseClass>Derived</BaseClass>
            </ECEntityClass>
          `,
        );
        // Instances exist at every level of the chain below `Base` — the mid-level `Derived` itself,
        // plus its two leaf siblings `A1`/`A2` — with "shared" reachable through both siblings and
        // "onlyDerived" only through the mid-level class.
        builder.insertInstance(s.items.Derived.fullName, { propBase: "onlyDerived" });
        builder.insertInstance(s.items.A1.fullName, { propBase: "shared" });
        builder.insertInstance(s.items.A2.fullName, { propBase: "shared" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      // The content target is the topmost base class `Base`, even though `PropBase` is declared there
      // and every instance lives on a subclass of it.
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.Base.fullName }],
      });
      const field = getPropertyFieldByName(descriptor, "PropBase");
      // The field's resolved classes span all three levels with instances — `Derived` itself plus
      // both of its leaf subclasses — driving one query per class.
      expect(field.primaryClassNames).toEqual([
        setup.schema.items.A1.fullName,
        setup.schema.items.A2.fullName,
        setup.schema.items.Derived.fullName,
      ]);

      const values = await collect(getDistinctFieldValues({ imodelAccess, field }));

      expect(values.slice().sort()).toEqual(["onlyDerived", "shared"].sort());
      expect(values).toHaveLength(2);
    });

    it("excludes sibling subclasses absent from the field's resolved classes when collapsing onto a shared base", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="Base">
              <ECCustomAttributes>
                <ClassMap xmlns="ECDbMap.02.00.01">
                  <MapStrategy>TablePerHierarchy</MapStrategy>
                </ClassMap>
              </ECCustomAttributes>
              <ECProperty propertyName="PropBase" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="A1">
              <BaseClass>Base</BaseClass>
            </ECEntityClass>
            <ECEntityClass typeName="A2">
              <BaseClass>Base</BaseClass>
            </ECEntityClass>
            <ECEntityClass typeName="A3">
              <BaseClass>Base</BaseClass>
            </ECEntityClass>
          `,
        );
        const a1 = builder.insertInstance(s.items.A1.fullName, { propBase: "fromA1" });
        const a3 = builder.insertInstance(s.items.A3.fullName, { propBase: "fromA3" });
        // `A2` has data too, and `Base`'s polymorphic `FROM` reaches it — but it is deliberately left
        // out of the descriptor's scope below, so its value must never reach the results.
        builder.insertInstance(s.items.A2.fullName, { propBase: "fromA2" });
        return { schema: s, a1, a3 };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      // Scoping the descriptor to only `A1`/`A3` instances resolves the field to just those two
      // classes, even though the target class `Base` has a third subclass carrying data.
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.Base.fullName, instanceIds: [setup.a1.id, setup.a3.id] }],
      });
      const field = getPropertyFieldByName(descriptor, "PropBase");
      expect(field.primaryClassNames).toEqual([setup.schema.items.A1.fullName, setup.schema.items.A3.fullName]);

      const values = await collect(getDistinctFieldValues({ imodelAccess, field }));

      // `A1` and `A3` collapse onto their shared base `Base`, whose polymorphic `FROM` also reaches
      // `A2` — so only the class restriction keeps `"fromA2"` out.
      expect(values.slice().sort()).toEqual(["fromA1", "fromA3"].sort());
      expect(values).not.toContain("fromA2");
    });

    it("returns distinct values for a mixin-declared property shared by sibling classes under a common base", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="Base" modifier="Abstract">
              <ECCustomAttributes>
                <ClassMap xmlns="ECDbMap.02.00.01">
                  <MapStrategy>TablePerHierarchy</MapStrategy>
                </ClassMap>
              </ECCustomAttributes>
            </ECEntityClass>
            <ECEntityClass typeName="IShared" modifier="Abstract">
              <ECCustomAttributes>
                <IsMixin xmlns="CoreCustomAttributes.01.00.04">
                  <AppliesToEntityClass>Base</AppliesToEntityClass>
                </IsMixin>
              </ECCustomAttributes>
              <ECProperty propertyName="SharedProp" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="A1">
              <BaseClass>Base</BaseClass>
              <BaseClass>IShared</BaseClass>
            </ECEntityClass>
            <ECEntityClass typeName="A2">
              <BaseClass>Base</BaseClass>
              <BaseClass>IShared</BaseClass>
            </ECEntityClass>
          `,
        );
        // `A1` and `A2` share both the base class `Base` and the mixin `IShared`, but `Base` itself
        // does not implement the mixin — so `SharedProp` is not addressable from it.
        builder.insertInstance(s.items.A1.fullName, { sharedProp: "fromA1" });
        builder.insertInstance(s.items.A1.fullName, { sharedProp: "shared" });
        builder.insertInstance(s.items.A2.fullName, { sharedProp: "shared" });
        builder.insertInstance(s.items.A2.fullName, { sharedProp: undefined });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.Base.fullName }],
      });
      const field = getPropertyFieldByName(descriptor, "SharedProp");
      expect(field.primaryClassNames).toEqual([setup.schema.items.A1.fullName, setup.schema.items.A2.fullName]);

      const values = await collect(getDistinctFieldValues({ imodelAccess, field }));

      // Values are merged and de-duplicated across both implementers, NULL included.
      expect(values.slice().sort()).toEqual([undefined, "fromA1", "shared"].sort());
      expect(values).toHaveLength(3);
    });
  });
});
