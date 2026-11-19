/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createAsyncIterator, ResolvablePromise } from "presentation-test-utilities";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import { createHierarchyNodePaths } from "../../hierarchies/imodel/HierarchyNodePaths.js";
import { NodeSelectClauseColumnNames } from "../../hierarchies/imodel/NodeSelectQueryFactory.js";
import { createIModelAccessStub, createTestSourceGenericNode } from "../Utils.js";

import type { GenericInstanceFilter } from "@itwin/core-common";
import type { Props } from "@itwin/presentation-shared";
import type {
  GroupingHierarchyNode,
  HierarchyNode,
  NonGroupingHierarchyNode,
} from "../../hierarchies/HierarchyNode.js";
import type { HierarchyNodeIdentifier } from "../../hierarchies/HierarchyNodeIdentifier.js";
import type { GenericNodeKey, HierarchyNodeKey, IModelInstanceKey } from "../../hierarchies/HierarchyNodeKey.js";
import type { InstanceHierarchyNodeProcessingParams } from "../../hierarchies/imodel/IModelHierarchyNode.js";
import type { PathBasedHierarchyDefinition } from "../../hierarchies/imodel/PathBasedHierarchyDefinition.js";
import type { RowDef } from "../../hierarchies/imodel/TreeNodesReader.js";

