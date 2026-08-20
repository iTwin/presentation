/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createHiddenSchemaMembersDescriptorTransformer,
  defineIModelFieldsProvider,
} from "@itwin/presentation-content";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import {
  buildDescriptor,
  createContentIModelAccess,
  getPropertyFieldByName,
  getRelatedPropertyFieldsByPath,
} from "./Utils.js";

import type { RelationshipPath } from "@itwin/presentation-shared";

describe("Content", () => {
  describe("Hidden schema members", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("hides a property declared by a hidden base class but keeps ancestor and explicitly shown descendant properties visible", async () => {
      // A (visible, own property)
      //  └─ BHidden (HiddenClass, own property)
      //      ├─ C (no own property)
      //      └─ DShown (HiddenClass Show=true, own property)
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="BHidden">
              <BaseClass>A</BaseClass>
              <ECCustomAttributes>
                <HiddenClass xmlns="CoreCustomAttributes.01.00.03" />
              </ECCustomAttributes>
              <ECProperty propertyName="PropB" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="C">
              <BaseClass>BHidden</BaseClass>
            </ECEntityClass>
            <ECEntityClass typeName="DShown">
              <BaseClass>BHidden</BaseClass>
              <ECCustomAttributes>
                <HiddenClass xmlns="CoreCustomAttributes.01.00.03">
                  <Show>true</Show>
                </HiddenClass>
              </ECCustomAttributes>
              <ECProperty propertyName="PropD" typeName="string" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.C.fullName, { propA: "a-c", propB: "b-c" });
        builder.insertInstance(s.items.DShown.fullName, { propA: "a-d", propB: "b-d", propD: "d" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { descriptorTransformers: [createHiddenSchemaMembersDescriptorTransformer()] },
      });

      // `A`'s own property is not affected by `BHidden` being hidden — it stays visible for both leaves.
      const propA = getPropertyFieldByName(descriptor, "PropA");
      expect(propA.hidden).toBeUndefined();
      expect(propA.propertyClassName).toBe(setup.schema.items.A.fullName);
      expect([...propA.valueClassNames].sort()).toEqual(
        [setup.schema.items.C.fullName, setup.schema.items.DShown.fullName].sort(),
      );

      // `BHidden`'s own property is hidden for every class that inherits it, including `DShown`
      // (an explicitly shown leaf) — visibility is decided by the property's declaring class only.
      const propB = getPropertyFieldByName(descriptor, "PropB");
      expect(propB.hidden).toBe(true);
      expect(propB.propertyClassName).toBe(setup.schema.items.BHidden.fullName);
      expect([...propB.valueClassNames].sort()).toEqual(
        [setup.schema.items.C.fullName, setup.schema.items.DShown.fullName].sort(),
      );

      // `DShown`'s own property is declared by an explicitly-shown class, so it stays visible.
      const propD = getPropertyFieldByName(descriptor, "PropD");
      expect(propD.hidden).toBeUndefined();
      expect(propD.propertyClassName).toBe(setup.schema.items.DShown.fullName);
      expect(propD.valueClassNames).toEqual([setup.schema.items.DShown.fullName]);
    });

    it("hides properties of a schema-hidden class while an explicitly shown class in the same schema stays visible", async () => {
      // HiddenSchema
      //  ├─ A (own property, no class-level override)
      //  └─ BShown (HiddenClass Show=true, own property)
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECCustomAttributes>
              <HiddenSchema xmlns="CoreCustomAttributes.01.00.03" />
            </ECCustomAttributes>
            <ECEntityClass typeName="A">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="BShown">
              <ECCustomAttributes>
                <HiddenClass xmlns="CoreCustomAttributes.01.00.03">
                  <Show>true</Show>
                </HiddenClass>
              </ECCustomAttributes>
              <ECProperty propertyName="PropB" typeName="string" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.A.fullName, { propA: "a" });
        builder.insertInstance(s.items.BShown.fullName, { propB: "b" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const config = { descriptorTransformers: [createHiddenSchemaMembersDescriptorTransformer()] };

      const descriptorA = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config,
      });
      const propA = getPropertyFieldByName(descriptorA, "PropA");
      expect(propA.hidden).toBe(true);

      const descriptorB = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.BShown.fullName }],
        config,
      });
      const propB = getPropertyFieldByName(descriptorB, "PropB");
      expect(propB.hidden).toBeUndefined();
    });

    it("hides related-property fields via both HiddenClass and HiddenProperty while keeping unrelated inherited properties visible", async () => {
      // A --RelB--> BHidden (extends RelatedBase, HiddenClass, own property P1)
      //   └─RelC--> C         (extends RelatedBase, own property P2 with HiddenProperty)
      // RelatedBase declares a domain property inherited (unaffected) by both related classes.
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="RelatedBase">
              <ECProperty propertyName="Description" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="A">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="BHidden">
              <BaseClass>RelatedBase</BaseClass>
              <ECCustomAttributes>
                <HiddenClass xmlns="CoreCustomAttributes.01.00.03" />
              </ECCustomAttributes>
              <ECProperty propertyName="P1" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="C">
              <BaseClass>RelatedBase</BaseClass>
              <ECProperty propertyName="P2" typeName="string">
                <ECCustomAttributes>
                  <HiddenProperty xmlns="CoreCustomAttributes.01.00.03" />
                </ECCustomAttributes>
              </ECProperty>
            </ECEntityClass>
            <ECRelationshipClass typeName="RelB" strength="referencing" modifier="None">
              <Source multiplicity="(0..*)" roleLabel="a to bHidden" polymorphic="true">
                <Class class="A" />
              </Source>
              <Target multiplicity="(0..*)" roleLabel="bHidden to a" polymorphic="true">
                <Class class="BHidden" />
              </Target>
            </ECRelationshipClass>
            <ECRelationshipClass typeName="RelC" strength="referencing" modifier="None">
              <Source multiplicity="(0..*)" roleLabel="a to c" polymorphic="true">
                <Class class="A" />
              </Source>
              <Target multiplicity="(0..*)" roleLabel="c to a" polymorphic="true">
                <Class class="C" />
              </Target>
            </ECRelationshipClass>
          `,
        );
        const a = builder.insertInstance(s.items.A.fullName, { propA: "a" });
        const bHidden = builder.insertInstance(s.items.BHidden.fullName, { description: "b-desc", p1: "p1" });
        const c = builder.insertInstance(s.items.C.fullName, { description: "c-desc", p2: "p2" });
        builder.insertRelationship(s.items.RelB.fullName, a.id, bHidden.id);
        builder.insertRelationship(s.items.RelC.fullName, a.id, c.id);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const pathToBHidden: RelationshipPath = [
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.BHidden.fullName,
          relationshipName: setup.schema.items.RelB.fullName,
        },
      ];
      const pathToC: RelationshipPath = [
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.C.fullName,
          relationshipName: setup.schema.items.RelC.fullName,
        },
      ];
      const provider = defineIModelFieldsProvider({
        id: "provider_v1",
        async getContribution() {
          return { relatedProperties: [{ path: pathToBHidden }, { path: pathToC }] };
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: {
          imodelFieldsProviders: [provider],
          descriptorTransformers: [createHiddenSchemaMembersDescriptorTransformer()],
        },
      });

      // `BHidden.P1` is hidden because its property source class (`BHidden`) has `HiddenClass`.
      const p1 = getRelatedPropertyFieldsByPath(descriptor, pathToBHidden).find((f) => f.propertyName === "P1");
      expect(p1).toBeDefined();
      expect(p1!.hidden).toBe(true);

      // `C.P2` is hidden because the property itself has `HiddenProperty`.
      const p2 = getRelatedPropertyFieldsByPath(descriptor, pathToC).find((f) => f.propertyName === "P2");
      expect(p2).toBeDefined();
      expect(p2!.hidden).toBe(true);

      // `Description` is inherited from the (non-hidden) `RelatedBase` on both related paths, so it
      // stays visible for both `BHidden` and `C`, even though `BHidden` itself is hidden.
      const descriptionViaB = getRelatedPropertyFieldsByPath(descriptor, pathToBHidden).find(
        (f) => f.propertyName === "Description",
      );
      expect(descriptionViaB).toBeDefined();
      expect(descriptionViaB!.hidden).toBeUndefined();

      const descriptionViaC = getRelatedPropertyFieldsByPath(descriptor, pathToC).find(
        (f) => f.propertyName === "Description",
      );
      expect(descriptionViaC).toBeDefined();
      expect(descriptionViaC!.hidden).toBeUndefined();
    });

    it("hides a link-table relationship-class property marked HiddenProperty while a related target property stays visible", async () => {
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
              <ECProperty propertyName="P1" typeName="string">
                <ECCustomAttributes>
                  <HiddenProperty xmlns="CoreCustomAttributes.01.00.03" />
                </ECCustomAttributes>
              </ECProperty>
              <Source multiplicity="(0..*)" roleLabel="a to b" polymorphic="true">
                <Class class="A" />
              </Source>
              <Target multiplicity="(0..*)" roleLabel="b to a" polymorphic="true">
                <Class class="B" />
              </Target>
            </ECRelationshipClass>
          `,
        );
        const a = builder.insertInstance(s.items.A.fullName, { propA: "a" });
        const b = builder.insertInstance(s.items.B.fullName, { propB: "b" });
        builder.insertRelationship(s.items.AtoB.fullName, a.id, b.id, { p1: "p1" });
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
      const declaration = {
        path,
        properties: [{ stepIndex: 0, target: { select: "all" as const }, relationship: { select: "all" as const } }],
      };
      const provider = defineIModelFieldsProvider({
        id: "provider_v1",
        async getContribution() {
          return { relatedProperties: [declaration] };
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: {
          imodelFieldsProviders: [provider],
          descriptorTransformers: [createHiddenSchemaMembersDescriptorTransformer()],
        },
      });

      const relatedFields = getRelatedPropertyFieldsByPath(descriptor, path);

      const p1 = relatedFields.find((f) => f.propertyName === "P1");
      expect(p1).toBeDefined();
      expect(p1!.propertyClassName).toBe(setup.schema.items.AtoB.fullName);
      expect(p1!.hidden).toBe(true);

      const propB = relatedFields.find((f) => f.propertyName === "PropB");
      expect(propB).toBeDefined();
      expect(propB!.propertyClassName).toBe(setup.schema.items.B.fullName);
      expect(propB!.hidden).toBeUndefined();
    });
  });
});
