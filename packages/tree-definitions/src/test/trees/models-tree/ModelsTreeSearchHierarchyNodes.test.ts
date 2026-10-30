/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect, createAsyncIterator, ResolvablePromise } from "presentation-test-utilities";
import { of } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHierarchyProvider, HierarchyNode, HierarchyNodeKey } from "@itwin/presentation-hierarchies";
import { CLASS_NAMES } from "../../../tree-definitions/shared/ClassNameDefinitions.js";
import { createModelsTree } from "../../../tree-definitions/trees/models-tree/CreateModelsTree.js";
import { ModelsTreeDefinition } from "../../../tree-definitions/trees/models-tree/ModelsTreeDefinition.js";
import { createHierarchyNodePaths } from "../../../tree-definitions/trees/models-tree/ModelsTreeSearchHierarchyNodes.js";

import type { Id64String } from "@itwin/core-bentley";
import type { GenericInstanceFilter } from "@itwin/core-common";
import type {
  GetHierarchyNodesProps,
  GroupingHierarchyNode,
  HierarchyProvider,
  InstancesNodeKey,
  NonGroupingHierarchyNode,
} from "@itwin/presentation-hierarchies";
import type {
  ModelsTreeHierarchyConfiguration,
  ModelsTreeSearchPath,
  ModelsTreeSearchPathKey,
} from "../../../tree-definitions/trees/models-tree/ModelsTreeDefinition.js";
import type { ModelsTreeHierarchyNode } from "../../../tree-definitions/trees/models-tree/ModelsTreeSearchHierarchyNodes.js";

type InstanceNode = NonGroupingHierarchyNode & { key: InstancesNodeKey };
type NodeInstanceKey = InstancesNodeKey["instanceKeys"][number];
type ParentNode = GetHierarchyNodesProps["parentNode"];
/** An entry of the expected path. Hidden entries have no node, but their keys are in `parentKeys` of their descendants. */
type ExpectedPathEntry = InstanceNode | GroupingHierarchyNode | { hidden: ModelsTreeSearchPathKey };

