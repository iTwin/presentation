/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineIModelFieldsProvider, resolveContentSources } from "@itwin/presentation-content";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import { validateCategoryChain } from "./DescriptorValidation.js";
import {
  buildDescriptor,
  createContentIModelAccess,
  getPropertyFieldsByName,
  getRelatedPropertyFields,
} from "./Utils.js";

import type { RelationshipPath } from "@itwin/presentation-shared";
import type { ECDbBuilder } from "../ECDbUtils.js";

/**
 * Integration coverage for `IModelFieldsProvider.applyRecursively` — modeled on the feature
 * request's own example: a `Wall` has a `WallType` (via `HasPhysicalType`), and a `WallType` has a
 * unique aspect (via `HasUniqueAspect`, targeting a base `Aspect` class with two concrete
 * subclasses). Provider A contributes the wall-to-type step; provider B, opted in via
 * `applyRecursively`, contributes the type-to-aspect step written purely in terms of
 * `target.primaryClass` (`WallType`) — never aware of any particular wall.
 */
describe("Content", () => {
  describe("Nested related properties (applyRecursively)", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    async function importWallSchema(builder: ECDbBuilder, testName: string) {
      return importSchema(
        testName,
        builder,
        `
          <ECEntityClass typeName="Wall">
            <ECProperty propertyName="Name" typeName="string" />
          </ECEntityClass>
          <ECEntityClass typeName="WallType">
            <ECProperty propertyName="TypeName" typeName="string" />
          </ECEntityClass>
          <ECEntityClass typeName="Aspect" modifier="Abstract">
            <ECCustomAttributes>
              <ClassMap xmlns="ECDbMap.02.00.01">
                <MapStrategy>TablePerHierarchy</MapStrategy>
              </ClassMap>
            </ECCustomAttributes>
          </ECEntityClass>
          <ECEntityClass typeName="WallTypeAspectA">
            <BaseClass>Aspect</BaseClass>
            <ECProperty propertyName="PropA" typeName="string" />
          </ECEntityClass>
          <ECEntityClass typeName="WallTypeAspectB">
            <BaseClass>Aspect</BaseClass>
            <ECProperty propertyName="PropB" typeName="string" />
          </ECEntityClass>
          <ECRelationshipClass typeName="HasPhysicalType" strength="referencing" modifier="None">
            <Source multiplicity="(0..*)" roleLabel="wall has type" polymorphic="true">
              <Class class="Wall" />
            </Source>
            <Target multiplicity="(0..*)" roleLabel="type of wall" polymorphic="true">
              <Class class="WallType" />
            </Target>
          </ECRelationshipClass>
          <ECRelationshipClass typeName="HasUniqueAspect" strength="referencing" modifier="None">
            <Source multiplicity="(0..*)" roleLabel="wall type has aspect" polymorphic="true">
              <Class class="WallType" />
            </Source>
            <Target multiplicity="(0..*)" roleLabel="aspect of wall type" polymorphic="true">
              <Class class="Aspect" />
            </Target>
          </ECRelationshipClass>
        `,
      );
    }

    /** Provider A: `Wall --[HasPhysicalType]--> WallType`, applied on the direct target only. */
    function createWallToTypeProvider(schema: Awaited<ReturnType<typeof importWallSchema>>) {
      return defineIModelFieldsProvider({
        id: "wallToType_v1",
        async getContribution({ target }) {
          if (target.primaryClass !== schema.items.Wall.fullName) {
            return undefined;
          }
          return {
            relatedProperties: [
              {
                path: [
                  {
                    sourceClassName: schema.items.Wall.fullName,
                    targetClassName: schema.items.WallType.fullName,
                    relationshipName: schema.items.HasPhysicalType.fullName,
                  },
                ],
                properties: [{ stepIndex: 0, target: { select: { exclude: ["TypeName"] } } }],
              },
            ],
          };
        },
      });
    }

    /**
     * Provider B: `WallType --[HasUniqueAspect]--> Aspect`, opted into nested application. Written
     * entirely in terms of `target.primaryClass` — it never mentions `Wall` and has no idea which
     * wall (if any) led to the `WallType` it's being invoked for.
     */
    function createTypeToAspectProvider(schema: Awaited<ReturnType<typeof importWallSchema>>) {
      return defineIModelFieldsProvider({
        id: "typeToAspect_v1",
        applyRecursively: true,
        async getContribution({ target }) {
          if (target.primaryClass !== schema.items.WallType.fullName) {
            return undefined;
          }
          return {
            relatedProperties: [
              {
                path: [
                  {
                    sourceClassName: schema.items.WallType.fullName,
                    targetClassName: schema.items.Aspect.fullName,
                    relationshipName: schema.items.HasUniqueAspect.fullName,
                  },
                ],
              },
            ],
          };
        },
      });
    }

    it("loads and scopes nested aspect fields when the parent excludes a target property", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importWallSchema(builder, testName);
        const wall1 = builder.insertInstance(s.items.Wall.fullName, { name: "Wall1" });
        const wallType1 = builder.insertInstance(s.items.WallType.fullName, { typeName: "Type1" });
        const aspectA = builder.insertInstance(s.items.WallTypeAspectA.fullName, { propA: "a" });
        builder.insertRelationship(s.items.HasPhysicalType.fullName, wall1.id, wallType1.id);
        builder.insertRelationship(s.items.HasUniqueAspect.fullName, wallType1.id, aspectA.id);

        const wall2 = builder.insertInstance(s.items.Wall.fullName, { name: "Wall2" });
        const wallType2 = builder.insertInstance(s.items.WallType.fullName, { typeName: "Type2" });
        const aspectB = builder.insertInstance(s.items.WallTypeAspectB.fullName, { propB: "b" });
        builder.insertRelationship(s.items.HasPhysicalType.fullName, wall2.id, wallType2.id);
        builder.insertRelationship(s.items.HasUniqueAspect.fullName, wallType2.id, aspectB.id);

        return { schema: s, wall1 };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const providerA = createWallToTypeProvider(setup.schema);
      const providerB = createTypeToAspectProvider(setup.schema);

      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.Wall.fullName, instanceIds: [setup.wall1.id] }],
        config: { imodelFieldsProviders: [providerA, providerB] },
      });

      // Wall1's own aspect (PropA / WallTypeAspectA) is present...
      const propAFields = getPropertyFieldsByName(descriptor, "PropA");
      expect(propAFields).toHaveLength(1);
      expect(propAFields[0].pathFromTarget).toHaveLength(2);
      expect(propAFields[0].pathFromTarget[0]).toMatchObject({
        sourceClassName: setup.schema.items.Wall.fullName,
        targetClassName: setup.schema.items.WallType.fullName,
        relationshipName: setup.schema.items.HasPhysicalType.fullName,
      });
      expect(propAFields[0].pathFromTarget[1]).toMatchObject({
        sourceClassName: setup.schema.items.WallType.fullName,
        targetClassName: setup.schema.items.WallTypeAspectA.fullName,
        relationshipName: setup.schema.items.HasUniqueAspect.fullName,
      });
      expect(propAFields[0].valueClassNames).toEqual([setup.schema.items.WallTypeAspectA.fullName]);
      expect(propAFields[0].primaryClassNames).toEqual([setup.schema.items.Wall.fullName]);

      // ...but Wall2's aspect (PropB / WallTypeAspectB), reachable only through the *other* wall
      // type, must not leak in — even though provider B was invoked for the shared `WallType`
      // anchor class, not a specific wall-type instance.
      expect(getPropertyFieldsByName(descriptor, "PropB")).toHaveLength(0);
    });

    it("resolves every concrete aspect subclass reachable when the request is not scoped to a single wall", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importWallSchema(builder, testName);
        const wall1 = builder.insertInstance(s.items.Wall.fullName, { name: "Wall1" });
        const wallType1 = builder.insertInstance(s.items.WallType.fullName, { typeName: "Type1" });
        const aspectA = builder.insertInstance(s.items.WallTypeAspectA.fullName, { propA: "a" });
        builder.insertRelationship(s.items.HasPhysicalType.fullName, wall1.id, wallType1.id);
        builder.insertRelationship(s.items.HasUniqueAspect.fullName, wallType1.id, aspectA.id);

        const wall2 = builder.insertInstance(s.items.Wall.fullName, { name: "Wall2" });
        const wallType2 = builder.insertInstance(s.items.WallType.fullName, { typeName: "Type2" });
        const aspectB = builder.insertInstance(s.items.WallTypeAspectB.fullName, { propB: "b" });
        builder.insertRelationship(s.items.HasPhysicalType.fullName, wall2.id, wallType2.id);
        builder.insertRelationship(s.items.HasUniqueAspect.fullName, wallType2.id, aspectB.id);

        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const providerA = createWallToTypeProvider(setup.schema);
      const providerB = createTypeToAspectProvider(setup.schema);

      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.Wall.fullName }],
        config: { imodelFieldsProviders: [providerA, providerB] },
      });

      expect(getPropertyFieldsByName(descriptor, "PropA")).toHaveLength(1);
      expect(getPropertyFieldsByName(descriptor, "PropB")).toHaveLength(1);
    });

    it("does not nest aspect fields when the aspect provider is not opted into applyRecursively", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importWallSchema(builder, testName);
        const wall1 = builder.insertInstance(s.items.Wall.fullName, { name: "Wall1" });
        const wallType1 = builder.insertInstance(s.items.WallType.fullName, { typeName: "Type1" });
        const aspectA = builder.insertInstance(s.items.WallTypeAspectA.fullName, { propA: "a" });
        builder.insertRelationship(s.items.HasPhysicalType.fullName, wall1.id, wallType1.id);
        builder.insertRelationship(s.items.HasUniqueAspect.fullName, wallType1.id, aspectA.id);
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const providerA = createWallToTypeProvider(setup.schema);
      // Same declaration as `createTypeToAspectProvider`, but never opts into nested application.
      const providerBNotOptedIn = { ...createTypeToAspectProvider(setup.schema), applyRecursively: false };

      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.Wall.fullName }],
        config: { imodelFieldsProviders: [providerA, providerBNotOptedIn] },
      });

      expect(getRelatedPropertyFields(descriptor).filter((f) => f.pathFromTarget.length > 1)).toHaveLength(0);
      expect(getPropertyFieldsByName(descriptor, "PropA")).toHaveLength(0);
    });

    it("terminates a self-referencing nested chain via the per-branch (provider, anchor class) guard", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="Node">
              <ECProperty propertyName="Name" typeName="string" />
            </ECEntityClass>
            <ECRelationshipClass typeName="NodeToNode" strength="referencing" modifier="None">
              <Source multiplicity="(0..*)" roleLabel="refers to" polymorphic="true">
                <Class class="Node" />
              </Source>
              <Target multiplicity="(0..*)" roleLabel="referred to by" polymorphic="true">
                <Class class="Node" />
              </Target>
            </ECRelationshipClass>
          `,
        );
        // A 2-cycle: N1 -> N2 -> N1. Without the cycle guard, a data-driven implementation would
        // keep resolving longer and longer (real, matching) paths forever.
        const n1 = builder.insertInstance(s.items.Node.fullName, { name: "N1" });
        const n2 = builder.insertInstance(s.items.Node.fullName, { name: "N2" });
        builder.insertRelationship(s.items.NodeToNode.fullName, n1.id, n2.id);
        builder.insertRelationship(s.items.NodeToNode.fullName, n2.id, n1.id);
        return { schema: s, n1 };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const provider = defineIModelFieldsProvider({
        id: "selfRef_v1",
        applyRecursively: true,
        async getContribution() {
          return {
            relatedProperties: [
              {
                path: [
                  {
                    sourceClassName: setup.schema.items.Node.fullName,
                    targetClassName: setup.schema.items.Node.fullName,
                    relationshipName: setup.schema.items.NodeToNode.fullName,
                  },
                ],
              },
            ],
          };
        },
      });

      // `resolveContentSources` alone is enough to prove termination — if the guard were missing,
      // this call would recurse indefinitely (or until the process ran out of memory) instead of
      // resolving.
      const sources = await resolveContentSources({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.Node.fullName, instanceIds: [setup.n1.id] }],
        config: { imodelFieldsProviders: [provider] },
      });

      expect(sources).toHaveLength(1);
      // One base group (N1 -> N2) plus exactly one nested group (N1 -> N2 -> N1) — the guard blocks
      // re-applying `selfRef_v1` at the `Node` anchor a second time.
      expect(sources[0].resolvedDeclarations).toHaveLength(2);
      const nestedGroup = sources[0].resolvedDeclarations.find((g) => g.nested);
      expect(nestedGroup).toBeDefined();
      expect(nestedGroup!.nested).toEqual({
        anchorClassName: setup.schema.items.Node.fullName,
        prefixStepCount: 1,
        categoryContext: [{ stepIndex: 0, kind: "targetClass" }],
      });
      expect(nestedGroup!.paths).toHaveLength(1);
      expect(nestedGroup!.paths[0].path).toHaveLength(2);
    });

    describe("category placement", () => {
      type Scope = "relatedClass" | "parent" | undefined;
      let setup: ChainSetup;

      beforeAll(async () => {
        setup = await buildChainSetup();
        return () => setup[Symbol.dispose]();
      });

      /** `Wall -> WallType -> WallTypeAspect -> WallTypeDetail`, each class with categorized and uncategorized properties. */
      async function buildChainSetup() {
        return buildTestECDb("NestedRelatedProperties_category_placement", async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <PropertyCategory typeName="Geometry" displayLabel="Geometry" priority="10" />
              <ECEntityClass typeName="Wall">
                <ECProperty propertyName="Name" typeName="string" />
              </ECEntityClass>
              <ECEntityClass typeName="WallType">
                <ECProperty propertyName="TypeName" typeName="string" />
                <ECProperty propertyName="TypeCategorized" typeName="string" category="Geometry" />
              </ECEntityClass>
              <ECEntityClass typeName="WallTypeAspect">
                <ECProperty propertyName="AspectUncategorized" typeName="string" />
                <ECProperty propertyName="AspectSecondUncategorized" typeName="string" />
                <ECProperty propertyName="AspectCategorized" typeName="string" category="Geometry" />
              </ECEntityClass>
              <ECEntityClass typeName="WallTypeDetail">
                <ECProperty propertyName="DetailUncategorized" typeName="string" />
                <ECProperty propertyName="DetailCategorized" typeName="string" category="Geometry" />
              </ECEntityClass>
              <ECRelationshipClass typeName="HasPhysicalType" strength="referencing" modifier="None">
                <Source multiplicity="(0..*)" roleLabel="wall has type" polymorphic="true">
                  <Class class="Wall" />
                </Source>
                <Target multiplicity="(0..*)" roleLabel="type of wall" polymorphic="true">
                  <Class class="WallType" />
                </Target>
              </ECRelationshipClass>
              <ECRelationshipClass typeName="HasUniqueAspect" strength="referencing" modifier="None">
                <Source multiplicity="(0..*)" roleLabel="type has aspect" polymorphic="true">
                  <Class class="WallType" />
                </Source>
                <Target multiplicity="(0..*)" roleLabel="aspect of type" polymorphic="true">
                  <Class class="WallTypeAspect" />
                </Target>
              </ECRelationshipClass>
              <ECRelationshipClass typeName="HasDetail" strength="referencing" modifier="None">
                <Source multiplicity="(0..*)" roleLabel="aspect has detail" polymorphic="true">
                  <Class class="WallTypeAspect" />
                </Source>
                <Target multiplicity="(0..*)" roleLabel="detail of aspect" polymorphic="true">
                  <Class class="WallTypeDetail" />
                </Target>
              </ECRelationshipClass>
            `,
          );
          const wall = builder.insertInstance(s.items.Wall.fullName, { name: "Wall" });
          const type = builder.insertInstance(s.items.WallType.fullName, { typeName: "t", typeCategorized: "tc" });
          const aspect = builder.insertInstance(s.items.WallTypeAspect.fullName, {
            aspectUncategorized: "au",
            aspectSecondUncategorized: "asu",
            aspectCategorized: "ac",
          });
          const detail = builder.insertInstance(s.items.WallTypeDetail.fullName, {
            detailUncategorized: "du",
            detailCategorized: "dc",
          });
          builder.insertRelationship(s.items.HasPhysicalType.fullName, wall.id, type.id);
          builder.insertRelationship(s.items.HasUniqueAspect.fullName, type.id, aspect.id);
          builder.insertRelationship(s.items.HasDetail.fullName, aspect.id, detail.id);
          return { schema: s };
        });
      }

      type ChainSetup = Awaited<ReturnType<typeof buildChainSetup>>;

      /**
       * Declarations applied on the wall (to its type) and, recursively, on the type (to its aspect) and the
       * aspect (to its detail).
       */
      function createChainConfig(
        chainSetup: ChainSetup,
        scopes: { type?: Scope; aspect?: Scope; detail?: Scope; typeProperties?: "none-displayed" },
      ) {
        const { items } = chainSetup.schema;
        const step = (
          sourceClassName: RelationshipPath[number]["sourceClassName"],
          targetClassName: RelationshipPath[number]["targetClassName"],
          relationshipName: RelationshipPath[number]["relationshipName"],
        ): RelationshipPath[number] => ({ sourceClassName, targetClassName, relationshipName });
        const withScope = (scope: Scope) => (scope ? { propertyCategoryScope: scope } : undefined);
        return {
          imodelFieldsProviders: [
            defineIModelFieldsProvider({
              id: "wallToType_v1",
              async getContribution({ target }) {
                if (target.primaryClass !== items.Wall.fullName) {
                  return undefined;
                }
                return {
                  relatedProperties: [
                    {
                      path: [step(items.Wall.fullName, items.WallType.fullName, items.HasPhysicalType.fullName)],
                      cardinalityHint: "one" as const,
                      ...withScope(scopes.type),
                      // Excluding every property keeps the type an anchor while displaying none of its properties.
                      ...(scopes.typeProperties
                        ? {
                            properties: [
                              { stepIndex: 0, target: { select: { exclude: ["TypeName", "TypeCategorized"] } } },
                            ],
                          }
                        : undefined),
                    },
                  ],
                };
              },
            }),
            defineIModelFieldsProvider({
              id: "nested_v1",
              applyRecursively: true,
              async getContribution({ target }) {
                if (target.primaryClass === items.WallType.fullName) {
                  return {
                    relatedProperties: [
                      {
                        path: [
                          step(items.WallType.fullName, items.WallTypeAspect.fullName, items.HasUniqueAspect.fullName),
                        ],
                        cardinalityHint: "one" as const,
                        ...withScope(scopes.aspect),
                      },
                    ],
                  };
                }
                if (target.primaryClass === items.WallTypeAspect.fullName) {
                  return {
                    relatedProperties: [
                      {
                        path: [
                          step(items.WallTypeAspect.fullName, items.WallTypeDetail.fullName, items.HasDetail.fullName),
                        ],
                        cardinalityHint: "one" as const,
                        ...withScope(scopes.detail),
                      },
                    ],
                  };
                }
                return undefined;
              },
            }),
          ],
        };
      }

      async function describeChain(chainSetup: ChainSetup, scopes: Parameters<typeof createChainConfig>[1]) {
        const descriptor = await buildDescriptor({
          imodelAccess: createContentIModelAccess(chainSetup.ecdb),
          targets: [{ primaryClass: chainSetup.schema.items.Wall.fullName }],
          config: createChainConfig(chainSetup, scopes),
        });
        const field = (name: string) => getRelatedPropertyFields(descriptor).find((f) => f.propertyName === name)!;
        return { descriptor, field };
      }

      it("nests every level under its class when all declarations use the default scope", async () => {
        const { descriptor, field } = await describeChain(setup, {});
        validateCategoryChain(descriptor, field("TypeCategorized"), ["WallType", "Geometry"]);
        validateCategoryChain(descriptor, field("AspectCategorized"), ["WallType", "WallTypeAspect", "Geometry"]);
        validateCategoryChain(descriptor, field("AspectUncategorized"), ["WallType", "WallTypeAspect"]);
      });

      it("attaches a parent-scoped nested declaration to the enclosing class category", async () => {
        const { descriptor, field } = await describeChain(setup, { type: "relatedClass", aspect: "parent" });
        validateCategoryChain(descriptor, field("AspectCategorized"), ["WallType", "Geometry"]);
        validateCategoryChain(descriptor, field("AspectUncategorized"), ["WallType", "WallTypeAspect"]);
      });

      it("shares the outer and nested property category when both declarations use parent scope", async () => {
        const { descriptor, field } = await describeChain(setup, { type: "parent", aspect: "parent" });

        validateCategoryChain(descriptor, field("TypeCategorized"), ["Geometry"]);
        validateCategoryChain(descriptor, field("TypeName"), ["WallType"]);
        validateCategoryChain(descriptor, field("AspectCategorized"), ["Geometry"]);
        validateCategoryChain(descriptor, field("AspectUncategorized"), ["WallTypeAspect"]);
        expect(field("TypeCategorized").categoryId).toBe(field("AspectCategorized").categoryId);
      });

      it.each([
        { type: "parent", aspect: "parent", context: [] },
        { type: "relatedClass", aspect: "parent", context: ["WallType"] },
        { type: "parent", aspect: "relatedClass", context: ["WallTypeAspect"] },
        { type: "relatedClass", aspect: "relatedClass", context: ["WallType", "WallTypeAspect"] },
      ] as const)(
        "inherits type=$type and aspect=$aspect scope at the detail level",
        async ({ type, aspect, context }) => {
          const { descriptor, field } = await describeChain(setup, { type, aspect, detail: "parent" });

          validateCategoryChain(descriptor, field("DetailCategorized"), [...context, "Geometry"]);
          validateCategoryChain(descriptor, field("DetailUncategorized"), [...context, "WallTypeDetail"]);
          validateCategoryChain(descriptor, field("AspectCategorized"), [...context, "Geometry"]);
          expect(field("DetailCategorized").categoryId).toBe(field("AspectCategorized").categoryId);
        },
      );

      it.each([
        { type: "parent", context: [] },
        { type: "relatedClass", context: ["WallType"] },
      ] as const)("inherits $type scope from an ancestor that displays no properties", async ({ type, context }) => {
        const { descriptor, field } = await describeChain(setup, {
          type,
          aspect: "parent",
          typeProperties: "none-displayed",
        });

        expect(getRelatedPropertyFields(descriptor).some((f) => f.propertyName === "TypeName")).toBe(false);
        validateCategoryChain(descriptor, field("AspectCategorized"), [...context, "Geometry"]);
        validateCategoryChain(descriptor, field("AspectUncategorized"), [...context, "WallTypeAspect"]);
      });

      it.each([false, true])(
        "keeps a direct multi-step declaration's categories independent of a separate prefix declaration: %s",
        async (includePrefix) => {
          const { items } = setup.schema;
          const descriptor = await buildDescriptor({
            imodelAccess: createContentIModelAccess(setup.ecdb),
            targets: [{ primaryClass: items.Wall.fullName }],
            config: {
              imodelFieldsProviders: [
                defineIModelFieldsProvider({
                  id: "multiStep_v1",
                  async getContribution({ target }) {
                    if (target.primaryClass !== items.Wall.fullName) {
                      return undefined;
                    }
                    return {
                      relatedProperties: [
                        ...(includePrefix
                          ? [
                              {
                                path: [
                                  {
                                    sourceClassName: items.Wall.fullName,
                                    targetClassName: items.WallType.fullName,
                                    relationshipName: items.HasPhysicalType.fullName,
                                  },
                                ],
                              },
                            ]
                          : []),
                        {
                          path: [
                            {
                              sourceClassName: items.Wall.fullName,
                              targetClassName: items.WallType.fullName,
                              relationshipName: items.HasPhysicalType.fullName,
                            },
                            {
                              sourceClassName: items.WallType.fullName,
                              targetClassName: items.WallTypeAspect.fullName,
                              relationshipName: items.HasUniqueAspect.fullName,
                            },
                          ],
                          cardinalityHint: "one" as const,
                          propertyCategoryScope: "parent" as const,
                          properties: [{ stepIndex: 1, target: { select: "all" as const } }],
                        },
                      ],
                    };
                  },
                }),
              ],
            },
          });

          const field = (name: string) => getRelatedPropertyFields(descriptor).find((f) => f.propertyName === name)!;
          // Unlike the nested declaration, the single declaration has no enclosing type category.
          validateCategoryChain(descriptor, field("AspectCategorized"), ["Geometry"]);
          validateCategoryChain(descriptor, field("AspectUncategorized"), ["WallTypeAspect"]);
        },
      );

      it("keeps top-level and nested class fallbacks distinct on the same path", async () => {
        const { items } = setup.schema;
        const config = createChainConfig(setup, { aspect: "parent" });
        config.imodelFieldsProviders.push(
          defineIModelFieldsProvider({
            id: "directAspect_v1",
            async getContribution({ target }) {
              if (target.primaryClass !== items.Wall.fullName) {
                return undefined;
              }
              return {
                relatedProperties: [
                  {
                    propertyCategoryScope: "parent",
                    path: [
                      {
                        sourceClassName: items.Wall.fullName,
                        targetClassName: items.WallType.fullName,
                        relationshipName: items.HasPhysicalType.fullName,
                      },
                      {
                        sourceClassName: items.WallType.fullName,
                        targetClassName: items.WallTypeAspect.fullName,
                        relationshipName: items.HasUniqueAspect.fullName,
                      },
                    ],
                    properties: [{ stepIndex: 1, target: { select: { include: ["AspectUncategorized"] } } }],
                  },
                ],
              };
            },
          }),
        );
        const descriptor = await buildDescriptor({
          imodelAccess: createContentIModelAccess(setup.ecdb),
          targets: [{ primaryClass: items.Wall.fullName }],
          config,
        });
        const fields = getRelatedPropertyFields(descriptor);
        const top = fields.find((field) => field.propertyName === "AspectUncategorized")!;
        const nested = fields.find((field) => field.propertyName === "AspectSecondUncategorized")!;
        expect(top.categoryId).not.toBe(nested.categoryId);
        validateCategoryChain(descriptor, top, ["WallTypeAspect"]);
        validateCategoryChain(descriptor, nested, ["WallType", "WallTypeAspect"]);
      });
    });
  });
});
