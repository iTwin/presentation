/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  collect,
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertPhysicalPartition,
  insertPhysicalSubModel,
  insertSpatialCategory,
  insertSubject,
} from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { withEditTxn } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { createIModelHierarchyProvider, HierarchyNode } from "@itwin/presentation-hierarchies";
import { CLASS_NAMES, createModelsTree } from "@itwin/presentation-tree-definitions/internal";
import { initialize, terminate } from "../../IntegrationTests.js";
import { createIModelAccess } from "../Common.js";
import { buildIModel } from "../IModelUtils.js";

import type { Id64String } from "@itwin/core-bentley";
import type { IModelConnection } from "@itwin/core-frontend";
import type { HierarchyProvider } from "@itwin/presentation-hierarchies";
import type { InstanceKey } from "@itwin/presentation-shared";
import type { ModelsTreeHierarchyConfiguration } from "@itwin/presentation-tree-definitions/internal";

describe("Models tree", () => {
  beforeAll(async () => {
    await initialize();
  });

  afterAll(async () => {
    await terminate();
  });

  describe("hierarchy node paths", () => {
    it.each([
      { target: "subject" as const, types: ["subject", "subject"] },
      { target: "model" as const, types: ["subject", "subject", "model"] },
      { target: "category" as const, types: ["subject", "subject", "model", "category"] },
      { target: "element" as const, types: ["subject", "subject", "model", "category", "element"] },
    ])("returns path to $target target", async ({ target, types }) => {
      await using setupResult = await buildIModel(async (imodel) =>
        withEditTxn(imodel, (txn) => {
          const subject = insertSubject({ txn, codeValue: "subject", parentId: IModel.rootSubjectId });
          const model = insertPhysicalModelWithPartition({ txn, codeValue: "model", partitionParentId: subject.id });
          const category = insertSpatialCategory({ txn, codeValue: "category" });
          const element = insertPhysicalElement({ txn, modelId: model.id, categoryId: category.id });
          return { subject, model, category, element };
        }),
      );
      const { imodelConnection, ...keys } = setupResult;
      const { tree, provider } = createTreeAndProvider({
        imodelConnection,
        hierarchyConfig: { elements: { classGrouping: "disable" } },
      });
      const targetKey = keys[target];

      const paths = await collect(
        tree.createHierarchyNodePaths({ targetItems: [targetKey], hierarchyProvider: provider }),
      );
      const [{ path: instanceKeysPath }] = await collect(tree.createInstanceKeyPaths({ targetItems: [targetKey] }));
      expect(paths).toEqual([
        { path: await loadNodesPathByTraversal({ provider, path: instanceKeysPath }), target: targetKey.id },
      ]);
      expect(paths[0].path.map((node) => node.extendedData?.type)).toEqual(types);
    });

    it("omits models hidden by partition properties", async () => {
      await using setupResult = await buildIModel(async (imodel) =>
        withEditTxn(imodel, (txn) => {
          const partition = insertPhysicalPartition({
            txn,
            codeValue: "hidden model",
            parentId: IModel.rootSubjectId,
            jsonProperties: { PhysicalPartition: { Model: { Content: true } } },
          });
          const model = insertPhysicalSubModel({ txn, modeledElementId: partition.id });
          const category = insertSpatialCategory({ txn, codeValue: "category" });
          const element = insertPhysicalElement({ txn, modelId: model.id, categoryId: category.id });
          return { model, element };
        }),
      );
      const { imodelConnection, ...keys } = setupResult;
      const { tree, provider } = createTreeAndProvider({
        imodelConnection,
        hierarchyConfig: { elements: { classGrouping: "disable" } },
      });

      expect(
        await collect(tree.createHierarchyNodePaths({ targetItems: [keys.model], hierarchyProvider: provider })),
      ).toEqual([]);

      const paths = await collect(
        tree.createHierarchyNodePaths({ targetItems: [keys.element], hierarchyProvider: provider }),
      );
      expect(paths).toHaveLength(1);
      expect(paths[0].path.map((node) => node.extendedData?.type)).toEqual(["subject", "category", "element"]);
      await expectPathToBeExpandable({ provider, path: paths[0].path, hiddenModelIds: [keys.model.id] });
    });

    it.each([
      {
        name: "in the modeled element's category",
        sameCategory: true,
        types: ["subject", "model", "category", "element", "element"],
      },
      {
        name: "in a different category",
        sameCategory: false,
        types: ["subject", "model", "category", "element", "category", "element"],
      },
    ])("omits sub-models with elements $name", async ({ sameCategory, types }) => {
      await using setupResult = await buildIModel(async (imodel, testSchema) =>
        withEditTxn(imodel, (txn) => {
          const model = insertPhysicalModelWithPartition({ txn, codeValue: "model" });
          const category = insertSpatialCategory({ txn, codeValue: "category" });
          const modeledElement = insertPhysicalElement({
            txn,
            classFullName: testSchema.items.SubModelablePhysicalObject.fullName,
            modelId: model.id,
            categoryId: category.id,
          });
          const subModel = insertPhysicalSubModel({ txn, modeledElementId: modeledElement.id });
          const subModelCategory = sameCategory
            ? category
            : insertSpatialCategory({ txn, codeValue: "sub-model category" });
          const subModelElement = insertPhysicalElement({ txn, modelId: subModel.id, categoryId: subModelCategory.id });
          return { subModel, subModelElement };
        }),
      );
      const { imodelConnection, ...keys } = setupResult;
      const { tree, provider } = createTreeAndProvider({
        imodelConnection,
        hierarchyConfig: { elements: { classGrouping: "disable" } },
      });

      expect(
        await collect(tree.createHierarchyNodePaths({ targetItems: [keys.subModel], hierarchyProvider: provider })),
      ).toEqual([]);

      const paths = await collect(
        tree.createHierarchyNodePaths({ targetItems: [keys.subModelElement], hierarchyProvider: provider }),
      );
      expect(paths).toHaveLength(1);
      expect(paths[0].path.map((node) => node.extendedData?.type)).toEqual(types);
      await expectPathToBeExpandable({ provider, path: paths[0].path, hiddenModelIds: [keys.subModel.id] });
    });

    it.each(["enable", "enable-with-counts"] as const)(
      "includes class grouping nodes when class grouping is `%s`",
      async (classGrouping) => {
        await using setupResult = await buildIModel(async (imodel) =>
          withEditTxn(imodel, (txn) => {
            const model = insertPhysicalModelWithPartition({ txn, codeValue: "model" });
            const category = insertSpatialCategory({ txn, codeValue: "category" });
            const element = insertPhysicalElement({ txn, modelId: model.id, categoryId: category.id });
            return { element };
          }),
        );
        const { imodelConnection, ...keys } = setupResult;
        const { tree, provider } = createTreeAndProvider({
          imodelConnection,
          hierarchyConfig: { elements: { classGrouping } },
        });

        const paths = await collect(
          tree.createHierarchyNodePaths({ targetItems: [keys.element], hierarchyProvider: provider }),
        );
        expect(paths).toHaveLength(1);
        const { path } = paths[0];
        expect(path.map((node) => node.extendedData?.type)).toEqual([
          "subject",
          "model",
          "category",
          undefined,
          "element",
        ]);
        const group = path[3];
        expect(HierarchyNode.isClassGroupingNode(group) && group.key.className).toBe(keys.element.className);
        expect(HierarchyNode.isGroupingNode(group) && group.nonGroupingAncestor).toBe(path[2]);
        await expectPathToBeExpandable({ provider, path, hiddenModelIds: [] });
      },
    );

    it("requests more than 100 elements of the same class in one level with 2 requests", async () => {
      const elementsCount = 101;
      await using setupResult = await buildIModel(async (imodel) =>
        withEditTxn(imodel, (txn) => {
          const model = insertPhysicalModelWithPartition({ txn, codeValue: "model" });
          const category = insertSpatialCategory({ txn, codeValue: "category" });
          return {
            elements: Array.from({ length: elementsCount }, () =>
              insertPhysicalElement({ txn, modelId: model.id, categoryId: category.id }),
            ),
          };
        }),
      );
      const { imodelConnection, elements } = setupResult;
      const { tree, provider } = createTreeAndProvider({
        imodelConnection,
        hierarchyConfig: { elements: { classGrouping: "disable" } },
      });

      const getNodesSpy = vi.spyOn(provider, "getNodes");
      const paths = await collect(
        tree.createHierarchyNodePaths({ targetItems: elements, limit: "unbounded", hierarchyProvider: provider }),
      );
      expect(paths.map(({ path, target }) => ({ key: path[path.length - 1].key, target }))).toEqual(
        expect.arrayContaining(
          elements.map((key) => ({
            key: { type: "instances", instanceKeys: [expect.objectContaining(key)] },
            target: key.id,
          })),
        ),
      );
      expect(paths).toHaveLength(elementsCount);
      const elementRequestSizes = getNodesSpy.mock.calls.flatMap(([{ instanceFilter }]) =>
        instanceFilter?.propertyClassNames.includes(CLASS_NAMES.GeometricElement3d)
          ? ["rules" in instanceFilter.rules ? instanceFilter.rules.rules.length : 1]
          : [],
      );
      expect(elementRequestSizes.sort((lhs, rhs) => lhs - rhs)).toEqual([1, 100]);
    });
  });
});