describe("createHierarchyNodePaths", () => {
  const subject: ModelsTreeSearchPathKey = { className: CLASS_NAMES.Subject, id: "0x1" };
  const model: ModelsTreeSearchPathKey = { className: CLASS_NAMES.GeometricModel3d, id: "0x2" };
  const category: ModelsTreeSearchPathKey = { className: CLASS_NAMES.SpatialCategory, id: "0x3" };
  const element: ModelsTreeSearchPathKey = { className: CLASS_NAMES.GeometricElement3d, id: "0x4" };
  const childCategory: ModelsTreeSearchPathKey = { className: CLASS_NAMES.SpatialCategory, id: "0x5" };
  const childElement: ModelsTreeSearchPathKey = { className: CLASS_NAMES.GeometricElement3d, id: "0x6" };

  // node keys have actual classes of instances, while search paths have base classes
  const subjectNode = createInstanceNode({ key: subject, extendedData: { type: "subject" } });
  const modelNode = createInstanceNode({
    key: { ...model, className: "BisCore.PhysicalModel" },
    extendedData: { type: "model" },
  });
  const categoryNode = createInstanceNode({ key: category, extendedData: { type: "category", modelIds: [model.id] } });
  const elementNode = createInstanceNode({
    key: { ...element, className: "Generic.PhysicalObject" },
    extendedData: { type: "element", modelId: model.id, categoryId: category.id },
  });
  const childCategoryNode = createInstanceNode({
    key: childCategory,
    extendedData: { type: "category", modelIds: [model.id], parentElementIds: [element.id] },
  });
  const childElementNode = createInstanceNode({
    key: { ...childElement, className: "Generic.PhysicalObject" },
    extendedData: { type: "element", modelId: model.id, categoryId: childCategory.id },
  });
  const hierarchyEntries: Array<[ParentNode, HierarchyNode[]]> = [
    [undefined, [subjectNode]],
    [subjectNode, [modelNode]],
    [modelNode, [categoryNode]],
    [categoryNode, [elementNode]],
    [elementNode, [childCategoryNode]],
    [childCategoryNode, [childElementNode]],
  ];

  let hierarchy: Map<string, HierarchyNode[]>;
  const getNodes = vi.fn<HierarchyProvider["getNodes"]>();
  const hierarchyProvider = createHierarchyProvider(() => ({ getNodes }));
  const getHiddenModelIds = vi.fn(() => of(new Set<Id64String>()));
  const idsProvider = { getHiddenModelIds };

  function setHierarchy(entries: Array<[ParentNode, HierarchyNode[]]>) {
    hierarchy = new Map(entries.map(([parentNode, children]) => [getHierarchyId(parentNode), children]));
  }

  beforeEach(() => {
    setHierarchy(hierarchyEntries);
    // returns requested children of the given parent, like a hierarchy provider would
    getNodes.mockReset().mockImplementation(({ parentNode, instanceFilter }) => {
      const ids = getFilteredIds(instanceFilter);
      const parentKeys = parentNode ? [...parentNode.parentKeys, parentNode.key] : [];
      const nonGroupingAncestor =
        parentNode && !HierarchyNode.isGroupingNode(parentNode)
          ? (parentNode as GroupingHierarchyNode["nonGroupingAncestor"])
          : undefined;
      return createAsyncIterator(
        (hierarchy.get(getHierarchyId(parentNode)) ?? [])
          .filter((node) => getInstanceKeys(node).some(({ id }) => ids.has(id)))
          .map((node): HierarchyNode =>
            HierarchyNode.isGroupingNode(node)
              ? { ...node, parentKeys, ...(nonGroupingAncestor ? { nonGroupingAncestor } : {}) }
              : { ...node, parentKeys },
          ),
      );
    });
    getHiddenModelIds.mockReset().mockImplementation(() => of(new Set<Id64String>()));
  });

  async function loadPaths(paths: ModelsTreeSearchPath[]) {
    return collect(
      createHierarchyNodePaths({
        instanceKeyPaths: createAsyncIterator(paths.map((path) => ({ path, target: path.at(-1)?.id ?? "" }))),
        hierarchyProvider,
        idsProvider,
      }),
    );
  }

  it.each([
    { target: "subject", path: [subject], nodes: [subjectNode] },
    { target: "model", path: [subject, model], nodes: [subjectNode, modelNode] },
    { target: "category", path: [subject, model, category], nodes: [subjectNode, modelNode, categoryNode] },
    {
      target: "element",
      path: [subject, model, category, element],
      nodes: [subjectNode, modelNode, categoryNode, elementNode],
    },
    {
      target: "child element",
      path: [subject, model, category, element, childCategory, childElement],
      nodes: [subjectNode, modelNode, categoryNode, elementNode, childCategoryNode, childElementNode],
    },
  ])("returns path to $target target", async ({ path, nodes }) => {
    expect(await loadPaths([path])).toEqual([{ path: createPath(nodes), target: path.at(-1)!.id }]);
    // every level is requested with an instance filter and a parent node that the hierarchy definition expects
    expect(getNodes).toHaveBeenCalledTimes(path.length);
    getNodes.mock.calls.forEach(([{ parentNode, instanceFilter }], index) => {
      expect(instanceFilter?.propertyClassNames).toEqual([path[index].className]);
      expect(parentNode?.extendedData).toEqual(nodes[index - 1]?.extendedData);
    });
  });

  it("omits models hidden by partition properties", async () => {
    getHiddenModelIds.mockReturnValue(of(new Set([model.id])));
    expect(await loadPaths([[subject, model]])).toEqual([]);
    expect(await loadPaths([[subject, model, category, element]])).toEqual([
      { path: createPath([subjectNode, { hidden: model }, categoryNode, elementNode]), target: element.id },
    ]);
    expect(getNodes.mock.calls.map(([{ instanceFilter }]) => instanceFilter?.propertyClassNames)).not.toContainEqual([
      CLASS_NAMES.GeometricModel3d,
    ]);
  });

  it("omits sub-models", async () => {
    const subModel: ModelsTreeSearchPathKey = { ...model, id: element.id };
    const subModelCategory: ModelsTreeSearchPathKey = { ...category, id: "0x7" };
    const subModelElement: ModelsTreeSearchPathKey = { ...element, id: "0x8" };
    const subModelExtendedData = { type: "model", subModeledElementCategory: category.id };
    const subModelCategoryNode = createInstanceNode({
      key: subModelCategory,
      extendedData: { type: "category", modelIds: [subModel.id] },
    });
    const subModelElementNode = createInstanceNode({
      key: subModelElement,
      extendedData: { type: "element", modelId: subModel.id, categoryId: subModelCategory.id },
    });
    setHierarchy([
      ...hierarchyEntries,
      [createInstanceNode({ key: subModel, extendedData: subModelExtendedData }), [subModelCategoryNode]],
      [subModelCategoryNode, [subModelElementNode]],
    ]);
    expect(
      await loadPaths([
        [subject, model, category, element, subModel],
        [subject, model, category, element, subModel, subModelCategory, subModelElement],
      ]),
    ).toEqual([
      {
        path: createPath([
          subjectNode,
          modelNode,
          categoryNode,
          elementNode,
          { hidden: subModel },
          subModelCategoryNode,
          subModelElementNode,
        ]),
        target: subModelElement.id,
      },
    ]);
    expect(getNodes).toHaveBeenCalledWith(
      expect.objectContaining({
        parentNode: expect.objectContaining({
          key: createInstancesNodeKey(subModel),
          extendedData: subModelExtendedData,
        }),
      }),
    );
  });

  it("includes class grouping nodes", async () => {
    const elementGroup = createGroupingNode(elementNode);
    const childElementGroup = createGroupingNode(childElementNode);
    setHierarchy([
      ...hierarchyEntries,
      [categoryNode, [elementGroup]],
      [elementGroup, [elementNode]],
      [childCategoryNode, [childElementGroup]],
      [childElementGroup, [childElementNode]],
    ]);
    expect(await loadPaths([[subject, model, category, element, childCategory, childElement]])).toEqual([
      {
        path: createPath([
          subjectNode,
          modelNode,
          categoryNode,
          elementGroup,
          elementNode,
          childCategoryNode,
          childElementGroup,
          childElementNode,
        ]),
        target: childElement.id,
      },
    ]);
  });

  it("requests more than 100 elements of the same class in one level with 2 requests", async () => {
    const elementNodes = Array.from({ length: 101 }, (_, index) =>
      createInstanceNode({
        key: { className: "Generic.PhysicalObject", id: `0x${(index + 0x100).toString(16)}` },
        extendedData: elementNode.extendedData,
      }),
    );
    setHierarchy([...hierarchyEntries, [categoryNode, elementNodes]]);
    const elementIds = elementNodes.map((node) => node.key.instanceKeys[0].id);
    expect(await loadPaths(elementIds.map((id) => [subject, model, category, { ...element, id }]))).toEqual(
      elementNodes.map((node, index) => ({
        path: createPath([subjectNode, modelNode, categoryNode, node]),
        target: elementIds[index],
      })),
    );
    const elementRequests = getNodes.mock.calls.filter(([{ instanceFilter }]) =>
      instanceFilter?.propertyClassNames.includes(CLASS_NAMES.GeometricElement3d),
    );
    expect(elementRequests.map(([{ instanceFilter }]) => getFilteredIds(instanceFilter).size)).toEqual([100, 1]);
  });

  it("requests nodes of all hierarchy levels in parallel", async () => {
    const release = new ResolvablePromise<void>();
    const loadNodes = getNodes.getMockImplementation()!;
    getNodes.mockImplementation(async function* (props) {
      await release;
      yield* loadNodes(props);
    });
    const path = [subject, model, category, element, childCategory, childElement];
    const result = loadPaths([path]);
    // all levels are requested before any request completes
    await vi.waitFor(() => expect(getNodes).toHaveBeenCalledTimes(path.length));
    await release.resolve();
    expect(await result).toHaveLength(1);
  });
});

