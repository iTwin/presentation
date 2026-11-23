/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect, createAsyncIterator, ResolvablePromise } from "presentation-test-utilities";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createIModelHierarchyNodePaths } from "../../hierarchies/imodel/HierarchyNodePaths.js";
import { NodeSelectClauseColumnNames } from "../../hierarchies/imodel/NodeSelectQueryFactory.js";
import { createIModelAccessStub, createTestSourceGenericNode } from "../Utils.js";

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

describe("createIModelHierarchyNodePaths", () => {
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
  // classes of loaded nodes derive from search path classes, and all classes derive from the hierarchy level class
  const derivedClasses: { [derived: string]: string } = { "s.DerivedA": "s.A", "s.DerivedB": "s.B" };
  const defineHierarchyLevel = vi.fn<PathBasedHierarchyDefinition["defineHierarchyLevel"]>();

  function setRows(entries: Array<[HierarchyNodeIdentifier[], RowDef[]]>) {
    rows = new Map(entries.map(([path, levelRows]) => [getPathId(path), levelRows]));
  }

  function getProps(
    hierarchyDefinition?: Partial<PathBasedHierarchyDefinition>,
  ): Omit<Props<typeof createIModelHierarchyNodePaths>, "paths"> {
    return { imodelAccess, hierarchyDefinition: { defineHierarchyLevel, ...hierarchyDefinition } };
  }

  /** Returns hierarchy level requests, with IDs of instances that the provider filters the levels to. */
  function getRequests() {
    const idsByPathId = new Map(
      imodelAccess.createQueryReader.mock.calls.map(([query]) => {
        const { ecsql, searchClassNames } = parseSearchQuery(query);
        return [ecsql, [...(searchClassNames?.keys() ?? [])]];
      }),
    );
    return defineHierarchyLevel.mock.calls.map(([{ path }]) => ({ path, ids: idsByPathId.get(getPathId(path)) ?? [] }));
  }

  beforeEach(() => {
    setRows(hierarchyRows);
    imodelAccess = {
      ...createIModelAccessStub(),
      imodelKey,
      classDerivesFrom: async (derived: string, base: string) => derivedClasses[derived] === base || base === "s.Base",
    };
    // the provider filters hierarchy levels by joining their queries with search path instances
    imodelAccess.createQueryReader.mockImplementation((query) => {
      const { ecsql, searchClassNames } = parseSearchQuery(query);
      return createAsyncIterator(
        (rows.get(ecsql) ?? []).flatMap((row) => {
          const id = row[NodeSelectClauseColumnNames.ECInstanceId];
          const searchClassName = searchClassNames?.get(id);
          if (!searchClassNames) {
            return [row];
          }
          return searchClassName ? [{ ...row, SearchECInstanceId: id, SearchClassName: searchClassName }] : [];
        }),
      );
    });
    defineHierarchyLevel
      .mockReset()
      .mockImplementation(async ({ path }) => [{ fullClassName: "s.Base", query: { ecsql: getPathId(path) } }]);
  });

  /** Loads node paths for the given instance key paths. */
  async function loadPaths(
    paths: HierarchyNodeIdentifier[][],
    hierarchyDefinition?: Partial<PathBasedHierarchyDefinition>,
  ) {
    return collect(
      createIModelHierarchyNodePaths({ ...getProps(hierarchyDefinition), paths: paths.map((path) => ({ path })) }),
    );
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
    expect(await loadPaths([path])).toEqual([createPath(nodes)]);
    // every level is requested with the search path to the parent, and filtered to the search path instance
    expect(getRequests()).toEqual(
      path.map((identifier, index) => ({ path: path.slice(0, index), ids: [identifier.id] })),
    );
  });

  it("passes provider props to the hierarchy provider", async () => {
    const formatter = vi.fn(async () => "formatted");
    const [nodesPath] = await collect(
      createIModelHierarchyNodePaths({ ...getProps(), formatter, paths: [{ path: [a] }] }),
    );
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

  it("accepts search paths as arrays of identifiers", async () => {
    expect(await collect(createIModelHierarchyNodePaths({ ...getProps(), paths: [[a, b]] }))).toEqual([
      createPath([nodeA, nodeB]),
    ]);
  });

  it("starts consuming paths when iteration starts", async () => {
    const getPaths = vi.fn(function* () {
      yield { path: [a] };
    });
    const nodesPaths = createIModelHierarchyNodePaths({ ...getProps(), paths: { [Symbol.iterator]: getPaths } });
    expect(getPaths).not.toHaveBeenCalled();
    expect(await nodesPaths.next()).toEqual({ done: false, value: createPath([nodeA]) });
    expect(getPaths).toHaveBeenCalledOnce();
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
    const result = collect(createIModelHierarchyNodePaths({ ...getProps(), paths: createPaths() }));
    await firstPathConsumed;
    expect(defineHierarchyLevel).not.toHaveBeenCalled();
    await releaseSecondPath.resolve();
    expect(await result).toHaveLength(2);
    expect(getRequests()).toHaveLength(2);
  });

  describe("aborting", () => {
    const reason = new Error("aborted");

    it("rejects without loading nodes when the signal is already aborted", async () => {
      await expect(
        collect(
          createIModelHierarchyNodePaths({
            ...getProps(),
            paths: [{ path: [a] }],
            abortSignal: AbortSignal.abort(reason),
          }),
        ),
      ).rejects.toBe(reason);
      expect(defineHierarchyLevel).not.toHaveBeenCalled();
    });

    it("stops consuming paths when aborted", async () => {
      const controller = new AbortController();
      const firstPathConsumed = new ResolvablePromise<void>();
      const releaseSecondPath = new ResolvablePromise<void>();
      async function* createPaths() {
        yield { path: [a, b] };
        await firstPathConsumed.resolve();
        await releaseSecondPath;
        yield { path: [a, e] };
      }
      const result = collect(
        createIModelHierarchyNodePaths({ ...getProps(), paths: createPaths(), abortSignal: controller.signal }),
      );
      await firstPathConsumed;
      controller.abort(reason);
      await expect(result).rejects.toBe(reason);
      await releaseSecondPath.resolve();
      expect(defineHierarchyLevel).not.toHaveBeenCalled();
    });

    it("rejects without waiting for pending hierarchy levels when aborted", async () => {
      const controller = new AbortController();
      const childLevelRequested = new ResolvablePromise<void>();
      const releaseChildLevel = new ResolvablePromise<void>();
      const result = collect(
        createIModelHierarchyNodePaths({
          ...getProps({
            defineHierarchyLevel: async (props) => {
              if (props.path.length > 0) {
                await childLevelRequested.resolve();
                await releaseChildLevel;
              }
              return defineHierarchyLevel(props);
            },
          }),
          paths: [{ path: [a, b] }],
          abortSignal: controller.signal,
        }),
      );
      await childLevelRequested;
      controller.abort(reason);
      await expect(result).rejects.toBe(reason);
      await releaseChildLevel.resolve();
    });
  });

  it("requests all siblings together", async () => {
    const result = await loadPaths([
      [a, b, c],
      [a, e],
      [a, b, d],
    ]);
    expect(result).toEqual([
      createPath([nodeA, nodeB, nodeC]),
      createPath([nodeA, nodeB, nodeD]),
      createPath([nodeA, nodeE]),
    ]);
    // siblings of different classes are requested together
    expect(getRequests().map(({ ids }) => ids)).toEqual([[a.id], [b.id, e.id], [c.id, d.id]]);
  });

  it("returns a path for every unique target, with paths to ancestors before paths to their descendants", async () => {
    const paths = [{ path: [a, b] }, { path: [a] }, { path: [a, b] }];
    const result = await collect(createIModelHierarchyNodePaths({ ...getProps(), paths: createAsyncIterator(paths) }));
    expect(result).toEqual([createPath([nodeA]), createPath([nodeA, nodeB])]);
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
    ).toEqual([createPath([nodeA, nodeB])]);
  });

  it("throws when nodes are merged by label", async () => {
    const mergeByLabel = { byLabel: { action: "merge" as const } };
    setRows([
      ...hierarchyRows,
      [
        [a, b],
        [
          createRow({ ...c, label: "C", grouping: mergeByLabel }),
          createRow({ ...d, label: "C", grouping: mergeByLabel }),
        ],
      ],
    ]);
    await expect(
      loadPaths([
        [a, b, c],
        [a, b, d],
      ]),
    ).rejects.toThrow("don't support nodes with multiple instance keys");
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
    expect(await loadPaths([[a, b, c]])).toEqual([createPath([nodeA, nodeB, nodeC])]);
  });

  it("matches nodes whose class is a base class of the search path class", async () => {
    const baseClassRowA = createRow({ ...a, label: "A" });
    setRows([[[], [baseClassRowA]]]);
    const derivedA = { ...a, className: "s.DerivedA" as const };
    expect(await loadPaths([[derivedA]])).toEqual([createPath([createExpectedNode(baseClassRowA)])]);
  });

  it("returns one path for targets that differ only by class and match the same node", async () => {
    const derivedA = { ...a, className: "s.DerivedA" as const };
    expect(await loadPaths([[a], [derivedA]])).toEqual([createPath([nodeA])]);
  });

  it("matches loaded nodes to search tree branches rather than identifiers", async () => {
    // `b` is under `a`, but not at the root level
    expect(await loadPaths([[b], [a, b]])).toEqual([createPath([nodeA, nodeB])]);
  });

  it("passes hierarchy level size limit to every request", async () => {
    const result = await collect(
      createIModelHierarchyNodePaths({
        ...getProps(),
        hierarchyLevelSizeLimit: "unbounded",
        paths: [{ path: [a, b, c] }],
      }),
    );
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
      expect(await loadPaths([[a]], defineLevelWithGenericNode([]))).toEqual([createPath([nodeA])]);
    });

    it("returns paths through generic nodes", async () => {
      setRows([[[generic], [rowA]]]);
      const result = await loadPaths([[generic, a], [generic]], defineLevelWithGenericNode([]));
      const expectedGenericNode = {
        key: { type: "generic" as const, id: "g", source: expect.any(String) },
        label: "G",
      };
      expect(result).toEqual([createPath([expectedGenericNode]), createPath([expectedGenericNode, nodeA])]);
      // instances are excluded from the root level, because only a generic node is requested
      expect(getRequests()).toEqual([
        { path: [], ids: [] },
        { path: [generic], ids: [a.id] },
      ]);
    });

    it("matches generic nodes by ID, ignoring identifiers' source", async () => {
      const result = await loadPaths(
        [[{ ...generic, source: "other" }], [{ ...generic, id: "other" }]],
        defineLevelWithGenericNode([]),
      );
      expect(result).toEqual([createPath([{ key: { ...generic, source: expect.any(String) }, label: "G" }])]);
    });
  });

  it("ignores instance nodes that weren't requested", async () => {
    // e.g. when the hierarchy definition doesn't apply the instance filter
    setRows([[[], [rowA, rowB]]]);
    const nodes = await loadPaths([[a]], {
      defineHierarchyLevel: async ({ path }) => [{ fullClassName: "s.Base", query: { ecsql: getPathId(path) } }],
    });
    expect(nodes).toEqual([createPath([nodeA])]);
  });

  describe("hidden nodes", () => {
    const hiddenRowB = createRow({ className: "s.DerivedB", id: b.id, label: "B", hidden: true });

    beforeEach(() => {
      setRows([...hierarchyRows, [[a], [hiddenRowB, rowE]]]);
    });

    it("omits hidden nodes from paths, and paths to hidden targets", async () => {
      expect(
        await loadPaths([
          [a, b],
          [a, b, c],
        ]),
      ).toEqual([createPath([nodeA, { hidden: nodeB }, nodeC])]);
      expect(getRequests()).toEqual([
        { path: [], ids: [a.id] },
        { path: [a], ids: [b.id] },
        { path: [a, b], ids: [c.id] },
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
      expect(await loadPaths([[a, b, c]])).toEqual([createPath([nodeA, { hidden: nodeB }, nodeC])]);
    });

    it("omits hidden nodes when they are pre-processed and post-processed", async () => {
      const preProcessNode = vi.fn(async ({ node }) => node) as NonNullable<
        PathBasedHierarchyDefinition["preProcessNode"]
      >;
      // the post-processor drops attributes it doesn't know about
      const postProcessNode = vi.fn<NonNullable<PathBasedHierarchyDefinition["postProcessNode"]>>(async ({ node }) => {
        const { isHidden: _, ...rest } = node as typeof node & { isHidden?: boolean };
        return rest;
      });
      expect(await loadPaths([[a, b, c]], { preProcessNode, postProcessNode })).toEqual([
        createPath([nodeA, { hidden: nodeB }, nodeC]),
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
      const [nodesPath] = await loadPaths([[a, b, c]]);
      expect(nodesPath).toEqual(createPath([nodeA, { hidden: nodeB }, createLabelGroupingNode("C"), nodeC]));
      const nonGroupingAncestor = (nodesPath[1] as GroupingHierarchyNode).nonGroupingAncestor;
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
        createPath([nodeA, nodeB, classGroupingNode, createLabelGroupingNode("C"), nodeC]),
        createPath([nodeA, nodeB, classGroupingNode, nodeD]),
      ]);
      // grouping nodes' non-grouping ancestor is the actual parent node
      const [loadedA, loadedB, loadedOuterGroup, loadedInnerGroup] = result[0] as [
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
        createPath([nodeA, nodeB, group, { ...nodeC, label: "G" }]),
        createPath([nodeA, nodeB, group, createExpectedNode(rowF)]),
      ]);
      // grouping node's children are taken from the grouped hierarchy level, without querying it again
      expect(
        imodelAccess.createQueryReader.mock.calls.filter(
          ([query]) => parseSearchQuery(query).ecsql === getPathId([a, b]),
        ),
      ).toHaveLength(1);
    });

    it("includes root grouping nodes", async () => {
      setRows([
        ...hierarchyRows,
        [[], [createRow({ className: "s.DerivedA", id: a.id, label: "A", grouping: { byLabel: true } })]],
      ]);
      const [nodesPath] = await loadPaths([[a, b]]);
      expect(nodesPath).toEqual(createPath([createLabelGroupingNode("A"), nodeA, nodeB]));
      expect(nodesPath[0]).not.toHaveProperty("nonGroupingAncestor");
    });
  });

  describe("search attributes", () => {
    const getSearch = (node: HierarchyNode) => (node as NonGroupingHierarchyNode).search;

    it("assigns search attributes based on all paths", async () => {
      const result = await loadPaths([[a, b, c], [a]]);
      const cTree = { identifier: c };
      const bTree = { identifier: b, children: [cTree] };
      const searchA = { isSearchTarget: true, childrenTargetPaths: [bTree] };
      expect(result.map((nodesPath) => nodesPath.map(getSearch))).toEqual([
        [searchA],
        [
          searchA,
          { hasSearchTargetAncestor: true, childrenTargetPaths: [cTree] },
          { hasSearchTargetAncestor: true, isSearchTarget: true },
        ],
      ]);
    });

    it("assigns search attributes of all sibling identifiers that match the node", async () => {
      const derivedA = { ...a, className: "s.DerivedA" as const };
      const result = await loadPaths([
        [a, b],
        [derivedA, e],
      ]);
      expect(result.map((nodesPath) => getSearch(nodesPath[0]))).toEqual([
        { childrenTargetPaths: [{ identifier: b }, { identifier: e }] },
        { childrenTargetPaths: [{ identifier: b }, { identifier: e }] },
      ]);
    });

    it("auto-expands nodes and grouping nodes based on search path options", async () => {
      const f: IModelInstanceKey = { className: "s.D", id: "0x6" };
      const rowF = createRow({ ...f, label: "F", grouping: { byLabel: true } });
      setRows([
        ...hierarchyRows,
        [
          [a, b],
          [
            createRow({ ...c, label: "C", grouping: { byLabel: true } }),
            rowF,
            createRow({ ...d, label: "C", grouping: { byLabel: true } }),
          ],
        ],
      ]);
      const result = await collect(
        createIModelHierarchyNodePaths({
          ...getProps(),
          paths: [
            // reveals the target by expanding its ancestors, including all its grouping nodes
            { path: [a, b, c], options: { reveal: true } },
            // `groupingLevel: 1` doesn't expand any grouping nodes
            { path: [a, b, f], options: { reveal: { groupingLevel: 1 } } },
            // the grouping node is shared with the revealed target
            { path: [a, b, d] },
          ],
        }),
      );
      expect(result.map((nodesPath) => nodesPath.map(({ label, autoExpand }) => ({ label, autoExpand })))).toEqual([
        [
          { label: "A", autoExpand: true },
          { label: "B", autoExpand: true },
          { label: "C", autoExpand: true },
          { label: "C", autoExpand: undefined },
        ],
        [
          { label: "A", autoExpand: true },
          { label: "B", autoExpand: true },
          { label: "C", autoExpand: true },
          { label: "C", autoExpand: undefined },
        ],
        [
          { label: "A", autoExpand: true },
          { label: "B", autoExpand: true },
          { label: "F", autoExpand: undefined },
          { label: "F", autoExpand: undefined },
        ],
      ]);
    });
  });

  it("requests many siblings in one request", async () => {
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
    expect(result[0]).toEqual(createPath([nodeA, nodeB, createExpectedNode(childRows[0])]));
    const childRequests = getRequests().filter(({ path }) => path.length === 2);
    expect(childRequests).toHaveLength(1);
    expect(childRequests[0].ids).toHaveLength(10_001);
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
/** An entry of the expected path. Nodes of hidden entries aren't in the path, but they're ancestors of the following nodes. */
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

/**
 * Parses a hierarchy level query, that the provider wraps to join it with search path instances. Returns the original
 * query, and search path class names by instance IDs, if the query is wrapped.
 */
function parseSearchQuery(query: { ecsql: string; ctes?: string[] }) {
  const searchInfo = query.ctes?.find((cte) => cte.startsWith("SearchInfo"));
  if (!searchInfo) {
    return { ecsql: query.ecsql, searchClassNames: undefined };
  }
  const searchClassNames = new Map<string, string>();
  for (const [, className, ids] of searchInfo.matchAll(
    /'([^']+)' AS SearchClassName\s+FROM \S+\s+WHERE ECInstanceId IN \(([^)]*)\)/g,
  )) {
    ids.split(",").forEach((id) => searchClassNames.set(id.trim(), className));
  }
  return { ecsql: query.ecsql.match(/FROM \(\s*([\s\S]*?)\s*\) \[q\]/)![1], searchClassNames };
}

/** Creates the expected path, with `parentKeys` of the actual hierarchy. */
function createPath(entries: ExpectedPathEntry[]): HierarchyNode[] {
  const ancestorKeys = new Array<HierarchyNodeKey>();
  return entries.flatMap((entry) => {
    if ("hidden" in entry) {
      ancestorKeys.push(entry.hidden.key);
      return [];
    }
    const expectedNode = { ...entry, parentKeys: [...ancestorKeys] };
    ancestorKeys.push(entry.key);
    return [expect.objectContaining(expectedNode)];
  });
}
