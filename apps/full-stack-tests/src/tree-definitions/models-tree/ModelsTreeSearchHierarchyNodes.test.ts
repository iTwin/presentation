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
  createIModelHierarchyNodePaths,
  createIModelHierarchyProvider,
  HierarchyNode,
  HierarchySearchTree,
} from "@itwin/presentation-hierarchies";
import { createModelsTree } from "@itwin/presentation-tree-definitions/internal";
import { initialize, terminate } from "../../IntegrationTests.js";
import { createIModelAccess } from "../Common.js";
import { buildIModel } from "../IModelUtils.js";

import type { IModelConnection } from "@itwin/core-frontend";
import type { HierarchyProvider, HierarchySearchPathOptions } from "@itwin/presentation-hierarchies";
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
      const searchPaths = await collect(tree.createInstanceKeyPaths({ targetItems: [targetKey] }));
      expect(paths).toEqual(await loadNodesPathsByTraversal({ provider, imodelAccess, searchPaths }));
      expect(paths[0].map((node) => node.extendedData?.type)).toEqual(types);
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
      const { tree, provider, imodelAccess } = createTreeAndProvider({
        imodelConnection,
        hierarchyConfig: { elements: { classGrouping: "disable" } },
      });

      expect(await createNodePaths({ tree, imodelAccess, targetItems: [keys.model] })).toEqual([]);

      const paths = await createNodePaths({ tree, imodelAccess, targetItems: [keys.element] });
      expect(paths).toHaveLength(1);
      expect(paths[0].map((node) => node.extendedData?.type)).toEqual(["subject", "category", "element"]);
      // the hidden model is still an ancestor of its children
      expect(paths[0].at(-1)!.parentKeys).toContainEqual(matchInstancesNodeKey(keys.model));
      await expectNodesPathExists({ provider, path: paths[0] });
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
      const { tree, provider, imodelAccess } = createTreeAndProvider({
        imodelConnection,
        hierarchyConfig: { elements: { classGrouping: "disable" } },
      });

      expect(await createNodePaths({ tree, imodelAccess, targetItems: [keys.subModel] })).toEqual([]);

      const paths = await createNodePaths({ tree, imodelAccess, targetItems: [keys.subModelElement] });
      expect(paths).toHaveLength(1);
      expect(paths[0].map((node) => node.extendedData?.type)).toEqual(types);
      // the hidden sub-model is still an ancestor of its children
      expect(paths[0].at(-1)!.parentKeys).toContainEqual(matchInstancesNodeKey(keys.subModel));
      await expectNodesPathExists({ provider, path: paths[0] });
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
        const [path] = paths;
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

    it.each([
      { name: "no options", options: undefined },
      { name: "`reveal: true`", options: { reveal: true } },
      { name: "`reveal` up to a grouping level", options: { reveal: { groupingLevel: 1 } } },
      { name: "`autoExpand`", options: { autoExpand: true } },
    ])("assigns the same search attributes as a provider with the search applied, with $name", async ({ options }) => {
      await using setupResult = await buildIModel(async (imodel) =>
        withEditTxn(imodel, (txn) => {
          const model = insertPhysicalModelWithPartition({ txn, codeValue: "model" });
          const category = insertSpatialCategory({ txn, codeValue: "category" });
          const element1 = insertPhysicalElement({ txn, modelId: model.id, categoryId: category.id });
          const element2 = insertPhysicalElement({ txn, modelId: model.id, categoryId: category.id });
          return { element1, element2 };
        }),
      );
      const { imodelConnection, ...keys } = setupResult;
      const { tree, provider, imodelAccess } = createTreeAndProvider({
        imodelConnection,
        hierarchyConfig: { elements: { classGrouping: "enable" } },
      });
      // both elements are under the same class grouping node, but only the first path has options
      const searchPaths = [
        ...(await collect(tree.createInstanceKeyPaths({ targetItems: [keys.element1] }))).map(({ path }) => ({
          path,
          options,
        })),
        ...(await collect(tree.createInstanceKeyPaths({ targetItems: [keys.element2] }))).map(({ path }) => ({ path })),
      ];

      const nodePaths = await collect(
        createIModelHierarchyNodePaths({
          imodelAccess,
          hierarchyDefinition: tree.hierarchyDefinition,
          paths: searchPaths,
        }),
      );
      expect(nodePaths).toEqual(await loadNodesPathsByTraversal({ provider, imodelAccess, searchPaths }));
    });

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
      expect(paths.map((path) => path[path.length - 1].key)).toEqual(
        expect.arrayContaining(
          elements.map((key) => ({ type: "instances", instanceKeys: [expect.objectContaining(key)] })),
        ),
      );
      expect(paths).toHaveLength(elementsCount);
      // hierarchy levels of node paths are identified by paths, and sibling instances are requested together
      const elementRequests = defineHierarchyLevelSpy.mock.calls.filter(([props]) => {
        const parentEntry = "path" in props ? props.path.at(-1) : undefined;
        return !!parentEntry && "className" in parentEntry && parentEntry.className === "BisCore.SpatialCategory";
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
 * hierarchy definition and instance key paths to `createIModelHierarchyNodePaths`.
 */
async function createNodePaths({
  tree,
  imodelAccess,
  ...searchProps
}: Parameters<ReturnType<typeof createModelsTree>["createInstanceKeyPaths"]>[0] & {
  tree: ReturnType<typeof createTreeAndProvider>["tree"];
  imodelAccess: ReturnType<typeof createIModelAccess>;
}) {
  return collect(
    createIModelHierarchyNodePaths({
      imodelAccess,
      hierarchyDefinition: tree.hierarchyDefinition,
      paths: tree.createInstanceKeyPaths(searchProps),
    }),
  );
}

/**
 * Loads nodes paths for the given search paths by applying the search to the provider and traversing the hierarchy
 * from the root. The search is applied once for all paths, because search attributes of nodes depend on all of them.
 */
async function loadNodesPathsByTraversal({
  searchPaths,
  ...props
}: {
  provider: HierarchyProvider;
  imodelAccess: ReturnType<typeof createIModelAccess>;
  searchPaths: Array<{ path: ReadonlyArray<Readonly<InstanceKey>>; options?: HierarchySearchPathOptions }>;
}): Promise<HierarchyNode[][]> {
  props.provider.setHierarchySearch({ paths: await HierarchySearchTree.createFromPathsList(searchPaths) });
  return Promise.all(searchPaths.map(async ({ path }) => loadNodesPathByTraversal({ ...props, path })));
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

/** Checks that every node of the path is a child of the preceding node, with the same ancestor keys. */
async function expectNodesPathExists({ provider, path }: { provider: HierarchyProvider; path: HierarchyNode[] }) {
  let parentNode: HierarchyNode | undefined;
  for (const node of path) {
    const children = await collect(provider.getNodes({ parentNode, ignoreCache: true }));
    expect(children).toContainEqual(expect.objectContaining({ key: node.key, parentKeys: node.parentKeys }));
    parentNode = node;
  }
}

/** Creates the key of an instances node, that has a node key matching the given instance key. */
function matchInstancesNodeKey(instanceKey: InstanceKey) {
  return { type: "instances", instanceKeys: [expect.objectContaining(instanceKey)] };
}
