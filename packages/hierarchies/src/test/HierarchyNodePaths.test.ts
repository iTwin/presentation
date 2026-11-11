/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect, createAsyncIterator, ResolvablePromise } from "presentation-test-utilities";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import { HierarchyNode } from "../hierarchies/HierarchyNode.js";
import { createHierarchyNodePaths } from "../hierarchies/HierarchyNodePaths.js";
import { createHierarchyProvider } from "../hierarchies/HierarchyProvider.js";
import {
  createTestGenericNode,
  createTestGenericNodeKey,
  createTestGroupingNode,
  createTestInstanceNode,
} from "./Utils.js";

import type { GenericInstanceFilter } from "@itwin/core-common";
import type {
  GroupingHierarchyNode,
  NonGroupingHierarchyNode,
  ParentHierarchyNode,
} from "../hierarchies/HierarchyNode.js";
import type { HierarchyNodeKey, IModelInstanceKey, InstancesNodeKey } from "../hierarchies/HierarchyNodeKey.js";
import type { MinimalHierarchyNode } from "../hierarchies/HierarchyNodePaths.js";
import type { HierarchyProvider } from "../hierarchies/HierarchyProvider.js";

describe("createHierarchyNodePaths", () => {
  // search paths use base classes, while loaded nodes have actual classes of instances
  const a: IModelInstanceKey = { className: "s.A", id: "0x1" };
  const b: IModelInstanceKey = { className: "s.B", id: "0x2" };
  const c: IModelInstanceKey = { className: "s.C", id: "0x3" };
  const d: IModelInstanceKey = { className: "s.C", id: "0x4" };
  const e: IModelInstanceKey = { className: "s.D", id: "0x5" };
  const nodeA = createInstanceNode({ className: "s.DerivedA", id: a.id });
  const nodeB = createInstanceNode({ className: "s.DerivedB", id: b.id });
  const nodeC = createInstanceNode(c);
  const nodeD = createInstanceNode(d);
  const nodeE = createInstanceNode(e);
  const hierarchyEntries: Array<[ParentNode, HierarchyNode[]]> = [
    [undefined, [nodeA]],
    [nodeA, [nodeB, nodeE]],
    [nodeB, [nodeC, nodeD]],
  ];

  let hierarchy: Map<string, HierarchyNode[]>;
  const getNodes = vi.fn<HierarchyProvider["getNodes"]>();
  const hierarchyProvider = createHierarchyProvider(() => ({ getNodes }));
  const createMinimalNode = vi.fn(
    ({
      instanceKey,
      parentNode,
    }: {
      instanceKey: IModelInstanceKey;
      parentNode: MinimalHierarchyNode | undefined;
    }): MinimalHierarchyNode => ({
      key: { type: "instances", instanceKeys: [instanceKey] },
      parentKeys: parentNode ? [...parentNode.parentKeys, parentNode.key] : [],
      label: "",
      extendedData: { minimal: true },
    }),
  );

  function setHierarchy(entries: Array<[ParentNode, HierarchyNode[]]>) {
    hierarchy = new Map(entries.map(([parentNode, children]) => [getHierarchyId(parentNode), children]));
  }

  beforeEach(() => {
    setHierarchy(hierarchyEntries);
    // returns requested children of the given parent, like a hierarchy provider would - filtered requests return
    // only requested instances, and grouping nodes that group only them
    getNodes.mockReset().mockImplementation(({ parentNode, instanceFilter }) => {
      const ids = getFilteredIds(instanceFilter);
      const isRequested = ({ id }: { id: string }) => !instanceFilter || ids.has(id);
      const parentKeys = parentNode ? [...parentNode.parentKeys, parentNode.key] : [];
      const nonGroupingAncestor =
        parentNode && HierarchyNode.isGroupingNode(parentNode)
          ? parentNode.nonGroupingAncestor
          : (parentNode as GroupingHierarchyNode["nonGroupingAncestor"]);
      return createAsyncIterator(
        (hierarchy.get(getHierarchyId(parentNode)) ?? [])
          .filter((node) => HierarchyNode.isGeneric(node) || getInstanceKeys(node).some(isRequested))
          .map((node): HierarchyNode =>
            HierarchyNode.isGroupingNode(node)
              ? {
                  ...node,
                  groupedInstanceKeys: node.groupedInstanceKeys.filter(isRequested),
                  parentKeys,
                  ...(nonGroupingAncestor ? { nonGroupingAncestor } : {}),
                }
              : { ...node, parentKeys },
          ),
      );
    });
    createMinimalNode.mockClear();
  });

  /** Loads node paths for the given instance key paths and returns them with `searchPath` set to the instance key path. */
  async function loadPaths(paths: IModelInstanceKey[][]) {
    const nodePaths = await collect(
      createHierarchyNodePaths({ hierarchyProvider, paths: paths.map((path) => ({ path })), createMinimalNode }),
    );
    return nodePaths.map(({ searchPath, nodesPath }) => ({ searchPath: searchPath.path, nodesPath }));
  }

  it("returns nothing for no paths", async () => {
    expect(await loadPaths([])).toEqual([]);
    expect(getNodes).not.toHaveBeenCalled();
  });

  it.each([
    { target: "root", path: [a], nodes: [nodeA] },
    { target: "child", path: [a, b], nodes: [nodeA, nodeB] },
    { target: "grandchild", path: [a, b, c], nodes: [nodeA, nodeB, nodeC] },
  ])("returns path to $target target", async ({ path, nodes }) => {
    expect(await loadPaths([path])).toEqual([{ searchPath: path, nodesPath: createPath(nodes) }]);
    // every level is requested with an instance filter and a minimal parent node
    expect(getNodes).toHaveBeenCalledTimes(path.length);
    path.forEach((identifier, index) => {
      expect(getNodes).toHaveBeenCalledWith({
        parentNode: index > 0 ? createMinimalNode.mock.results[index - 1].value : undefined,
        instanceFilter: createIdsFilter([identifier.id]),
      });
    });
  });

  it("creates minimal nodes once for every unique path prefix", async () => {
    await loadPaths([
      [a, b, c],
      [a, b, d],
      [a, e],
    ]);
    expect(createMinimalNode.mock.calls.map(([{ instanceKey }]) => instanceKey)).toEqual([a, b, c, d, e]);
    const [minimalA, minimalB] = createMinimalNode.mock.results.map(({ value }) => value);
    expect(createMinimalNode).toHaveBeenNthCalledWith(1, { instanceKey: a, parentNode: undefined });
    expect(createMinimalNode).toHaveBeenNthCalledWith(2, { instanceKey: b, parentNode: minimalA });
    expect(createMinimalNode).toHaveBeenNthCalledWith(3, { instanceKey: c, parentNode: minimalB });
    expect(createMinimalNode).toHaveBeenNthCalledWith(4, { instanceKey: d, parentNode: minimalB });
    expect(createMinimalNode).toHaveBeenNthCalledWith(5, { instanceKey: e, parentNode: minimalA });
  });

  it("consumes paths as they come in and requests nodes after all paths are consumed", async () => {
    const releaseSecondPath = new ResolvablePromise<void>();
    async function* createPaths() {
      yield { path: [a, b] };
      await releaseSecondPath;
      yield { path: [a, e] };
    }
    const result = collect(createHierarchyNodePaths({ hierarchyProvider, paths: createPaths(), createMinimalNode }));
    await vi.waitFor(() => expect(createMinimalNode).toHaveBeenCalledTimes(2));
    expect(getNodes).not.toHaveBeenCalled();
    await releaseSecondPath.resolve();
    expect(await result).toHaveLength(2);
    expect(createMinimalNode).toHaveBeenCalledTimes(3);
  });

  it("requests all siblings together", async () => {
    const result = await loadPaths([
      [a, b, c],
      [a, e],
      [a, b, d],
    ]);
    expect(result).toEqual([
      { searchPath: [a, b, c], nodesPath: createPath([nodeA, nodeB, nodeC]) },
      { searchPath: [a, e], nodesPath: createPath([nodeA, nodeE]) },
      { searchPath: [a, b, d], nodesPath: createPath([nodeA, nodeB, nodeD]) },
    ]);
    // siblings of different classes are requested together
    expect(getNodes.mock.calls.map(([{ instanceFilter }]) => instanceFilter)).toEqual([
      createIdsFilter([a.id]),
      createIdsFilter([b.id, e.id]),
      createIdsFilter([c.id, d.id]),
    ]);
  });

  it("yields the given search path objects in the order of input paths", async () => {
    const paths = [
      { path: [a, b], target: "b" },
      { path: [a], target: "a" },
    ];
    const result = await collect(
      createHierarchyNodePaths({ hierarchyProvider, paths: createAsyncIterator(paths), createMinimalNode }),
    );
    expect(result).toEqual([
      { searchPath: paths[0], nodesPath: createPath([nodeA, nodeB]) },
      { searchPath: paths[1], nodesPath: createPath([nodeA]) },
    ]);
    result.forEach(({ searchPath }, index) => expect(searchPath).toBe(paths[index]));
  });

  it("omits paths whose target or ancestor isn't in the hierarchy", async () => {
    const missing: IModelInstanceKey = { className: "s.C", id: "0x99" };
    expect(await loadPaths([[], [a, missing], [a, missing, c], [missing, b]])).toEqual([]);
  });

  it("matches nodes by instance ID and iModel key", async () => {
    const imodelNodeB = createInstanceNode({ ...nodeB.key.instanceKeys[0], imodelKey: "imodel" });
    setHierarchy([...hierarchyEntries, [nodeA, [imodelNodeB]]]);
    expect(
      await loadPaths([
        [a, { ...b, imodelKey: "imodel" }],
        [a, { ...b, imodelKey: "other" }],
      ]),
    ).toEqual([{ searchPath: [a, { ...b, imodelKey: "imodel" }], nodesPath: createPath([nodeA, imodelNodeB]) }]);
  });

  it("returns the same node for all entries matching its instance keys", async () => {
    const mergedNode = createTestInstanceNode({
      key: { type: "instances", instanceKeys: [c, d] },
      label: "merged",
      parentKeys: [],
    });
    setHierarchy([...hierarchyEntries, [nodeB, [mergedNode]]]);
    expect(
      await loadPaths([
        [a, b, c],
        [a, b, d],
      ]),
    ).toEqual([
      { searchPath: [a, b, c], nodesPath: createPath([nodeA, nodeB, mergedNode]) },
      { searchPath: [a, b, d], nodesPath: createPath([nodeA, nodeB, mergedNode]) },
    ]);
  });

  it("ignores generic nodes", async () => {
    setHierarchy([
      ...hierarchyEntries,
      [undefined, [createTestGenericNode({ key: createTestGenericNodeKey() }), nodeA]],
    ]);
    expect(await loadPaths([[a]])).toEqual([{ searchPath: [a], nodesPath: createPath([nodeA]) }]);
  });

  it("ignores instance nodes that weren't requested", async () => {
    // e.g. children of hidden nodes that are returned in their place
    getNodes.mockImplementationOnce(() => createAsyncIterator([nodeB, nodeA]));
    expect(await loadPaths([[a]])).toEqual([{ searchPath: [a], nodesPath: createPath([nodeA]) }]);
  });

  describe("hidden nodes", () => {
    beforeEach(() => {
      createMinimalNode.mockImplementation(({ instanceKey, parentNode }) => ({
        key: { type: "instances", instanceKeys: [instanceKey] },
        parentKeys: parentNode ? [...parentNode.parentKeys, parentNode.key] : [],
        label: "",
        ...(instanceKey.id === b.id ? { processingParams: { hideInHierarchy: true } } : {}),
      }));
    });

    it("doesn't request hidden nodes, but requests their children", async () => {
      expect(
        await loadPaths([
          [a, b],
          [a, b, c],
        ]),
      ).toEqual([{ searchPath: [a, b, c], nodesPath: createPath([nodeA, { hidden: b }, nodeC]) }]);
      expect(getNodes.mock.calls.map(([{ instanceFilter }]) => instanceFilter)).toEqual([
        createIdsFilter([a.id]),
        createIdsFilter([c.id]),
      ]);
      // hidden entry's minimal node is used as the parent node
      expect(getNodes.mock.calls[1][0].parentNode).toBe(createMinimalNode.mock.results[1].value);
    });

    it("sets non-grouping ancestor of grouping nodes under hidden parents", async () => {
      const groupC = createGroupingNode(nodeC);
      setHierarchy([...hierarchyEntries, [nodeB, [groupC]], [groupC, [nodeC]]]);
      const [{ nodesPath }] = await loadPaths([[a, b, c]]);
      expect(nodesPath).toEqual(createPath([nodeA, { hidden: b }, groupC, nodeC]));
      expect((nodesPath[1] as GroupingHierarchyNode).nonGroupingAncestor).toEqual({
        key: { type: "instances", instanceKeys: [b] },
        parentKeys: [nodeA.key],
        label: "",
        processingParams: { hideInHierarchy: true },
      });
    });
  });

  describe("grouping nodes", () => {
    it("includes nested grouping nodes", async () => {
      const outerGroup = createGroupingNode(nodeC, nodeD);
      const innerGroup = createGroupingNode(nodeC);
      innerGroup.key = { type: "label-grouping", label: "inner" };
      setHierarchy([
        ...hierarchyEntries,
        [nodeB, [outerGroup]],
        [outerGroup, [innerGroup, nodeD]],
        [innerGroup, [nodeC]],
      ]);
      const result = await loadPaths([
        [a, b, c],
        [a, b, d],
      ]);
      expect(result).toEqual([
        { searchPath: [a, b, c], nodesPath: createPath([nodeA, nodeB, outerGroup, innerGroup, nodeC]) },
        { searchPath: [a, b, d], nodesPath: createPath([nodeA, nodeB, outerGroup, nodeD]) },
      ]);
      // grouping nodes' non-grouping ancestor is the actual parent node
      const [loadedA, loadedB, loadedOuterGroup, loadedInnerGroup] = result[0].nodesPath as [
        NonGroupingHierarchyNode,
        NonGroupingHierarchyNode,
        GroupingHierarchyNode,
        GroupingHierarchyNode,
      ];
      expect(loadedOuterGroup.nonGroupingAncestor).toBe(loadedB);
      expect(loadedInnerGroup.nonGroupingAncestor).toBe(loadedB);
      expect(loadedB.parentKeys).toEqual([loadedA.key]);
    });

    it("returns grouping nodes that group all requested siblings", async () => {
      const f: IModelInstanceKey = { className: "s.D", id: "0x6" };
      const nodeF = createInstanceNode(f);
      const group = createGroupingNode(nodeC, nodeD, nodeF);
      group.key = { type: "label-grouping", label: "group" };
      // the provider groups instances of the request, so siblings of different classes are in the same grouping node
      const expectedGroup = { ...group, groupedInstanceKeys: [c, f] };
      setHierarchy([...hierarchyEntries, [nodeB, [group]], [expectedGroup, [nodeC, nodeD, nodeF]]]);
      const result = await loadPaths([
        [a, b, c],
        [a, b, f],
      ]);
      expect(result).toEqual([
        { searchPath: [a, b, c], nodesPath: createPath([nodeA, nodeB, expectedGroup, nodeC]) },
        { searchPath: [a, b, f], nodesPath: createPath([nodeA, nodeB, expectedGroup, nodeF]) },
      ]);
    });

    it("includes root grouping nodes", async () => {
      const groupA = createGroupingNode(nodeA);
      setHierarchy([...hierarchyEntries, [undefined, [groupA]], [groupA, [nodeA]]]);
      const [{ nodesPath }] = await loadPaths([[a, b]]);
      expect(nodesPath).toEqual(createPath([groupA, nodeA, nodeB]));
      expect(nodesPath[0]).not.toHaveProperty("nonGroupingAncestor");
    });

    it("doesn't request children of grouping nodes without requested instances", async () => {
      const otherGroup = createGroupingNode(createInstanceNode({ className: "s.C", id: "0x99" }));
      const groupC = createGroupingNode(nodeC);
      setHierarchy([...hierarchyEntries, [nodeB, [otherGroup, groupC]], [groupC, [nodeC]]]);
      // simulate a group of unrelated instances, e.g. promoted from a hidden node
      getNodes.mockImplementationOnce(() => createAsyncIterator([nodeA]));
      getNodes.mockImplementationOnce(() => createAsyncIterator([nodeB]));
      getNodes.mockImplementationOnce(() => createAsyncIterator([otherGroup, groupC]));
      expect(await loadPaths([[a, b, c]])).toEqual([
        { searchPath: [a, b, c], nodesPath: createPath([nodeA, nodeB, groupC, nodeC]) },
      ]);
      expect(getNodes.mock.calls.map(([{ parentNode }]) => parentNode)).not.toContain(otherGroup);
    });
  });

  it("requests more than 100 siblings in one request with nested filter rule groups", async () => {
    const children = Array.from({ length: 10_001 }, (_, index) =>
      createInstanceNode({ className: "s.C", id: `0x${(index + 0x100).toString(16)}` }),
    );
    setHierarchy([...hierarchyEntries, [nodeB, children]]);
    const paths = children.map((child) => [a, b, child.key.instanceKeys[0]]);
    expect(await loadPaths(paths)).toEqual(
      children.map((child, index) => ({ searchPath: paths[index], nodesPath: createPath([nodeA, nodeB, child]) })),
    );
    const childRequests = getNodes.mock.calls.filter(
      ([{ parentNode }]) => parentNode?.key.type === "instances" && parentNode.key.instanceKeys[0].id === b.id,
    );
    expect(childRequests).toHaveLength(1);
    const { rules } = childRequests[0][0].instanceFilter!;
    expect(getFilteredIds(childRequests[0][0].instanceFilter).size).toBe(10_001);
    // rules are nested so that no `or` group has more than 100 rules:
    // or
    // ├─ or                        (100 groups)
    // │  ├─ or [rule 1 … 100]
    // │  ├─ …
    // │  └─ or [rule 9901 … 10000]
    // └─ or                        (1 group)
    //    └─ or [rule 10001]
    assert("rules" in rules);
    expect(rules.rules).toHaveLength(2);
    expect(getMaxRulesInGroup(rules)).toBe(100);
  });

  it("requests nodes of all hierarchy levels concurrently", async () => {
    const release = new ResolvablePromise<void>();
    const loadNodes = getNodes.getMockImplementation()!;
    getNodes.mockImplementation(async function* (props) {
      await release;
      yield* loadNodes(props);
    });
    const result = loadPaths([[a, b, c]]);
    // all levels are requested before any request completes
    await vi.waitFor(() => expect(getNodes).toHaveBeenCalledTimes(3));
    await release.resolve();
    expect(await result).toHaveLength(1);
  });
});

