/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect, createAsyncIterator } from "presentation-test-utilities";
import { of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { CLASS_NAMES } from "../../../tree-definitions/shared/ClassNameDefinitions.js";
import { createModelsTree } from "../../../tree-definitions/trees/models-tree/CreateModelsTree.js";
import { ModelsTreeDefinition } from "../../../tree-definitions/trees/models-tree/ModelsTreeDefinition.js";
import { createModelsTreeMinimalNodeFactory } from "../../../tree-definitions/trees/models-tree/ModelsTreeMinimalNodes.js";

import type { Id64String } from "@itwin/core-bentley";
import type { IModelInstanceKey, InstancesNodeKey, MinimalHierarchyNode } from "@itwin/presentation-hierarchies";
import type { ModelsTreeSearchPathKey } from "../../../tree-definitions/trees/models-tree/ModelsTreeDefinition.js";

describe("createModelsTreeMinimalNodeFactory", () => {
  const subject: ModelsTreeSearchPathKey = { className: CLASS_NAMES.Subject, id: "0x1" };
  const model: ModelsTreeSearchPathKey = { className: CLASS_NAMES.GeometricModel3d, id: "0x2" };
  const category: ModelsTreeSearchPathKey = { className: CLASS_NAMES.SpatialCategory, id: "0x3" };
  const element: ModelsTreeSearchPathKey = { className: CLASS_NAMES.GeometricElement3d, id: "0x4" };
  const childElement: ModelsTreeSearchPathKey = { className: CLASS_NAMES.GeometricElement3d, id: "0x5" };
  const childCategory: ModelsTreeSearchPathKey = { className: CLASS_NAMES.SpatialCategory, id: "0x6" };
  // sub-models have the same ID as their modeled element
  const subModel: ModelsTreeSearchPathKey = { className: CLASS_NAMES.GeometricModel3d, id: element.id };

  /** Creates minimal nodes for the given path, passing the node created for the previous key as the parent node. */
  async function createMinimalNodesPath(path: IModelInstanceKey[], hiddenModelIds: Id64String[] = []) {
    const createNode = await createModelsTreeMinimalNodeFactory({
      idsProvider: { getHiddenModelIds: () => of(new Set(hiddenModelIds)) },
    });
    let parentNode: MinimalHierarchyNode | undefined;
    return path.map((instanceKey) => (parentNode = createNode({ instanceKey, parentNode })));
  }

  /** Creates minimal nodes for the given path and returns the node of the last key. */
  async function createTargetMinimalNode(path: IModelInstanceKey[], hiddenModelIds?: Id64String[]) {
    return (await createMinimalNodesPath(path, hiddenModelIds)).at(-1);
  }

  it("creates nodes with keys and parent keys of the search path", async () => {
    expect(await createMinimalNodesPath([subject, model, category, element])).toEqual([
      { key: createKey(subject), parentKeys: [], label: "", extendedData: { type: "subject" } },
      { key: createKey(model), parentKeys: [createKey(subject)], label: "", extendedData: { type: "model" } },
      {
        key: createKey(category),
        parentKeys: [createKey(subject), createKey(model)],
        label: "",
        extendedData: { type: "category", modelIds: [model.id] },
      },
      {
        key: createKey(element),
        parentKeys: [createKey(subject), createKey(model), createKey(category)],
        label: "",
        extendedData: { type: "element", modelId: model.id, categoryId: category.id },
      },
    ]);
  });

  it("creates child category node of an element", async () => {
    expect(await createTargetMinimalNode([subject, model, category, element, childCategory])).toMatchObject({
      extendedData: { type: "category", modelIds: [model.id], parentElementIds: [element.id] },
    });
  });

  it("creates child element node of an element", async () => {
    expect(await createTargetMinimalNode([subject, model, category, element, childElement])).toMatchObject({
      extendedData: { type: "element", modelId: model.id, categoryId: category.id },
    });
  });

  it("marks models hidden by partition properties as hidden", async () => {
    expect(await createTargetMinimalNode([subject, model], [model.id])).toEqual({
      key: createKey(model),
      parentKeys: [createKey(subject)],
      label: "",
      extendedData: { type: "model" },
      processingParams: { hideInHierarchy: true },
    });
  });

  it("marks sub-models as hidden", async () => {
    expect(await createTargetMinimalNode([subject, model, category, element, subModel])).toMatchObject({
      extendedData: { type: "model", subModeledElementCategory: category.id },
      processingParams: { hideInHierarchy: true },
    });
  });

  it("creates category node of a sub-model", async () => {
    expect(await createTargetMinimalNode([subject, model, category, element, subModel, childCategory])).toMatchObject({
      extendedData: { type: "category", modelIds: [subModel.id] },
    });
  });

  it("creates element node of a sub-model in the modeled element's category", async () => {
    // sub-model elements in the modeled element's category have no category entry in search paths
    expect(await createTargetMinimalNode([subject, model, category, element, subModel, childElement])).toMatchObject({
      extendedData: { type: "element", modelId: subModel.id, categoryId: category.id },
    });
  });

  it("loads hidden model IDs once, when the factory is created", async () => {
    const getHiddenModelIds = vi.fn(() => of(new Set<Id64String>()));
    const createMinimalNodeFn = await createModelsTreeMinimalNodeFactory({ idsProvider: { getHiddenModelIds } });
    createMinimalNodeFn({ instanceKey: model, parentNode: undefined });
    createMinimalNodeFn({ instanceKey: { ...model, id: "0x99" }, parentNode: undefined });
    expect(getHiddenModelIds).toHaveBeenCalledOnce();
  });

  it.each([
    { name: "root category", path: [category], error: "SpatialCategory must have a nearest ancestor model ID" },
    {
      name: "category under subject",
      path: [subject, category],
      error: "SpatialCategory must have a nearest ancestor model ID",
    },
    {
      name: "root element",
      path: [element],
      error: "GeometricElement3d must have nearest ancestor model and category IDs",
    },
    {
      name: "element under subject",
      path: [subject, element],
      error: "GeometricElement3d must have nearest ancestor model and category IDs",
    },
    {
      name: "element under model",
      path: [subject, model, element],
      error: "GeometricElement3d must have nearest ancestor model and category IDs",
    },
    {
      name: "unsupported class",
      path: [{ className: "BisCore.Element" as const, id: "0x1" }],
      error: `Unsupported models tree search path class: "BisCore.Element"`,
    },
  ])("throws for $name", async ({ path, error }) => {
    await expect(createMinimalNodesPath(path)).rejects.toThrow(error);
  });
});

describe("createModelsTree", () => {
  const imodelAccess = {
    createQueryReader: () => createAsyncIterator([]),
    getSchema: async () => undefined,
    getHiddenClassesTree: async () => [],
    classDerivesFrom: () => false,
  };

  it("passes tree props to instance key paths search", async () => {
    const pathsSearch = vi
      .spyOn(ModelsTreeDefinition, "createInstanceKeyPaths")
      .mockImplementation(() => createAsyncIterator([]));
    const tree = createModelsTree({ imodelAccess, uniqueId: "test-id" });
    await collect(tree.createInstanceKeyPaths({ targetItems: [], limit: 5 }));
    expect(pathsSearch).toHaveBeenCalledWith(
      expect.objectContaining({ targetItems: [], limit: 5, uniqueId: "test-id", imodelAccess }),
    );
  });

  it("creates minimal node factory", async () => {
    const tree = createModelsTree({ imodelAccess });
    const createMinimalNode = await tree.getMinimalNodeFactory();
    const subject: ModelsTreeSearchPathKey = { className: CLASS_NAMES.Subject, id: "0x1" };
    expect(createMinimalNode({ instanceKey: subject, parentNode: undefined })).toEqual({
      key: createKey(subject),
      parentKeys: [],
      label: "",
      extendedData: { type: "subject" },
    });
  });
});

function createKey(key: IModelInstanceKey): InstancesNodeKey {
  return { type: "instances", instanceKeys: [{ className: key.className, id: key.id }] };
}
