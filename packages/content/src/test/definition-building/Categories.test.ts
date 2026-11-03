/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { collectCategories, pruneUnreferencedCategories } from "../../content/definition-building/Categories.js";
import { createContributionMemoizer } from "../../content/definition-building/ContributionMemoizer.js";
import { CategoryDefinition } from "../../content/model/Category.js";
import { createEntityClass, createSchemaAccess } from "../MetadataStubs.js";

import type { EC, RelationshipPath } from "@itwin/presentation-shared";
import type { ContentSource } from "../../content/ContentTarget.js";
import type { CategorizedField, FieldCategorization } from "../../content/definition-building/ClassPropertyFields.js";
import type { ExternalFieldsProvider } from "../../content/extensions/ExternalFieldsProvider.js";
import type { IModelFieldsProvider } from "../../content/extensions/IModelFieldsProvider.js";
import type { PropertyField } from "../../content/model/Field.js";

const aToB: RelationshipPath[number] = {
  sourceClassName: "TestSchema.A",
  targetClassName: "TestSchema.B",
  relationshipName: "TestSchema.aToB",
};
const bToC: RelationshipPath[number] = {
  sourceClassName: "TestSchema.B",
  targetClassName: "TestSchema.C",
  relationshipName: "TestSchema.bToC",
};
const cToD: RelationshipPath[number] = {
  sourceClassName: "TestSchema.C",
  targetClassName: "TestSchema.D",
  relationshipName: "TestSchema.cToD",
};

function createSource(): ContentSource {
  return {
    target: { primaryClass: "TestSchema.A" },
    resolvedPrimaryClasses: ["TestSchema.A"],
    resolvedDeclarations: [],
    resolvedExternalInputs: [],
  };
}

function createProvider(
  id: IModelFieldsProvider["id"],
  categories: Record<string, CategoryDefinition>,
  priority?: number,
): IModelFieldsProvider {
  return {
    id,
    ...(priority !== undefined ? { priority } : undefined),
    async getContribution() {
      return { categories };
    },
  };
}

const getContribution: Parameters<typeof collectCategories>[0]["getContribution"] = async ({ provider, target }) =>
  provider.getContribution({ imodelAccess: createSchemaAccess([]), target });

const getAnchorContribution: Parameters<typeof collectCategories>[0]["getAnchorContribution"] = async ({
  provider,
  anchorClassName,
}) => provider.getContribution({ imodelAccess: createSchemaAccess([]), target: { primaryClass: anchorClassName } });

function createExternalProvider(
  id: ExternalFieldsProvider["id"],
  categories?: Record<string, CategoryDefinition>,
  priority?: number,
): ExternalFieldsProvider {
  return {
    id,
    fields: [],
    ...(categories !== undefined ? { categories } : undefined),
    ...(priority !== undefined ? { priority } : undefined),
    async getValues() {
      return [];
    },
  };
}

/** An enumerated related property field paired with its category facts (input to `collectCategories`). */
function createCategorizedField(props: {
  id?: string;
  propertyName?: string;
  pathFromTarget?: RelationshipPath;
  anchor?: FieldCategorization["anchor"];
  propertyCategory?: { id: EC.FullClassNameDotNotation; label: string };
  overrideCategoryId?: string;
  propertyCategoryScope?: FieldCategorization["propertyCategoryScope"];
  categoryContext?: FieldCategorization["categoryContext"];
}): CategorizedField {
  const id = props.id ?? "field";
  const categorization: FieldCategorization = {
    anchor: props.anchor ?? (props.pathFromTarget?.length ? "targetClass" : "none"),
    categoryContext: props.categoryContext ?? [],
  };
  if (props.propertyCategoryScope !== undefined) {
    categorization.propertyCategoryScope = props.propertyCategoryScope;
  }
  if (props.propertyCategory) {
    categorization.category = { source: "propertyCategory", ...props.propertyCategory };
  }
  if (props.overrideCategoryId !== undefined) {
    categorization.category = { source: "override", id: props.overrideCategoryId };
  }
  return {
    field: {
      kind: "property",
      id,
      label: "Field",
      type: { kind: "primitive", type: "String" },
      propertyClassName: "TestSchema.B",
      propertyName: props.propertyName ?? "Prop",
      pathFromTarget: props.pathFromTarget ?? [],
      valueClassNames: ["TestSchema.B"],
      primaryClassNames: props.pathFromTarget?.length ? [props.pathFromTarget[0].sourceClassName] : ["TestSchema.B"],
      pathCardinality: "one",
    },
    categorization,
  };
}

/** A final property field (with `categoryId` already assigned) for the pruning tests. */
function createFieldWithCategory(props: { id?: string; categoryId?: string }): PropertyField {
  const id = props.id ?? "field";
  return {
    kind: "property",
    id,
    label: "Field",
    type: { kind: "primitive", type: "String" },
    propertyClassName: "TestSchema.B",
    propertyName: "Prop",
    pathFromTarget: [],
    valueClassNames: ["TestSchema.B"],
    primaryClassNames: ["TestSchema.B"],
    pathCardinality: "one",
    ...(props.categoryId !== undefined ? { categoryId: props.categoryId } : undefined),
  };
}