function createTreeAndProvider({
  imodelConnection,
  hierarchyConfig,
}: {
  imodelConnection: IModelConnection;
  hierarchyConfig: ModelsTreeHierarchyConfiguration;
}) {
  const imodelAccess = createIModelAccess(imodelConnection);
  // node paths are created for hierarchies without label merging
  const tree = createModelsTree({
    imodelAccess,
    hierarchyConfig: {
      ...hierarchyConfig,
      subjects: { ...hierarchyConfig.subjects, labelMerging: "disable" },
      models: { ...hierarchyConfig.models, labelMerging: "disable" },
      categories: { ...hierarchyConfig.categories, labelMerging: "disable" },
    },
  });
  const provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition: tree.hierarchyDefinition });
  return { tree, provider };
}

/** Loads nodes for the given path of instance keys by traversing the hierarchy from the root. */
async function loadNodesPathByTraversal({
  provider,
  path,
}: {
  provider: HierarchyProvider;
  path: ReadonlyArray<Readonly<InstanceKey>>;
}): Promise<HierarchyNode[]> {
  const result = new Array<HierarchyNode>();
  for (const { id } of path) {
    result.push(...(await findChildNodes({ provider, parentNode: result.at(-1), id })));
  }
  return result;
}

/** Finds a child node of the given instance, together with grouping nodes it's grouped under. */
async function findChildNodes({
  provider,
  parentNode,
  id,
}: {
  provider: HierarchyProvider;
  parentNode: HierarchyNode | undefined;
  id: Id64String;
}): Promise<HierarchyNode[]> {
  for await (const node of provider.getNodes({ parentNode })) {
    if (HierarchyNode.isGroupingNode(node) && node.groupedInstanceKeys.some((key) => key.id === id)) {
      return [node, ...(await findChildNodes({ provider, parentNode: node, id }))];
    }
    if (HierarchyNode.isInstancesNode(node) && node.key.instanceKeys.some((key) => key.id === id)) {
      return [node];
    }
  }
  throw new Error(`Node for instance "${id}" not found`);
}

/**
 * Checks that every node of the path is a child of the preceding node, and that hidden models are not in the path.
 * Hidden models' children take their place in the hierarchy.
 */
async function expectPathToBeExpandable({
  provider,
  path,
  hiddenModelIds,
}: {
  provider: HierarchyProvider;
  path: HierarchyNode[];
  hiddenModelIds: Id64String[];
}) {
  for (const [index, node] of path.entries()) {
    expect(
      HierarchyNode.isInstancesNode(node) &&
        node.extendedData?.type === "model" &&
        hiddenModelIds.includes(node.key.instanceKeys[0].id),
    ).toBe(false);
    const children = await collect(
      provider.getNodes({ parentNode: index === 0 ? undefined : path[index - 1], ignoreCache: true }),
    );
    expect(children.map((child) => child.key)).toContainEqual(node.key);
  }
}
