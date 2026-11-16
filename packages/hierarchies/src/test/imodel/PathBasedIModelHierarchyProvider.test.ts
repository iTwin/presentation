/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect as collectIterator, createAsyncIterator } from "presentation-test-utilities";
import { lastValueFrom, toArray } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assert } from "@itwin/core-bentley";
import { RowsLimitExceededError } from "../../hierarchies/HierarchyErrors.js";
import { HierarchyNode } from "../../hierarchies/HierarchyNode.js";
import { IModelHierarchyProviderImpl } from "../../hierarchies/imodel/IModelHierarchyProvider.js";
import { NodeSelectClauseColumnNames } from "../../hierarchies/imodel/NodeSelectQueryFactory.js";
import {
  PathBasedIModelHierarchyProvider,
  pathBasedParentPropsHandler,
} from "../../hierarchies/imodel/PathBasedIModelHierarchyProvider.js";
import {
  createIModelAccessStub,
  createInstanceLabelSelectClauseFactoryStub,
  createTestGroupingNode,
  createTestProcessedGroupingNode,
  createTestSourceGenericNode,
} from "../Utils.js";

import type { Observable } from "rxjs";
import type { GenericInstanceFilter } from "@itwin/core-common";
import type { DeepReadonly } from "@itwin/presentation-shared";
import type { GroupingHierarchyNode } from "../../hierarchies/HierarchyNode.js";
import type { IModelInstanceKey } from "../../hierarchies/HierarchyNodeKey.js";
import type { HierarchyDefinition } from "../../hierarchies/imodel/IModelHierarchyDefinition.js";
import type { InstanceHierarchyNodeProcessingParams } from "../../hierarchies/imodel/IModelHierarchyNode.js";
import type {
  HierarchyLevelPathProps,
  PathBasedIModelHierarchyProviderProps,
} from "../../hierarchies/imodel/PathBasedIModelHierarchyProvider.js";
import type { RowDef } from "../../hierarchies/imodel/TreeNodesReader.js";

