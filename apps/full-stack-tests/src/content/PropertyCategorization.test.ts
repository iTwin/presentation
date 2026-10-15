/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CategoryDefinition, defineIModelFieldsProvider } from "@itwin/presentation-content";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import { validateCategoryChain } from "./DescriptorValidation.js";
import {
  buildDescriptor,
  createContentIModelAccess,
  getFieldCategory,
  getPropertyFieldByName,
  getRelatedPropertyFields,
} from "./Utils.js";

import type { RelationshipPath } from "@itwin/presentation-shared";

describe("Content", () => {
  describe("Property categorization", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("assigns the EC schema property category to a direct field", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <PropertyCategory typeName="MyCategory" displayLabel="My Category" priority="10" />
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Categorized" typeName="string" category="MyCategory" />
              <ECProperty propertyName="Uncategorized" typeName="string" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.A.fullName, { categorized: "x", uncategorized: "y" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });

      const categorized = getPropertyFieldByName(descriptor, "Categorized");
      validateCategoryChain(descriptor, categorized, ["My Category"]);
    });

    it("auto-creates a category for related property fields", async () => {
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
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { imodelFieldsProviders: [provider] },
      });

      const propB = getRelatedPropertyFields(descriptor).find((f) => f.propertyName === "PropB");
      // The auto-created target category is labelled by the (unlabelled) target class name.
      validateCategoryChain(descriptor, propB!, ["B"]);
    });

    it("assigns a provider-declared category to related fields", async () => {
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
      const provider = defineIModelFieldsProvider({
        id: "provider_v1",
        async getContribution() {
          return {
            categories: { custom: { id: "custom", label: "Custom Category" } },
            relatedProperties: [
              {
                path: [
                  {
                    sourceClassName: setup.schema.items.A.fullName,
                    targetClassName: setup.schema.items.B.fullName,
                    relationshipName: setup.schema.items.AtoB.fullName,
                  },
                ],
                properties: [{ stepIndex: 0, target: { select: "all", defaultOverrides: { categoryId: "custom" } } }],
              },
            ],
          };
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { imodelFieldsProviders: [provider] },
      });

      const propB = getRelatedPropertyFields(descriptor).find((f) => f.propertyName === "PropB");
      expect(propB!.categoryId).toBe("custom");
      validateCategoryChain(descriptor, propB!, ["Custom Category"]);
    });

    it("nests related field under categories hierarchy", async () => {
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
      const provider = defineIModelFieldsProvider({
        id: "provider_v1",
        async getContribution() {
          return {
            categories: {
              parent: { id: "parent", label: "Parent Category" },
              child: { id: "child", label: "Child Category", parentId: "parent" },
            },
            relatedProperties: [
              {
                path: [
                  {
                    sourceClassName: setup.schema.items.A.fullName,
                    targetClassName: setup.schema.items.B.fullName,
                    relationshipName: setup.schema.items.AtoB.fullName,
                  },
                ],
                properties: [{ stepIndex: 0, target: { select: "all", defaultOverrides: { categoryId: "child" } } }],
              },
            ],
          };
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { imodelFieldsProviders: [provider] },
      });

      const propB = getRelatedPropertyFields(descriptor).find((f) => f.propertyName === "PropB");
      expect(propB!.categoryId).toBe("child");
      validateCategoryChain(descriptor, propB!, ["Parent Category", "Child Category"]);
    });

    it("nests a related target category under its relationship category", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B" displayLabel="Class B">
              <ECProperty propertyName="PropB" typeName="string" />
            </ECEntityClass>
            <ECRelationshipClass typeName="AtoB" strength="referencing" modifier="None" displayLabel="A To B">
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
          return {
            relatedProperties: [
              { path, properties: [{ stepIndex: 0, target: { select: "all" }, relationship: { select: "all" } }] },
            ],
          };
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { imodelFieldsProviders: [provider] },
      });

      const relProp = getRelatedPropertyFields(descriptor).find((f) => f.propertyName === "RelProp");
      const propB = getRelatedPropertyFields(descriptor).find((f) => f.propertyName === "PropB");
      // The relationship-class field's category is top-level; the target-class field's category nests
      // under it.
      validateCategoryChain(descriptor, relProp!, ["A To B"]);
      validateCategoryChain(descriptor, propB!, ["A To B", "Class B"]);
    });

    it("prefers a provider category override over the EC schema property category", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <PropertyCategory typeName="BCat" displayLabel="B Category" priority="10" />
            <ECEntityClass typeName="A">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B" displayLabel="Class B">
              <ECProperty propertyName="Categorized" typeName="string" category="BCat" />
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
        const b = builder.insertInstance(s.items.B.fullName, { categorized: "c" });
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
          return {
            categories: { custom: { id: "custom", label: "Custom Category" } },
            relatedProperties: [
              {
                path,
                properties: [{ stepIndex: 0, target: { select: "all", defaultOverrides: { categoryId: "custom" } } }],
              },
            ],
          };
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { imodelFieldsProviders: [provider] },
      });

      const categorized = getRelatedPropertyFields(descriptor).find((f) => f.propertyName === "Categorized");
      // The override wins over the field's EC schema property category.
      expect(categorized!.categoryId).toBe("custom");
      validateCategoryChain(descriptor, categorized!, ["Custom Category"]);
    });

    it("nests a related field's EC schema property category under its class anchor", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <PropertyCategory typeName="BCat" displayLabel="B Category" priority="10" />
            <ECEntityClass typeName="A">
              <ECProperty propertyName="PropA" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B" displayLabel="Class B">
              <ECProperty propertyName="Categorized" typeName="string" category="BCat" />
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
        const b = builder.insertInstance(s.items.B.fullName, { categorized: "c" });
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
          return { relatedProperties: [{ path, properties: [{ stepIndex: 0, target: { select: "all" } }] }] };
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { imodelFieldsProviders: [provider] },
      });

      const categorized = getRelatedPropertyFields(descriptor).find((f) => f.propertyName === "Categorized");
      validateCategoryChain(descriptor, categorized!, ["Class B", "B Category"]);
    });

    it("leaves a direct field without a category when it has none", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <PropertyCategory typeName="MyCategory" displayLabel="My Category" priority="10" />
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Categorized" typeName="string" category="MyCategory" />
              <ECProperty propertyName="Uncategorized" typeName="string" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.A.fullName, { categorized: "x", uncategorized: "y" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
      });

      // There is no default category: an uncategorized direct field simply has no category.
      const uncategorized = getPropertyFieldByName(descriptor, "Uncategorized");
      expect(uncategorized.categoryId).toBeUndefined();
      expect(getFieldCategory(descriptor, uncategorized)).toBeUndefined();

      // The categorized field still gets its EC schema category.
      const categorized = getPropertyFieldByName(descriptor, "Categorized");
      validateCategoryChain(descriptor, categorized, ["My Category"]);
    });

    it("leaves a dangling category reference when an override names an undeclared category", async () => {
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
      const provider = defineIModelFieldsProvider({
        id: "provider_v1",
        async getContribution() {
          // References a category id that is not declared in `categories`.
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
                properties: [
                  { stepIndex: 0, target: { select: "all", defaultOverrides: { categoryId: "does-not-exist" } } },
                ],
              },
            ],
          };
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { imodelFieldsProviders: [provider] },
      });

      const propB = getRelatedPropertyFields(descriptor).find((f) => f.propertyName === "PropB");
      expect(propB!.categoryId).toBe("does-not-exist");
      // The undeclared category is not fabricated, so the field resolves to no category chain.
      validateCategoryChain(descriptor, propB!, []);
    });

    describe("property category scope", () => {
      type Scope = "relatedClass" | "parent" | undefined;

      /** `A -[AtoB]-> B` and `A -[AtoB2]-> B` over one `B` carrying categorized and uncategorized properties. */
      async function buildScopeSetup() {
        return buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <PropertyCategory typeName="Geometry" displayLabel="Geometry" />
              <ECEntityClass typeName="A">
                <ECProperty propertyName="PropA" typeName="string" />
              </ECEntityClass>
              <ECEntityClass typeName="B" displayLabel="Class B">
                <ECProperty propertyName="Categorized" typeName="string" category="Geometry" />
                <ECProperty propertyName="Uncategorized" typeName="string" />
              </ECEntityClass>
              <ECRelationshipClass typeName="AtoB" strength="referencing" modifier="None">
                <Source multiplicity="(0..*)" roleLabel="a to b" polymorphic="true">
                  <Class class="A" />
                </Source>
                <Target multiplicity="(0..*)" roleLabel="b to a" polymorphic="true">
                  <Class class="B" />
                </Target>
              </ECRelationshipClass>
              <ECRelationshipClass typeName="AtoB2" strength="referencing" modifier="None">
                <Source multiplicity="(0..*)" roleLabel="a to b 2" polymorphic="true">
                  <Class class="A" />
                </Source>
                <Target multiplicity="(0..*)" roleLabel="b to a 2" polymorphic="true">
                  <Class class="B" />
                </Target>
              </ECRelationshipClass>
            `,
          );
          const a = builder.insertInstance(s.items.A.fullName, { propA: "a" });
          const b = builder.insertInstance(s.items.B.fullName, { categorized: "c", uncategorized: "u" });
          builder.insertRelationship(s.items.AtoB.fullName, a.id, b.id);
          builder.insertRelationship(s.items.AtoB2.fullName, a.id, b.id);
          return { schema: s };
        });
      }

      type ScopeSetup = Awaited<ReturnType<typeof buildScopeSetup>>;

      function createScopeProvider(
        setup: ScopeSetup,
        declarations: Array<{
          relationship: "AtoB" | "AtoB2";
          scope: Scope;
          defaultOverrides?: { categoryId: string };
          overrides?: Record<string, { categoryId: string }>;
        }>,
        categories?: Record<string, { id: string; label: string; parentId?: string }>,
      ) {
        return defineIModelFieldsProvider({
          id: "provider_v1",
          async getContribution() {
            return {
              ...(categories ? { categories } : undefined),
              relatedProperties: declarations.map(({ relationship, scope, defaultOverrides, overrides }) => ({
                path: [
                  {
                    sourceClassName: setup.schema.items.A.fullName,
                    targetClassName: setup.schema.items.B.fullName,
                    relationshipName: setup.schema.items[relationship].fullName,
                  },
                ],
                cardinalityHint: "one" as const,
                ...(scope ? { propertyCategoryScope: scope } : undefined),
                ...(defaultOverrides || overrides
                  ? { properties: [{ stepIndex: 0, target: { select: "all" as const, defaultOverrides, overrides } }] }
                  : undefined),
              })),
            };
          },
        });
      }

      async function buildScopeDescriptor(setup: ScopeSetup, provider: ReturnType<typeof createScopeProvider>) {
        return buildDescriptor({
          imodelAccess: createContentIModelAccess(setup.ecdb),
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
          config: { imodelFieldsProviders: [provider] },
        });
      }

      function fieldsOf(descriptor: Awaited<ReturnType<typeof buildScopeDescriptor>>, relationship: "AtoB" | "AtoB2") {
        const fields = getRelatedPropertyFields(descriptor).filter((f) =>
          f.pathFromTarget[0].relationshipName.endsWith(relationship),
        );
        return {
          categorized: fields.find((f) => f.propertyName === "Categorized")!,
          uncategorized: fields.find((f) => f.propertyName === "Uncategorized")!,
        };
      }

      it.each([undefined, "relatedClass" as const])(
        `nests property categories under the related class category when scope is %s`,
        async (scope) => {
          using setup = await buildScopeSetup();
          const descriptor = await buildScopeDescriptor(
            setup,
            createScopeProvider(setup, [{ relationship: "AtoB", scope }]),
          );

          const { categorized, uncategorized } = fieldsOf(descriptor, "AtoB");
          validateCategoryChain(descriptor, categorized, ["Class B", "Geometry"]);
          validateCategoryChain(descriptor, uncategorized, ["Class B"]);
        },
      );

      it("attaches property categories to the enclosing context when scope is parent", async () => {
        using setup = await buildScopeSetup();
        const descriptor = await buildScopeDescriptor(
          setup,
          createScopeProvider(setup, [{ relationship: "AtoB", scope: "parent" }]),
        );

        const { categorized, uncategorized } = fieldsOf(descriptor, "AtoB");
        validateCategoryChain(descriptor, categorized, ["Geometry"]);
        expect(descriptor.categories[categorized.categoryId!].parentId).toBeUndefined();
        // Uncategorized properties keep the related class fallback.
        validateCategoryChain(descriptor, uncategorized, ["Class B"]);
        expect(descriptor.categories[uncategorized.categoryId!].parentId).toBeUndefined();
      });

      it.each(["relatedClass", "parent"] as const)(
        "prefers an explicit category override over scope %s",
        async (scope) => {
          using setup = await buildScopeSetup();
          const descriptor = await buildScopeDescriptor(
            setup,
            createScopeProvider(setup, [{ relationship: "AtoB", scope, defaultOverrides: { categoryId: "custom" } }], {
              custom: { id: "custom", label: "Custom" },
            }),
          );

          const { categorized, uncategorized } = fieldsOf(descriptor, "AtoB");
          expect(categorized.categoryId).toBe("custom");
          validateCategoryChain(descriptor, categorized, ["Custom"]);
          validateCategoryChain(descriptor, uncategorized, ["Custom"]);
        },
      );

      it("shares a class category reached over different relationships under the same parent", async () => {
        using setup = await buildScopeSetup();
        const descriptor = await buildScopeDescriptor(
          setup,
          createScopeProvider(setup, [
            { relationship: "AtoB", scope: "parent" },
            { relationship: "AtoB2", scope: "parent" },
          ]),
        );

        const viaFirst = fieldsOf(descriptor, "AtoB");
        const viaSecond = fieldsOf(descriptor, "AtoB2");
        // Two distinct fields, one category each for the class fallback and for the property category.
        expect(viaFirst.uncategorized.id).not.toBe(viaSecond.uncategorized.id);
        expect(viaFirst.uncategorized.categoryId).toBe(viaSecond.uncategorized.categoryId);
        expect(viaFirst.categorized.categoryId).toBe(viaSecond.categorized.categoryId);
        validateCategoryChain(descriptor, viaFirst.uncategorized, ["Class B"]);
        validateCategoryChain(descriptor, viaSecond.uncategorized, ["Class B"]);
        validateCategoryChain(descriptor, viaFirst.categorized, ["Geometry"]);
        validateCategoryChain(descriptor, viaSecond.categorized, ["Geometry"]);
      });

      it("updates provider category parents and overrides when class categories are merged", async () => {
        using setup = await buildScopeSetup();
        const originalClassCategoryId = CategoryDefinition.computeId({
          path: [
            {
              sourceClassName: setup.schema.items.A.fullName,
              targetClassName: setup.schema.items.B.fullName,
              relationshipName: setup.schema.items.AtoB.fullName,
            },
          ],
        });
        const child = { id: "child", label: "Child", parentId: originalClassCategoryId };
        const propertyName = "Categorized";
        const descriptor = await buildScopeDescriptor(
          setup,
          createScopeProvider(
            setup,
            [
              { relationship: "AtoB", scope: "parent", overrides: { [propertyName]: { categoryId: "child" } } },
              {
                relationship: "AtoB2",
                scope: "parent",
                overrides: { [propertyName]: { categoryId: originalClassCategoryId } },
              },
            ],
            { child },
          ),
        );
        const viaFirst = fieldsOf(descriptor, "AtoB");
        const viaSecond = fieldsOf(descriptor, "AtoB2");
        validateCategoryChain(descriptor, viaFirst.categorized, ["Class B", "Child"]);
        validateCategoryChain(descriptor, viaSecond.categorized, ["Class B"]);
        validateCategoryChain(descriptor, viaFirst.uncategorized, ["Class B"]);
        validateCategoryChain(descriptor, viaSecond.uncategorized, ["Class B"]);
        expect(Object.keys(descriptor.categories)).not.toContain(originalClassCategoryId);
        expect(child.parentId).toBe(originalClassCategoryId);
      });

      it("keeps class and property categories with matching unqualified names separate across schemas", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const schemas = [];
          for (const suffix of ["First", "Second"]) {
            const schema = await importSchema(
              `${testName}_${suffix}`,
              builder,
              `
              <PropertyCategory typeName="Geometry" displayLabel="${suffix} Geometry" />
              <ECEntityClass typeName="A"><ECProperty propertyName="Name" typeName="string" /></ECEntityClass>
              <ECEntityClass typeName="B" displayLabel="${suffix} B">
                <ECProperty propertyName="Categorized" typeName="string" category="Geometry" />
                <ECProperty propertyName="Uncategorized" typeName="string" />
              </ECEntityClass>
              <ECRelationshipClass typeName="AtoB" strength="referencing" modifier="None">
                <Source multiplicity="(0..*)" roleLabel="source" polymorphic="true"><Class class="A" /></Source>
                <Target multiplicity="(0..*)" roleLabel="target" polymorphic="true"><Class class="B" /></Target>
              </ECRelationshipClass>
            `,
            );
            const source = builder.insertInstance(schema.items.A.fullName, { name: suffix });
            const target = builder.insertInstance(schema.items.B.fullName, {
              categorized: suffix,
              uncategorized: suffix,
            });
            builder.insertRelationship(schema.items.AtoB.fullName, source.id, target.id);
            schemas.push(schema);
          }
          return { schemas };
        });
        const descriptor = await buildDescriptor({
          imodelAccess: createContentIModelAccess(setup.ecdb),
          targets: setup.schemas.map((schema) => ({ primaryClass: schema.items.A.fullName })),
          config: {
            imodelFieldsProviders: [
              defineIModelFieldsProvider({
                id: "crossSchema_v1",
                async getContribution({ target }) {
                  const schema = setup.schemas.find((candidate) => candidate.items.A.fullName === target.primaryClass)!;
                  return {
                    relatedProperties: [
                      {
                        propertyCategoryScope: "parent",
                        path: [
                          {
                            sourceClassName: schema.items.A.fullName,
                            targetClassName: schema.items.B.fullName,
                            relationshipName: schema.items.AtoB.fullName,
                          },
                        ],
                      },
                    ],
                  };
                },
              }),
            ],
          },
        });
        const fields = getRelatedPropertyFields(descriptor);
        for (const propertyName of ["Categorized", "Uncategorized"]) {
          const selected = fields.filter((field) => field.propertyName === propertyName);
          expect(selected).toHaveLength(2);
          expect(selected[0].id).not.toBe(selected[1].id);
          expect(selected[0].categoryId).not.toBe(selected[1].categoryId);
        }
        expect(
          Object.values(descriptor.categories)
            .map((category) => category.label)
            .sort(),
        ).toEqual(["First B", "First Geometry", "Second B", "Second Geometry"]);
      });

      it("keeps a property category with the same name distinct under different parents", async () => {
        using setup = await buildScopeSetup();
        const descriptor = await buildScopeDescriptor(
          setup,
          createScopeProvider(setup, [
            { relationship: "AtoB", scope: "parent" },
            { relationship: "AtoB2", scope: "relatedClass" },
          ]),
        );

        const topLevel = fieldsOf(descriptor, "AtoB").categorized;
        const nested = fieldsOf(descriptor, "AtoB2").categorized;
        expect(topLevel.categoryId).not.toBe(nested.categoryId);
        validateCategoryChain(descriptor, topLevel, ["Geometry"]);
        validateCategoryChain(descriptor, nested, ["Class B", "Geometry"]);
      });

      it.each([
        { scope: "relatedClass" as const, categorizedChain: ["A To B", "Geometry"] },
        { scope: "parent" as const, categorizedChain: ["Geometry"] },
      ])("applies $scope scope to relationship class properties", async ({ scope, categorizedChain }) => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <PropertyCategory typeName="Geometry" displayLabel="Geometry" />
              <ECEntityClass typeName="A">
                <ECProperty propertyName="PropA" typeName="string" />
              </ECEntityClass>
              <ECEntityClass typeName="B" displayLabel="Class B">
                <ECProperty propertyName="PropB" typeName="string" />
              </ECEntityClass>
              <ECRelationshipClass typeName="AtoB" strength="referencing" modifier="None" displayLabel="A To B">
                <ECProperty propertyName="RelCategorized" typeName="string" category="Geometry" />
                <ECProperty propertyName="RelUncategorized" typeName="string" />
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
          builder.insertRelationship(s.items.AtoB.fullName, a.id, b.id, { relCategorized: "c", relUncategorized: "u" });
          return { schema: s };
        });
        const path: RelationshipPath = [
          {
            sourceClassName: setup.schema.items.A.fullName,
            targetClassName: setup.schema.items.B.fullName,
            relationshipName: setup.schema.items.AtoB.fullName,
          },
        ];
        const descriptor = await buildDescriptor({
          imodelAccess: createContentIModelAccess(setup.ecdb),
          targets: [{ primaryClass: setup.schema.items.A.fullName }],
          config: {
            imodelFieldsProviders: [
              defineIModelFieldsProvider({
                id: "provider_v1",
                async getContribution() {
                  return {
                    relatedProperties: [
                      {
                        path,
                        propertyCategoryScope: scope,
                        properties: [{ stepIndex: 0, target: { select: "all" }, relationship: { select: "all" } }],
                      },
                    ],
                  };
                },
              }),
            ],
          },
        });
        const fields = getRelatedPropertyFields(descriptor);
        validateCategoryChain(
          descriptor,
          fields.find((field) => field.propertyName === "RelCategorized")!,
          categorizedChain,
        );
        validateCategoryChain(
          descriptor,
          fields.find((field) => field.propertyName === "RelUncategorized")!,
          ["A To B"],
        );
        validateCategoryChain(
          descriptor,
          fields.find((field) => field.propertyName === "PropB")!,
          ["A To B", "Class B"],
        );
      });
    });
  });
});