describe("createHierarchyNodePaths", () => {
  const imodelKey = "test-imodel";
  // search paths use base classes, while loaded nodes have actual classes of instances
  const a: IModelInstanceKey = { className: "s.A", id: "0x1" };
  const b: IModelInstanceKey = { className: "s.B", id: "0x2" };
  const c: IModelInstanceKey = { className: "s.C", id: "0x3" };
  const d: IModelInstanceKey = { className: "s.C", id: "0x4" };
  const e: IModelInstanceKey = { className: "s.D", id: "0x5" };
  const rowA = createRow({ className: "s.DerivedA", id: a.id, label: "A" });
  const rowB = createRow({ className: "s.DerivedB", id: b.id, label: "B" });
  const rowC = createRow({ ...c, label: "C" });
  const rowD = createRow({ ...d, label: "D" });
  const rowE = createRow({ ...e, label: "E" });
  const [nodeA, nodeB, nodeC, nodeD, nodeE] = [rowA, rowB, rowC, rowD, rowE].map(createExpectedNode);
  const hierarchyRows: Array<[IModelInstanceKey[], RowDef[]]> = [
    [[], [rowA]],
    [[a], [rowB, rowE]],
    [
      [a, b],
      [rowC, rowD],
    ],
  ];

  /** Rows of hierarchy levels by IDs of their parent paths. */
  let rows: Map<string, RowDef[]>;
  let imodelAccess: ReturnType<typeof createIModelAccessStub> & { imodelKey: string };
  // classes of loaded nodes derive from search path classes
  const derivedClasses: { [derived: string]: string } = { "s.DerivedA": "s.A", "s.DerivedB": "s.B" };
  // the definition applies the instance filter by passing filtered IDs as query bindings
  const defineHierarchyLevel = vi.fn<PathBasedHierarchyDefinition["defineHierarchyLevel"]>();

  function setRows(entries: Array<[HierarchyNodeIdentifier[], RowDef[]]>) {
    rows = new Map(entries.map(([path, levelRows]) => [getPathId(path), levelRows]));
  }

  function getHierarchyProviderProps(
    hierarchyDefinition?: Partial<PathBasedHierarchyDefinition>,
  ): Props<typeof createHierarchyNodePaths>["hierarchyProviderProps"] {
    return { imodelAccess, hierarchyDefinition: { defineHierarchyLevel, ...hierarchyDefinition } };
  }

  /** Returns `defineHierarchyLevel` requests, made by `createHierarchyNodePaths` - they're always filtered. */
  function getRequests() {
    return defineHierarchyLevel.mock.calls
      .map(([{ path, instanceFilter }]) => ({ path, instanceFilter }))
      .filter(({ instanceFilter }) => !!instanceFilter);
  }

  beforeEach(() => {
    setRows(hierarchyRows);
    imodelAccess = {
      ...createIModelAccessStub(),
      imodelKey,
      classDerivesFrom: async (derived: string, base: string) => derivedClasses[derived] === base,
    };
    imodelAccess.createQueryReader.mockImplementation((query) => {
      const ids = Array.isArray(query.bindings) ? new Set(query.bindings.map(({ value }) => value)) : undefined;
      return createAsyncIterator(
        (rows.get(query.ecsql) ?? []).filter((row) => !ids || ids.has(row[NodeSelectClauseColumnNames.ECInstanceId])),
      );
    });
    defineHierarchyLevel
      .mockReset()
      .mockImplementation(async ({ path, instanceFilter }) => [
        {
          fullClassName: "s.Base",
          query: {
            ecsql: getPathId(path),
            ...(instanceFilter
              ? { bindings: [...getFilteredIds(instanceFilter)].map((id) => ({ type: "id" as const, value: id })) }
              : {}),
          },
        },
      ]);
  });

  /** Loads node paths for the given instance key paths and returns them with `searchPath` set to the instance key path. */
  async function loadPaths(
    paths: HierarchyNodeIdentifier[][],
    hierarchyDefinition?: Partial<PathBasedHierarchyDefinition>,
  ) {
    const nodePaths = await createHierarchyNodePaths({
      hierarchyProviderProps: getHierarchyProviderProps(hierarchyDefinition),
      paths: paths.map((path) => ({ path })),
    });
    return nodePaths.map(({ searchPath, nodesPath }) => ({ searchPath: searchPath.path, nodesPath }));
  }

  it("returns nothing for no paths", async () => {
    expect(await loadPaths([])).toEqual([]);
    expect(defineHierarchyLevel).not.toHaveBeenCalled();
  });

  it.each([
    { target: "root", path: [a], nodes: [nodeA] },
    { target: "child", path: [a, b], nodes: [nodeA, nodeB] },
    { target: "grandchild", path: [a, b, c], nodes: [nodeA, nodeB, nodeC] },
  ])("returns path to $target target", async ({ path, nodes }) => {
    expect(await loadPaths([path])).toEqual([{ searchPath: path, nodesPath: createPath(nodes) }]);
    // every level is requested with an instance filter and the search path to the parent
    expect(getRequests()).toEqual(
      path.map((identifier, index) => ({
        path: path.slice(0, index),
        instanceFilter: createIdsFilter([identifier.id]),
      })),
    );
  });

  it("passes provider props to the hierarchy provider", async () => {
    const formatter = vi.fn(async () => "formatted");
    const [{ nodesPath }] = await createHierarchyNodePaths({
      hierarchyProviderProps: { ...getHierarchyProviderProps(), formatter },
      paths: [{ path: [a] }],
    });
    expect(nodesPath).toEqual([expect.objectContaining({ label: "formatted" })]);
  });

  it("requests every unique path prefix once", async () => {
    await loadPaths([
      [a, b, c],
      [a, b, d],
      [a, e],
    ]);
    expect(getRequests().map(({ path }) => path)).toEqual([[], [a], [a, b]]);
  });

  it("consumes paths as they come in and requests nodes after all paths are consumed", async () => {
    const releaseSecondPath = new ResolvablePromise<void>();
    const firstPathConsumed = new ResolvablePromise<void>();
    async function* createPaths() {
      yield { path: [a, b] };
      await firstPathConsumed.resolve();
      await releaseSecondPath;
      yield { path: [a, e] };
    }
    const result = createHierarchyNodePaths({
      hierarchyProviderProps: getHierarchyProviderProps(),
      paths: createPaths(),
    });
    await firstPathConsumed;
    expect(defineHierarchyLevel).not.toHaveBeenCalled();
    await releaseSecondPath.resolve();
    expect(await result).toHaveLength(2);
    expect(getRequests()).toHaveLength(2);
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
    expect(getRequests().map(({ instanceFilter }) => instanceFilter)).toEqual([
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
    const result = await createHierarchyNodePaths({
      hierarchyProviderProps: getHierarchyProviderProps(),
      paths: createAsyncIterator(paths),
    });
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
    expect(
      await loadPaths([
        [a, { ...b, imodelKey }],
        [a, { ...b, imodelKey: "other" }],
      ]),
    ).toEqual([{ searchPath: [a, { ...b, imodelKey }], nodesPath: createPath([nodeA, nodeB]) }]);
  });

  it("throws when nodes are merged by label", async () => {
    setRows([
      ...hierarchyRows,
      [[a, b], [createRow({ ...c, label: "C", grouping: { byLabel: { action: "merge" } } })]],
    ]);
    await expect(loadPaths([[a, b, c]])).rejects.toThrow("don't support nodes merged by label");
  });

  it("doesn't match nodes of other classes with the same ID", async () => {
    // e.g. a model has the same ID as the element it models
    setRows([
      ...hierarchyRows,
      [
        [a, b],
        [rowC, createRow({ className: "s.Other", id: c.id, label: "other" })],
      ],
    ]);
    expect(await loadPaths([[a, b, c]])).toEqual([
      { searchPath: [a, b, c], nodesPath: createPath([nodeA, nodeB, nodeC]) },
    ]);
  });

  it("matches nodes whose class is a base class of the search path class", async () => {
    const baseClassRowA = createRow({ ...a, label: "A" });
    setRows([[[], [baseClassRowA]]]);
    const derivedA = { ...a, className: "s.DerivedA" as const };
    expect(await loadPaths([[derivedA]])).toEqual([
      { searchPath: [derivedA], nodesPath: createPath([createExpectedNode(baseClassRowA)]) },
    ]);
  });

  it("passes hierarchy level size limit to every request", async () => {
    const result = await createHierarchyNodePaths({
      hierarchyProviderProps: getHierarchyProviderProps(),
      hierarchyLevelSizeLimit: "unbounded",
      paths: [{ path: [a, b, c] }],
    });
    expect(result).toHaveLength(1);
    expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(3);
    imodelAccess.createQueryReader.mock.calls.forEach(([_, config]) => expect(config?.limit).toBe("unbounded"));
  });

  describe("generic nodes", () => {
    const generic: GenericNodeKey = { type: "generic", id: "g" };
    const genericNode = createTestSourceGenericNode({ key: "g", label: "G", children: true });

    function defineLevelWithGenericNode(genericNodePath: HierarchyNodeIdentifier[]) {
      return {
        defineHierarchyLevel: async (props: Props<PathBasedHierarchyDefinition["defineHierarchyLevel"]>) => [
          ...(getPathId(props.path) === getPathId(genericNodePath) ? [{ node: genericNode }] : []),
          ...(await defineHierarchyLevel(props)),
        ],
      };
    }

    it("ignores generic nodes that weren't requested", async () => {
      expect(await loadPaths([[a]], defineLevelWithGenericNode([]))).toEqual([
        { searchPath: [a], nodesPath: createPath([nodeA]) },
      ]);
    });

    it("returns paths through generic nodes", async () => {
      setRows([[[generic], [rowA]]]);
      const result = await loadPaths([[generic, a], [generic]], defineLevelWithGenericNode([]));
      const expectedGenericNode = {
        key: { type: "generic" as const, id: "g", source: expect.any(String) },
        label: "G",
      };
      expect(result).toEqual([
        { searchPath: [generic, a], nodesPath: createPath([expectedGenericNode, nodeA]) },
        { searchPath: [generic], nodesPath: createPath([expectedGenericNode]) },
      ]);
      // instances are excluded from the root level, because only a generic node is requested
      expect(getFilteredIds(getRequests()[0].instanceFilter).size).toBe(0);
      expect(getRequests()[1]).toEqual({ path: [generic], instanceFilter: createIdsFilter([a.id]) });
    });

    it("matches generic nodes by ID and source", async () => {
      const result = await loadPaths(
        [[{ ...generic, source: "other" }], [{ ...generic, id: "other" }]],
        defineLevelWithGenericNode([]),
      );
      expect(result).toEqual([]);
    });
  });

  it("ignores instance nodes that weren't requested", async () => {
    // e.g. when the hierarchy definition doesn't apply the instance filter
    setRows([[[], [rowA, rowB]]]);
    const nodes = await loadPaths([[a]], {
      defineHierarchyLevel: async ({ path }) => [{ fullClassName: "s.Base", query: { ecsql: getPathId(path) } }],
    });
    expect(nodes).toEqual([{ searchPath: [a], nodesPath: createPath([nodeA]) }]);
  });

  describe("hidden nodes", () => {
    const hiddenRowB = createRow({ className: "s.DerivedB", id: b.id, label: "B", hidden: true });

    beforeEach(() => {
      setRows([...hierarchyRows, [[a], [hiddenRowB, rowE]]]);
    });

    it("includes hidden nodes in paths with a flag, but omits paths to hidden targets", async () => {
      expect(
        await loadPaths([
          [a, b],
          [a, b, c],
        ]),
      ).toEqual([{ searchPath: [a, b, c], nodesPath: createPath([nodeA, { hidden: nodeB }, nodeC]) }]);
      expect(getRequests()).toEqual([
        { path: [], instanceFilter: createIdsFilter([a.id]) },
        { path: [a], instanceFilter: createIdsFilter([b.id]) },
        { path: [a, b], instanceFilter: createIdsFilter([c.id]) },
      ]);
    });

    it("doesn't group hidden nodes", async () => {
      setRows([
        ...hierarchyRows,
        [
          [a],
          [createRow({ className: "s.DerivedB", id: b.id, label: "B", hidden: true, grouping: { byLabel: true } })],
        ],
      ]);
      expect(await loadPaths([[a, b, c]])).toEqual([
        { searchPath: [a, b, c], nodesPath: createPath([nodeA, { hidden: nodeB }, nodeC]) },
      ]);
    });

    it("keeps the hidden flag when nodes are pre-processed and post-processed", async () => {
      const preProcessNode = vi.fn(async ({ node }) => node) as NonNullable<
        PathBasedHierarchyDefinition["preProcessNode"]
      >;
      // the post-processor drops attributes it doesn't know about
      const postProcessNode = vi.fn<NonNullable<PathBasedHierarchyDefinition["postProcessNode"]>>(async ({ node }) => {
        const { isHidden: _, ...rest } = node as typeof node & { isHidden?: boolean };
        return rest;
      });
      expect(await loadPaths([[a, b, c]], { preProcessNode, postProcessNode })).toEqual([
        { searchPath: [a, b, c], nodesPath: createPath([nodeA, { hidden: nodeB }, nodeC]) },
      ]);
      expect(preProcessNode).toHaveBeenCalledWith(expect.objectContaining({ path: [a] }));
      expect(postProcessNode).toHaveBeenCalledWith(expect.objectContaining({ path: [a] }));
    });

    it("omits paths whose hidden ancestor isn't in the hierarchy", async () => {
      setRows([...hierarchyRows, [[a], [rowE]]]);
      expect(await loadPaths([[a, b, c]])).toEqual([]);
    });

    it("sets non-grouping ancestor of grouping nodes under hidden parents to the hidden node", async () => {
      setRows([
        ...hierarchyRows,
        [[a], [hiddenRowB]],
        [[a, b], [createRow({ ...c, label: "C", grouping: { byLabel: true } })]],
      ]);
      const [{ nodesPath }] = await loadPaths([[a, b, c]]);
      expect(nodesPath).toEqual(createPath([nodeA, { hidden: nodeB }, createLabelGroupingNode("C"), nodeC]));
      const nonGroupingAncestor = (nodesPath[2] as GroupingHierarchyNode).nonGroupingAncestor;
      expect(nonGroupingAncestor).toEqual(expect.objectContaining({ ...nodeB, parentKeys: [nodeA.key] }));
      expect(nonGroupingAncestor).not.toHaveProperty("isHidden");
    });
  });

  describe("grouping nodes", () => {
    it("includes nested grouping nodes", async () => {
      imodelAccess.stubEntityClass({ schemaName: "s", className: "C", classLabel: "Class C" });
      setRows([
        ...hierarchyRows,
        [
          [a, b],
          [
            createRow({ ...c, label: "C", grouping: { byClass: true, byLabel: true } }),
            createRow({ ...d, label: "D", grouping: { byClass: true } }),
          ],
        ],
      ]);
      const result = await loadPaths([
        [a, b, c],
        [a, b, d],
      ]);
      const classGroupingNode = {
        key: { type: "class-grouping" as const, className: "s.C" as const },
        label: "Class C",
      };
      expect(result).toEqual([
        {
          searchPath: [a, b, c],
          nodesPath: createPath([nodeA, nodeB, classGroupingNode, createLabelGroupingNode("C"), nodeC]),
        },
        { searchPath: [a, b, d], nodesPath: createPath([nodeA, nodeB, classGroupingNode, nodeD]) },
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

    it("returns grouping nodes that group requested siblings", async () => {
      const f: IModelInstanceKey = { className: "s.D", id: "0x6" };
      const rowF = createRow({ ...f, label: "G", grouping: { byLabel: true } });
      setRows([
        ...hierarchyRows,
        [
          [a, b],
          [createRow({ ...c, label: "G", grouping: { byLabel: true } }), rowF],
        ],
      ]);
      const result = await loadPaths([
        [a, b, c],
        [a, b, f],
      ]);
      const group = createLabelGroupingNode("G");
      expect(result).toEqual([
        { searchPath: [a, b, c], nodesPath: createPath([nodeA, nodeB, group, { ...nodeC, label: "G" }]) },
        { searchPath: [a, b, f], nodesPath: createPath([nodeA, nodeB, group, createExpectedNode(rowF)]) },
      ]);
      // grouping node's children are taken from the grouped hierarchy level, without querying it again
      expect(
        imodelAccess.createQueryReader.mock.calls.filter(([{ ecsql }]) => ecsql === getPathId([a, b])),
      ).toHaveLength(1);
    });

    it("includes root grouping nodes", async () => {
      setRows([
        ...hierarchyRows,
        [[], [createRow({ className: "s.DerivedA", id: a.id, label: "A", grouping: { byLabel: true } })]],
      ]);
      const [{ nodesPath }] = await loadPaths([[a, b]]);
      expect(nodesPath).toEqual(createPath([createLabelGroupingNode("A"), nodeA, nodeB]));
      expect(nodesPath[0]).not.toHaveProperty("nonGroupingAncestor");
    });
  });

  it("requests more than 100 siblings in one request with nested filter rule groups", async () => {
    const childRows = Array.from({ length: 10_001 }, (_, index) =>
      createRow({ className: "s.C", id: `0x${(index + 0x100).toString(16)}`, label: `${index}` }),
    );
    setRows([...hierarchyRows, [[a, b], childRows]]);
    const paths = childRows.map((row) => [
      a,
      b,
      { className: "s.C" as const, id: row[NodeSelectClauseColumnNames.ECInstanceId] },
    ]);
    const result = await loadPaths(paths);
    expect(result).toHaveLength(10_001);
    expect(result[0]).toEqual({
      searchPath: paths[0],
      nodesPath: createPath([nodeA, nodeB, createExpectedNode(childRows[0])]),
    });
    const childRequests = getRequests().filter(({ path }) => path.length === 2);
    expect(childRequests).toHaveLength(1);
    const { rules } = childRequests[0].instanceFilter!;
    expect(getFilteredIds(childRequests[0].instanceFilter).size).toBe(10_001);
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
    const readRows = imodelAccess.createQueryReader.getMockImplementation()!;
    imodelAccess.createQueryReader.mockImplementation((query, config) =>
      (async function* () {
        await release;
        yield* readRows(query, config);
      })(),
    );
    const result = loadPaths([[a, b, c]]);
    // all levels are requested before any request completes
    await vi.waitFor(() => expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(3));
    await release.resolve();
    expect(await result).toHaveLength(1);
  });
});

/** An expected node of a path. */
interface ExpectedNode {
  key: HierarchyNodeKey;
  label: string;
}
/** An entry of the expected path. Nodes of hidden entries have the `isHidden` flag. */
type ExpectedPathEntry = ExpectedNode | { hidden: ExpectedNode };

function createRow(props: {
  className: string;
  id: string;
  label: string;
  hidden?: boolean;
  grouping?: InstanceHierarchyNodeProcessingParams["grouping"];
}): RowDef {
  return {
    [NodeSelectClauseColumnNames.FullClassName]: props.className as `${string}.${string}`,
    [NodeSelectClauseColumnNames.ECInstanceId]: props.id,
    [NodeSelectClauseColumnNames.DisplayLabel]: props.label,
    // children are known, so they're not determined by requesting child hierarchy levels
    [NodeSelectClauseColumnNames.HasChildren]: true,
    ...(props.hidden ? { [NodeSelectClauseColumnNames.HideNodeInHierarchy]: true } : {}),
    ...(props.grouping ? { [NodeSelectClauseColumnNames.Grouping]: JSON.stringify(props.grouping) } : {}),
  };
}

function createExpectedNode(row: RowDef): ExpectedNode {
  return {
    key: {
      type: "instances",
      instanceKeys: [
        {
          className: row[NodeSelectClauseColumnNames.FullClassName],
          id: row[NodeSelectClauseColumnNames.ECInstanceId],
          imodelKey: "test-imodel",
        },
      ],
    },
    label: row[NodeSelectClauseColumnNames.DisplayLabel],
  };
}

function createLabelGroupingNode(label: string): ExpectedNode {
  return { key: { type: "label-grouping", label }, label };
}

function getPathId(path: HierarchyNodeIdentifier[]): string {
  return path.map(({ id }) => id).join("/");
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
      const hiddenNode = { ...entry.hidden, parentKeys: [...ancestorKeys], isHidden: true };
      ancestorKeys.push(entry.hidden.key);
      return [expect.objectContaining(hiddenNode)];
    }
    const expectedNode = { ...entry, parentKeys: [...ancestorKeys] };
    ancestorKeys.push(entry.key);
    return [expect.objectContaining(expectedNode)];
  });
}
