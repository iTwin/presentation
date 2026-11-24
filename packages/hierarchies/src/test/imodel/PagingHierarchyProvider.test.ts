/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect, createAsyncIterator, ResolvablePromise, waitFor } from "presentation-test-utilities";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BeEvent } from "@itwin/core-bentley";
import { HierarchyRequestInterruptedError, InvalidContinuationTokenError } from "../../hierarchies/HierarchyErrors.js";
import { HierarchyNode } from "../../hierarchies/HierarchyNode.js";
import { NodeSelectClauseColumnNames } from "../../hierarchies/imodel/NodeSelectQueryFactory.js";
import { createPagingHierarchyProvider as origCreatePagingHierarchyProvider } from "../../hierarchies/imodel/PagingHierarchyProvider.js";
import {
  createIModelAccessStub,
  createInstanceLabelSelectClauseFactoryStub,
  createTestGenericNodeKey,
  createTestGroupingNode,
  createTestSourceGenericNode,
} from "../Utils.js";

import type { GenericInstanceFilter } from "@itwin/core-common";
import type { ECSqlQueryDef, Props } from "@itwin/presentation-shared";
import type { NonGroupingHierarchyNode, ParentHierarchyNode } from "../../hierarchies/HierarchyNode.js";
import type {
  HierarchyDefinition,
  HierarchyLevelDefinition,
} from "../../hierarchies/imodel/IModelHierarchyDefinition.js";
import type { RowDef } from "../../hierarchies/imodel/TreeNodesReader.js";

