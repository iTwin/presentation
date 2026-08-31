/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineIModelFieldsProvider, resolveContentSources } from "@itwin/presentation-content";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import { createContentIModelAccess } from "./Utils.js";

describe("Content", () => {
  describe("Source resolution", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("enumerates concrete subclasses present in data for a polymorphic target", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Prop" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <BaseClass>A</BaseClass>
            </ECEntityClass>
            <ECEntityClass typeName="C">
              <BaseClass>A</BaseClass>
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.B.fullName, { prop: "b" });
        builder.insertInstance(s.items.C.fullName, { prop: "c" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });
      expect(sources).toHaveLength(1);
      expect([...sources[0].resolvedPrimaryClasses].sort()).toEqual(
        [setup.schema.items.B.fullName, setup.schema.items.C.fullName].sort(),
      );
    });

    it("resolves empty primary classes when a polymorphic base has no instances", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A" modifier="Abstract">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <BaseClass>A</BaseClass>
            </ECEntityClass>
          `,
        );
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });

      expect(sources[0].resolvedPrimaryClasses).toEqual([]);
    });

    it("resolves a leaf class to itself", async () => {
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
        builder.insertInstance(s.items.A.fullName, { prop: "a" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });
      expect(sources[0].resolvedPrimaryClasses).toEqual([setup.schema.items.A.fullName]);
    });

    it("narrows enumerated classes by instanceIds", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Prop" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <BaseClass>A</BaseClass>
            </ECEntityClass>
            <ECEntityClass typeName="C">
              <BaseClass>A</BaseClass>
            </ECEntityClass>
          `,
        );
        const b = builder.insertInstance(s.items.B.fullName, { prop: "b" });
        builder.insertInstance(s.items.C.fullName, { prop: "c" });
        return { schema: s, b };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName, instanceIds: [setup.b.id] }],
      });
      expect(sources[0].resolvedPrimaryClasses).toEqual([setup.schema.items.B.fullName]);
    });

    it("narrows enumerated classes by instanceFilter", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Prop" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <BaseClass>A</BaseClass>
            </ECEntityClass>
            <ECEntityClass typeName="C">
              <BaseClass>A</BaseClass>
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.B.fullName, { prop: "keep" });
        builder.insertInstance(s.items.C.fullName, { prop: "drop" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [
          { primaryClass: setup.schema.items.A.fullName, instanceFilter: { expression: `this.Prop = 'keep'` } },
        ],
      });
      expect(sources[0].resolvedPrimaryClasses).toEqual([setup.schema.items.B.fullName]);
    });

    it("resolves a provider-declared relationship path to concrete classes", async () => {
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
        const b1 = builder.insertInstance(s.items.B1.fullName, { propB: "b" });
        builder.insertRelationship(s.items.AtoB.fullName, a.id, b1.id);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const provider = defineIModelFieldsProvider({
        id: "provider_v1",
        async getContribution() {
          return {
            relatedProperties: [
              {
                path: [
                  {
                    sourceClassName: setup.schema.items.A.fullName,
                    targetClassName: setup.schema.items.B.fullName,
                    relationshipName: setup.schema.items.AtoB.fullName,
                  },
                ],
              },
            ],
          };
        },
      });
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { imodelFieldsProviders: [provider] },
      });
      expect(sources[0].resolvedDeclarations).toHaveLength(1);
      const decl = sources[0].resolvedDeclarations[0];
      expect(decl.providerId).toBe("provider_v1");
      expect(decl.paths).toHaveLength(1);
      expect(decl.paths[0].path[0]).toMatchObject({
        sourceClassName: setup.schema.items.A.fullName,
        targetClassName: setup.schema.items.B1.fullName,
        relationshipName: setup.schema.items.AtoB.fullName,
      });
    });

    it("reports the concrete near-end source classes that connect to each resolved path", async () => {
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
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="A1"><BaseClass>A</BaseClass></ECEntityClass>
            <ECEntityClass typeName="A2"><BaseClass>A</BaseClass></ECEntityClass>
            <ECEntityClass typeName="A3"><BaseClass>A</BaseClass></ECEntityClass>
            <ECEntityClass typeName="A4"><BaseClass>A</BaseClass></ECEntityClass>
            <ECEntityClass typeName="B">
              <ECCustomAttributes>
                <ClassMap xmlns="ECDbMap.02.00.01">
                  <MapStrategy>TablePerHierarchy</MapStrategy>
                </ClassMap>
              </ECCustomAttributes>
              <ECProperty propertyName="SharedProp" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B1"><BaseClass>B</BaseClass></ECEntityClass>
            <ECEntityClass typeName="B2"><BaseClass>B</BaseClass></ECEntityClass>
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
        const a1 = builder.insertInstance(s.items.A1.fullName, { propA: "a1" });
        const a2 = builder.insertInstance(s.items.A2.fullName, { propA: "a2" });
        const a3 = builder.insertInstance(s.items.A3.fullName, { propA: "a3" });
        // `A4` has an instance but no relationship to any `B`.
        builder.insertInstance(s.items.A4.fullName, { propA: "a4" });
        const b1 = builder.insertInstance(s.items.B1.fullName, { sharedProp: "b1" });
        const b2x = builder.insertInstance(s.items.B2.fullName, { sharedProp: "b2x" });
        const b2y = builder.insertInstance(s.items.B2.fullName, { sharedProp: "b2y" });
        // Different `A` subclasses connect to different `B` subclasses.
        builder.insertRelationship(s.items.AtoB.fullName, a1.id, b1.id);
        builder.insertRelationship(s.items.AtoB.fullName, a2.id, b2x.id);
        builder.insertRelationship(s.items.AtoB.fullName, a3.id, b2y.id);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const provider = defineIModelFieldsProvider({
        id: "provider_v1",
        async getContribution() {
          return {
            relatedProperties: [
              {
                path: [
                  {
                    sourceClassName: setup.schema.items.A.fullName,
                    targetClassName: setup.schema.items.B.fullName,
                    relationshipName: setup.schema.items.AtoB.fullName,
                  },
                ],
              },
            ],
          };
        },
      });
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(sources).toHaveLength(1);
      // The primary scan discovers every concrete subclass with an instance, including the
      // unconnected `A4`.
      expect([...sources[0].resolvedPrimaryClasses].sort()).toEqual(
        [
          setup.schema.items.A1.fullName,
          setup.schema.items.A2.fullName,
          setup.schema.items.A3.fullName,
          setup.schema.items.A4.fullName,
        ].sort(),
      );

      expect(sources[0].resolvedDeclarations).toHaveLength(1);
      const paths = sources[0].resolvedDeclarations[0].paths;
      expect(paths).toHaveLength(2);

      const pathToB1 = paths.find((p) => p.path[p.path.length - 1].targetClassName === setup.schema.items.B1.fullName);
      const pathToB2 = paths.find((p) => p.path[p.path.length - 1].targetClassName === setup.schema.items.B2.fullName);

      // Only the near-end subclasses that actually connect to each path are reported; `A4` appears in
      // none of them.
      expect([...pathToB1!.targetClassNames].sort()).toEqual([setup.schema.items.A1.fullName].sort());
      expect([...pathToB2!.targetClassNames].sort()).toEqual(
        [setup.schema.items.A2.fullName, setup.schema.items.A3.fullName].sort(),
      );
    });

    it("excludes classes from enumeration via an instance filter class predicate", async () => {
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
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B"><BaseClass>A</BaseClass></ECEntityClass>
            <ECEntityClass typeName="C"><BaseClass>B</BaseClass></ECEntityClass>
            <ECEntityClass typeName="D"><BaseClass>C</BaseClass></ECEntityClass>
            <ECEntityClass typeName="E"><BaseClass>D</BaseClass></ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.A.fullName, { propA: "a" });
        builder.insertInstance(s.items.B.fullName, { propA: "b" });
        builder.insertInstance(s.items.C.fullName, { propA: "c" });
        builder.insertInstance(s.items.D.fullName, { propA: "d" });
        builder.insertInstance(s.items.E.fullName, { propA: "e" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [
          {
            primaryClass: setup.schema.items.A.fullName,
            // Exclude `B` exactly (ONLY) and `D` polymorphically (`D` and its subclass `E`), leaving
            // `A` and `C`.
            instanceFilter: {
              expression: `this.ECClassId IS NOT (ONLY ${setup.schema.items.B.fullName}, ${setup.schema.items.D.fullName})`,
            },
          },
        ],
      });

      expect([...sources[0].resolvedPrimaryClasses].sort()).toEqual(
        [setup.schema.items.A.fullName, setup.schema.items.C.fullName].sort(),
      );
    });

    it("resolves a serializable nested declaration group when a provider opts into applyRecursively", async () => {
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
      const providerA = defineIModelFieldsProvider({
        id: "providerA_v1",
        async getContribution({ target }) {
          if (target.primaryClass !== setup.schema.items.A.fullName) {
            return undefined;
          }
          return {
            relatedProperties: [
              {
                path: [
                  {
                    sourceClassName: setup.schema.items.A.fullName,
                    targetClassName: setup.schema.items.B.fullName,
                    relationshipName: setup.schema.items.AtoB.fullName,
                  },
                ],
              },
            ],
          };
        },
      });
      const providerB = defineIModelFieldsProvider({
        id: "providerB_v1",
        applyRecursively: true,
        async getContribution({ target }) {
          if (target.primaryClass !== setup.schema.items.B.fullName) {
            return undefined;
          }
          return {
            relatedProperties: [
              {
                path: [
                  {
                    sourceClassName: setup.schema.items.B.fullName,
                    targetClassName: setup.schema.items.C.fullName,
                    relationshipName: setup.schema.items.BtoC.fullName,
                  },
                ],
              },
            ],
          };
        },
      });

      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { imodelFieldsProviders: [providerA, providerB] },
      });

      expect(sources).toHaveLength(1);
      expect(sources[0].resolvedDeclarations).toHaveLength(2);

      const baseGroup = sources[0].resolvedDeclarations.find((g) => g.providerId === "providerA_v1")!;
      expect(baseGroup.nested).toBeUndefined();
      expect(baseGroup.paths).toHaveLength(1);

      const nestedGroup = sources[0].resolvedDeclarations.find((g) => g.providerId === "providerB_v1")!;
      expect(nestedGroup).toBeDefined();
      // The group's own shape is a plain, JSON-serializable object (no functions/classes) — a
      // `ContentSource` produced this way must remain cacheable/reproducible across runs.
      expect(JSON.parse(JSON.stringify(nestedGroup))).toEqual(nestedGroup);
      expect(nestedGroup.nested).toEqual({ anchorClassName: setup.schema.items.B.fullName, prefixStepCount: 1 });
      expect(nestedGroup.paths).toHaveLength(1);
      // The nested group's path is the *full* path from the original target `A` — the concrete A-to-B
      // prefix plus the nested declaration's own B-to-C suffix — never just the suffix from `B` alone.
      expect(nestedGroup.paths[0].path).toHaveLength(2);
      expect(nestedGroup.paths[0].path[0]).toMatchObject({
        sourceClassName: setup.schema.items.A.fullName,
        targetClassName: setup.schema.items.B.fullName,
        relationshipName: setup.schema.items.AtoB.fullName,
      });
      expect(nestedGroup.paths[0].path[1]).toMatchObject({
        sourceClassName: setup.schema.items.B.fullName,
        targetClassName: setup.schema.items.C.fullName,
        relationshipName: setup.schema.items.BtoC.fullName,
      });
      expect(nestedGroup.paths[0].targetClassNames).toEqual([setup.schema.items.A.fullName]);
    });
  });
});