describe("PathBasedIModelHierarchyProvider", () => {
  const imodelKey = "test-imodel";
  const parentKey: IModelInstanceKey = { className: "a.b", id: "0x1" };
  let imodelAccess: ReturnType<typeof createIModelAccessStub> & { imodelKey: string };
  /** Rows of hierarchy levels, by IDs of the path to the parent. */
  let rows: Map<string, RowDef[]>;
  const defineHierarchyLevel = vi.fn<HierarchyDefinition<HierarchyLevelPathProps>["defineHierarchyLevel"]>();

  beforeEach(() => {
    imodelAccess = { ...createIModelAccessStub(), imodelKey };
    rows = new Map();
    imodelAccess.createQueryReader.mockImplementation((query) => {
      // children of grouping nodes that aren't cached are re-queried by joining the query with grouped instance IDs
      const filteredQuery = query.ecsql.match(/FROM \((.*)\) q\s+JOIN IdSet/s);
      if (!filteredQuery) {
        return createAsyncIterator(rows.get(query.ecsql) ?? []);
      }
      const ids = Object.values(query.bindings ?? {}).find((binding) => binding.type === "idset")?.value as string[];
      return createAsyncIterator(
        (rows.get(filteredQuery[1]) ?? []).filter((row) => ids.includes(row[NodeSelectClauseColumnNames.ECInstanceId])),
      );
    });
    defineHierarchyLevel
      .mockReset()
      .mockImplementation(async ({ path }) => [{ fullClassName: "x.y", query: { ecsql: getPathId(path) } }]);
  });

  function createProvider(props?: Partial<PathBasedIModelHierarchyProviderProps>) {
    return new PathBasedIModelHierarchyProvider({
      imodelAccess,
      hierarchyDefinition: { defineHierarchyLevel },
      ...props,
    });
  }

  async function collect<T>(observable: Observable<T>) {
    return lastValueFrom(observable.pipe(toArray()));
  }

  it("loads root nodes for an empty path", async () => {
    rows.set("", [createRow({ id: "0x1", label: "one", hasChildren: false })]);
    expect(await collect(createProvider().getNodes({ path: [] }))).toEqual([
      expect.objectContaining({ key: createKey("0x1"), label: "one", children: false }),
    ]);
    expect(defineHierarchyLevel).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ path: [] }));
    // path-based definitions get the path instead of the parent node
    expect(defineHierarchyLevel.mock.calls[0][0]).not.toHaveProperty("parentNode");
  });

  it("loads child nodes of the given path", async () => {
    const instanceFilter = {} as GenericInstanceFilter;
    rows.set("0x1", [createRow({ id: "0x2", hasChildren: false })]);
    const nodes = await collect(
      createProvider().getNodes({ path: [parentKey], instanceFilter, hierarchyLevelSizeLimit: 5 }),
    );
    expect(nodes).toEqual([expect.objectContaining({ key: createKey("0x2") })]);
    expect(defineHierarchyLevel).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ path: [parentKey], instanceFilter }),
    );
    expect(imodelAccess.createQueryReader).toHaveBeenCalledExactlyOnceWith(
      { ecsql: "0x1" },
      expect.objectContaining({ limit: 5 }),
    );
  });

  it("creates select and filter clauses using given props", async () => {
    const instanceLabelSelectClauseFactory = createInstanceLabelSelectClauseFactoryStub();
    const createLabelSelectClauseSpy = vi.spyOn(instanceLabelSelectClauseFactory, "createSelectClause");
    defineHierarchyLevel.mockImplementation(async ({ createSelectClause }) => [
      {
        fullClassName: "x.y",
        query: {
          ecsql: `SELECT ${await createSelectClause({
            ecClassId: { selector: "this.ECClassId" },
            ecInstanceId: { selector: "this.ECInstanceId" },
            nodeLabel: { of: { classAlias: "this" } },
          })}`,
        },
      },
    ]);
    await collect(createProvider({ instanceLabelSelectClauseFactory, queryConcurrency: 1 }).getNodes({ path: [] }));
    expect(createLabelSelectClauseSpy).toHaveBeenCalled();
  });

  it("formats labels using given formatter", async () => {
    defineHierarchyLevel.mockResolvedValue([
      { node: createTestSourceGenericNode({ label: [{ type: "Integer", value: 1 }], children: false }) },
    ]);
    const formatter = vi.fn(async () => "formatted");
    expect(await collect(createProvider({ formatter }).getNodes({ path: [] }))).toEqual([
      expect.objectContaining({ label: "formatted" }),
    ]);
  });

  it("calls hierarchy definition's parser with path to the parent node", async () => {
    const row = createRow({ id: "0x2" });
    rows.set("0x1", [row]);
    const parseNode = vi.fn<NonNullable<HierarchyDefinition<HierarchyLevelPathProps>["parseNode"]>>(async () => ({
      key: { type: "instances", instanceKeys: [{ className: "x.y", id: "0x3" }] },
      label: "parsed",
      children: false,
    }));
    const provider = createProvider({ hierarchyDefinition: { defineHierarchyLevel, parseNode } });
    expect(await collect(provider.getNodes({ path: [parentKey] }))).toEqual([
      expect.objectContaining({ key: createKey("0x3"), label: "parsed" }),
    ]);
    expect(parseNode).toHaveBeenCalledExactlyOnceWith({
      row: expect.objectContaining(row),
      path: [parentKey],
      imodelKey,
    });
  });

  it("calls hierarchy definition's pre-processor with path to the parent node", async () => {
    rows.set("0x1", [createRow({ id: "0x2", hasChildren: false }), createRow({ id: "0x3", hasChildren: false })]);
    // generic processors can't be typed with `vi.fn`
    const preProcessNode = vi
      .fn()
      .mockImplementation(async ({ node }) =>
        node.key.instanceKeys[0].id === "0x2" ? { ...node, extendedData: { preProcessed: true } } : undefined,
      );
    const provider = createProvider({ hierarchyDefinition: { defineHierarchyLevel, preProcessNode } });
    expect(await collect(provider.getNodes({ path: [parentKey] }))).toEqual([
      expect.objectContaining({ key: createKey("0x2"), extendedData: { preProcessed: true } }),
    ]);
    expect(preProcessNode).toHaveBeenCalledWith({
      node: expect.objectContaining({ key: createKey("0x2") }),
      path: [parentKey],
    });
  });

  it("calls hierarchy definition's post-processor with path to the non-grouping parent node", async () => {
    rows.set("0x1", [
      createRow({ id: "0x2", label: "x", hasChildren: false, grouping: { byLabel: true } }),
      createRow({ id: "0x3", label: "x", hasChildren: false, grouping: { byLabel: true } }),
    ]);
    const postProcessNode = vi.fn<NonNullable<HierarchyDefinition<HierarchyLevelPathProps>["postProcessNode"]>>(
      async ({ node }) => ({ ...node, extendedData: { postProcessed: true } }),
    );
    const provider = createProvider({ hierarchyDefinition: { defineHierarchyLevel, postProcessNode } });
    const [groupingNode] = await collect(provider.getNodes({ path: [parentKey] }));
    expect(groupingNode).toMatchObject({ extendedData: { postProcessed: true } });
    const groupedNodes = await collect(
      provider.getGroupingNodeChildren({ path: [parentKey], groupingNode: groupingNode as GroupingHierarchyNode }),
    );
    expect(groupedNodes).toMatchObject([
      { extendedData: { postProcessed: true } },
      { extendedData: { postProcessed: true } },
    ]);
    expect(postProcessNode).toHaveBeenCalledTimes(3);
    postProcessNode.mock.calls.forEach(([props]) => expect(props.path).toEqual([parentKey]));
  });

  describe("children determination", () => {
    it("requests child hierarchy level with node's instance key appended to the path", async () => {
      rows.set("0x1", [createRow({ id: "0x2" }), createRow({ id: "0x3" })]);
      rows.set("0x1/0x2", [createRow({ id: "0x4" })]);
      expect(await collect(createProvider().getNodes({ path: [parentKey] }))).toEqual([
        expect.objectContaining({ key: createKey("0x2"), children: true }),
        expect.objectContaining({ key: createKey("0x3"), children: false }),
      ]);
      expect(defineHierarchyLevel).toHaveBeenCalledWith(
        expect.objectContaining({ path: [parentKey, { className: "x.y", id: "0x2", imodelKey }] }),
      );
    });

    it("hides nodes without children if requested", async () => {
      rows.set("", [createRow({ id: "0x1", hideIfNoChildren: true })]);
      expect(await collect(createProvider().getNodes({ path: [] }))).toEqual([]);
    });

    it("determines children of nodes with hidden children", async () => {
      rows.set("", [createRow({ id: "0x1" }), createRow({ id: "0x2" })]);
      rows.set("0x1", [createRow({ id: "0x3", hideInHierarchy: true })]);
      rows.set("0x1/0x3", [createRow({ id: "0x5" })]);
      rows.set("0x2", [createRow({ id: "0x4", hideInHierarchy: true })]);
      expect(await collect(createProvider().getNodes({ path: [] }))).toEqual([
        expect.objectContaining({ key: createKey("0x1"), children: true }),
        expect.objectContaining({ key: createKey("0x2"), children: false }),
      ]);
    });

    it("assumes nodes have children if child hierarchy level exceeds the limit", async () => {
      rows.set("", [createRow({ id: "0x1" })]);
      imodelAccess.createQueryReader.mockImplementation((query) =>
        query.ecsql === "0x1"
          ? (async function* () {
              throw new RowsLimitExceededError({ limit: 1, rows: [] });
            })()
          : createAsyncIterator(rows.get(query.ecsql) ?? []),
      );
      expect(await collect(createProvider().getNodes({ path: [] }))).toEqual([
        expect.objectContaining({ children: true }),
      ]);
    });

    it("determines children of merged nodes using all their instance keys", async () => {
      const grouping = { byLabel: { action: "merge" as const } };
      rows.set("", [createRow({ id: "0x1", label: "x", grouping }), createRow({ id: "0x2", label: "x", grouping })]);
      // only the second merged instance has children
      rows.set("0x2", [createRow({ id: "0x3", hasChildren: false })]);
      expect(await collect(createProvider().getNodes({ path: [] }))).toEqual([
        expect.objectContaining({
          key: {
            type: "instances",
            instanceKeys: [createKey("0x1").instanceKeys[0], createKey("0x2").instanceKeys[0]],
          },
          children: true,
        }),
      ]);
      expect(defineHierarchyLevel).toHaveBeenCalledWith(
        expect.objectContaining({ path: [createKey("0x1").instanceKeys[0]] }),
      );
      expect(defineHierarchyLevel).toHaveBeenCalledWith(
        expect.objectContaining({ path: [createKey("0x2").instanceKeys[0]] }),
      );
    });

    it("determines children of nodes with merged hidden children using all their instance keys", async () => {
      rows.set("", [createRow({ id: "0x1" })]);
      // hidden nodes of the same class are merged into a single node
      rows.set("0x1", [
        createRow({ id: "0x2", hideInHierarchy: true }),
        createRow({ id: "0x3", hideInHierarchy: true }),
      ]);
      // only the second hidden instance has children
      rows.set("0x1/0x3", [createRow({ id: "0x4", hasChildren: false })]);
      expect(await collect(createProvider().getNodes({ path: [] }))).toEqual([
        expect.objectContaining({ key: createKey("0x1"), children: true }),
      ]);
    });
  });

  describe("caching", () => {
    it("caches hierarchy levels by path", async () => {
      rows.set("0x1", [createRow({ id: "0x2", hasChildren: false })]);
      const provider = createProvider();
      const nodes = await collect(provider.getNodes({ path: [parentKey] }));
      expect(await collect(provider.getNodes({ path: [{ ...parentKey }] }))).toEqual(nodes);
      expect(defineHierarchyLevel).toHaveBeenCalledOnce();
      expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();
    });

    it("doesn't share cached hierarchy levels between paths whose keys differ in class name or iModel key", async () => {
      rows.set("0x1", [createRow({ id: "0x2", hasChildren: false })]);
      const provider = createProvider();
      await collect(provider.getNodes({ path: [parentKey] }));
      // e.g. a base class of the parent instance's class
      await collect(provider.getNodes({ path: [{ ...parentKey, className: "a.base" }] }));
      await collect(provider.getNodes({ path: [{ ...parentKey, imodelKey }] }));
      expect(defineHierarchyLevel).toHaveBeenCalledTimes(3);
      expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(3);
    });

    it("reuses hierarchy levels loaded to determine children, when requested with node's instance key", async () => {
      rows.set("", [createRow({ id: "0x1" })]);
      rows.set("0x1", [createRow({ id: "0x2", hasChildren: false })]);
      const provider = createProvider();
      const [node] = await collect(provider.getNodes({ path: [] }));
      assert(HierarchyNode.isInstancesNode(node));
      await collect(provider.getNodes({ path: [node.key.instanceKeys[0]] }));
      expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(2);
    });
  });

  describe("generic nodes", () => {
    it("loads generic nodes", async () => {
      defineHierarchyLevel.mockResolvedValue([{ node: createTestSourceGenericNode({ key: "g", children: false }) }]);
      expect(await collect(createProvider().getNodes({ path: [] }))).toEqual([
        expect.objectContaining({ key: { type: "generic", id: "g", source: expect.any(String) }, children: false }),
      ]);
    });

    it("doesn't request children of generic nodes, because they can't be put into paths", async () => {
      defineHierarchyLevel.mockResolvedValueOnce([{ node: createTestSourceGenericNode({ key: "g" }) }]);
      expect(await collect(createProvider().getNodes({ path: [] }))).toEqual([
        expect.objectContaining({ children: false }),
      ]);
      expect(defineHierarchyLevel).toHaveBeenCalledOnce();
    });

    it("doesn't request children of hidden generic nodes", async () => {
      rows.set("", [createRow({ id: "0x1" })]);
      // the only child of the instance node is a hidden generic node, whose children can't be requested
      defineHierarchyLevel.mockImplementation(async ({ path }) =>
        path.length === 0
          ? [{ fullClassName: "x.y", query: { ecsql: "" } }]
          : [{ node: createTestSourceGenericNode({ key: "g", processingParams: { hideInHierarchy: true } }) }],
      );
      expect(await collect(createProvider().getNodes({ path: [] }))).toEqual([
        expect.objectContaining({ key: createKey("0x1"), children: false }),
      ]);
    });
  });

  describe("hidden nodes", () => {
    it("returns hidden nodes with a flag, instead of their children", async () => {
      rows.set("", [
        createRow({ id: "0x1", hideInHierarchy: true }),
        createRow({ id: "0x2", hideInHierarchy: true, hasChildren: false }),
      ]);
      rows.set("0x1", [createRow({ id: "0x3" })]);
      const nodes = await collect(createProvider().getNodes({ path: [] }));
      expect(nodes).toHaveLength(2);
      expect(nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: createKey("0x1"), label: "0x1", children: true, isHidden: true }),
          expect.objectContaining({ key: createKey("0x2"), label: "0x2", children: false, isHidden: true }),
        ]),
      );
      expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();
    });

    it("doesn't group hidden nodes", async () => {
      rows.set("", [
        createRow({ id: "0x1", label: "x", hideInHierarchy: true, grouping: { byLabel: true } }),
        createRow({ id: "0x2", label: "x", hasChildren: false, grouping: { byLabel: true } }),
      ]);
      const nodes = await collect(createProvider().getNodes({ path: [] }));
      expect(nodes).toHaveLength(2);
      expect(nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: createKey("0x1"), isHidden: true }),
          expect.objectContaining({ key: expect.objectContaining({ type: "label-grouping", label: "x" }) }),
        ]),
      );
    });
  });

  describe("grouping", () => {
    it("returns grouping nodes and their children without re-querying", async () => {
      rows.set("", [
        createRow({ id: "0x1", label: "x", hasChildren: false, grouping: { byLabel: true } }),
        createRow({ id: "0x2", label: "x", hasChildren: false, grouping: { byLabel: true } }),
        createRow({ id: "0x3", label: "y", hasChildren: false }),
      ]);
      const provider = createProvider();
      const nodes = await collect(provider.getNodes({ path: [] }));
      const groupingKey = { type: "label-grouping" as const, label: "x", groupId: undefined };
      expect(nodes).toEqual([
        expect.objectContaining({ key: groupingKey, children: true }),
        expect.objectContaining({ key: createKey("0x3") }),
      ]);
      const groupedNodes = await collect(
        provider.getGroupingNodeChildren({ path: [], groupingNode: nodes[0] as GroupingHierarchyNode }),
      );
      expect(groupedNodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: createKey("0x1") }),
          expect.objectContaining({ key: createKey("0x2") }),
        ]),
      );
      expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();
    });

    it("doesn't set non-grouping ancestors of grouping nodes", async () => {
      imodelAccess.stubEntityClass({ schemaName: "x", className: "y", classLabel: "Class Y" });
      const grouping = { byClass: true, byLabel: true };
      rows.set("0x1", [
        createRow({ id: "0x2", label: "a", hasChildren: false, grouping }),
        createRow({ id: "0x3", label: "a", hasChildren: false, grouping }),
      ]);
      const provider = createProvider();
      const [classGroupingNode] = await collect(provider.getNodes({ path: [parentKey] }));
      assert(HierarchyNode.isGroupingNode(classGroupingNode));
      const [labelGroupingNode] = await collect(
        provider.getGroupingNodeChildren({ path: [parentKey], groupingNode: classGroupingNode }),
      );
      expect(classGroupingNode).not.toHaveProperty("nonGroupingAncestor");
      expect(labelGroupingNode).not.toHaveProperty("nonGroupingAncestor");
    });

    it("loads children of grouping nodes that aren't cached by re-querying the grouped hierarchy level", async () => {
      rows.set("0x1", [
        createRow({ id: "0x2", label: "x", hasChildren: false, grouping: { byLabel: true } }),
        createRow({ id: "0x3", label: "x", hasChildren: false, grouping: { byLabel: true } }),
        createRow({ id: "0x4", label: "y", hasChildren: false }),
      ]);
      const [groupingNode] = await collect(createProvider().getNodes({ path: [parentKey] }));
      assert(HierarchyNode.isGroupingNode(groupingNode));
      imodelAccess.createQueryReader.mockClear();
      defineHierarchyLevel.mockClear();

      // a different provider instance doesn't have the grouping node's children cached
      const groupedNodes = await collect(createProvider().getGroupingNodeChildren({ path: [parentKey], groupingNode }));
      expect(groupedNodes).toHaveLength(2);
      expect(groupedNodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: createKey("0x2") }),
          expect.objectContaining({ key: createKey("0x3") }),
        ]),
      );
      expect(defineHierarchyLevel).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ path: [parentKey] }));
      expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();
    });

    it("loads children of nested grouping nodes that aren't cached", async () => {
      imodelAccess.stubEntityClass({ schemaName: "x", className: "y", classLabel: "Class Y" });
      const grouping = { byClass: true, byLabel: true };
      rows.set("0x1", [
        createRow({ id: "0x2", label: "a", hasChildren: false, grouping }),
        createRow({ id: "0x3", label: "a", hasChildren: false, grouping }),
        createRow({ id: "0x4", label: "b", hasChildren: false, grouping }),
      ]);
      const path = [parentKey];
      const provider = createProvider();
      const [classGroupingNode] = await collect(provider.getNodes({ path }));
      assert(HierarchyNode.isGroupingNode(classGroupingNode));
      const labelGroupingNode = (
        await collect(provider.getGroupingNodeChildren({ path, groupingNode: classGroupingNode }))
      ).find((n) => HierarchyNode.isLabelGroupingNode(n) && n.key.label === "a");
      assert(!!labelGroupingNode && HierarchyNode.isGroupingNode(labelGroupingNode));

      const groupedNodes = await collect(
        createProvider().getGroupingNodeChildren({ path, groupingNode: labelGroupingNode }),
      );
      expect(groupedNodes).toHaveLength(2);
      expect(groupedNodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: createKey("0x2") }),
          expect.objectContaining({ key: createKey("0x3") }),
        ]),
      );
    });

    it("groups children of grouping nodes", async () => {
      imodelAccess.stubEntityClass({ schemaName: "x", className: "y", classLabel: "Class Y" });
      const grouping = { byClass: true, byLabel: true };
      rows.set("", [
        createRow({ id: "0x1", label: "a", hasChildren: false, grouping }),
        createRow({ id: "0x2", label: "a", hasChildren: false, grouping }),
      ]);
      const provider = createProvider();
      const [classGroupingNode] = await collect(provider.getNodes({ path: [] }));
      expect(classGroupingNode.key).toEqual({ type: "class-grouping", className: "x.y" });
      const [labelGroupingNode] = await collect(
        provider.getGroupingNodeChildren({ path: [], groupingNode: classGroupingNode as GroupingHierarchyNode }),
      );
      expect(labelGroupingNode.key).toMatchObject({ type: "label-grouping", label: "a" });
      expect(
        await collect(
          provider.getGroupingNodeChildren({ path: [], groupingNode: labelGroupingNode as GroupingHierarchyNode }),
        ),
      ).toHaveLength(2);
    });
  });
});

