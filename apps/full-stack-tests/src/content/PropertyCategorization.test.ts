/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineIModelFieldsProvider } from "@itwin/presentation-content";
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
  });
});
