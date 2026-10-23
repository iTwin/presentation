/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  defineExternalFieldsProvider,
  defineIModelFieldsProvider,
  resolveContentSources,
} from "@itwin/presentation-content";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import { createContentIModelAccess } from "./Utils.js";

import type { ContentSource, ContentTarget } from "@itwin/presentation-content";
import type { EC, RelationshipPath } from "@itwin/presentation-shared";

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
      expect(nestedGroup.nested).toEqual({
        anchorClassName: setup.schema.items.B.fullName,
        prefixStepCount: 1,
        categoryContext: [{ stepIndex: 0, kind: "targetClass" }],
      });
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

    it("loads fine when two targets on the same class have disjoint instanceFilters", async () => {
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
        builder.insertInstance(s.items.A.fullName, { prop: "keep" });
        builder.insertInstance(s.items.A.fullName, { prop: "drop" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);

      const sources = await resolveContentSources({
        imodelAccess,
        targets: [
          { primaryClass: setup.schema.items.A.fullName, instanceFilter: { expression: `this.Prop = 'keep'` } },
          { primaryClass: setup.schema.items.A.fullName, instanceFilter: { expression: `this.Prop = 'drop'` } },
        ],
      });

      expect(sources).toHaveLength(2);
    });

    it("throws when two targets on the same class have overlapping instanceFilters", async () => {
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
        builder.insertInstance(s.items.A.fullName, { prop: "shared" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);

      await expect(
        resolveContentSources({
          imodelAccess,
          targets: [
            { primaryClass: setup.schema.items.A.fullName, instanceFilter: { expression: `this.Prop = 'shared'` } },
            { primaryClass: setup.schema.items.A.fullName },
          ],
        }),
      ).rejects.toThrow(/^Content targets #0 \(.*\.A\) and #1 \(.*\.A\) overlap: instance 0x[0-9a-f]+ is in both\./);
    });

    describe("hidden related classes", () => {
      // HiddenRoot (HiddenClass)
      //  └─ Base (declared target class; visible subclasses stay reachable despite the hidden root)
      //      ├─ VisibleSub
      //      └─ HiddenSub (HiddenClass)
      //          └─ ShownSub (HiddenClass Show=true)
      // A --RelToBase--> Base
      // A --RelToMid--> Mid (HiddenClass) --RelMidToBase--> Base
      type ResolvedPath = ContentSource["resolvedDeclarations"][number]["paths"][number];
      let setup: Awaited<ReturnType<typeof setupHiddenRelatedClasses>>;

      beforeAll(async () => {
        setup = await setupHiddenRelatedClasses();
        return () => setup[Symbol.dispose]();
      });

      async function setupHiddenRelatedClasses() {
        return buildTestECDb("SourceResolution_hidden_related_classes", async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="A">
                <ECProperty propertyName="PropA" typeName="string" />
              </ECEntityClass>
              <ECEntityClass typeName="HiddenRoot">
                <ECCustomAttributes>
                  <ClassMap xmlns="ECDbMap.02.00.01">
                    <MapStrategy>TablePerHierarchy</MapStrategy>
                  </ClassMap>
                  <HiddenClass xmlns="CoreCustomAttributes.01.00.03" />
                </ECCustomAttributes>
              </ECEntityClass>
              <ECEntityClass typeName="Base">
                <BaseClass>HiddenRoot</BaseClass>
                <ECProperty propertyName="PropBase" typeName="string" />
              </ECEntityClass>
              <ECEntityClass typeName="VisibleSub">
                <BaseClass>Base</BaseClass>
              </ECEntityClass>
              <ECEntityClass typeName="HiddenSub">
                <BaseClass>Base</BaseClass>
                <ECCustomAttributes>
                  <HiddenClass xmlns="CoreCustomAttributes.01.00.03" />
                </ECCustomAttributes>
              </ECEntityClass>
              <ECEntityClass typeName="ShownSub">
                <BaseClass>HiddenSub</BaseClass>
                <ECCustomAttributes>
                  <HiddenClass xmlns="CoreCustomAttributes.01.00.03">
                    <Show>true</Show>
                  </HiddenClass>
                </ECCustomAttributes>
              </ECEntityClass>
              <ECEntityClass typeName="Mid">
                <ECCustomAttributes>
                  <HiddenClass xmlns="CoreCustomAttributes.01.00.03" />
                </ECCustomAttributes>
                <ECProperty propertyName="PropMid" typeName="string" />
              </ECEntityClass>
              <ECEntityClass typeName="End">
                <ECCustomAttributes>
                  <ClassMap xmlns="ECDbMap.02.00.01">
                    <MapStrategy>TablePerHierarchy</MapStrategy>
                  </ClassMap>
                </ECCustomAttributes>
                <ECProperty propertyName="PropEnd" typeName="string" />
              </ECEntityClass>
              <ECEntityClass typeName="VisibleEnd">
                <BaseClass>End</BaseClass>
              </ECEntityClass>
              <ECEntityClass typeName="HiddenEnd">
                <BaseClass>End</BaseClass>
                <ECCustomAttributes>
                  <HiddenClass xmlns="CoreCustomAttributes.01.00.03" />
                </ECCustomAttributes>
              </ECEntityClass>
              <ECRelationshipClass typeName="RelToBase" strength="referencing" modifier="None">
                <Source multiplicity="(0..*)" roleLabel="a to base" polymorphic="true">
                  <Class class="A" />
                </Source>
                <Target multiplicity="(0..*)" roleLabel="base to a" polymorphic="true">
                  <Class class="Base" />
                </Target>
              </ECRelationshipClass>
              <ECRelationshipClass typeName="RelToMid" strength="referencing" modifier="None">
                <Source multiplicity="(0..*)" roleLabel="a to mid" polymorphic="true">
                  <Class class="A" />
                </Source>
                <Target multiplicity="(0..*)" roleLabel="mid to a" polymorphic="true">
                  <Class class="Mid" />
                </Target>
              </ECRelationshipClass>
              <ECRelationshipClass typeName="RelMidToBase" strength="referencing" modifier="None">
                <Source multiplicity="(0..*)" roleLabel="mid to base" polymorphic="true">
                  <Class class="Mid" />
                </Source>
                <Target multiplicity="(0..*)" roleLabel="base to mid" polymorphic="true">
                  <Class class="Base" />
                </Target>
              </ECRelationshipClass>
              <ECRelationshipClass typeName="RelBaseToEnd" strength="referencing" modifier="None">
                <Source multiplicity="(0..*)" roleLabel="base to end" polymorphic="true">
                  <Class class="Base" />
                </Source>
                <Target multiplicity="(0..*)" roleLabel="end to base" polymorphic="true">
                  <Class class="End" />
                </Target>
              </ECRelationshipClass>
            `,
          );
          const a = builder.insertInstance(s.items.A.fullName, { propA: "a" });
          const mid = builder.insertInstance(s.items.Mid.fullName, { propMid: "mid" });
          builder.insertRelationship(s.items.RelToMid.fullName, a.id, mid.id);
          for (const className of [s.items.VisibleSub, s.items.HiddenSub, s.items.ShownSub].map((c) => c.fullName)) {
            const instance = builder.insertInstance(className, { propBase: className });
            builder.insertRelationship(s.items.RelToBase.fullName, a.id, instance.id);
            builder.insertRelationship(s.items.RelMidToBase.fullName, mid.id, instance.id);
            for (const endClass of [s.items.VisibleEnd, s.items.HiddenEnd]) {
              const end = builder.insertInstance(endClass.fullName, { propEnd: endClass.fullName });
              builder.insertRelationship(s.items.RelBaseToEnd.fullName, instance.id, end.id);
            }
          }
          return { schema: s };
        });
      }

      async function resolveFinalTargetClasses(
        path: RelationshipPath,
        options?: { target?: Partial<ContentTarget>; resolve?: () => Promise<ResolvedPath[]> },
      ) {
        const provider = defineIModelFieldsProvider({
          id: "provider_v1",
          async getContribution() {
            return { relatedProperties: [{ path, ...(options?.resolve ? { resolve: options.resolve } : undefined) }] };
          },
        });
        const sources = await resolveContentSources({
          imodelAccess: createContentIModelAccess(setup.ecdb),
          targets: [{ primaryClass: setup.schema.items.A.fullName, ...options?.target }],
          config: { imodelFieldsProviders: [provider] },
        });
        return sources[0].resolvedDeclarations
          .flatMap(({ paths }) => paths.map(({ path: resolved }) => resolved[resolved.length - 1].targetClassName))
          .sort();
      }

      function pathToBase(targetClassName: EC.FullClassNameDotNotation): RelationshipPath {
        return [
          {
            sourceClassName: setup.schema.items.A.fullName,
            targetClassName,
            relationshipName: setup.schema.items.RelToBase.fullName,
          },
        ];
      }

      function pathThroughMid(targetClassName: EC.FullClassNameDotNotation): RelationshipPath {
        return [
          {
            sourceClassName: setup.schema.items.A.fullName,
            targetClassName: setup.schema.items.Mid.fullName,
            relationshipName: setup.schema.items.RelToMid.fullName,
          },
          {
            sourceClassName: setup.schema.items.Mid.fullName,
            targetClassName,
            relationshipName: setup.schema.items.RelMidToBase.fullName,
          },
        ];
      }

      it("excludes hidden subclasses discovered through a visible declared target class", async () => {
        const { items } = setup.schema;
        expect(await resolveFinalTargetClasses(pathToBase(items.Base.fullName))).toEqual(
          [items.VisibleSub.fullName, items.ShownSub.fullName].sort(),
        );
      });

      it("keeps a hidden class when the declaration explicitly targets it", async () => {
        const { items } = setup.schema;
        expect(await resolveFinalTargetClasses(pathToBase(items.HiddenSub.fullName))).toEqual(
          [items.HiddenSub.fullName, items.ShownSub.fullName].sort(),
        );
      });

      it("excludes hidden subclasses of the final target class of a multi-step path", async () => {
        const { items } = setup.schema;
        expect(await resolveFinalTargetClasses(pathThroughMid(items.Base.fullName))).toEqual(
          [items.VisibleSub.fullName, items.ShownSub.fullName].sort(),
        );
      });

      it("keeps a hidden class when it's the explicit final target of a multi-step path", async () => {
        const { items } = setup.schema;
        expect(await resolveFinalTargetClasses(pathThroughMid(items.HiddenSub.fullName))).toEqual(
          [items.HiddenSub.fullName, items.ShownSub.fullName].sort(),
        );
      });

      it("keeps a visible final target reachable through a hidden intermediate class", async () => {
        const { items } = setup.schema;
        expect(await resolveFinalTargetClasses(pathThroughMid(items.VisibleSub.fullName))).toEqual([
          items.VisibleSub.fullName,
        ]);
      });

      it("excludes hidden final targets of a path long enough for every query strategy", async () => {
        const { items } = setup.schema;
        const path: RelationshipPath = [
          ...pathThroughMid(items.Base.fullName),
          {
            sourceClassName: items.Base.fullName,
            targetClassName: items.End.fullName,
            relationshipName: items.RelBaseToEnd.fullName,
          },
        ];
        // One path per concrete `Base` subclass (intermediate classes aren't filtered), all ending in the visible class
        expect([...new Set(await resolveFinalTargetClasses(path))]).toEqual([items.VisibleEnd.fullName]);
      });

      it("excludes hidden final targets when the target has an instance filter with alternatives", async () => {
        const { items } = setup.schema;
        expect(
          await resolveFinalTargetClasses(pathToBase(items.Base.fullName), {
            target: { instanceFilter: { expression: `this.PropA = 'a' OR this.PropA = 'other'` } },
          }),
        ).toEqual([items.VisibleSub.fullName, items.ShownSub.fullName].sort());
      });

      it("excludes hidden final targets of external fields provider input paths", async () => {
        const { items } = setup.schema;
        const [sourceSource] = await resolveContentSources({
          imodelAccess: createContentIModelAccess(setup.ecdb),
          targets: [{ primaryClass: items.A.fullName }],
          config: {
            externalFieldsProviders: [
              defineExternalFieldsProvider({
                id: "ext_v1",
                fields: [{ id: "f", label: "F", type: { kind: "primitive", type: "String" } }],
                inputs: {
                  propBase: {
                    propertyClassName: items.Base.fullName,
                    propertyName: "PropBase",
                    related: { path: pathToBase(items.Base.fullName) },
                  },
                },
                async getValues() {
                  return [];
                },
              }),
            ],
          },
        });
        expect(
          sourceSource.resolvedExternalInputs
            .flatMap(({ paths }) => paths.map(({ path }) => path[path.length - 1].targetClassName))
            .sort(),
        ).toEqual([items.VisibleSub.fullName, items.ShownSub.fullName].sort());
      });

      it("returns paths of a custom resolver as they are, even when they end in a hidden class", async () => {
        const { items } = setup.schema;
        const customPath: ResolvedPath = {
          path: [
            {
              sourceClassName: items.A.fullName,
              targetClassName: items.HiddenSub.fullName,
              relationshipName: items.RelToBase.fullName,
            },
          ],
          targetClassNames: [items.A.fullName],
        };
        expect(
          await resolveFinalTargetClasses(pathToBase(items.Base.fullName), { resolve: async () => [customPath] }),
        ).toEqual([items.HiddenSub.fullName]);
      });

      it("excludes hidden classes when resolving through nested declarations", async () => {
        const { items } = setup.schema;
        const toMid: RelationshipPath = [
          {
            sourceClassName: items.A.fullName,
            targetClassName: items.Mid.fullName,
            relationshipName: items.RelToMid.fullName,
          },
        ];
        const midToBase: RelationshipPath = [
          {
            sourceClassName: items.Mid.fullName,
            targetClassName: items.Base.fullName,
            relationshipName: items.RelMidToBase.fullName,
          },
        ];
        const sources = await resolveContentSources({
          imodelAccess: createContentIModelAccess(setup.ecdb),
          targets: [{ primaryClass: items.A.fullName }],
          config: {
            imodelFieldsProviders: [
              defineIModelFieldsProvider({
                id: "root_v1",
                async getContribution() {
                  return { relatedProperties: [{ path: toMid }] };
                },
              }),
              defineIModelFieldsProvider({
                id: "nested_v1",
                applyRecursively: true,
                async getContribution({ target }) {
                  return target.primaryClass === items.Mid.fullName
                    ? { relatedProperties: [{ path: midToBase }] }
                    : undefined;
                },
              }),
            ],
          },
        });
        const nestedFinalTargets = sources[0].resolvedDeclarations
          .filter(({ providerId }) => providerId === "nested_v1")
          .flatMap(({ paths }) => paths.map(({ path }) => path[path.length - 1].targetClassName))
          .sort();
        expect(nestedFinalTargets).toEqual([items.VisibleSub.fullName, items.ShownSub.fullName].sort());
      });
    });
  });
});