describe("createModelsTree", () => {
  it("disables label merging in node paths without changing the other search settings", async () => {
    const hierarchyConfig: ModelsTreeHierarchyConfiguration = {
      subjects: { root: "exclude", labelMerging: "enable" },
      models: { withoutElements: "include", labelMerging: "enable" },
      categories: { labelMerging: "enable" },
      elements: { classGrouping: "disable", excludedClasses: ["Test.Excluded"] },
    };
    const tree = createModelsTree({
      hierarchyConfig,
      imodelAccess: {
        createQueryReader: () => createAsyncIterator([]),
        getSchema: async () => undefined,
        getHiddenClassesTree: async () => [],
        classDerivesFrom: () => false,
      },
    });
    const pathsSearch = vi
      .spyOn(ModelsTreeDefinition, "createInstanceKeyPaths")
      .mockImplementation(() => createAsyncIterator([]));
    const treeSearch = vi.spyOn(ModelsTreeDefinition, "createSearchTree").mockResolvedValue([]);
    const hierarchyProvider = createHierarchyProvider(() => ({ getNodes: () => createAsyncIterator([]) }));
    await collect(tree.createHierarchyNodePaths({ targetItems: [], hierarchyProvider }));
    const expectedConfig = {
      ...hierarchyConfig,
      subjects: { ...hierarchyConfig.subjects, labelMerging: "disable" },
      models: { ...hierarchyConfig.models, labelMerging: "disable" },
      categories: { ...hierarchyConfig.categories, labelMerging: "disable" },
    };
    expect(pathsSearch.mock.calls[0][0].hierarchyConfig).toMatchObject(expectedConfig);
    await collect(tree.createInstanceKeyPaths({ targetItems: [] }));
    await tree.createSearchTree({ targetItems: [] });
    expect(pathsSearch.mock.calls[1][0].hierarchyConfig).toMatchObject(hierarchyConfig);
    expect(treeSearch.mock.calls[0][0].hierarchyConfig).toMatchObject(hierarchyConfig);
    expect(tree).not.toHaveProperty("createHierarchyNodeSearchTree");
    pathsSearch.mockRestore();
    treeSearch.mockRestore();
  });
});

