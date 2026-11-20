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
import {
  createHierarchyNodePaths,
  createIModelHierarchyProvider,
  HierarchyNode,
} from "@itwin/presentation-hierarchies";
import { createModelsTree } from "@itwin/presentation-tree-definitions/internal";
import { initialize, terminate } from "../../IntegrationTests.js";
import { createIModelAccess } from "../Common.js";
import { buildIModel } from "../IModelUtils.js";

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
      const { tree, provider, imodelAccess } = createTreeAndProvider({
        imodelConnection,
        hierarchyConfig: { elements: { classGrouping: "disable" } },
      });
      const targetKey = keys[target];

      const paths = await createNodePaths({ tree, imodelAccess, targetItems: [targetKey] });
      const [{ path: instanceKeysPath }] = await collect(tree.createInstanceKeyPaths({ targetItems: [targetKey] }));
      expect(paths).toEqual([
        {
          path: await loadNodesPathByTraversal({ provider, imodelAccess, path: instanceKeysPath }),
          target: targetKey.id,
        },
      ]);
      expect(paths[0].path.map((node) => node.extendedData?.type)).toEqual(types);
    });

    it("flags models hidden by partition properties", async () => {
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
      const { tree, provider, imodelAccess } = createTreeAndProvider({
        imodelConnection,
        hierarchyConfig: { elements: { classGrouping: "disable" } },
      });

      expect(await createNodePaths({ tree, imodelAccess, targetItems: [keys.model] })).toEqual([]);

      const paths = await createNodePaths({ tree, imodelAccess, targetItems: [keys.element] });
      expect(paths).toHaveLength(1);
      expect(paths[0].path.map((node) => node.extendedData?.type)).toEqual(["subject", "model", "category", "element"]);
      expect(paths[0].path.filter((node) => node.isHidden)).toMatchObject([
        { key: { instanceKeys: [{ id: keys.model.id }] } },
      ]);
      await expectNodesPathExists({ provider, path: paths[0].path });
    });

    it.each([
      {
        name: "in the modeled element's category",
        sameCategory: true,
        types: ["subject", "model", "category", "element", "model", "element"],
      },
      {
        name: "in a different category",
        sameCategory: false,
        types: ["subject", "model", "category", "element", "model", "category", "element"],
      },
    ])("flags sub-models with elements $name", async ({ sameCategory, types }) => {
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
      const { tree, provider, imodelAccess } = createTreeAndProvider({
        imodelConnection,
        hierarchyConfig: { elements: { classGrouping: "disable" } },
      });

      expect(await createNodePaths({ tree, imodelAccess, targetItems: [keys.subModel] })).toEqual([]);

      const paths = await createNodePaths({ tree, imodelAccess, targetItems: [keys.subModelElement] });
      expect(paths).toHaveLength(1);
      expect(paths[0].path.map((node) => node.extendedData?.type)).toEqual(types);
      expect(paths[0].path.filter((node) => node.isHidden)).toMatchObject([
        { key: { instanceKeys: [{ id: keys.subModel.id }] } },
      ]);
      await expectNodesPathExists({ provider, path: paths[0].path });
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
        const { tree, provider, imodelAccess } = createTreeAndProvider({
          imodelConnection,
          hierarchyConfig: { elements: { classGrouping } },
        });

        const paths = await createNodePaths({ tree, imodelAccess, targetItems: [keys.element] });
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
        await expectNodesPathExists({ provider, path });
      },
    );

    it("requests more than 100 elements in one level with a single request", async () => {
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
      const { tree, imodelAccess } = createTreeAndProvider({
        imodelConnection,
        hierarchyConfig: { elements: { classGrouping: "disable" } },
      });

      const defineHierarchyLevelSpy = vi.spyOn(tree.hierarchyDefinition, "defineHierarchyLevel");
      const paths = await createNodePaths({ tree, imodelAccess, targetItems: elements, limit: "unbounded" });
      expect(paths.map(({ path, target }) => ({ key: path[path.length - 1].key, target }))).toEqual(
        expect.arrayContaining(
          elements.map((key) => ({
            key: { type: "instances", instanceKeys: [expect.objectContaining(key)] },
            target: key.id,
          })),
        ),
      );
      expect(paths).toHaveLength(elementsCount);
      // hierarchy levels of node paths are identified by paths, and their sibling instances are requested using filters
      const elementRequests = defineHierarchyLevelSpy.mock.calls.filter(([props]) => {
        const parentEntry = "path" in props ? props.path.at(-1) : undefined;
        return (
          !!parentEntry &&
          "className" in parentEntry &&
          parentEntry.className === "BisCore.SpatialCategory" &&
          !!props.instanceFilter
        );
      });
      expect(elementRequests).toHaveLength(1);
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
  // node paths can only be created for hierarchies without label merging
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
  return { tree, provider, imodelAccess };
}

/**
 * Loads hierarchy node paths for the given search targets, the way consumers are expected to: by passing the tree's
 * hierarchy definition and instance key paths to `createHierarchyNodePaths`.
 */
async function createNodePaths({
  tree,
  imodelAccess,
  ...searchProps
}: Parameters<ReturnType<typeof createModelsTree>["createInstanceKeyPaths"]>[0] & {
  tree: ReturnType<typeof createTreeAndProvider>["tree"];
  imodelAccess: ReturnType<typeof createIModelAccess>;
}) {
  const nodePaths = await createHierarchyNodePaths({
    imodelAccess,
    hierarchyDefinition: tree.hierarchyDefinition,
    paths: tree.createInstanceKeyPaths(searchProps),
  });
  return nodePaths.map(({ searchPath, nodesPath }) => ({ path: nodesPath, target: searchPath.target }));
}

/** Loads nodes for the given path of instance keys by traversing the hierarchy from the root. */
async function loadNodesPathByTraversal({
  path,
  ...props
}: {
  provider: HierarchyProvider;
  imodelAccess: ReturnType<typeof createIModelAccess>;
  path: ReadonlyArray<Readonly<InstanceKey>>;
}): Promise<HierarchyNode[]> {
  const result = new Array<HierarchyNode>();
  for (const instanceKey of path) {
    result.push(...(await loadGroupedInstanceNodeSegment({ ...props, parentNode: result.at(-1), instanceKey })));
  }
  return result;
}

/**
 * Loads the segment of a nodes path for the given instance under the given parent node - grouping nodes the instance is
 * grouped under, followed by the instance's node. Search paths may contain base classes of instances' classes, so node
 * keys' classes only have to derive from the given instance key's class.
 */
async function loadGroupedInstanceNodeSegment({
  provider,
  imodelAccess,
  parentNode,
  instanceKey,
}: {
  provider: HierarchyProvider;
  imodelAccess: ReturnType<typeof createIModelAccess>;
  parentNode: HierarchyNode | undefined;
  instanceKey: Readonly<InstanceKey>;
}): Promise<HierarchyNode[]> {
  const containsInstanceKey = async (keys: InstanceKey[]) =>
    (
      await Promise.all(
        keys.map(
          async (key) =>
            key.id === instanceKey.id && (await imodelAccess.classDerivesFrom(key.className, instanceKey.className)),
        ),
      )
    ).some((matches) => matches);
  for await (const node of provider.getNodes({ parentNode })) {
    if (HierarchyNode.isGroupingNode(node) && (await containsInstanceKey(node.groupedInstanceKeys))) {
      return [
        node,
        ...(await loadGroupedInstanceNodeSegment({ provider, imodelAccess, parentNode: node, instanceKey })),
      ];
    }
    if (HierarchyNode.isInstancesNode(node) && (await containsInstanceKey(node.key.instanceKeys))) {
      return [node];
    }
  }
  throw new Error(`Node for instance "${instanceKey.className}:${instanceKey.id}" not found`);
}

/**
 * Checks that every visible node of the path is a child of the preceding visible node. Hidden nodes are skipped, because
 * their children take their place in the hierarchy.
 */
async function expectNodesPathExists({
  provider,
  path,
}: {
  provider: HierarchyProvider;
  path: Array<HierarchyNode & { isHidden?: boolean }>;
}) {
  let parentNode: HierarchyNode | undefined;
  for (const node of path) {
    if (node.isHidden) {
      continue;
    }
    const children = await collect(provider.getNodes({ parentNode, ignoreCache: true }));
    expect(children.map((child) => child.key)).toContainEqual(node.key);
    parentNode = node;
  }
}
