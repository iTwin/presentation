/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { collectCategories, pruneUnreferencedCategories } from "../../content/descriptor-building/Categories.js";
import { CategoryDefinition } from "../../content/model/Category.js";
import { createEntityClass, createSchemaAccess } from "../MetadataStubs.js";

import type { RelationshipPath } from "@itwin/presentation-shared";
import type { ContentSource } from "../../content/ContentTarget.js";
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

const getContribution: Parameters<typeof collectCategories>[0]["getContribution"] = async (provider, target) =>
  provider.getContribution({ imodelAccess: createSchemaAccess([]), target });

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

function createRelatedField(props: { pathFromTarget?: RelationshipPath; categoryId?: string }): PropertyField {
  return {
    kind: "property",
    id: "field",
    selectorId: "field",
    label: "Field",
    type: { kind: "primitive", type: "String" },
    propertyClassName: "TestSchema.B",
    propertyName: "Prop",
    pathFromTarget: props.pathFromTarget ?? [],
    valueClassNames: ["TestSchema.B"],
    ...(props.categoryId !== undefined ? { categoryId: props.categoryId } : undefined),
  };
}

describe("collectCategories", () => {
  it("collects categories contributed by providers", async () => {
    const provider = createProvider("p_v1", { cat: { id: "cat", label: "Cat" } });
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([]),
      sources: [createSource()],
      providers: [provider],
      externalProviders: [],
      getContribution,
      fields: {},
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
      providers: [provider],
      externalProviders: [],
      getContribution,
      fields: {},
    });
    expect(categories).to.deep.equal({});
  });

  it("resolves category id conflicts in favor of the higher-priority provider", async () => {
    const low = createProvider("low_v1", { cat: { id: "cat", label: "Low" } }, 1);
    const high = createProvider("high_v1", { cat: { id: "cat", label: "High" } }, 2);
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([]),
      sources: [createSource()],
      providers: [low, high],
      externalProviders: [],
      getContribution,
      fields: {},
    });
    expect(categories.cat.label).to.equal("High");
  });

  it("keeps the first-seen category on a priority tie", async () => {
    const first = createProvider("first_v1", { cat: { id: "cat", label: "First" } }, 5);
    const second = createProvider("second_v1", { cat: { id: "cat", label: "Second" } }, 5);
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([]),
      sources: [createSource()],
      providers: [first, second],
      externalProviders: [],
      getContribution,
      fields: {},
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
      providers: [imodelProvider],
      externalProviders: [external],
      getContribution,
      fields: {},
    });
    expect(categories.shared.label).to.equal("From External");
    expect(categories.extOnly).to.deep.equal({ id: "extOnly", label: "Ext Only" });
  });

  it("ignores external fields providers that declare no categories", async () => {
    const external = createExternalProvider("ext_v1");
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([]),
      sources: [createSource()],
      providers: [],
      externalProviders: [external],
      getContribution,
      fields: {},
    });
    expect(categories).to.deep.equal({});
  });

  it("applies the default priority to external categories without an explicit priority", async () => {
    const external = createExternalProvider("ext_v1", { cat: { id: "cat", label: "Ext" } });
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([]),
      sources: [createSource()],
      providers: [],
      externalProviders: [external],
      getContribution,
      fields: {},
    });
    expect(categories.cat).to.deep.equal({ id: "cat", label: "Ext" });
  });

  it("auto-creates a category for a related field without one, labelled by the terminal class", async () => {
    const field = createRelatedField({ pathFromTarget: [aToB] });
    const fields = { field };
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([createEntityClass({ fullName: "TestSchema.B", label: "The B" })]),
      sources: [createSource()],
      providers: [],
      externalProviders: [],
      getContribution,
      fields,
    });
    const id = CategoryDefinition.computeId({ path: [aToB] });
    expect(categories[id]).to.deep.equal({ id, label: "The B" });
    expect(field.categoryId).to.equal(id);
  });

  it("shares one auto-created category across related fields on the same path", async () => {
    const fields = {
      a: { ...createRelatedField({ pathFromTarget: [aToB] }), id: "a", propertyName: "A" },
      b: { ...createRelatedField({ pathFromTarget: [aToB] }), id: "b", propertyName: "B" },
    };
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([createEntityClass({ fullName: "TestSchema.B" })]),
      sources: [createSource()],
      providers: [],
      externalProviders: [],
      getContribution,
      fields,
    });
    const id = CategoryDefinition.computeId({ path: [aToB] });
    expect(Object.keys(categories)).to.deep.equal([id]);
    expect(fields.a.categoryId).to.equal(id);
    expect(fields.b.categoryId).to.equal(id);
  });

  it("creates a single terminal category when no fields attach at intermediate classes", async () => {
    // Segment [a->b->c->d]: only a field at the full path → only a `d` category, no `b`/`c`.
    const field = { ...createRelatedField({ pathFromTarget: [aToB, bToC, cToD] }), id: "d" };
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([createEntityClass({ fullName: "TestSchema.D", label: "The D" })]),
      sources: [createSource()],
      providers: [],
      externalProviders: [],
      getContribution,
      fields: { d: field },
    });
    const dId = CategoryDefinition.computeId({ path: [aToB, bToC, cToD] });
    expect(Object.keys(categories)).to.deep.equal([dId]);
    expect(categories[dId]).to.deep.equal({ id: dId, label: "The D" });
    expect(field.categoryId).to.equal(dId);
  });

  it("nests a terminal under the nearest shorter segment terminal, skipping field-less classes", async () => {
    // Segments [a->b],[b->c->d]: fields at `a->b` and `a->b->c->d` → `b` (top) and `d` (under `b`), no `c`.
    const bField = { ...createRelatedField({ pathFromTarget: [aToB] }), id: "b", propertyName: "PB" };
    const dField = { ...createRelatedField({ pathFromTarget: [aToB, bToC, cToD] }), id: "d", propertyName: "PD" };
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([
        createEntityClass({ fullName: "TestSchema.B", label: "The B" }),
        createEntityClass({ fullName: "TestSchema.D", label: "The D" }),
      ]),
      sources: [createSource()],
      providers: [],
      externalProviders: [],
      getContribution,
      fields: { b: bField, d: dField },
    });
    const bId = CategoryDefinition.computeId({ path: [aToB] });
    const dId = CategoryDefinition.computeId({ path: [aToB, bToC, cToD] });
    expect(new Set(Object.keys(categories))).to.deep.equal(new Set([bId, dId]));
    expect(categories[bId]).to.deep.equal({ id: bId, label: "The B" });
    expect(categories[dId]).to.deep.equal({ id: dId, label: "The D", parentId: bId });
  });

  it("nests a full chain of categories when fields attach at every segment terminal", async () => {
    // Segments [a->b],[b->c],[c->d]: fields at each terminal → `b` -> `c` -> `d`.
    const bField = { ...createRelatedField({ pathFromTarget: [aToB] }), id: "b", propertyName: "PB" };
    const cField = { ...createRelatedField({ pathFromTarget: [aToB, bToC] }), id: "c", propertyName: "PC" };
    const dField = { ...createRelatedField({ pathFromTarget: [aToB, bToC, cToD] }), id: "d", propertyName: "PD" };
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([
        createEntityClass({ fullName: "TestSchema.B", label: "The B" }),
        createEntityClass({ fullName: "TestSchema.C", label: "The C" }),
        createEntityClass({ fullName: "TestSchema.D", label: "The D" }),
      ]),
      sources: [createSource()],
      providers: [],
      externalProviders: [],
      getContribution,
      fields: { b: bField, c: cField, d: dField },
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
    const yField = { ...createRelatedField({ pathFromTarget: [aToY] }), id: "y", propertyName: "PY" };
    const cField = { ...createRelatedField({ pathFromTarget: [aToB, bToC] }), id: "c", propertyName: "PC" };
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([
        createEntityClass({ fullName: "TestSchema.Y", label: "The Y" }),
        createEntityClass({ fullName: "TestSchema.C", label: "The C" }),
      ]),
      sources: [createSource()],
      providers: [],
      externalProviders: [],
      getContribution,
      fields: { y: yField, c: cField },
    });
    const yId = CategoryDefinition.computeId({ path: [aToY] });
    const cId = CategoryDefinition.computeId({ path: [aToB, bToC] });
    expect(categories[yId]).to.deep.equal({ id: yId, label: "The Y" });
    expect(categories[cId]).to.deep.equal({ id: cId, label: "The C" });
  });

  it("does not auto-create for direct fields or fields that already have a category", async () => {
    const direct = { ...createRelatedField({ pathFromTarget: [] }), id: "direct" };
    const categorized = {
      ...createRelatedField({ pathFromTarget: [aToB], categoryId: "explicit" }),
      id: "categorized",
    };
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([]),
      sources: [createSource()],
      providers: [],
      externalProviders: [],
      getContribution,
      fields: { direct, categorized },
    });
    expect(categories).to.deep.equal({});
    expect(direct.categoryId).to.be.undefined;
    expect(categorized.categoryId).to.equal("explicit");
  });

  it("does not auto-create when a provider already declared the field's path category", async () => {
    const id = CategoryDefinition.computeId({ path: [aToB] });
    const field = createRelatedField({ pathFromTarget: [aToB] });
    const provider = createProvider("p_v1", { [id]: { id, label: "Provider Category" } });
    const categories = await collectCategories({
      imodelAccess: createSchemaAccess([createEntityClass({ fullName: "TestSchema.B", label: "Should not be used" })]),
      sources: [createSource()],
      providers: [provider],
      externalProviders: [],
      getContribution,
      fields: { field },
    });
    expect(categories[id].label).to.equal("Provider Category");
    expect(field.categoryId).to.equal(id);
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
    const leafField = { ...createRelatedField({ categoryId: "leaf" }), id: "leafField" };
    const rootField = { ...createRelatedField({ categoryId: "root" }), id: "rootField" };
    const pruned = pruneUnreferencedCategories({ leafField, rootField }, categories);
    expect(Object.keys(pruned).sort()).to.deep.equal(["leaf", "mid", "root"]);
  });

  it("ignores fields without a category and dangling category references", () => {
    const categories = { a: { id: "a", label: "A" } };
    const noCategory = { ...createRelatedField({}), id: "noCategory" };
    const dangling = { ...createRelatedField({ categoryId: "missing" }), id: "dangling" };
    const pruned = pruneUnreferencedCategories({ noCategory, dangling }, categories);
    expect(pruned).to.deep.equal({});
  });
});
