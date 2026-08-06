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
  getPropertyFieldByName,
  getPropertyFieldsByName,
  getRelatedPropertyFields,
  getRelatedPropertyFieldsByPath,
} from "./Utils.js";

import type { RelationshipPath } from "@itwin/presentation-shared";

describe("Content", () => {
  describe("Related properties", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("adds a single-step related property field", async () => {
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
        const a = builder.insertInstance(s.items.A.fullName, { propA: "a" });
        const b = builder.insertInstance(s.items.B.fullName, { propB: "b" });
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

      const related = getRelatedPropertyFields(descriptor);
      const propB = related.find((f) => f.propertyName === "PropB");
      expect(propB).toBeDefined();
      expect(propB!.propertyClassName).toBe(setup.schema.items.B.fullName);
      expect(propB!.pathFromTarget).toEqual(path);
      expect(propB!.valueClassNames).toEqual([setup.schema.items.B.fullName]);
    });

    it("adds multi-step related property fields", async () => {
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
            <ECEntityClass typeName="C">
              <ECProperty propertyName="PropC" typeName="string" />
            </ECEntityClass>
            <ECRelationshipClass typeName="AtoB" strength="referencing" modifier="None">
              <Source multiplicity="(0..*)" roleLabel="a to b" polymorphic="true">
                <Class class="A" />
              </Source>
              <Target multiplicity="(0..*)" roleLabel="b to a" polymorphic="true">
                <Class class="B" />
              </Target>
            </ECRelationshipClass>
            <ECRelationshipClass typeName="BtoC" strength="referencing" modifier="None">
              <Source multiplicity="(0..*)" roleLabel="b to c" polymorphic="true">
                <Class class="B" />
              </Source>
              <Target multiplicity="(0..*)" roleLabel="c to b" polymorphic="true">
                <Class class="C" />
              </Target>
            </ECRelationshipClass>
          `,
        );
        const a = builder.insertInstance(s.items.A.fullName, { propA: "a" });
        const b = builder.insertInstance(s.items.B.fullName, { propB: "b" });
        const c = builder.insertInstance(s.items.C.fullName, { propC: "c" });
        builder.insertRelationship(s.items.AtoB.fullName, a.id, b.id);
        builder.insertRelationship(s.items.BtoC.fullName, b.id, c.id);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const path: RelationshipPath = [
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.B.fullName,
          relationshipName: setup.schema.items.AtoB.fullName,
        },
        {
          sourceClassName: setup.schema.items.B.fullName,
          targetClassName: setup.schema.items.C.fullName,
          relationshipName: setup.schema.items.BtoC.fullName,
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

      const propC = getRelatedPropertyFields(descriptor).find((f) => f.propertyName === "PropC");
      expect(propC).toBeDefined();
      expect(propC!.pathFromTarget).toEqual(path);
      expect(propC!.propertyClassName).toBe(setup.schema.items.C.fullName);
    });

    it("loads only the properties opted in by a step spec", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <ECProperty propertyName="Keep" typeName="string" />
              <ECProperty propertyName="Drop" typeName="string" />
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
        const a = builder.insertInstance(s.items.A.fullName, { propA: "a" });
        const b = builder.insertInstance(s.items.B.fullName, { keep: "k", drop: "d" });
        builder.insertRelationship(s.items.AtoB.fullName, a.id, b.id);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const declaration = {
        path: [
          {
            sourceClassName: setup.schema.items.A.fullName,
            targetClassName: setup.schema.items.B.fullName,
            relationshipName: setup.schema.items.AtoB.fullName,
          },
        ],
        properties: [{ stepIndex: 0, target: { select: { include: ["Keep"] } } }],
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
        config: { imodelFieldsProviders: [provider] },
      });

      expect(getPropertyFieldByName(descriptor, "Keep").pathFromTarget).toEqual(declaration.path);
      expect(getPropertyFieldsByName(descriptor, "Drop")).toHaveLength(0);
    });

    it("loads relationship-class properties", async () => {
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
              <ECProperty propertyName="RelProp" typeName="string" />
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
        builder.insertRelationship(s.items.AtoB.fullName, a.id, b.id, { relProp: "r" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const declaration = {
        path: [
          {
            sourceClassName: setup.schema.items.A.fullName,
            targetClassName: setup.schema.items.B.fullName,
            relationshipName: setup.schema.items.AtoB.fullName,
          },
        ],
        properties: [{ stepIndex: 0, relationship: { select: "all" as const } }],
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
        config: { imodelFieldsProviders: [provider] },
      });

      const relProp = getRelatedPropertyFields(descriptor).find((f) => f.propertyName === "RelProp");
      expect(relProp).toBeDefined();
      expect(relProp!.propertyClassName).toBe(setup.schema.items.AtoB.fullName);
      expect(relProp!.pathFromTarget).toEqual(declaration.path);
      expect(relProp!.valueClassNames).toEqual([setup.schema.items.AtoB.fullName]);
    });

    it("loads no target properties with per-step select none", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <ECProperty propertyName="Keep" typeName="string" />
              <ECProperty propertyName="Drop" typeName="string" />
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
        const a = builder.insertInstance(s.items.A.fullName, { propA: "a" });
        const b = builder.insertInstance(s.items.B.fullName, { keep: "k", drop: "d" });
        builder.insertRelationship(s.items.AtoB.fullName, a.id, b.id);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const declaration = {
        path: [
          {
            sourceClassName: setup.schema.items.A.fullName,
            targetClassName: setup.schema.items.B.fullName,
            relationshipName: setup.schema.items.AtoB.fullName,
          },
        ],
        properties: [{ stepIndex: 0, target: { select: "none" as const } }],
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
        config: { imodelFieldsProviders: [provider] },
      });

      expect(getPropertyFieldsByName(descriptor, "Keep")).toHaveLength(0);
      expect(getPropertyFieldsByName(descriptor, "Drop")).toHaveLength(0);
    });

    it("excludes named properties with per-step select exclude", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <ECProperty propertyName="Keep" typeName="string" />
              <ECProperty propertyName="Drop" typeName="string" />
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
        const a = builder.insertInstance(s.items.A.fullName, { propA: "a" });
        const b = builder.insertInstance(s.items.B.fullName, { keep: "k", drop: "d" });
        builder.insertRelationship(s.items.AtoB.fullName, a.id, b.id);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const declaration = {
        path: [
          {
            sourceClassName: setup.schema.items.A.fullName,
            targetClassName: setup.schema.items.B.fullName,
            relationshipName: setup.schema.items.AtoB.fullName,
          },
        ],
        properties: [{ stepIndex: 0, target: { select: { exclude: ["Drop"] } } }],
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
        config: { imodelFieldsProviders: [provider] },
      });

      expect(getPropertyFieldByName(descriptor, "Keep").pathFromTarget).toEqual(declaration.path);
      expect(getPropertyFieldsByName(descriptor, "Drop")).toHaveLength(0);
    });

    it("produces no related field for a related class with no instances", async () => {
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
        builder.insertInstance(s.items.A.fullName, { propA: "a" });
        builder.insertInstance(s.items.B.fullName, { propB: "b" });
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

      expect(getRelatedPropertyFields(descriptor).find((f) => f.propertyName === "PropB")).toBeUndefined();
    });

    it("creates related fields for multiple concrete relationship paths", async () => {
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
            <ECEntityClass typeName="C">
              <ECProperty propertyName="PropC" typeName="string" />
            </ECEntityClass>
            <ECRelationshipClass typeName="AtoB" strength="referencing" modifier="None">
              <Source multiplicity="(0..*)" roleLabel="a to b" polymorphic="true">
                <Class class="A" />
              </Source>
              <Target multiplicity="(0..*)" roleLabel="b to a" polymorphic="true">
                <Class class="B" />
              </Target>
            </ECRelationshipClass>
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
        const a = builder.insertInstance(s.items.A.fullName, { propA: "a" });
        const b = builder.insertInstance(s.items.B.fullName, { propB: "b" });
        const c = builder.insertInstance(s.items.C.fullName, { propC: "c" });
        builder.insertRelationship(s.items.AtoB.fullName, a.id, b.id);
        builder.insertRelationship(s.items.AtoC.fullName, a.id, c.id);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const pathToB: RelationshipPath = [
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.B.fullName,
          relationshipName: setup.schema.items.AtoB.fullName,
        },
      ];
      const pathToC: RelationshipPath = [
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.C.fullName,
          relationshipName: setup.schema.items.AtoC.fullName,
        },
      ];
      const provider = defineIModelFieldsProvider({
        id: "provider_v1",
        async getContribution() {
          return { relatedProperties: [{ path: pathToB }, { path: pathToC }] };
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { imodelFieldsProviders: [provider] },
      });

      const related = getRelatedPropertyFields(descriptor);
      const propB = related.find((f) => f.propertyName === "PropB");
      const propC = related.find((f) => f.propertyName === "PropC");
      expect(propB?.pathFromTarget).toEqual(pathToB);
      expect(propC?.pathFromTarget).toEqual(pathToC);
    });

    it("adds a related property field reached by traversing a relationship backwards", async () => {
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
            <ECRelationshipClass typeName="BtoA" strength="referencing" modifier="None">
              <Source multiplicity="(0..*)" roleLabel="b to a" polymorphic="true">
                <Class class="B" />
              </Source>
              <Target multiplicity="(0..*)" roleLabel="a to b" polymorphic="true">
                <Class class="A" />
              </Target>
            </ECRelationshipClass>
          `,
        );
        const a = builder.insertInstance(s.items.A.fullName, { propA: "a" });
        const b = builder.insertInstance(s.items.B.fullName, { propB: "b" });
        builder.insertRelationship(s.items.BtoA.fullName, b.id, a.id);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      // The `BtoA` relationship points from `B` to `A`, so to load `B`'s properties for `A` content we
      // traverse it backwards: the step starts at `A`, reaches `B`, and sets `relationshipReverse`.
      const path: RelationshipPath = [
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.B.fullName,
          relationshipName: setup.schema.items.BtoA.fullName,
          relationshipReverse: true,
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

      const propB = getRelatedPropertyFields(descriptor).find((f) => f.propertyName === "PropB");
      expect(propB).toBeDefined();
      expect(propB!.propertyClassName).toBe(setup.schema.items.B.fullName);
      expect(propB!.pathFromTarget).toEqual([
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.B.fullName,
          relationshipName: setup.schema.items.BtoA.fullName,
          relationshipReverse: true,
        },
      ]);
      expect(propB!.valueClassNames).toEqual([setup.schema.items.B.fullName]);
    });

    it("discovers all derived target classes and creates a field per concrete subclass", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <ECCustomAttributes>
                <ClassMap xmlns="ECDbMap.02.00.01">
                  <MapStrategy>TablePerHierarchy</MapStrategy>
                </ClassMap>
              </ECCustomAttributes>
              <ECProperty propertyName="SharedProp" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B1">
              <BaseClass>B</BaseClass>
              <ECProperty propertyName="Prop1" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B2">
              <BaseClass>B</BaseClass>
              <ECProperty propertyName="Prop2" typeName="string" />
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
        const a = builder.insertInstance(s.items.A.fullName, { propA: "a" });
        const b1 = builder.insertInstance(s.items.B1.fullName, { sharedProp: "s1", prop1: "p1" });
        const b2 = builder.insertInstance(s.items.B2.fullName, { sharedProp: "s2", prop2: "p2" });
        builder.insertRelationship(s.items.AtoB.fullName, a.id, b1.id);
        builder.insertRelationship(s.items.AtoB.fullName, a.id, b2.id);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      // The path targets the *base* class `B`; resolution should discover the concrete `B1`/`B2`
      // subclasses present in the data.
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

      // The single declaration resolves to one concrete path per discovered subclass.
      expect(descriptor.sources).toHaveLength(1);
      const resolvedDeclarations = descriptor.sources[0].resolvedDeclarations;
      expect(resolvedDeclarations).toHaveLength(1);
      const resolvedPaths = resolvedDeclarations[0].paths.map((p) => p.path);
      expect(resolvedPaths).toHaveLength(2);
      expect(resolvedPaths).toEqual([
        [
          {
            sourceClassName: setup.schema.items.A.fullName,
            targetClassName: setup.schema.items.B1.fullName,
            relationshipName: setup.schema.items.AtoB.fullName,
          },
        ],
        [
          {
            sourceClassName: setup.schema.items.A.fullName,
            targetClassName: setup.schema.items.B2.fullName,
            relationshipName: setup.schema.items.AtoB.fullName,
          },
        ],
      ]);

      // The base-declared `SharedProp` yields a separate field per concrete subclass, each carrying the
      // concrete path to its subclass.
      const sharedFields = getPropertyFieldsByName(descriptor, "SharedProp");
      expect(sharedFields).toHaveLength(2);
      expect(sharedFields[0].valueClassNames).toEqual([setup.schema.items.B1.fullName]);
      expect(sharedFields[1].valueClassNames).toEqual([setup.schema.items.B2.fullName]);

      expect(sharedFields[0].pathFromTarget).toEqual([
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.B1.fullName,
          relationshipName: setup.schema.items.AtoB.fullName,
        },
      ]);
      expect(sharedFields[1].pathFromTarget).toEqual([
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.B2.fullName,
          relationshipName: setup.schema.items.AtoB.fullName,
        },
      ]);

      // Subclass-specific properties are discovered on their respective concrete classes.
      const prop1Field = getPropertyFieldByName(descriptor, "Prop1");
      expect(prop1Field.valueClassNames).toEqual([setup.schema.items.B1.fullName]);
      expect(prop1Field.pathFromTarget).toEqual([
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.B1.fullName,
          relationshipName: setup.schema.items.AtoB.fullName,
        },
      ]);

      const prop2Field = getPropertyFieldByName(descriptor, "Prop2");
      expect(prop2Field.valueClassNames).toEqual([setup.schema.items.B2.fullName]);
      expect(prop2Field.pathFromTarget).toEqual([
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.B2.fullName,
          relationshipName: setup.schema.items.AtoB.fullName,
        },
      ]);
    });

    it("resolves a base relationship in the declared path to the concrete derived relationship", async () => {
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
            <ECRelationshipClass typeName="A_B" strength="referencing" modifier="None">
              <Source multiplicity="(0..*)" roleLabel="a to b" polymorphic="true">
                <Class class="A" />
              </Source>
              <Target multiplicity="(0..*)" roleLabel="b to a" polymorphic="true">
                <Class class="B" />
              </Target>
            </ECRelationshipClass>
            <ECRelationshipClass typeName="A_B_Derived" strength="referencing" modifier="None">
              <BaseClass>A_B</BaseClass>
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
        // The data uses the *derived* relationship class.
        builder.insertRelationship(s.items.A_B_Derived.fullName, a.id, b.id);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const path: RelationshipPath = [
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.B.fullName,
          relationshipName: setup.schema.items.A_B.fullName,
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

      const propB = getRelatedPropertyFields(descriptor).find((f) => f.propertyName === "PropB");
      expect(propB?.propertyClassName).toBe(setup.schema.items.B.fullName);
      expect(propB?.pathFromTarget).toEqual([
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.B.fullName,
          relationshipName: setup.schema.items.A_B_Derived.fullName,
        },
      ]);
      expect(propB?.valueClassNames).toEqual([setup.schema.items.B.fullName]);
    });

    it("resolves a polymorphic middle step to each concrete intermediate class", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <ECCustomAttributes>
                <ClassMap xmlns="ECDbMap.02.00.01">
                  <MapStrategy>TablePerHierarchy</MapStrategy>
                </ClassMap>
              </ECCustomAttributes>
              <ECProperty propertyName="PropB" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B1">
              <BaseClass>B</BaseClass>
            </ECEntityClass>
            <ECEntityClass typeName="B2">
              <BaseClass>B</BaseClass>
            </ECEntityClass>
            <ECEntityClass typeName="C">
              <ECProperty propertyName="PropC" typeName="string" />
            </ECEntityClass>
            <ECRelationshipClass typeName="AtoB" strength="referencing" modifier="None">
              <Source multiplicity="(0..*)" roleLabel="a to b" polymorphic="true">
                <Class class="A" />
              </Source>
              <Target multiplicity="(0..*)" roleLabel="b to a" polymorphic="true">
                <Class class="B" />
              </Target>
            </ECRelationshipClass>
            <ECRelationshipClass typeName="BtoC" strength="referencing" modifier="None">
              <Source multiplicity="(0..*)" roleLabel="b to c" polymorphic="true">
                <Class class="B" />
              </Source>
              <Target multiplicity="(0..*)" roleLabel="c to b" polymorphic="true">
                <Class class="C" />
              </Target>
            </ECRelationshipClass>
          `,
        );
        const a = builder.insertInstance(s.items.A.fullName, { propA: "a" });
        const b1 = builder.insertInstance(s.items.B1.fullName, { propB: "b1" });
        const b2 = builder.insertInstance(s.items.B2.fullName, { propB: "b2" });
        const c = builder.insertInstance(s.items.C.fullName, { propC: "c" });
        builder.insertRelationship(s.items.AtoB.fullName, a.id, b1.id);
        builder.insertRelationship(s.items.AtoB.fullName, a.id, b2.id);
        builder.insertRelationship(s.items.BtoC.fullName, b1.id, c.id);
        builder.insertRelationship(s.items.BtoC.fullName, b2.id, c.id);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      // Two-step path whose middle step targets the *base* class `B`.
      const path: RelationshipPath = [
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.B.fullName,
          relationshipName: setup.schema.items.AtoB.fullName,
        },
        {
          sourceClassName: setup.schema.items.B.fullName,
          targetClassName: setup.schema.items.C.fullName,
          relationshipName: setup.schema.items.BtoC.fullName,
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

      // The polymorphic middle step resolves to `B1` and `B2`, producing a `PropC` field per concrete
      // intermediate class, each carrying its full concrete two-step path.
      const propCFields = getPropertyFieldsByName(descriptor, "PropC");
      expect(propCFields).toHaveLength(2);
      expect(propCFields[0].valueClassNames).toEqual([setup.schema.items.C.fullName]);
      expect(propCFields[1].valueClassNames).toEqual([setup.schema.items.C.fullName]);

      expect(propCFields[0].pathFromTarget).toEqual([
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.B1.fullName,
          relationshipName: setup.schema.items.AtoB.fullName,
        },
        {
          sourceClassName: setup.schema.items.B1.fullName,
          targetClassName: setup.schema.items.C.fullName,
          relationshipName: setup.schema.items.BtoC.fullName,
        },
      ]);
      expect(propCFields[1].pathFromTarget).toEqual([
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.B2.fullName,
          relationshipName: setup.schema.items.AtoB.fullName,
        },
        {
          sourceClassName: setup.schema.items.B2.fullName,
          targetClassName: setup.schema.items.C.fullName,
          relationshipName: setup.schema.items.BtoC.fullName,
        },
      ]);
    });

    it("keeps separate fields for different-length paths sharing a first step", async () => {
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
            <ECEntityClass typeName="C">
              <ECProperty propertyName="PropC" typeName="string" />
            </ECEntityClass>
            <ECRelationshipClass typeName="AtoB" strength="referencing" modifier="None">
              <Source multiplicity="(0..*)" roleLabel="a to b" polymorphic="true">
                <Class class="A" />
              </Source>
              <Target multiplicity="(0..*)" roleLabel="b to a" polymorphic="true">
                <Class class="B" />
              </Target>
            </ECRelationshipClass>
            <ECRelationshipClass typeName="BtoC" strength="referencing" modifier="None">
              <Source multiplicity="(0..*)" roleLabel="b to c" polymorphic="true">
                <Class class="B" />
              </Source>
              <Target multiplicity="(0..*)" roleLabel="c to b" polymorphic="true">
                <Class class="C" />
              </Target>
            </ECRelationshipClass>
          `,
        );
        const a = builder.insertInstance(s.items.A.fullName, { propA: "a" });
        const b = builder.insertInstance(s.items.B.fullName, { propB: "b" });
        const c = builder.insertInstance(s.items.C.fullName, { propC: "c" });
        builder.insertRelationship(s.items.AtoB.fullName, a.id, b.id);
        builder.insertRelationship(s.items.BtoC.fullName, b.id, c.id);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const shortPath: RelationshipPath = [
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.B.fullName,
          relationshipName: setup.schema.items.AtoB.fullName,
        },
      ];
      const longPath: RelationshipPath = [
        ...shortPath,
        {
          sourceClassName: setup.schema.items.B.fullName,
          targetClassName: setup.schema.items.C.fullName,
          relationshipName: setup.schema.items.BtoC.fullName,
        },
      ];
      const provider = defineIModelFieldsProvider({
        id: "provider_v1",
        async getContribution() {
          // Two declarations that share their first step but differ in length.
          return { relatedProperties: [{ path: shortPath }, { path: longPath }] };
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { imodelFieldsProviders: [provider] },
      });

      const propBFields = getRelatedPropertyFieldsByPath(descriptor, shortPath);
      expect(propBFields).toHaveLength(1);
      expect(propBFields[0].propertyName).toBe("PropB");
      expect(propBFields[0].pathFromTarget).toEqual(shortPath);

      const propCFields = getRelatedPropertyFieldsByPath(descriptor, longPath);
      expect(propCFields).toHaveLength(1);
      expect(propCFields[0].propertyName).toBe("PropC");
      expect(propCFields[0].pathFromTarget).toEqual(longPath);

      expect(propBFields[0].id).not.toBe(propCFields[0].id);
    });

    it("loads both target and relationship-class properties for a step", async () => {
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
              <ECProperty propertyName="RelProp" typeName="string" />
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
        builder.insertRelationship(s.items.AtoB.fullName, a.id, b.id, { relProp: "r" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const expectedPath: RelationshipPath = [
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.B.fullName,
          relationshipName: setup.schema.items.AtoB.fullName,
        },
      ];
      const declaration = {
        path: expectedPath,
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
        config: { imodelFieldsProviders: [provider] },
      });

      const propB = getRelatedPropertyFields(descriptor).find((f) => f.propertyName === "PropB");
      expect(propB).toBeDefined();
      expect(propB!.propertyClassName).toBe(setup.schema.items.B.fullName);
      expect(propB!.valueClassNames).toEqual([setup.schema.items.B.fullName]);
      expect(propB!.pathFromTarget).toEqual(expectedPath);

      const relProp = getRelatedPropertyFields(descriptor).find((f) => f.propertyName === "RelProp");
      expect(relProp).toBeDefined();
      expect(relProp!.propertyClassName).toBe(setup.schema.items.AtoB.fullName);
      expect(relProp!.valueClassNames).toEqual([setup.schema.items.AtoB.fullName]);
      expect(relProp!.pathFromTarget).toEqual(expectedPath);

      expect(propB!.id).not.toBe(relProp!.id);
    });

    it("loads only relationship-class properties when the target selects none", async () => {
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
              <ECProperty propertyName="RelProp" typeName="string" />
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
        builder.insertRelationship(s.items.AtoB.fullName, a.id, b.id, { relProp: "r" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const expectedPath: RelationshipPath = [
        {
          sourceClassName: setup.schema.items.A.fullName,
          targetClassName: setup.schema.items.B.fullName,
          relationshipName: setup.schema.items.AtoB.fullName,
        },
      ];
      const declaration = {
        path: expectedPath,
        properties: [{ stepIndex: 0, target: { select: "none" as const }, relationship: { select: "all" as const } }],
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
        config: { imodelFieldsProviders: [provider] },
      });

      const relProp = getRelatedPropertyFields(descriptor).find((f) => f.propertyName === "RelProp");
      expect(relProp).toBeDefined();
      expect(relProp!.propertyClassName).toBe(setup.schema.items.AtoB.fullName);
      expect(relProp!.pathFromTarget).toEqual(expectedPath);
      // The target class contributes no fields.
      expect(getPropertyFieldsByName(descriptor, "PropB")).toHaveLength(0);
    });
  });
});