type ParentNode = ParentHierarchyNode | undefined;
/** An entry of the expected path. Hidden entries have no node, but their keys are in `parentKeys` of their descendants. */
type ExpectedPathEntry = HierarchyNode | { hidden: IModelInstanceKey };

function createInstanceNode(key: IModelInstanceKey): NonGroupingHierarchyNode & { key: InstancesNodeKey } {
  return { ...createTestInstanceNode({ label: "", children: true }), key: { type: "instances", instanceKeys: [key] } };
}

function createGroupingNode(...groupedNodes: NonGroupingHierarchyNode[]): GroupingHierarchyNode {
  return createTestGroupingNode({ groupedInstanceKeys: groupedNodes.flatMap((node) => getInstanceKeys(node)) });
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
    return `group:${JSON.stringify(node.key)}:${node.groupedInstanceKeys.map(({ id }) => id).join()}`;
  }
  return HierarchyNode.isInstancesNode(node) ? node.key.instanceKeys[0].id : JSON.stringify(node.key);
}

function getFilteredIds(instanceFilter: GenericInstanceFilter | undefined): Set<string> {
  function getRuleIds(rule: GenericInstanceFilter["rules"]): string[] {
    if ("rules" in rule) {
      return rule.rules.flatMap(getRuleIds);
    }
    return typeof rule.value?.rawValue === "string" ? [rule.value.rawValue] : [];
  }
  return new Set(instanceFilter ? getRuleIds(instanceFilter.rules) : []);
}

function getMaxRulesInGroup(rule: GenericInstanceFilter["rules"]): number {
  return "rules" in rule ? Math.max(rule.rules.length, ...rule.rules.map(getMaxRulesInGroup)) : 0;
}

function createIdsFilter(ids: string[]): GenericInstanceFilter {
  const rules = ids.map((id) => ({
    sourceAlias: "this",
    propertyName: "ECInstanceId",
    operator: "is-equal" as const,
    propertyTypeName: "long",
    value: { rawValue: id, displayValue: id },
  }));
  return {
    propertyClassNames: [],
    relatedInstances: [],
    rules: rules.length === 1 ? rules[0] : { operator: "or", rules },
  };
}

/** Creates the expected path, with `parentKeys` of the actual hierarchy. */
function createPath(entries: ExpectedPathEntry[]): HierarchyNode[] {
  const ancestorKeys = new Array<HierarchyNodeKey>();
  return entries.flatMap((entry) => {
    if ("hidden" in entry) {
      ancestorKeys.push({ type: "instances", instanceKeys: [entry.hidden] });
      return [];
    }
    const node = { ...entry, parentKeys: [...ancestorKeys] };
    ancestorKeys.push(entry.key);
    return [expect.objectContaining(node)];
  });
}