describe("pathBasedParentPropsHandler", () => {
  const path: IModelInstanceKey[] = [
    { className: "a.b", id: "0x1" },
    { className: "a.c", id: "0x2" },
  ];

  it("returns path of the hierarchy level grouped by a grouping node", () => {
    expect(
      pathBasedParentPropsHandler.getGroupedHierarchyLevelParentProps({ path, groupingNode: createTestGroupingNode() }),
    ).toEqual({ path });
  });

  it("creates props of grouping node's children hierarchy level", () => {
    const groupingNode = createTestProcessedGroupingNode();
    expect(
      pathBasedParentPropsHandler.createChildrenParentProps({ node: groupingNode, parentProps: { path } }),
    ).toEqual([{ path, groupingNode }]);
  });

  it("requests instance keys of merged hidden nodes' children using all their instance keys", async () => {
    const imodelAccess = { ...createIModelAccessStub(), imodelKey: "test-imodel" };
    // rows of hierarchy levels by the last instance ID of the path - the parent level has two hidden instances of the same
    // class, and only the second one has children
    const levelRows: Record<string, Array<[string, string, boolean]>> = {
      "0x2": [
        ["x.y", "0x3", true],
        ["x.y", "0x4", true],
      ],
      "0x4": [["x.y", "0x5", false]],
    };
    imodelAccess.createQueryReader.mockImplementation((query) =>
      createAsyncIterator(levelRows[query.ecsql.match(/level:(\w+)/)![1]] ?? []),
    );
    const defineHierarchyLevel = vi.fn<HierarchyDefinition<HierarchyLevelPathProps>["defineHierarchyLevel"]>(
      async ({ path: levelPath }) => [{ fullClassName: "x.y", query: { ecsql: `level:${levelPath.at(-1)!.id}` } }],
    );
    const provider = new IModelHierarchyProviderImpl({
      imodels: [{ imodelAccess }],
      getHierarchyDefinition: () => ({ defineHierarchyLevel }),
      parentPropsHandler: pathBasedParentPropsHandler,
    });
    expect(await collectIterator(provider.getNodeInstanceKeys({ path }))).toEqual([
      { className: "x.y", id: "0x5", imodelKey: "test-imodel" },
    ]);
    expect(defineHierarchyLevel).toHaveBeenCalledTimes(3);
  });

  it("doesn't request instance keys of hidden generic nodes' children", async () => {
    const imodelAccess = { ...createIModelAccessStub(), imodelKey: "test-imodel" };
    const defineHierarchyLevel = vi.fn<HierarchyDefinition<HierarchyLevelPathProps>["defineHierarchyLevel"]>(
      async () => [{ node: createTestSourceGenericNode({ processingParams: { hideInHierarchy: true } }) }],
    );
    const provider = new IModelHierarchyProviderImpl({
      imodels: [{ imodelAccess }],
      getHierarchyDefinition: () => ({ defineHierarchyLevel }),
      parentPropsHandler: pathBasedParentPropsHandler,
    });
    expect(await collectIterator(provider.getNodeInstanceKeys({ path }))).toEqual([]);
    expect(defineHierarchyLevel).toHaveBeenCalledOnce();
  });

  it("creates identifier for logging", () => {
    expect(pathBasedParentPropsHandler.createIdentifierForLogging({ path })).toBe("<path: a.b:0x1 / a.c:0x2>");
    expect(
      pathBasedParentPropsHandler.createIdentifierForLogging({
        path: [],
        groupingNode: createTestGroupingNode({ key: { type: "class-grouping", className: "a.b" } }),
      }),
    ).toBe(`<path: , grouping node: {"type":"class-grouping","className":"a.b"}>`);
  });
});

