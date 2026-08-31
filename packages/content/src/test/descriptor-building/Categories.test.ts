/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { collectCategories, pruneUnreferencedCategories } from "../../content/descriptor-building/Categories.js";
import { createContributionMemoizer } from "../../content/descriptor-building/ContributionMemoizer.js";
import { CategoryDefinition } from "../../content/model/Category.js";
import { createEntityClass, createSchemaAccess } from "../MetadataStubs.js";

import type { EC, RelationshipPath } from "@itwin/presentation-shared";
import type { ContentSource } from "../../content/ContentTarget.js";
import type { CategorizedField, FieldCategorization } from "../../content/descriptor-building/ClassPropertyFields.js";
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
  schemaCategory?: { id: string; label: string };
  overrideCategoryId?: string;
}): CategorizedField {
  const id = props.id ?? "field";
  const categorization: FieldCategorization = { anchor: props.anchor ?? "targetClass" };
  if (props.schemaCategory) {
    categorization.category = { source: "schema", ...props.schemaCategory };
  }
  if (props.overrideCategoryId !== undefined) {
    categorization.category = { source: "override", id: props.overrideCategoryId };
  }
  return {
    field: {
      kind: "property",
      id,
      selectorId: id,
      label: "Field",
      type: { kind: "primitive", type: "String" },
      propertyClassName: "TestSchema.B",
      propertyName: props.propertyName ?? "Prop",
      pathFromTarget: props.pathFromTarget ?? [],
      valueClassNames: ["TestSchema.B"],
      primaryClassNames: props.pathFromTarget?.length ? [props.pathFromTarget[0].sourceClassName] : ["TestSchema.B"],
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
    selectorId: id,
    label: "Field",
    type: { kind: "primitive", type: "String" },
    propertyClassName: "TestSchema.B",
    propertyName: "Prop",
    pathFromTarget: [],
    valueClassNames: ["TestSchema.B"],
    primaryClassNames: ["TestSchema.B"],
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

  it("nests a terminal under the nearest shorter segment terminal, skipping field-less classes", async () => {
    // Segments [a->b],[b->c->d]: fields at `a->b` and `a->b->c->d` → `b` (top) and `d` (under `b`), no `c`.
    const bField = createCategorizedField({ id: "b", propertyName: "PB", pathFromTarget: [aToB] });
    const dField = createCategorizedField({ id: "d", propertyName: "PD", pathFromTarget: [aToB, bToC, cToD] });
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

  it("nests a full chain of categories when fields attach at every segment terminal", async () => {
    // Segments [a->b],[b->c],[c->d]: fields at each terminal → `b` -> `c` -> `d`.
    const bField = createCategorizedField({ id: "b", propertyName: "PB", pathFromTarget: [aToB] });
    const cField = createCategorizedField({ id: "c", propertyName: "PC", pathFromTarget: [aToB, bToC] });
    const dField = createCategorizedField({ id: "d", propertyName: "PD", pathFromTarget: [aToB, bToC, cToD] });
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
    expect(direct.field.categoryId).to.be.undefined;
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

  it("nests a related field's schema category under the auto-created path category", async () => {
    // A related field carrying a schema property category keeps that (sub-)category, but the path
    // category it nests under must still be auto-created — unlike an override, which suppresses it.
    const parentId = CategoryDefinition.computeId({ path: [aToB] });
    const schemaCategoryId = `${parentId}/TestSchema.Geometry`;
    const field = createCategorizedField({
      pathFromTarget: [aToB],
      schemaCategory: { id: "TestSchema.Geometry", label: "Geometry" },
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
    expect(field.field.categoryId).to.equal(schemaCategoryId);
    expect(categories[schemaCategoryId]).to.deep.equal({ id: schemaCategoryId, label: "Geometry", parentId });
    expect(categories[parentId]).to.deep.equal({ id: parentId, label: "B Label" });
  });

  it("nests the target category and both schema sub-categories under the relationship category", async () => {
    // A step that loads both target- and relationship-class properties (both with the same schema
    // category): the relationship class becomes the top-level group, the target class nests under it,
    // and the shared schema category yields a distinct sub-category under each owner.
    const geometry = { id: "TestSchema.Geometry", label: "Geometry" };
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
      schemaCategory: geometry,
    });
    const targetUn = createCategorizedField({
      id: "targetUn",
      propertyName: "TargetUn",
      pathFromTarget: [aToB],
      anchor: "targetClass",
    });
    const targetCat = createCategorizedField({
      id: "targetCat",
      propertyName: "TargetCat",
      pathFromTarget: [aToB],
      anchor: "targetClass",
      schemaCategory: geometry,
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
    //   - relationship schema category
    //   - target class category ("The B", under the relationship category)
    //     - target schema category
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
        schemaCategory: { id: "TestSchema.Geometry", label: "Geometry" },
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
        schemaCategory: { id: "TestSchema.Geometry", label: "Schema Geometry" },
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
            nested: { anchorClassName: props.anchorClassName, prefixStepCount: 1 },
          },
        ],
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
            nested: { anchorClassName: "TestSchema.B", prefixStepCount: 1 },
          },
          {
            providerId: provider.id,
            declarationIndex: 1,
            paths: [{ path: [aToB], targetClassNames: ["TestSchema.A"] }],
            nested: { anchorClassName: "TestSchema.B", prefixStepCount: 1 },
          },
        ],
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