function createInstancesNodeKey(key: NodeInstanceKey): InstancesNodeKey {
  return { type: "instances", instanceKeys: [{ className: key.className, id: key.id }] };
}

function createInstanceNode({
  key,
  extendedData,
}: {
  key: NodeInstanceKey;
  extendedData: InstanceNode["extendedData"];
}): InstanceNode {
  return { key: createInstancesNodeKey(key), label: "", parentKeys: [], children: true, extendedData };
}

function createGroupingNode(...groupedNodes: InstanceNode[]): GroupingHierarchyNode {
  return {
    key: { type: "class-grouping", className: "Generic.PhysicalObject" },
    label: "",
    parentKeys: [],
    children: true,
    groupedInstanceKeys: groupedNodes.flatMap((node) => node.key.instanceKeys),
  };
}

function getInstanceKeys(node: HierarchyNode) {
  if (HierarchyNode.isGroupingNode(node)) {
    return node.groupedInstanceKeys;
  }
  return HierarchyNode.isInstancesNode(node) ? node.key.instanceKeys : [];
}

/** Identifies fixture hierarchy nodes and parent nodes that are used to request their children. */
function getHierarchyId(node: ParentNode): string {
  if (!node) {
    return "root";
  }
  if (HierarchyNode.isGroupingNode(node)) {
    return `group:${node.groupedInstanceKeys.map(({ id }) => id).join()}`;
  }
  return HierarchyNodeKey.isInstances(node.key)
    ? `${node.extendedData?.type}:${node.key.instanceKeys[0].id}`
    : JSON.stringify(node.key);
}

function getFilteredIds(instanceFilter?: GenericInstanceFilter): Set<string> {
  const rules = !instanceFilter
    ? []
    : "rules" in instanceFilter.rules
      ? instanceFilter.rules.rules
      : [instanceFilter.rules];
  return new Set(
    rules.flatMap((rule) => ("rules" in rule || typeof rule.value?.rawValue !== "string" ? [] : [rule.value.rawValue])),
  );
}

/** Creates nodes with ancestor keys and non-grouping ancestors set based on preceding path entries. */
function createPath(entries: ExpectedPathEntry[]): ModelsTreeHierarchyNode[] {
  const result = new Array<ModelsTreeHierarchyNode>();
  const parentKeys = new Array<HierarchyNodeKey>();
  let nonGroupingAncestor: GroupingHierarchyNode["nonGroupingAncestor"];
  for (const entry of entries) {
    if ("hidden" in entry) {
      parentKeys.push(createInstancesNodeKey(entry.hidden));
      continue;
    }
    if (HierarchyNode.isGroupingNode(entry)) {
      result.push({ ...entry, parentKeys: [...parentKeys], ...(nonGroupingAncestor ? { nonGroupingAncestor } : {}) });
    } else {
      const node = { ...entry, parentKeys: [...parentKeys] };
      result.push(node);
      nonGroupingAncestor = node;
    }
    parentKeys.push(entry.key);
  }
  return result;
}