function getPathId(path: DeepReadonly<IModelInstanceKey[]>): string {
  return path.map(({ id }) => id).join("/");
}

function createKey(id: string) {
  return { type: "instances" as const, instanceKeys: [{ className: "x.y" as const, id, imodelKey: "test-imodel" }] };
}

function createRow(props: {
  id: string;
  label?: string;
  hasChildren?: boolean;
  hideIfNoChildren?: boolean;
  hideInHierarchy?: boolean;
  grouping?: InstanceHierarchyNodeProcessingParams["grouping"];
}): RowDef {
  return {
    [NodeSelectClauseColumnNames.FullClassName]: "x.y",
    [NodeSelectClauseColumnNames.ECInstanceId]: props.id,
    [NodeSelectClauseColumnNames.DisplayLabel]: props.label ?? props.id,
    ...(props.hasChildren !== undefined ? { [NodeSelectClauseColumnNames.HasChildren]: props.hasChildren } : {}),
    ...(props.hideIfNoChildren ? { [NodeSelectClauseColumnNames.HideIfNoChildren]: true } : {}),
    ...(props.hideInHierarchy ? { [NodeSelectClauseColumnNames.HideNodeInHierarchy]: true } : {}),
    ...(props.grouping ? { [NodeSelectClauseColumnNames.Grouping]: JSON.stringify(props.grouping) } : {}),
  };
}