describe("collectCategories", () => {
  it("collects categories contributed by providers", async () => {
    const provider = createProvider("p_v1", { cat: { id: "cat", label: "Cat" } });
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([]),
      sources: [createSource()],
      imodelFieldsProviders: [provider],
      externalFieldsProviders: [],
      getContribution,
      getAnchorContribution,
      fields: [],
    });
    expect(categories).to.deep.equal({ cat: { id: "cat", label: "Cat" } });
  });

  it("skips providers that contribute no categories", async () => {
    const provider: IModelFieldsProvider = {
      id: "p_v1",
      async getContribution() {
        return { relatedProperties: [] };
      },
    };
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([]),
      sources: [createSource()],
      imodelFieldsProviders: [provider],
      externalFieldsProviders: [],
      getContribution,
      getAnchorContribution,
      fields: [],
    });
    expect(categories).to.deep.equal({});
  });

  it("resolves category id conflicts in favor of the higher-priority provider", async () => {
    const low = createProvider("low_v1", { cat: { id: "cat", label: "Low" } }, 1);
    const high = createProvider("high_v1", { cat: { id: "cat", label: "High" } }, 2);
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([]),
      sources: [createSource()],
      imodelFieldsProviders: [low, high],
      externalFieldsProviders: [],
      getContribution,
      getAnchorContribution,
      fields: [],
    });
    expect(categories.cat.label).to.equal("High");
  });

  it("keeps the first-seen category on a priority tie", async () => {
    const first = createProvider("first_v1", { cat: { id: "cat", label: "First" } }, 5);
    const second = createProvider("second_v1", { cat: { id: "cat", label: "Second" } }, 5);
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([]),
      sources: [createSource()],
      imodelFieldsProviders: [first, second],
      externalFieldsProviders: [],
      getContribution,
      getAnchorContribution,
      fields: [],
    });
    expect(categories.cat.label).to.equal("First");
  });

  it("collects categories from external fields providers and resolves conflicts by priority", async () => {
    const imodelProvider = createProvider("imodel_v1", { shared: { id: "shared", label: "From iModel" } }, 1);
    const external = createExternalProvider(
      "ext_v1",
      { shared: { id: "shared", label: "From External" }, extOnly: { id: "extOnly", label: "Ext Only" } },
      2,
    );
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([]),
      sources: [createSource()],
      imodelFieldsProviders: [imodelProvider],
      externalFieldsProviders: [external],
      getContribution,
      getAnchorContribution,
      fields: [],
    });
    expect(categories.shared.label).to.equal("From External");
    expect(categories.extOnly).to.deep.equal({ id: "extOnly", label: "Ext Only" });
  });

  it("reuses category IDs across filtered paths that share the same relationship", () => {
    const filteredA: RelationshipPath = [
      { ...aToB, instanceFilter: { expression: "this.Kind = :kindA", bindings: { kindA: { type: "int", value: 1 } } } },
    ];
    const filteredB: RelationshipPath = [
      { ...aToB, instanceFilter: { expression: "this.Kind = :kindB", bindings: { kindB: { type: "int", value: 2 } } } },
    ];

    expect(CategoryDefinition.computeId({ path: filteredA })).to.equal(
      CategoryDefinition.computeId({ path: filteredB }),
    );
    expect(CategoryDefinition.computeId({ path: filteredA, omitTargetClass: true })).to.equal(
      CategoryDefinition.computeId({ path: filteredB, omitTargetClass: true }),
    );
  });

  it("ignores external fields providers that declare no categories", async () => {
    const external = createExternalProvider("ext_v1");
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([]),
      sources: [createSource()],
      imodelFieldsProviders: [],
      externalFieldsProviders: [external],
      getContribution,
      getAnchorContribution,
      fields: [],
    });
    expect(categories).to.deep.equal({});
  });

  it("applies the default priority to external categories without an explicit priority", async () => {
    // External provider with no explicit priority uses DEFAULT_FIELDS_PROVIDER_PRIORITY (1000).
    // A competing iModel provider at priority 999 loses; one at priority 1001 wins.
    const external = createExternalProvider("ext_v1", { cat: { id: "cat", label: "Ext" } });

    const lowerPriorityProvider = createProvider("low_v1", { cat: { id: "cat", label: "Lower" } }, 999);
    const categoriesVsLower = await collectCategories({
      imodelAccess: createSchemaAccess([]),
      sources: [createSource()],
      imodelFieldsProviders: [lowerPriorityProvider],
      externalFieldsProviders: [external],
      getContribution,
      getAnchorContribution,
      fields: [],
    });
    expect(categoriesVsLower.cat.label).to.equal("Ext");

    const higherPriorityProvider = createProvider("high_v1", { cat: { id: "cat", label: "Higher" } }, 1001);
    const categoriesVsHigher = await collectCategories({
      imodelAccess: createSchemaAccess([]),
      sources: [createSource()],
      imodelFieldsProviders: [higherPriorityProvider],
      externalFieldsProviders: [external],
      getContribution,
      getAnchorContribution,
      fields: [],
    });
    expect(categoriesVsHigher.cat.label).to.equal("Higher");
  });

  it("auto-creates a category for a related field without one, labelled by the terminal class", async () => {
    const field = createCategorizedField({ pathFromTarget: [aToB] });
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([createEntityClass({ fullName: "TestSchema.B", label: "The B" })]),
      sources: [createSource()],
      imodelFieldsProviders: [],
      externalFieldsProviders: [],
      getContribution,
      getAnchorContribution,
      fields: [field],
    });
    const id = CategoryDefinition.computeId({ path: [aToB] });
    expect(categories[id]).to.deep.equal({ id, label: "The B" });
    expect(field.field.categoryId).to.equal(id);
  });

  it("shares one auto-created category across related fields on the same path", async () => {
    const a = createCategorizedField({ id: "a", propertyName: "A", pathFromTarget: [aToB] });
    const b = createCategorizedField({ id: "b", propertyName: "B", pathFromTarget: [aToB] });
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([createEntityClass({ fullName: "TestSchema.B" })]),
      sources: [createSource()],
      imodelFieldsProviders: [],
      externalFieldsProviders: [],
      getContribution,
      getAnchorContribution,
      fields: [a, b],
    });
    const id = CategoryDefinition.computeId({ path: [aToB] });
    expect(Object.keys(categories)).to.deep.equal([id]);
    expect(a.field.categoryId).to.equal(id);
    expect(b.field.categoryId).to.equal(id);
  });

  it("creates a single terminal category when no fields attach at intermediate classes", async () => {
    // Segment [a->b->c->d]: only a field at the full path → only a `d` category, no `b`/`c`.
    const field = createCategorizedField({ id: "d", pathFromTarget: [aToB, bToC, cToD] });
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([createEntityClass({ fullName: "TestSchema.D", label: "The D" })]),
      sources: [createSource()],
      imodelFieldsProviders: [],
      externalFieldsProviders: [],
      getContribution,
      getAnchorContribution,
      fields: [field],
    });
    const dId = CategoryDefinition.computeId({ path: [aToB, bToC, cToD] });
    expect(Object.keys(categories)).to.deep.equal([dId]);
    expect(categories[dId]).to.deep.equal({ id: dId, label: "The D" });
    expect(field.field.categoryId).to.equal(dId);
  });

  it("nests a terminal under its explicit ancestor, skipping intermediate classes", async () => {
    const bField = createCategorizedField({ id: "b", propertyName: "PB", pathFromTarget: [aToB] });
    const dField = createCategorizedField({
      id: "d",
      propertyName: "PD",
      pathFromTarget: [aToB, bToC, cToD],
      categoryContext: [{ stepIndex: 0, kind: "targetClass" }],
    });
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([
        createEntityClass({ fullName: "TestSchema.B", label: "The B" }),
        createEntityClass({ fullName: "TestSchema.D", label: "The D" }),
      ]),
      sources: [createSource()],
      imodelFieldsProviders: [],
      externalFieldsProviders: [],
      getContribution,
      getAnchorContribution,
      fields: [bField, dField],
    });
    const bId = CategoryDefinition.computeId({ path: [aToB] });
    const dId = CategoryDefinition.computeId({ path: [aToB, bToC, cToD] });
    expect(new Set(Object.keys(categories))).to.deep.equal(new Set([bId, dId]));
    expect(categories[bId]).to.deep.equal({ id: bId, label: "The B" });
    expect(categories[dId]).to.deep.equal({ id: dId, label: "The D", parentId: bId });
  });

  it("nests a full chain of categories from explicit contexts", async () => {
    const bField = createCategorizedField({ id: "b", propertyName: "PB", pathFromTarget: [aToB] });
    const cField = createCategorizedField({
      id: "c",
      propertyName: "PC",
      pathFromTarget: [aToB, bToC],
      categoryContext: [{ stepIndex: 0, kind: "targetClass" }],
    });
    const dField = createCategorizedField({
      id: "d",
      propertyName: "PD",
      pathFromTarget: [aToB, bToC, cToD],
      categoryContext: [
        { stepIndex: 0, kind: "targetClass" },
        { stepIndex: 1, kind: "targetClass" },
      ],
    });
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([
        createEntityClass({ fullName: "TestSchema.B", label: "The B" }),
        createEntityClass({ fullName: "TestSchema.C", label: "The C" }),
        createEntityClass({ fullName: "TestSchema.D", label: "The D" }),
      ]),
      sources: [createSource()],
      imodelFieldsProviders: [],
      externalFieldsProviders: [],
      getContribution,
      getAnchorContribution,
      fields: [bField, cField, dField],
    });
    const bId = CategoryDefinition.computeId({ path: [aToB] });
    const cId = CategoryDefinition.computeId({ path: [aToB, bToC] });
    const dId = CategoryDefinition.computeId({ path: [aToB, bToC, cToD] });
    expect(categories[bId]).to.deep.equal({ id: bId, label: "The B" });
    expect(categories[cId]).to.deep.equal({ id: cId, label: "The C", parentId: bId });
    expect(categories[dId]).to.deep.equal({ id: dId, label: "The D", parentId: cId });
  });

  it("does not nest under a shorter terminal that is not a path prefix", async () => {
    // Two unrelated paths: a shorter terminal on a different branch must not become a parent.
    const aToY: RelationshipPath[number] = {
      sourceClassName: "TestSchema.A",
      targetClassName: "TestSchema.Y",
      relationshipName: "TestSchema.aToY",
    };
    const yField = createCategorizedField({ id: "y", propertyName: "PY", pathFromTarget: [aToY] });
    const cField = createCategorizedField({ id: "c", propertyName: "PC", pathFromTarget: [aToB, bToC] });
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([
        createEntityClass({ fullName: "TestSchema.Y", label: "The Y" }),
        createEntityClass({ fullName: "TestSchema.C", label: "The C" }),
      ]),
      sources: [createSource()],
      imodelFieldsProviders: [],
      externalFieldsProviders: [],
      getContribution,
      getAnchorContribution,
      fields: [yField, cField],
    });
    const yId = CategoryDefinition.computeId({ path: [aToY] });
    const cId = CategoryDefinition.computeId({ path: [aToB, bToC] });
    expect(categories[yId]).to.deep.equal({ id: yId, label: "The Y" });
    expect(categories[cId]).to.deep.equal({ id: cId, label: "The C" });
  });

  it("does not auto-create for direct fields or fields that already have a category", async () => {
    const direct = createCategorizedField({ id: "direct", pathFromTarget: [], anchor: "none" });
    const categorized = createCategorizedField({
      id: "categorized",
      pathFromTarget: [aToB],
      overrideCategoryId: "explicit",
    });
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([]),
      sources: [createSource()],
      imodelFieldsProviders: [],
      externalFieldsProviders: [],
      getContribution,
      getAnchorContribution,
      fields: [direct, categorized],
    });
    expect(categories).to.deep.equal({});
    expect(direct.field.categoryId).toBeUndefined();
    expect(categorized.field.categoryId).to.equal("explicit");
  });

  it("does not auto-create when a provider already declared the field's path category", async () => {
    const id = CategoryDefinition.computeId({ path: [aToB] });
    const field = createCategorizedField({ pathFromTarget: [aToB] });
    const provider = createProvider("p_v1", { [id]: { id, label: "Provider Category" } });
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([createEntityClass({ fullName: "TestSchema.B", label: "Should not be used" })]),
      sources: [createSource()],
      imodelFieldsProviders: [provider],
      externalFieldsProviders: [],
      getContribution,
      getAnchorContribution,
      fields: [field],
    });
    expect(categories[id].label).to.equal("Provider Category");
    expect(field.field.categoryId).to.equal(id);
  });

  it("does not auto-create when a provider already declared a relationship category", async () => {
    const id = CategoryDefinition.computeId({ path: [aToB], omitTargetClass: true });
    const field = createCategorizedField({ pathFromTarget: [aToB], anchor: "relationshipClass" });
    const provider = createProvider("p_v1", { [id]: { id, label: "Provider Relationship" } });
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([]),
      sources: [createSource()],
      imodelFieldsProviders: [provider],
      externalFieldsProviders: [],
      getContribution,
      getAnchorContribution,
      fields: [field],
    });
    expect(categories[id].label).to.equal("Provider Relationship");
    expect(field.field.categoryId).to.equal(id);
  });

  it("nests a related field's property category under the auto-created path category", async () => {
    // A related field carrying a schema property category keeps that (sub-)category, but the path
    // category it nests under must still be auto-created — unlike an override, which suppresses it.
    const parentId = CategoryDefinition.computeId({ path: [aToB] });
    const propertyCategoryId = `${parentId}/TestSchema.Geometry`;
    const field = createCategorizedField({
      pathFromTarget: [aToB],
      propertyCategory: { id: "TestSchema.Geometry", label: "Geometry" },
    });
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([createEntityClass({ fullName: "TestSchema.B", label: "B Label" })]),
      sources: [createSource()],
      imodelFieldsProviders: [],
      externalFieldsProviders: [],
      getContribution,
      getAnchorContribution,
      fields: [field],
    });
    expect(field.field.categoryId).to.equal(propertyCategoryId);
    expect(categories[propertyCategoryId]).to.deep.equal({ id: propertyCategoryId, label: "Geometry", parentId });
    expect(categories[parentId]).to.deep.equal({ id: parentId, label: "B Label" });
  });

  it("nests the target category and both schema sub-categories under the relationship category", async () => {
    // A step that loads both target- and relationship-class properties (both with the same schema
    // category): the relationship class becomes the top-level group, the target class nests under it,
    // and the shared property category yields a distinct sub-category under each owner.
    const geometry = { id: "TestSchema.Geometry", label: "Geometry" } as const;
    const relUn = createCategorizedField({
      id: "relUn",
      propertyName: "RelUn",
      pathFromTarget: [aToB],
      anchor: "relationshipClass",
    });
    const relCat = createCategorizedField({
      id: "relCat",
      propertyName: "RelCat",
      pathFromTarget: [aToB],
      anchor: "relationshipClass",
      propertyCategory: geometry,
    });
    const targetUn = createCategorizedField({
      id: "targetUn",
      propertyName: "TargetUn",
      pathFromTarget: [aToB],
      anchor: "targetClass",
      categoryContext: [{ stepIndex: 0, kind: "relationshipClass" }],
    });
    const targetCat = createCategorizedField({
      id: "targetCat",
      propertyName: "TargetCat",
      pathFromTarget: [aToB],
      anchor: "targetClass",
      categoryContext: [{ stepIndex: 0, kind: "relationshipClass" }],
      propertyCategory: geometry,
    });
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([
        createEntityClass({ fullName: "TestSchema.B", label: "The B" }),
        createEntityClass({ fullName: "TestSchema.aToB", label: "A to B" }),
      ]),
      sources: [createSource()],
      imodelFieldsProviders: [],
      externalFieldsProviders: [],
      getContribution,
      getAnchorContribution,
      fields: [relUn, relCat, targetUn, targetCat],
    });

    const relId = CategoryDefinition.computeId({ path: [aToB], omitTargetClass: true });
    const targetId = CategoryDefinition.computeId({ path: [aToB] });
    const relSchemaId = `${relId}/TestSchema.Geometry`;
    const targetSchemaId = `${targetId}/TestSchema.Geometry`;
    // Each field lands in its own category; the two schema sub-categories are distinct.
    expect(relUn.field.categoryId).to.equal(relId);
    expect(relCat.field.categoryId).to.equal(relSchemaId);
    expect(targetUn.field.categoryId).to.equal(targetId);
    expect(targetCat.field.categoryId).to.equal(targetSchemaId);
    // - relationship category ("A to B", top-level)
    //   - relationship property category
    //   - target class category ("The B", under the relationship category)
    //     - target property category
    expect(categories[relId]).to.deep.equal({ id: relId, label: "A to B" });
    expect(categories[relSchemaId]).to.deep.equal({ id: relSchemaId, label: "Geometry", parentId: relId });
    expect(categories[targetId]).to.deep.equal({ id: targetId, label: "The B", parentId: relId });
    expect(categories[targetSchemaId]).to.deep.equal({ id: targetSchemaId, label: "Geometry", parentId: targetId });
  });

  it("nests a later step's relationship category under an earlier step's target category", async () => {
    // Path a-[ab]->b-[bc]->c showing "b" (target of step 0) and "bc" (relationship of step 1).
    const bField = createCategorizedField({
      id: "b",
      propertyName: "B",
      pathFromTarget: [aToB],
      anchor: "targetClass",
    });
    const bcField = createCategorizedField({
      id: "bc",
      propertyName: "BC",
      pathFromTarget: [aToB, bToC],
      anchor: "relationshipClass",
      categoryContext: [{ stepIndex: 0, kind: "targetClass" }],
    });
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([
        createEntityClass({ fullName: "TestSchema.B", label: "The B" }),
        createEntityClass({ fullName: "TestSchema.bToC", label: "B to C" }),
      ]),
      sources: [createSource()],
      imodelFieldsProviders: [],
      externalFieldsProviders: [],
      getContribution,
      getAnchorContribution,
      fields: [bField, bcField],
    });
    const bId = CategoryDefinition.computeId({ path: [aToB] });
    const bcId = CategoryDefinition.computeId({ path: [aToB, bToC], omitTargetClass: true });
    expect(bField.field.categoryId).to.equal(bId);
    expect(bcField.field.categoryId).to.equal(bcId);
    // - "b" (target class category, top-level)
    //   - "bc" (relationship category, nested under "b")
    expect(categories[bId]).to.deep.equal({ id: bId, label: "The B" });
    expect(categories[bcId]).to.deep.equal({ id: bcId, label: "B to C", parentId: bId });
  });

  it("nests a relationship category under an earlier step's relationship category when the intermediate target has no fields", async () => {
    // Relationship properties at both steps, none from the intermediate `b` target class.
    const abField = createCategorizedField({
      id: "ab",
      propertyName: "AB",
      pathFromTarget: [aToB],
      anchor: "relationshipClass",
    });
    const bcField = createCategorizedField({
      id: "bc",
      propertyName: "BC",
      pathFromTarget: [aToB, bToC],
      anchor: "relationshipClass",
      categoryContext: [{ stepIndex: 0, kind: "relationshipClass" }],
    });
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([
        createEntityClass({ fullName: "TestSchema.aToB", label: "A to B" }),
        createEntityClass({ fullName: "TestSchema.bToC", label: "B to C" }),
      ]),
      sources: [createSource()],
      imodelFieldsProviders: [],
      externalFieldsProviders: [],
      getContribution,
      getAnchorContribution,
      fields: [abField, bcField],
    });
    const abId = CategoryDefinition.computeId({ path: [aToB], omitTargetClass: true });
    const bcId = CategoryDefinition.computeId({ path: [aToB, bToC], omitTargetClass: true });
    // - "ab" (relationship category, top-level)
    //   - "bc" (relationship category, nested under "ab" — the field-less `b` target is skipped)
    expect(categories[abId]).to.deep.equal({ id: abId, label: "A to B" });
    expect(categories[bcId]).to.deep.equal({ id: bcId, label: "B to C", parentId: abId });
  });

  describe("schema property categories", () => {
    it("registers a direct field's schema property category top-level", async () => {
      const field = createCategorizedField({
        anchor: "none",
        propertyCategory: { id: "TestSchema.Geometry", label: "Geometry" },
      });
      const categories = await collectCategories({
        imodelAccess: createSchemaAccess([]),
        sources: [createSource()],
        imodelFieldsProviders: [],
        externalFieldsProviders: [],
        getContribution,
        getAnchorContribution,
        fields: [field],
      });
      expect(field.field.categoryId).to.equal("TestSchema.Geometry");
      expect(categories).to.deep.equal({ "TestSchema.Geometry": { id: "TestSchema.Geometry", label: "Geometry" } });
    });

    it("lets a provider category override a schema property category with the same id", async () => {
      const provider = createProvider("p_v1", {
        "TestSchema.Geometry": { id: "TestSchema.Geometry", label: "Provider Geometry" },
      });
      const field = createCategorizedField({
        anchor: "none",
        propertyCategory: { id: "TestSchema.Geometry", label: "Schema Geometry" },
      });
      const categories = await collectCategories({
        imodelAccess: createSchemaAccess([]),
        sources: [createSource()],
        imodelFieldsProviders: [provider],
        externalFieldsProviders: [],
        getContribution,
        getAnchorContribution,
        fields: [field],
      });
      expect(categories["TestSchema.Geometry"].label).to.equal("Provider Geometry");
    });
  });

  describe("category placement", () => {
    const geometryCategory = { id: "TestSchema.Geometry", label: "Geometry" } as const;
    const aToB2: RelationshipPath[number] = { ...aToB, relationshipName: "TestSchema.aToB2" };
    const schema = () =>
      createSchemaAccess([
        createEntityClass({ fullName: "TestSchema.B", label: "The B" }),
        createEntityClass({ fullName: "TestSchema.C", label: "The C" }),
      ]);
    const collect = async (fields: CategorizedField[], source: ContentSource = createSource()) =>
      collectCategories({
        imodelAccess: schema(),
        sources: [source],
        imodelFieldsProviders: [],
        externalFieldsProviders: [],
        getContribution,
        getAnchorContribution,
        fields,
      });
    const nestedSource = (): ContentSource => ({
      ...createSource(),
      resolvedDeclarations: [
        {
          providerId: "p_v1",
          declarationIndex: 0,
          paths: [{ path: [aToB, bToC], targetClassNames: ["TestSchema.A"] }],
          nested: {
            anchorClassName: "TestSchema.B",
            prefixStepCount: 1,
            categoryContext: [{ stepIndex: 0, kind: "targetClass" }],
          },
        },
      ],
    });

    it("places a parent-scoped property category at the top level and keeps the class fallback for uncategorized properties", async () => {
      const categorized = createCategorizedField({
        id: "categorized",
        pathFromTarget: [aToB],
        propertyCategory: geometryCategory,
        propertyCategoryScope: "parent",
      });
      const uncategorized = createCategorizedField({
        id: "uncategorized",
        pathFromTarget: [aToB],
        propertyCategoryScope: "parent",
      });
      const categories = await collect([categorized, uncategorized]);
      const bId = CategoryDefinition.computeId({ path: [aToB] });
      expect(categorized.field.categoryId).to.equal(geometryCategory.id);
      expect(uncategorized.field.categoryId).to.equal(bId);
      expect(categories).to.deep.equal({
        [geometryCategory.id]: { id: geometryCategory.id, label: "Geometry" },
        [bId]: { id: bId, label: "The B" },
      });
    });

    it("does not create the related class category when only parent-scoped property categories are used", async () => {
      const field = createCategorizedField({
        pathFromTarget: [aToB],
        propertyCategory: geometryCategory,
        propertyCategoryScope: "parent",
      });
      const categories = await collect([field]);
      expect(Object.keys(categories)).to.deep.equal([geometryCategory.id]);
    });

    it("nests a related-class scoped nested declaration's property category under the anchor and nested classes", async () => {
      const field = createCategorizedField({
        pathFromTarget: [aToB, bToC],
        propertyCategory: geometryCategory,
        categoryContext: [{ stepIndex: 0, kind: "targetClass" }],
      });
      const categories = await collect([field], nestedSource());
      const bId = CategoryDefinition.computeId({ path: [aToB] });
      const cId = CategoryDefinition.computeId({ path: [aToB, bToC] });
      const geometryId = `${cId}/${geometryCategory.id}`;
      expect(field.field.categoryId).to.equal(geometryId);
      expect(categories[geometryId]).to.deep.equal({ id: geometryId, label: "Geometry", parentId: cId });
      expect(categories[cId]).to.deep.equal({ id: cId, label: "The C", parentId: bId });
      expect(categories[bId]).to.deep.equal({ id: bId, label: "The B" });
    });

    it("attaches a parent-scoped nested declaration's property category to the anchor category", async () => {
      const categorized = createCategorizedField({
        id: "categorized",
        pathFromTarget: [aToB, bToC],
        propertyCategory: geometryCategory,
        propertyCategoryScope: "parent",
        categoryContext: [{ stepIndex: 0, kind: "targetClass" }],
      });
      const uncategorized = createCategorizedField({
        id: "uncategorized",
        pathFromTarget: [aToB, bToC],
        propertyCategoryScope: "parent",
        categoryContext: [{ stepIndex: 0, kind: "targetClass" }],
      });
      const categories = await collect([categorized, uncategorized], nestedSource());
      const bId = CategoryDefinition.computeId({ path: [aToB] });
      const cId = CategoryDefinition.computeId({ path: [aToB, bToC] });
      const geometryId = `${bId}/${geometryCategory.id}`;
      expect(categorized.field.categoryId).to.equal(geometryId);
      expect(uncategorized.field.categoryId).to.equal(cId);
      expect(categories[geometryId]).to.deep.equal({ id: geometryId, label: "Geometry", parentId: bId });
      expect(categories[cId]).to.deep.equal({ id: cId, label: "The C", parentId: bId });
      // The anchor category exists although no field of the anchor itself is displayed.
      expect(categories[bId]).to.deep.equal({ id: bId, label: "The B" });
    });

    it("shares a class category reached over different paths under the same parent", async () => {
      const viaFirst = createCategorizedField({ id: "first", propertyName: "P1", pathFromTarget: [aToB] });
      const viaSecond = createCategorizedField({ id: "second", propertyName: "P2", pathFromTarget: [aToB2] });
      const categories = await collect([viaFirst, viaSecond]);
      const ids = [
        CategoryDefinition.computeId({ path: [aToB] }),
        CategoryDefinition.computeId({ path: [aToB2] }),
      ].sort();
      expect(viaFirst.field.categoryId).to.equal(ids[0]);
      expect(viaSecond.field.categoryId).to.equal(ids[0]);
      expect(Object.keys(categories)).to.deep.equal([ids[0]]);
    });

    it("shares a property category by name across paths and keeps it distinct under different parents", async () => {
      const viaFirst = createCategorizedField({
        id: "first",
        propertyName: "P1",
        pathFromTarget: [aToB],
        propertyCategory: geometryCategory,
        propertyCategoryScope: "parent",
      });
      const viaSecond = createCategorizedField({
        id: "second",
        propertyName: "P2",
        pathFromTarget: [aToB2],
        propertyCategory: geometryCategory,
        propertyCategoryScope: "parent",
      });
      const underAnchor = createCategorizedField({
        id: "third",
        propertyName: "P3",
        pathFromTarget: [aToB],
        propertyCategory: geometryCategory,
      });
      await collect([viaFirst, viaSecond, underAnchor]);
      expect(viaFirst.field.categoryId).to.equal(geometryCategory.id);
      expect(viaSecond.field.categoryId).to.equal(geometryCategory.id);
      expect(underAnchor.field.categoryId).to.not.equal(geometryCategory.id);
    });

    it("does not merge categories with equal labels but different names", async () => {
      const first = createCategorizedField({
        id: "first",
        propertyName: "P1",
        pathFromTarget: [aToB],
        propertyCategory: { id: "TestSchema.First", label: "Same" },
        propertyCategoryScope: "parent",
      });
      const second = createCategorizedField({
        id: "second",
        propertyName: "P2",
        pathFromTarget: [aToB],
        propertyCategory: { id: "TestSchema.Second", label: "Same" },
        propertyCategoryScope: "parent",
      });
      const categories = await collect([first, second]);
      expect(Object.keys(categories)).to.have.members(["TestSchema.First", "TestSchema.Second"]);
    });

    it("produces the same category ids regardless of field order", async () => {
      const create = () => [
        createCategorizedField({ id: "first", propertyName: "P1", pathFromTarget: [aToB] }),
        createCategorizedField({ id: "second", propertyName: "P2", pathFromTarget: [aToB2] }),
      ];
      const forward = create();
      const backward = create().reverse();
      await collect(forward);
      await collect(backward);
      expect(forward[0].field.categoryId).to.equal(backward[1].field.categoryId);
      expect(forward[1].field.categoryId).to.equal(backward[0].field.categoryId);
    });
  });

  describe("category sharing and parent relationships", () => {
    async function collect(fields: CategorizedField[], categories: Record<string, CategoryDefinition> = {}) {
      return collectCategories({
        imodelAccess: createSchemaAccess([
          createEntityClass({ fullName: "TestSchema.B" }),
          createEntityClass({ fullName: "TestSchema.C" }),
          createEntityClass({ fullName: "OtherSchema.B" }),
        ]),
        sources: [createSource()],
        imodelFieldsProviders: [createProvider("test_v1", categories)],
        externalFieldsProviders: [],
        getContribution,
        getAnchorContribution,
        fields,
      });
    }

    it("reparents a provider category to the shared class category without changing the provider's definition", async () => {
      const otherPath = [{ ...aToB, relationshipName: "TestSchema.zToB" as const }];
      const originalParentId = CategoryDefinition.computeId({ path: otherPath });
      const sharedParentId = CategoryDefinition.computeId({ path: [aToB] });
      const child = { id: "child", label: "Child", parentId: originalParentId };

      const viaFirstPath = createCategorizedField({ id: "first", pathFromTarget: [aToB] });
      const viaOtherPath = createCategorizedField({ id: "second", pathFromTarget: otherPath });
      const customField = createCategorizedField({ id: "custom", overrideCategoryId: "child" });

      const categories = await collect([viaFirstPath, viaOtherPath, customField], { child });
      expect(categories).to.deep.equal({
        [sharedParentId]: { id: sharedParentId, label: "B" },
        child: { id: "child", label: "Child", parentId: sharedParentId },
      });

      expect(viaFirstPath.field.categoryId).to.equal(sharedParentId);
      expect(viaOtherPath.field.categoryId).to.equal(sharedParentId);
      expect(customField.field.categoryId).to.equal("child");
      expect(child).to.deep.equal({ id: "child", label: "Child", parentId: originalParentId });
    });

    it("keeps a parent-scoped class fallback at the root even when a field uses a shorter path", async () => {
      const prefixField = createCategorizedField({ id: "prefix", pathFromTarget: [aToB] });
      const terminalField = createCategorizedField({
        id: "terminal",
        pathFromTarget: [aToB, bToC],
        propertyCategoryScope: "parent",
      });
      const prefixCategoryId = CategoryDefinition.computeId({ path: [aToB] });
      const terminalCategoryId = CategoryDefinition.computeId({ path: [aToB, bToC] });

      const categories = await collect([prefixField, terminalField]);

      expect(categories).to.deep.equal({
        [prefixCategoryId]: { id: prefixCategoryId, label: "B" },
        [terminalCategoryId]: { id: terminalCategoryId, label: "C" },
      });
      expect(prefixField.field.categoryId).to.equal(prefixCategoryId);
      expect(terminalField.field.categoryId).to.equal(terminalCategoryId);
    });

    it("keeps root class and property categories with matching unqualified names separate across schemas", async () => {
      const otherSchemaPath: RelationshipPath = [{ ...aToB, targetClassName: "OtherSchema.B" }];
      const testClassField = createCategorizedField({ id: "testClass", pathFromTarget: [aToB] });
      const otherClassField = createCategorizedField({ id: "otherClass", pathFromTarget: otherSchemaPath });
      const testGeometryField = createCategorizedField({
        categoryContext: [],
        id: "testGeometry",
        anchor: "none",
        propertyCategory: { id: "TestSchema.Geometry", label: "First" },
      });
      const otherGeometryField = createCategorizedField({
        categoryContext: [],
        id: "otherGeometry",
        anchor: "none",
        propertyCategory: { id: "OtherSchema.Geometry", label: "Second" },
      });
      const testClassId = CategoryDefinition.computeId({ path: [aToB] });
      const otherClassId = CategoryDefinition.computeId({ path: otherSchemaPath });

      const categories = await collect([testClassField, otherClassField, testGeometryField, otherGeometryField]);

      expect(categories).to.deep.equal({
        [testClassId]: { id: testClassId, label: "B" },
        [otherClassId]: { id: otherClassId, label: "B" },
        "TestSchema.Geometry": { id: "TestSchema.Geometry", label: "First" },
        "OtherSchema.Geometry": { id: "OtherSchema.Geometry", label: "Second" },
      });
      expect(testClassField.field.categoryId).to.equal(testClassId);
      expect(otherClassField.field.categoryId).to.equal(otherClassId);
      expect(testGeometryField.field.categoryId).to.equal("TestSchema.Geometry");
      expect(otherGeometryField.field.categoryId).to.equal("OtherSchema.Geometry");
    });

    it("keeps different category contexts on the same path distinct and order independent", async () => {
      const createFields = () => [
        createCategorizedField({ id: "prefix", pathFromTarget: [aToB] }),
        createCategorizedField({ id: "top", pathFromTarget: [aToB, bToC], propertyCategoryScope: "parent" }),
        createCategorizedField({
          id: "nested",
          pathFromTarget: [aToB, bToC],
          propertyCategoryScope: "parent",
          categoryContext: [{ stepIndex: 0, kind: "targetClass" }],
        }),
      ];
      const forward = createFields();
      const backward = createFields().reverse();
      const child = { id: "child", label: "Child", parentId: CategoryDefinition.computeId({ path: [aToB, bToC] }) };
      const categories = await collect(forward, { child });
      const reversed = await collect(backward, { child });
      expect(forward[1].field.categoryId).not.to.equal(forward[2].field.categoryId);
      expect(categories[forward[1].field.categoryId!].parentId).to.equal(undefined);
      expect(categories[forward[2].field.categoryId!].parentId).to.equal(forward[0].field.categoryId);
      expect(categories.child.parentId).to.equal(forward[1].field.categoryId);
      expect(reversed).to.deep.equal(categories);
      expect(backward[0].field.categoryId).to.equal(forward[2].field.categoryId);
      expect(backward[1].field.categoryId).to.equal(forward[1].field.categoryId);
    });
  });

  describe("nested contributions", () => {
    function createSourceWithNestedGroup(props: {
      providerId: IModelFieldsProvider["id"];
      anchorClassName: EC.FullClassNameDotNotation;
    }): ContentSource {
      return {
        target: { primaryClass: "TestSchema.A" },
        resolvedPrimaryClasses: ["TestSchema.A"],
        resolvedDeclarations: [
          {
            providerId: props.providerId,
            declarationIndex: 0,
            paths: [{ path: [aToB], targetClassNames: ["TestSchema.A"] }],
            nested: {
              anchorClassName: props.anchorClassName,
              prefixStepCount: 1,
              categoryContext: [{ stepIndex: 0, kind: "targetClass" }],
            },
          },
        ],
        resolvedExternalInputs: [],
      };
    }

    it("collects categories contributed for a nested anchor's synthesized target", async () => {
      const provider: IModelFieldsProvider = {
        id: "p_v1",
        applyRecursively: true,
        async getContribution({ target }) {
          return target.primaryClass === "TestSchema.B"
            ? { categories: { cat: { id: "cat", label: "Cat" } } }
            : undefined;
        },
      };
      const categories = await collectCategories({
        imodelAccess: createSchemaAccess([]),
        sources: [createSourceWithNestedGroup({ providerId: provider.id, anchorClassName: "TestSchema.B" })],
        imodelFieldsProviders: [provider],
        externalFieldsProviders: [],
        getContribution,
        getAnchorContribution,
        fields: [],
      });
      expect(categories).to.deep.equal({ cat: { id: "cat", label: "Cat" } });
    });

    it("does not throw and contributes nothing when the nested group's provider is no longer configured", async () => {
      const categories = await collectCategories({
        imodelAccess: createSchemaAccess([]),
        sources: [createSourceWithNestedGroup({ providerId: "missing_v1", anchorClassName: "TestSchema.B" })],
        imodelFieldsProviders: [],
        externalFieldsProviders: [],
        getContribution,
        getAnchorContribution,
        fields: [],
      });
      expect(categories).to.deep.equal({});
    });

    it("contributes nothing when the nested anchor contribution declares no categories", async () => {
      const provider: IModelFieldsProvider = {
        id: "p_v1",
        applyRecursively: true,
        async getContribution({ target }) {
          return target.primaryClass === "TestSchema.B" ? { relatedProperties: [] } : undefined;
        },
      };
      const categories = await collectCategories({
        imodelAccess: createSchemaAccess([]),
        sources: [createSourceWithNestedGroup({ providerId: provider.id, anchorClassName: "TestSchema.B" })],
        imodelFieldsProviders: [provider],
        externalFieldsProviders: [],
        getContribution,
        getAnchorContribution,
        fields: [],
      });
      expect(categories).to.deep.equal({});
    });

    it("fetches a nested anchor's contribution once even when multiple groups share it", async () => {
      let callCount = 0;
      const provider: IModelFieldsProvider = {
        id: "p_v1",
        applyRecursively: true,
        async getContribution({ target }) {
          if (target.primaryClass !== "TestSchema.B") {
            return undefined;
          }
          callCount++;
          return { categories: { cat: { id: "cat", label: "Cat" } } };
        },
      };
      const source: ContentSource = {
        target: { primaryClass: "TestSchema.A" },
        resolvedPrimaryClasses: ["TestSchema.A"],
        resolvedDeclarations: [
          {
            providerId: provider.id,
            declarationIndex: 0,
            paths: [{ path: [aToB], targetClassNames: ["TestSchema.A"] }],
            nested: {
              anchorClassName: "TestSchema.B",
              prefixStepCount: 1,
              categoryContext: [{ stepIndex: 0, kind: "targetClass" }],
            },
          },
          {
            providerId: provider.id,
            declarationIndex: 1,
            paths: [{ path: [aToB], targetClassNames: ["TestSchema.A"] }],
            nested: {
              anchorClassName: "TestSchema.B",
              prefixStepCount: 1,
              categoryContext: [{ stepIndex: 0, kind: "targetClass" }],
            },
          },
        ],
        resolvedExternalInputs: [],
      };
      const memoizer = createContributionMemoizer({ imodelAccess: createSchemaAccess([]) });
      const categories = await collectCategories({
        imodelAccess: createSchemaAccess([]),
        sources: [source],
        imodelFieldsProviders: [provider],
        externalFieldsProviders: [],
        getContribution: memoizer.getContribution,
        getAnchorContribution: memoizer.getAnchorContribution,
        fields: [],
      });
      expect(categories).to.deep.equal({ cat: { id: "cat", label: "Cat" } });
      expect(callCount).to.equal(1);
    });
  });
});

describe("pruneUnreferencedCategories", () => {
  it("keeps referenced categories and their ancestor chain, dropping the rest", () => {
    const categories = {
      root: { id: "root", label: "Root" },
      mid: { id: "mid", label: "Mid", parentId: "root" },
      leaf: { id: "leaf", label: "Leaf", parentId: "mid" },
      orphan: { id: "orphan", label: "Orphan" },
    };
    const leafField = createFieldWithCategory({ id: "leafField", categoryId: "leaf" });
    const rootField = createFieldWithCategory({ id: "rootField", categoryId: "root" });
    const pruned = pruneUnreferencedCategories({ fields: { leafField, rootField }, categories });
    expect(Object.keys(pruned).sort()).to.deep.equal(["leaf", "mid", "root"]);
  });

  it("ignores fields without a category and dangling category references", () => {
    const categories = { a: { id: "a", label: "A" } };
    const noCategory = createFieldWithCategory({ id: "noCategory" });
    const dangling = createFieldWithCategory({ id: "dangling", categoryId: "missing" });
    const pruned = pruneUnreferencedCategories({ fields: { noCategory, dangling }, categories });
    expect(pruned).to.deep.equal({});
  });
});