describe("createPagingHierarchyProvider", () => {
  let imodelAccess: ReturnType<typeof createIModelAccessStub> & { imodelKey: string };
  const sourceName = "test-source-name";

  function createPagingHierarchyProvider(props: Props<typeof origCreatePagingHierarchyProvider>) {
    return origCreatePagingHierarchyProvider({
      instanceLabelSelectClauseFactory: createInstanceLabelSelectClauseFactoryStub(),
      ...props,
      // @ts-expect-error: using non-exposed way to override source name
      sourceName,
    });
  }

  function createRow(id: string, props?: Partial<RowDef>): RowDef {
    return {
      [NodeSelectClauseColumnNames.FullClassName]: "a.b",
      [NodeSelectClauseColumnNames.ECInstanceId]: id,
      [NodeSelectClauseColumnNames.DisplayLabel]: id,
      ...props,
    };
  }

  function createRows(count: number, props?: Partial<RowDef>): RowDef[] {
    return Array.from({ length: count }, (_, i) => createRow(`0x${i + 1}`, { HasChildren: false, ...props }));
  }

  function parsePageQuery(ecsql: string) {
    const { inner, limit, offset } = ecsql.match(
      /^SELECT \* FROM \((?<inner>.*)\) LIMIT (?<limit>\d+) OFFSET (?<offset>\d+)$/s,
    )!.groups!;
    return { ecsql: inner, limit: Number(limit), offset: Number(offset) };
  }

  function getPageRows(queries: { [ecsql: string]: RowDef[] }, query: ECSqlQueryDef) {
    const { ecsql, limit, offset } = parsePageQuery(query.ecsql);
    return queries[ecsql].slice(offset, offset + limit);
  }

  /**
   * Sets up query reader to evaluate page queries created by the provider on top of given queries' rows. Rows of
   * a query may be given as a promise to control when the query returns them.
   */
  function setupQueries(queries: { [ecsql: string]: RowDef[] | Promise<RowDef[]> }) {
    imodelAccess.createQueryReader.mockImplementation(async function* (query: ECSqlQueryDef) {
      const { ecsql } = parsePageQuery(query.ecsql);
      yield* getPageRows({ [ecsql]: await queries[ecsql] }, query);
    });
  }

  /** Returns offsets of requested pages of the given query, in the order of requests. */
  function getQueryOffsets(ecsql: string) {
    return imodelAccess.createQueryReader.mock.calls
      .map(([query]) => parsePageQuery(query.ecsql))
      .filter((query) => query.ecsql === ecsql)
      .map((query) => query.offset);
  }

  function createQueryDefinition(ecsql: string): HierarchyLevelDefinition[number] {
    return { fullClassName: "a.b", query: { ecsql } };
  }

  function isParent(parentNode: ParentHierarchyNode | undefined, id: string) {
    if (!parentNode) {
      return false;
    }
    if (HierarchyNode.isGeneric(parentNode)) {
      return parentNode.key.id === id;
    }
    return HierarchyNode.isInstancesNode(parentNode) && parentNode.key.instanceKeys[0].id === id;
  }

  async function collectLabels(iterator: AsyncIterableIterator<NonGroupingHierarchyNode>) {
    return (await collect(iterator)).map((n) => n.label);
  }

  async function readLabels(iterator: AsyncIterableIterator<NonGroupingHierarchyNode>, count: number) {
    const labels = new Array<string>();
    for (let i = 0; i < count; ++i) {
      labels.push((await iterator.next()).value.label);
    }
    return labels;
  }

  beforeEach(() => {
    imodelAccess = { ...createIModelAccessStub(), imodelKey: "test-imodel" };
  });

  it("loads root generic nodes", async () => {
    const node = createTestSourceGenericNode({ key: "root" });
    using provider = createPagingHierarchyProvider({
      imodelAccess,
      hierarchyDefinition: { defineHierarchyLevel: async ({ parentNode }) => (parentNode ? [] : [{ node }]) },
    });
    const nodes = await collect(provider.getNodes({ parentNode: undefined }));
    expect(nodes).toEqual([
      {
        ...node,
        key: createTestGenericNodeKey({ id: "root", source: sourceName }),
        parentKeys: [],
        children: false,
        continuationToken: expect.any(String),
      },
    ]);
  });

  it("loads root instance nodes using a query limited to 10 000 rows", async () => {
    imodelAccess.createQueryReader.mockReturnValue(createAsyncIterator([createRow("0x1", { HasChildren: true })]));
    const query: ECSqlQueryDef = { ecsql: "QUERY", bindings: [{ type: "string", value: "binding" }], ctes: ["CTE"] };
    using provider = createPagingHierarchyProvider({
      imodelAccess,
      hierarchyDefinition: { defineHierarchyLevel: async () => [{ fullClassName: "a.b", query }] },
    });
    const nodes = await collect(provider.getNodes({ parentNode: undefined }));
    expect(nodes).toEqual([
      {
        key: { type: "instances", instanceKeys: [{ className: "a.b", id: "0x1", imodelKey: "test-imodel" }] },
        parentKeys: [],
        label: "0x1",
        children: true,
        continuationToken: expect.any(String),
      },
    ]);
    expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();
    expect(imodelAccess.createQueryReader).toHaveBeenCalledWith(
      { ...query, ecsql: "SELECT * FROM (QUERY) LIMIT 10000 OFFSET 0" },
      expect.objectContaining({ rowFormat: "ECSqlPropertyNames", limit: "unbounded" }),
    );
  });

  it("passes select and filter clause factories to hierarchy definition", async () => {
    imodelAccess.stubEntityClass({ schemaName: "x", className: "y" });
    const defineHierarchyLevel = vi.fn<HierarchyDefinition["defineHierarchyLevel"]>(async () => [
      { node: createTestSourceGenericNode({ key: "root", children: false }) },
    ]);
    using provider = origCreatePagingHierarchyProvider({ imodelAccess, hierarchyDefinition: { defineHierarchyLevel } });
    const nodes = await collect(provider.getNodes({ parentNode: undefined }));
    expect(nodes[0].key).toEqual({
      type: "generic",
      id: "root",
      source: expect.stringContaining("PagingHierarchyProvider"),
    });
    const { createSelectClause, createFilterClauses } = defineHierarchyLevel.mock.calls[0][0];
    expect(await createFilterClauses({ filter: undefined, contentClass: { fullName: "x.y", alias: "this" } })).toEqual({
      from: "x.y",
      joins: "",
      where: "",
    });
    expect(
      await createSelectClause({
        ecClassId: { selector: "this.ECClassId" },
        ecInstanceId: { selector: "this.ECInstanceId" },
        nodeLabel: "label",
      }),
    ).toContain("this.ECInstanceId");
  });

  it("throws when page size is not a positive integer", () => {
    for (const pageSize of [0, -1, 1.5, Number.NaN]) {
      expect(() =>
        createPagingHierarchyProvider({
          imodelAccess,
          pageSize,
          hierarchyDefinition: { defineHierarchyLevel: async () => [] },
        }),
      ).toThrow(`Invalid page size: ${pageSize}. Expected a positive integer.`);
    }
  });

  describe("paging", () => {
    function createQueryProvider(pageSize: number) {
      return createPagingHierarchyProvider({
        imodelAccess,
        pageSize,
        hierarchyDefinition: { defineHierarchyLevel: async () => [createQueryDefinition("Q")] },
      });
    }

    it("loads query results in pages of given size until a page with less rows than requested", async () => {
      const rows = createRows(7);
      setupQueries({ Q: rows });
      using provider = createQueryProvider(3);
      expect(await collectLabels(provider.getNodes({ parentNode: undefined }))).toEqual(
        rows.map((r) => r.ECInstanceId),
      );
      expect(getQueryOffsets("Q")).toEqual([0, 3, 6]);
    });

    it("requests one more page when the last page with rows is full", async () => {
      const rows = createRows(6);
      setupQueries({ Q: rows });
      using provider = createQueryProvider(3);
      expect(await collectLabels(provider.getNodes({ parentNode: undefined }))).toEqual(
        rows.map((r) => r.ECInstanceId),
      );
      expect(getQueryOffsets("Q")).toEqual([0, 3, 6]);
    });

    it("doesn't do anything until the first node is requested", async () => {
      setupQueries({ Q: createRows(1) });
      const defineHierarchyLevel = vi.fn<HierarchyDefinition["defineHierarchyLevel"]>(async () => [
        createQueryDefinition("Q"),
      ]);
      using provider = createPagingHierarchyProvider({ imodelAccess, hierarchyDefinition: { defineHierarchyLevel } });
      const iterator = provider.getNodes({ parentNode: undefined });
      expect(defineHierarchyLevel).not.toHaveBeenCalled();
      expect(await collectLabels(iterator)).toEqual(["0x1"]);
    });

    it("requests the next page only when a node that's not in loaded pages is requested", async () => {
      const rows = new ResolvablePromise<RowDef[]>();
      setupQueries({ Q: rows });
      using provider = createQueryProvider(3);
      const iterator = provider.getNodes({ parentNode: undefined });

      // the consumer gets all nodes of the first page, but the second one is not requested
      const firstPageLabels = readLabels(iterator, 3);
      await rows.resolve(createRows(7));
      expect(getQueryOffsets("Q")).toEqual([0]);
      expect(await firstPageLabels).toEqual(["0x1", "0x2", "0x3"]);

      expect(await readLabels(iterator, 1)).toEqual(["0x4"]);
      expect(getQueryOffsets("Q")).toEqual([0, 3]);

      expect(await collectLabels(iterator)).toEqual(["0x5", "0x6", "0x7"]);
      expect(getQueryOffsets("Q")).toEqual([0, 3, 6]);
    });

    it("requests the next page when loaded pages have no more nodes for the requested one", async () => {
      setupQueries({ Q: [...createRows(7, { HideIfNoChildren: true }), createRow("visible", { HasChildren: false })] });
      using provider = createQueryProvider(3);
      const iterator = provider.getNodes({ parentNode: undefined });
      expect(await readLabels(iterator, 1)).toEqual(["visible"]);
      expect(getQueryOffsets("Q")).toEqual([0, 3, 6]);
      expect((await iterator.next()).done).toBe(true);
    });

    it("processes a node only when it's requested", async () => {
      // Root level is defined by query `Q`, whose rows are returned only when the test resolves the `rows` promise.
      // Every root node gets its children from query `CHILDREN`, which returns no rows.
      const rows = new ResolvablePromise<RowDef[]>();
      setupQueries({ Q: rows, CHILDREN: [] });
      using provider = createPagingHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          defineHierarchyLevel: async ({ parentNode }) => [createQueryDefinition(parentNode ? "CHILDREN" : "Q")],
        },
      });
      const iterator = provider.getNodes({ parentNode: undefined });

      // Request the first node without awaiting it. The provider runs `Q` and waits for its rows.
      const firstNode = iterator.next();

      // Return all 3 rows at once. The rows don't say if the nodes have children (`HasChildren` is not set), so
      // processing a row into a node requires running `CHILDREN` - that makes it possible to tell which rows were
      // processed by looking at how many times `CHILDREN` was run.
      //
      // `resolve` returns only after the provider has done everything it can with the rows - there's no need to wait
      // any longer to give it a chance to do more.
      await rows.resolve(createRows(3, { HasChildren: undefined }));

      // The provider has all 3 rows, but only 1 node was requested, so only the first row should have been processed.
      // A provider that processes rows ahead of the consumer would have run `CHILDREN` 3 times by now.
      expect(getQueryOffsets("CHILDREN")).toEqual([0]);
      expect((await firstNode).value.label).toBe("0x1");

      // Requesting the remaining nodes gets the other 2 rows processed.
      expect(await collectLabels(iterator)).toEqual(["0x2", "0x3"]);
      expect(getQueryOffsets("CHILDREN")).toEqual([0, 0, 0]);
    });

    it("processes a hierarchy level definition only when its nodes are requested", async () => {
      const definitions = new ResolvablePromise<HierarchyLevelDefinition>();
      const rows = new ResolvablePromise<RowDef[]>();
      setupQueries({ Q: rows });
      const defineHierarchyLevel = vi.fn<HierarchyDefinition["defineHierarchyLevel"]>(async ({ parentNode }) =>
        parentNode ? [] : definitions,
      );
      using provider = createPagingHierarchyProvider({ imodelAccess, hierarchyDefinition: { defineHierarchyLevel } });
      const iterator = provider.getNodes({ parentNode: undefined });

      // the first definition's node is returned, but the second definition's query is not run
      const firstNode = iterator.next();
      await definitions.resolve([
        { node: createTestSourceGenericNode({ key: "a", label: "a", children: false }) },
        createQueryDefinition("Q"),
        { node: createTestSourceGenericNode({ key: "b", label: "b" }) },
      ]);
      expect(imodelAccess.createQueryReader).not.toHaveBeenCalled();
      expect((await firstNode).value.label).toBe("a");

      // the second definition's node is returned, but children of the third definition's node are not determined
      const secondNode = iterator.next();
      await rows.resolve([createRow("x", { HasChildren: false })]);
      expect(defineHierarchyLevel).toHaveBeenCalledOnce();
      expect((await secondNode).value.label).toBe("x");

      expect(await collectLabels(iterator)).toEqual(["b"]);
      expect(defineHierarchyLevel).toHaveBeenCalledTimes(2);
    });

    it("stops reading when the consumer stops", async () => {
      const secondRow = new ResolvablePromise<RowDef>();
      const thirdRowRead = vi.fn();
      const readerClosed = vi.fn();
      imodelAccess.createQueryReader.mockImplementation(async function* () {
        try {
          yield createRow("0x1", { HasChildren: false });
          yield await secondRow;
          thirdRowRead();
          yield createRow("0x3", { HasChildren: false });
        } finally {
          readerClosed();
        }
      });
      using provider = createQueryProvider(3);
      const iterator = provider.getNodes({ parentNode: undefined });
      expect(await readLabels(iterator, 1)).toEqual(["0x1"]);
      await iterator.return!();

      // the reader is closed as soon as the row, that was being read when the consumer stopped, is received
      await secondRow.resolve(createRow("0x2", { HasChildren: false }));
      expect(readerClosed).toHaveBeenCalledOnce();
      expect(thirdRowRead).not.toHaveBeenCalled();
      expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();
    });

    it("stops loading immediately when the consumer stops while a node is being loaded", async () => {
      const definitions = new ResolvablePromise<HierarchyLevelDefinition>();
      setupQueries({ Q: createRows(1) });
      const defineHierarchyLevel = vi.fn<HierarchyDefinition["defineHierarchyLevel"]>(async () => definitions);
      using provider = createPagingHierarchyProvider({ imodelAccess, hierarchyDefinition: { defineHierarchyLevel } });
      const iterator = provider.getNodes({ parentNode: undefined });

      const result = iterator.next();
      await waitFor(() => expect(defineHierarchyLevel).toHaveBeenCalledOnce());
      await expect(iterator.return!()).resolves.toEqual({ done: true, value: undefined });
      await expect(result).resolves.toEqual({ done: true, value: undefined });

      await definitions.resolve([createQueryDefinition("Q")]);
      expect(imodelAccess.createQueryReader).not.toHaveBeenCalled();
      await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
    });

    it("fails when a query fails", async () => {
      const error = new Error("test error");
      const rows = createRows(6);
      imodelAccess.createQueryReader.mockImplementation(async function* (query: ECSqlQueryDef) {
        if (parsePageQuery(query.ecsql).offset > 0) {
          throw error;
        }
        yield* getPageRows({ Q: rows }, query);
      });
      using provider = createQueryProvider(3);
      const iterator = provider.getNodes({ parentNode: undefined });
      expect(await readLabels(iterator, 3)).toEqual(["0x1", "0x2", "0x3"]);
      await expect(iterator.next()).rejects.toThrow(error);
    });

    it("streams nodes of multiple definitions in definitions' order", async () => {
      setupQueries({ Q1: createRows(4), Q2: [createRow("x", { HasChildren: false })] });
      using provider = createPagingHierarchyProvider({
        imodelAccess,
        pageSize: 3,
        hierarchyDefinition: {
          defineHierarchyLevel: async () => [
            createQueryDefinition("Q2"),
            { node: createTestSourceGenericNode({ key: "generic", label: "generic", children: false }) },
            createQueryDefinition("Q1"),
          ],
        },
      });
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(nodes.map((n) => n.label)).toEqual(["x", "generic", "0x1", "0x2", "0x3", "0x4"]);
      for (let i = 0; i < nodes.length; ++i) {
        expect(
          await collect(provider.getNodes({ parentNode: undefined, continuationToken: nodes[i].continuationToken })),
        ).toEqual(nodes.slice(i + 1));
      }
    });

    it("continues from a node on a later page using an offset query", async () => {
      setupQueries({ Q: createRows(10) });
      using provider = createQueryProvider(3);
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      imodelAccess.createQueryReader.mockClear();
      expect(
        await collectLabels(
          provider.getNodes({ parentNode: undefined, continuationToken: nodes[4].continuationToken }),
        ),
      ).toEqual(["0x6", "0x7", "0x8", "0x9", "0x10"]);
      expect(getQueryOffsets("Q")).toEqual([5, 8]);
    });
  });

  describe("hidden nodes", () => {
    // root level: [a, b, hidden, d, e], `hidden` children: [c1, c2, cHidden, c4], `cHidden` children: [c3_1, c3_2]
    const rows = {
      ROOT: [
        createRow("a", { HasChildren: false }),
        createRow("b", { HasChildren: false }),
        createRow("hidden", { HideNodeInHierarchy: true }),
        createRow("d", { HasChildren: false }),
        createRow("e", { HasChildren: false }),
      ],
      HIDDEN_CHILDREN: [
        createRow("c1", { HasChildren: false }),
        createRow("c2", { HasChildren: false }),
        createRow("cHidden", { HideNodeInHierarchy: true }),
        createRow("c4", { HasChildren: false }),
      ],
      C_HIDDEN_CHILDREN: [createRow("c3_1", { HasChildren: false }), createRow("c3_2", { HasChildren: false })],
      AFTER_GENERIC: [createRow("g_child", { HasChildren: false })],
    };

    function setupHierarchyWithHiddenNodes(props?: {
      pageSize?: number;
      /** Overrides for `rows` to control when queries return them. */
      queries?: { [ecsql in keyof typeof rows]?: Promise<RowDef[]> };
    }) {
      const { queries, ...providerProps } = props ?? {};
      setupQueries({ ...rows, ...queries });
      const defineHierarchyLevel = vi.fn<HierarchyDefinition["defineHierarchyLevel"]>(async ({ parentNode }) => {
        if (!parentNode) {
          return [
            createQueryDefinition("ROOT"),
            {
              node: createTestSourceGenericNode({ key: "g", label: "g", processingParams: { hideInHierarchy: true } }),
            },
            { node: createTestSourceGenericNode({ key: "f", label: "f", children: false }) },
          ];
        }
        if (isParent(parentNode, "hidden")) {
          return [createQueryDefinition("HIDDEN_CHILDREN")];
        }
        if (isParent(parentNode, "cHidden")) {
          return [createQueryDefinition("C_HIDDEN_CHILDREN")];
        }
        if (isParent(parentNode, "g")) {
          return [createQueryDefinition("AFTER_GENERIC")];
        }
        return [];
      });
      const provider = createPagingHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: { defineHierarchyLevel },
        ...providerProps,
      });
      return { provider, defineHierarchyLevel };
    }

    it("streams children of hidden nodes in place of the hidden nodes", async () => {
      using provider = setupHierarchyWithHiddenNodes().provider;
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(nodes.map((n) => n.label)).toEqual(["a", "b", "c1", "c2", "c3_1", "c3_2", "c4", "d", "e", "g_child", "f"]);
      const hiddenKey = {
        type: "instances",
        instanceKeys: [{ className: "a.b", id: "hidden", imodelKey: "test-imodel" }],
      };
      const cHiddenKey = {
        type: "instances",
        instanceKeys: [{ className: "a.b", id: "cHidden", imodelKey: "test-imodel" }],
      };
      expect(nodes.find((n) => n.label === "c1")!.parentKeys).toEqual([hiddenKey]);
      expect(nodes.find((n) => n.label === "c3_1")!.parentKeys).toEqual([hiddenKey, cHiddenKey]);
    });

    it("streams children of hidden nodes in place of the hidden nodes when levels span multiple pages", async () => {
      using provider = setupHierarchyWithHiddenNodes({ pageSize: 2 }).provider;
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(nodes.map((n) => n.label)).toEqual(["a", "b", "c1", "c2", "c3_1", "c3_2", "c4", "d", "e", "g_child", "f"]);
      expect(getQueryOffsets("ROOT")).toEqual([0, 2, 4]);
      expect(getQueryOffsets("HIDDEN_CHILDREN")).toEqual([0, 2, 4]);
      expect(getQueryOffsets("C_HIDDEN_CHILDREN")).toEqual([0, 2]);
    });

    it("requests children of a hidden node only when a node that follows the nodes before it is requested", async () => {
      const queries = {
        ROOT: new ResolvablePromise<RowDef[]>(),
        HIDDEN_CHILDREN: new ResolvablePromise<RowDef[]>(),
        C_HIDDEN_CHILDREN: new ResolvablePromise<RowDef[]>(),
      };
      using provider = setupHierarchyWithHiddenNodes({ pageSize: 3, queries }).provider;
      const iterator = provider.getNodes({ parentNode: undefined });

      // `hidden` is on the loaded page of root nodes, but its children are not requested
      let labels = readLabels(iterator, 2);
      await queries.ROOT.resolve(rows.ROOT);
      expect(getQueryOffsets("HIDDEN_CHILDREN")).toEqual([]);
      expect(await labels).toEqual(["a", "b"]);

      // `cHidden` is on the loaded page of `hidden` children, but its children are not requested
      labels = readLabels(iterator, 2);
      await queries.HIDDEN_CHILDREN.resolve(rows.HIDDEN_CHILDREN);
      expect(getQueryOffsets("C_HIDDEN_CHILDREN")).toEqual([]);
      expect(await labels).toEqual(["c1", "c2"]);

      // all children of `cHidden` are returned, but neither the next page of `hidden` children, nor the next page of
      // root nodes is requested
      labels = readLabels(iterator, 2);
      await queries.C_HIDDEN_CHILDREN.resolve(rows.C_HIDDEN_CHILDREN);
      expect(getQueryOffsets("HIDDEN_CHILDREN")).toEqual([0]);
      expect(getQueryOffsets("ROOT")).toEqual([0]);
      expect(await labels).toEqual(["c3_1", "c3_2"]);

      expect(await readLabels(iterator, 1)).toEqual(["c4"]);
      expect(getQueryOffsets("HIDDEN_CHILDREN")).toEqual([0, 3]);
      expect(getQueryOffsets("ROOT")).toEqual([0]);

      expect(await collectLabels(iterator)).toEqual(["d", "e", "g_child", "f"]);
      expect(getQueryOffsets("ROOT")).toEqual([0, 3]);
    });

    it("passes instance filter to child hierarchy levels of hidden nodes", async () => {
      const instanceFilter: GenericInstanceFilter = {
        propertyClassNames: [],
        relatedInstances: [],
        rules: { operator: "and", rules: [] },
      };
      const { provider, defineHierarchyLevel } = setupHierarchyWithHiddenNodes();
      using _ = provider;
      await collect(provider.getNodes({ parentNode: undefined, instanceFilter }));
      expect(defineHierarchyLevel).toHaveBeenCalledWith(
        expect.objectContaining({ parentNode: expect.objectContaining({ label: "cHidden" }), instanceFilter }),
      );
    });

    it("post-processes children of hidden nodes with the requested parent node", async () => {
      const postProcessNode = vi.fn<NonNullable<HierarchyDefinition["postProcessNode"]>>(async ({ node }) => node);
      setupQueries({ CHILDREN: [createRow("child", { HasChildren: false })] });
      using provider = createPagingHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          postProcessNode,
          defineHierarchyLevel: async ({ parentNode }) =>
            isParent(parentNode, "root")
              ? [{ node: createTestSourceGenericNode({ key: "hidden", processingParams: { hideInHierarchy: true } }) }]
              : [createQueryDefinition("CHILDREN")],
        },
      });
      const rootNode = { key: createTestGenericNodeKey({ id: "root", source: sourceName }), label: "", parentKeys: [] };
      expect(await collectLabels(provider.getNodes({ parentNode: rootNode }))).toEqual(["child"]);
      expect(postProcessNode).toHaveBeenCalledExactlyOnceWith({
        node: expect.objectContaining({ label: "child" }),
        parentNode: rootNode,
      });
    });

    it.each([undefined, 2])(
      "continues from any node using its continuation token (page size: %s)",
      async (pageSize) => {
        using provider = setupHierarchyWithHiddenNodes({ pageSize }).provider;
        const allNodes = await collect(provider.getNodes({ parentNode: undefined }));
        for (let i = 0; i < allNodes.length; ++i) {
          const continuedNodes = await collect(
            provider.getNodes({ parentNode: undefined, continuationToken: allNodes[i].continuationToken }),
          );
          expect(continuedNodes).toEqual(allNodes.slice(i + 1));
        }
      },
    );

    it("continues with an offset query when resuming inside hidden node's children", async () => {
      using provider = setupHierarchyWithHiddenNodes().provider;
      const allNodes = await collect(provider.getNodes({ parentNode: undefined }));
      imodelAccess.createQueryReader.mockClear();
      const c3_1 = allNodes.find((n) => n.label === "c3_1")!;
      await collect(provider.getNodes({ parentNode: undefined, continuationToken: c3_1.continuationToken }));
      // `hidden` node is at row 2 of root query and `cHidden` is at row 2 of `hidden` children query
      expect(getQueryOffsets("ROOT")).toEqual([2]);
      expect(getQueryOffsets("HIDDEN_CHILDREN")).toEqual([2]);
      expect(getQueryOffsets("C_HIDDEN_CHILDREN")).toEqual([1]);
    });

    it("throws on invalid continuation token", async () => {
      using provider = setupHierarchyWithHiddenNodes().provider;
      const encode = (payload: unknown) => btoa(JSON.stringify(payload));
      for (const continuationToken of [
        "invalid!",
        encode(null),
        encode(1),
        encode({ g: 0, f: "x", p: [[0, 0]] }),
        encode({ v: 2, g: 0, f: "x", p: [[0, 0]] }),
        encode({ v: 1, f: "x", p: [[0, 0]] }),
        encode({ v: 1, g: 0.5, f: "x", p: [[0, 0]] }),
        encode({ v: 1, g: 0, p: [[0, 0]] }),
        encode({ v: 1, g: 0, f: 1, p: [[0, 0]] }),
        encode({ v: 1, g: 0, f: "x" }),
        encode({ v: 1, g: 0, f: "x", p: [] }),
        encode({ v: 1, g: 0, f: "x", p: [1] }),
        encode({ v: 1, g: 0, f: "x", p: [[0]] }),
        encode({ v: 1, g: 0, f: "x", p: [[0, -1]] }),
        encode({ v: 1, g: 0, f: "x", p: [[0, 0.5]] }),
        encode({ v: 1, g: 0, f: "x", p: [[0, 0, 0]] }),
      ]) {
        expect(() => provider.getNodes({ parentNode: undefined, continuationToken })).toThrow(
          new InvalidContinuationTokenError(`Invalid continuation token: "${continuationToken}".`),
        );
      }
    });

    it("throws when the token was created for a different parent node or instance filter", async () => {
      setupQueries({ Q: createRows(1) });
      using provider = createPagingHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: { defineHierarchyLevel: async () => [createQueryDefinition("Q")] },
      });
      const parentNode = { key: { type: "generic" as const, id: "p" }, label: "p", parentKeys: [] };
      const instanceFilter: GenericInstanceFilter = {
        propertyClassNames: ["a.b"],
        relatedInstances: [],
        rules: { operator: "and", rules: [] },
      };
      const [{ continuationToken }] = await collect(provider.getNodes({ parentNode, instanceFilter }));
      for (const props of [
        { parentNode: undefined, instanceFilter },
        { parentNode: { ...parentNode, key: { type: "generic" as const, id: "other" } }, instanceFilter },
        {
          parentNode: { ...parentNode, parentKeys: [{ type: "generic" as const, id: "grandparent" }] },
          instanceFilter,
        },
        { parentNode },
      ]) {
        expect(() => provider.getNodes({ ...props, continuationToken })).toThrow(
          new InvalidContinuationTokenError(
            `Continuation token "${continuationToken}" was created for a different parent node or instance filter.`,
          ),
        );
      }
    });

    it("accepts the token for an equal parent node key, parent keys and instance filter", async () => {
      setupQueries({ Q: createRows(2) });
      using provider = createPagingHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: { defineHierarchyLevel: async () => [createQueryDefinition("Q")] },
      });
      const parentNode = {
        key: { type: "instances" as const, instanceKeys: [{ className: "a.b" as const, id: "0x1" }] },
        label: "p",
        parentKeys: [{ type: "generic" as const, id: "grandparent" }],
      };
      const [{ continuationToken }] = await collect(provider.getNodes({ parentNode }));
      expect(
        await collectLabels(
          provider.getNodes({
            parentNode: {
              label: "other",
              parentKeys: [{ id: "grandparent", type: "generic" }],
              key: { instanceKeys: [{ id: "0x1", className: "a.b" }], type: "instances" },
            },
            continuationToken,
          }),
        ),
      ).toEqual(["0x2"]);
    });

    it("throws when the token points to a hierarchy level definition that doesn't exist", async () => {
      const { provider, defineHierarchyLevel } = setupHierarchyWithHiddenNodes();
      using _ = provider;
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      const { continuationToken } = nodes.find((n) => n.label === "f")!;
      // definition now returns only root nodes and f node is no longer part of the hierarchy
      defineHierarchyLevel.mockImplementation(async () => [createQueryDefinition("ROOT")]);
      await expect(collect(provider.getNodes({ parentNode: undefined, continuationToken }))).rejects.toThrow(
        InvalidContinuationTokenError,
      );
    });

    it("omits hidden nodes that don't have children", async () => {
      using provider = createPagingHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          defineHierarchyLevel: async ({ parentNode }) =>
            parentNode
              ? []
              : [
                  {
                    node: createTestSourceGenericNode({
                      key: "hidden",
                      children: false,
                      processingParams: { hideInHierarchy: true },
                    }),
                  },
                  { node: createTestSourceGenericNode({ key: "visible", label: "visible" }) },
                ],
        },
      });
      expect(await collectLabels(provider.getNodes({ parentNode: undefined }))).toEqual(["visible"]);
    });
  });

  describe("determining children", () => {
    it("determines children by loading child hierarchy level", async () => {
      using provider = createPagingHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          defineHierarchyLevel: async ({ parentNode }) => {
            if (!parentNode) {
              return [
                { node: createTestSourceGenericNode({ key: "with-children" }) },
                { node: createTestSourceGenericNode({ key: "without-children" }) },
              ];
            }
            if (isParent(parentNode, "with-children")) {
              return [{ node: createTestSourceGenericNode({ key: "child", children: false }) }];
            }
            return [];
          },
        },
      });
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(nodes.map((n) => [n.key, n.children])).toEqual([
        [createTestGenericNodeKey({ id: "with-children", source: sourceName }), true],
        [createTestGenericNodeKey({ id: "without-children", source: sourceName }), false],
      ]);
    });

    it("stops reading children at the first child", async () => {
      const secondRow = new ResolvablePromise<RowDef>();
      const thirdRowRead = vi.fn();
      const readerClosed = vi.fn();
      imodelAccess.createQueryReader.mockImplementation(async function* () {
        try {
          yield createRow("0x1", { HasChildren: false });
          yield await secondRow;
          thirdRowRead();
          yield createRow("0x3", { HasChildren: false });
        } finally {
          readerClosed();
        }
      });
      // The root level has a single node that doesn't say if it has children, so the provider has to run its children
      // query (the reader above) to find that out.
      const defineHierarchyLevel = vi.fn<HierarchyDefinition["defineHierarchyLevel"]>(async ({ parentNode }) =>
        parentNode ? [createQueryDefinition("CHILDREN")] : [{ node: createTestSourceGenericNode({ key: "root" }) }],
      );
      using provider = createPagingHierarchyProvider({ imodelAccess, hierarchyDefinition: { defineHierarchyLevel } });

      // The first row of the children query is enough to know the root node has children - the node is returned
      // without waiting for the second row.
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(nodes.map((n) => n.children)).toEqual([true]);

      // At this point the provider is no longer interested in the children query, but the reader is still waiting
      // for the second row - a pending read can't be cancelled, the reader can only be closed when the read finishes.
      // Let the read finish to see what happens to the reader then.
      await secondRow.resolve(createRow("0x2", { HasChildren: false }));
      // the reader is closed, rather than read further
      expect(readerClosed).toHaveBeenCalledOnce();
      expect(thirdRowRead).not.toHaveBeenCalled();
      expect(defineHierarchyLevel).toHaveBeenCalledTimes(2);
    });

    it("reads children in pages until the first child is found", async () => {
      setupQueries({
        CHILDREN: [
          ...createRows(7, { HideIfNoChildren: true }),
          createRow("visible", { HasChildren: false }),
          ...createRows(7),
        ],
      });
      using provider = createPagingHierarchyProvider({
        imodelAccess,
        pageSize: 3,
        hierarchyDefinition: {
          defineHierarchyLevel: async ({ parentNode }) =>
            parentNode
              ? [createQueryDefinition("CHILDREN")]
              : [{ node: createTestSourceGenericNode({ key: "root", label: "root" }) }],
        },
      });
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(nodes.map((n) => [n.label, n.children])).toEqual([["root", true]]);
      // Pages at offsets 0 and 3 have no rows that count as children, so the provider moves on to the next page
      // without the consumer requesting anything more - it's still working on the root node. The page at offset 6
      // has the first child, so pages at offsets 9 and 12 are not requested.
      expect(getQueryOffsets("CHILDREN")).toEqual([0, 3, 6]);
    });

    it("determines children through hidden child nodes", async () => {
      using provider = createPagingHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          defineHierarchyLevel: async ({ parentNode }) => {
            if (!parentNode) {
              return [{ node: createTestSourceGenericNode({ key: "root" }) }];
            }
            if (isParent(parentNode, "root")) {
              return [
                { node: createTestSourceGenericNode({ key: "hidden", processingParams: { hideInHierarchy: true } }) },
              ];
            }
            if (isParent(parentNode, "hidden")) {
              return [{ node: createTestSourceGenericNode({ key: "child", children: false }) }];
            }
            return [];
          },
        },
      });
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(nodes.map((n) => n.children)).toEqual([true]);
    });

    it("doesn't count hidden child nodes without children as children", async () => {
      using provider = createPagingHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          defineHierarchyLevel: async ({ parentNode }) => {
            if (!parentNode) {
              return [{ node: createTestSourceGenericNode({ key: "root" }) }];
            }
            if (isParent(parentNode, "root")) {
              return [
                {
                  node: createTestSourceGenericNode({
                    key: "hidden",
                    children: false,
                    processingParams: { hideInHierarchy: true },
                  }),
                },
                {
                  node: createTestSourceGenericNode({
                    key: "hidden-if-no-children",
                    children: false,
                    processingParams: { hideIfNoChildren: true },
                  }),
                },
              ];
            }
            return [];
          },
        },
      });
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(nodes.map((n) => n.children)).toEqual([false]);
    });

    it("doesn't load children of hidden child node that says it has children", async () => {
      const defineHierarchyLevel = vi.fn<HierarchyDefinition["defineHierarchyLevel"]>(async ({ parentNode }) => {
        if (!parentNode) {
          return [{ node: createTestSourceGenericNode({ key: "root" }) }];
        }
        if (isParent(parentNode, "root")) {
          return [
            {
              node: createTestSourceGenericNode({
                key: "hidden",
                children: true,
                processingParams: { hideInHierarchy: true },
              }),
            },
          ];
        }
        return [];
      });
      using provider = createPagingHierarchyProvider({ imodelAccess, hierarchyDefinition: { defineHierarchyLevel } });
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(nodes.map((n) => n.children)).toEqual([true]);
      expect(defineHierarchyLevel).toHaveBeenCalledTimes(2);
    });

    it("hides nodes with `hideIfNoChildren` flag when they don't have children", async () => {
      using provider = createPagingHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          defineHierarchyLevel: async ({ parentNode }) => {
            if (!parentNode) {
              return [
                { node: createTestSourceGenericNode({ key: "a", processingParams: { hideIfNoChildren: true } }) },
                { node: createTestSourceGenericNode({ key: "b", processingParams: { hideIfNoChildren: true } }) },
                {
                  node: createTestSourceGenericNode({
                    key: "c",
                    children: true,
                    processingParams: { hideIfNoChildren: true },
                  }),
                },
                {
                  node: createTestSourceGenericNode({
                    key: "d",
                    children: false,
                    processingParams: { hideIfNoChildren: true },
                  }),
                },
              ];
            }
            if (isParent(parentNode, "a")) {
              return [{ node: createTestSourceGenericNode({ key: "child", children: false }) }];
            }
            return [];
          },
        },
      });
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(nodes.map((n) => [n.key, n.children])).toEqual([
        [createTestGenericNodeKey({ id: "a", source: sourceName }), true],
        [createTestGenericNodeKey({ id: "c", source: sourceName }), true],
      ]);
    });
  });

  describe("parent nodes", () => {
    it("passes parent node without continuation token to hierarchy definition", async () => {
      const defineHierarchyLevel = vi.fn<HierarchyDefinition["defineHierarchyLevel"]>(async () => []);
      using provider = createPagingHierarchyProvider({ imodelAccess, hierarchyDefinition: { defineHierarchyLevel } });
      const parentNode = {
        key: createTestGenericNodeKey({ id: "parent", source: sourceName }),
        label: "parent",
        parentKeys: [],
        continuationToken: "[[0,0]]",
      };
      await collect(provider.getNodes({ parentNode }));
      expect(defineHierarchyLevel).toHaveBeenCalledWith(
        expect.objectContaining({
          parentNode: { key: parentNode.key, label: parentNode.label, parentKeys: parentNode.parentKeys },
        }),
      );
    });

    it("returns no nodes for grouping, other source generic and other iModel instance parent nodes", async () => {
      const defineHierarchyLevel = vi.fn<HierarchyDefinition["defineHierarchyLevel"]>(async () => [
        { node: createTestSourceGenericNode() },
      ]);
      using provider = createPagingHierarchyProvider({ imodelAccess, hierarchyDefinition: { defineHierarchyLevel } });
      expect(
        await collect(
          provider.getNodes({ parentNode: createTestGroupingNode() as unknown as NonGroupingHierarchyNode }),
        ),
      ).toEqual([]);
      expect(
        await collect(
          provider.getNodes({
            parentNode: { key: createTestGenericNodeKey({ source: "other" }), label: "", parentKeys: [] },
          }),
        ),
      ).toEqual([]);
      expect(
        await collect(
          provider.getNodes({
            parentNode: {
              key: { type: "instances", instanceKeys: [{ className: "a.b", id: "0x1", imodelKey: "other-imodel" }] },
              label: "",
              parentKeys: [],
            },
          }),
        ),
      ).toEqual([]);
      expect(defineHierarchyLevel).not.toHaveBeenCalled();
    });

    it("passes only instance keys of provider's iModel to hierarchy definition", async () => {
      const defineHierarchyLevel = vi.fn<HierarchyDefinition["defineHierarchyLevel"]>(async () => [
        { node: createTestSourceGenericNode({ key: "child", children: false }) },
      ]);
      using provider = createPagingHierarchyProvider({ imodelAccess, hierarchyDefinition: { defineHierarchyLevel } });
      const parentNode: ParentHierarchyNode<NonGroupingHierarchyNode> = {
        key: {
          type: "instances",
          instanceKeys: [
            { className: "a.b", id: "0x1", imodelKey: "other-imodel" },
            { className: "a.b", id: "0x2", imodelKey: "test-imodel" },
            { className: "a.b", id: "0x3" },
          ],
        },
        label: "parent",
        parentKeys: [],
      };
      const nodes = await collect(provider.getNodes({ parentNode }));
      expect(defineHierarchyLevel).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          parentNode: {
            ...parentNode,
            key: {
              type: "instances",
              instanceKeys: [
                { className: "a.b", id: "0x2", imodelKey: "test-imodel" },
                { className: "a.b", id: "0x3" },
              ],
            },
          },
        }),
      );
      // child nodes still refer to the parent node the way it was given
      expect(nodes.map((n) => n.parentKeys)).toEqual([[parentNode.key]]);
    });
  });

  describe("node processing", () => {
    it("uses custom node parser", async () => {
      imodelAccess.createQueryReader.mockReturnValue(createAsyncIterator([{ custom: "0x1" }]));
      using provider = createPagingHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          parseNode: async ({ row }) => ({
            key: { type: "instances", instanceKeys: [{ className: "a.b", id: row.custom }] },
            label: "custom",
            children: false,
          }),
          defineHierarchyLevel: async () => [createQueryDefinition("Q")],
        },
      });
      expect(await collect(provider.getNodes({ parentNode: undefined }))).toEqual([
        {
          key: { type: "instances", instanceKeys: [{ className: "a.b", id: "0x1", imodelKey: "test-imodel" }] },
          label: "custom",
          parentKeys: [],
          children: false,
          continuationToken: expect.any(String),
        },
      ]);
    });

    it("pre-processes and post-processes nodes, and ignores grouping params", async () => {
      using provider = createPagingHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          preProcessNode: async ({ node }) =>
            HierarchyNode.isGeneric(node) && node.key.id === "omitted"
              ? undefined
              : { ...node, processingParams: { ...node.processingParams, grouping: { byLabel: true } } },
          postProcessNode: async ({ node }) => ({ ...node, extendedData: { postProcessed: true } }),
          defineHierarchyLevel: async ({ parentNode }) =>
            parentNode
              ? []
              : [
                  { node: createTestSourceGenericNode({ key: "omitted" }) },
                  {
                    node: createTestSourceGenericNode({
                      key: "visible",
                      processingParams: { hideIfNoChildren: true },
                      children: true,
                    }),
                  },
                ],
        },
      });
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(nodes).toEqual([
        {
          key: createTestGenericNodeKey({ id: "visible", source: sourceName }),
          label: "test",
          parentKeys: [],
          children: true,
          extendedData: { postProcessed: true },
          continuationToken: expect.any(String),
        },
      ]);
    });

    it("formats labels using given formatter and raises event when formatter changes", async () => {
      const node = createTestSourceGenericNode({
        key: "root",
        label: [
          { type: "Integer", value: 123 },
          { type: "String", value: "!" },
        ] as any,
        children: false,
      });
      using provider = createPagingHierarchyProvider({
        imodelAccess,
        formatter: async () => "_x_",
        hierarchyDefinition: { defineHierarchyLevel: async () => [{ node }] },
      });
      expect(await collectLabels(provider.getNodes({ parentNode: undefined }))).toEqual(["_x__x_"]);

      const listener = vi.fn();
      provider.hierarchyChanged.addListener(listener);
      const formatter = async () => "x";
      provider.setFormatter(formatter);
      expect(listener).toHaveBeenCalledWith({ formatterChange: { newFormatter: formatter } });
      expect(await collectLabels(provider.getNodes({ parentNode: undefined }))).toEqual(["xx"]);

      provider.setFormatter(undefined);
      expect(await collectLabels(provider.getNodes({ parentNode: undefined }))).toEqual(["123!"]);
    });
  });

  describe("hierarchy changes", () => {
    it("raises `hierarchyChanged` event and fails in-flight requests when iModel changes", async () => {
      const imodelChanged = new BeEvent<() => void>();
      setupQueries({ Q: [createRow("0x1", { HasChildren: false })] });
      const definitionsPromise = new ResolvablePromise<HierarchyLevelDefinition>();
      const defineHierarchyLevel = vi
        .fn<HierarchyDefinition["defineHierarchyLevel"]>()
        .mockImplementationOnce(async () => definitionsPromise)
        .mockImplementation(async () => [createQueryDefinition("Q")]);
      using provider = createPagingHierarchyProvider({
        imodelAccess,
        imodelChanged,
        hierarchyDefinition: { defineHierarchyLevel },
      });
      const listener = vi.fn();
      provider.hierarchyChanged.addListener(listener);

      const result = provider.getNodes({ parentNode: undefined }).next();
      await waitFor(() => expect(defineHierarchyLevel).toHaveBeenCalledOnce());
      imodelChanged.raiseEvent();
      expect(listener).toHaveBeenCalledWith({});
      await expect(result).rejects.toThrow(HierarchyRequestInterruptedError);
      await definitionsPromise.resolve([createQueryDefinition("Q")]);
      expect(imodelAccess.createQueryReader).not.toHaveBeenCalled();

      expect(await collectLabels(provider.getNodes({ parentNode: undefined }))).toEqual(["0x1"]);
    });

    it("fails the stream, instead of finishing it, when iModel changes after some nodes are streamed", async () => {
      const imodelChanged = new BeEvent<() => void>();
      setupQueries({ Q: createRows(2) });
      using provider = createPagingHierarchyProvider({
        imodelAccess,
        imodelChanged,
        hierarchyDefinition: { defineHierarchyLevel: async () => [createQueryDefinition("Q")] },
      });
      const iterator = provider.getNodes({ parentNode: undefined });
      expect((await iterator.next()).value.label).toBe("0x1");
      imodelChanged.raiseEvent();
      await expect(iterator.next()).rejects.toThrow(HierarchyRequestInterruptedError);
    });

    it("fails in-flight requests when formatter changes", async () => {
      setupQueries({ Q: createRows(2) });
      using provider = createPagingHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: { defineHierarchyLevel: async () => [createQueryDefinition("Q")] },
      });
      const iterator = provider.getNodes({ parentNode: undefined });
      expect((await iterator.next()).value.label).toBe("0x1");
      provider.setFormatter(async () => "x");
      await expect(iterator.next()).rejects.toThrow(HierarchyRequestInterruptedError);
    });

    it("fails requests that haven't started iterating when hierarchy changes", async () => {
      const defineHierarchyLevel = vi.fn<HierarchyDefinition["defineHierarchyLevel"]>(async () => [
        createQueryDefinition("Q"),
      ]);
      using provider = createPagingHierarchyProvider({ imodelAccess, hierarchyDefinition: { defineHierarchyLevel } });
      const iterator = provider.getNodes({ parentNode: undefined });
      provider.setFormatter(undefined);
      await expect(iterator.next()).rejects.toThrow(HierarchyRequestInterruptedError);
      expect(defineHierarchyLevel).not.toHaveBeenCalled();
    });

    it("fails requests made after the provider is disposed", async () => {
      const defineHierarchyLevel = vi.fn<HierarchyDefinition["defineHierarchyLevel"]>(async () => [
        createQueryDefinition("Q"),
      ]);
      const provider = createPagingHierarchyProvider({ imodelAccess, hierarchyDefinition: { defineHierarchyLevel } });
      provider[Symbol.dispose]();
      await expect(provider.getNodes({ parentNode: undefined }).next()).rejects.toThrow(
        HierarchyRequestInterruptedError,
      );
      expect(defineHierarchyLevel).not.toHaveBeenCalled();
    });

    it("throws when the token was created before an iModel change", async () => {
      const imodelChanged = new BeEvent<() => void>();
      setupQueries({ Q: createRows(2) });
      const props = {
        imodelAccess,
        imodelChanged,
        hierarchyDefinition: { defineHierarchyLevel: async () => [createQueryDefinition("Q")] },
      };
      using provider = createPagingHierarchyProvider(props);
      const [{ continuationToken }] = await collect(provider.getNodes({ parentNode: undefined }));

      provider.setFormatter(undefined);
      expect(await collectLabels(provider.getNodes({ parentNode: undefined, continuationToken }))).toEqual(["0x2"]);
      using otherProvider = createPagingHierarchyProvider(props);
      expect(await collectLabels(otherProvider.getNodes({ parentNode: undefined, continuationToken }))).toEqual([
        "0x2",
      ]);

      imodelChanged.raiseEvent();
      expect(() => provider.getNodes({ parentNode: undefined, continuationToken })).toThrow(
        new InvalidContinuationTokenError(
          `Continuation token "${continuationToken}" was created before a hierarchy change and can't be used anymore.`,
        ),
      );
    });

    it("unsubscribes from iModel changes and fails in-flight requests on dispose", async () => {
      const imodelChanged = new BeEvent<() => void>();
      const definitionsPromise = new ResolvablePromise<HierarchyLevelDefinition>();
      const defineHierarchyLevel = vi.fn<HierarchyDefinition["defineHierarchyLevel"]>(async () => definitionsPromise);
      const provider = createPagingHierarchyProvider({
        imodelAccess,
        imodelChanged,
        hierarchyDefinition: { defineHierarchyLevel },
      });

      const result = provider.getNodes({ parentNode: undefined }).next();
      await waitFor(() => expect(defineHierarchyLevel).toHaveBeenCalledOnce());
      expect(imodelChanged.numberOfListeners).toBe(1);
      provider[Symbol.dispose]();
      expect(imodelChanged.numberOfListeners).toBe(0);
      await expect(result).rejects.toThrow(HierarchyRequestInterruptedError);
      await definitionsPromise.resolve([createQueryDefinition("Q")]);
      expect(imodelAccess.createQueryReader).not.toHaveBeenCalled();
    });
  });
});
