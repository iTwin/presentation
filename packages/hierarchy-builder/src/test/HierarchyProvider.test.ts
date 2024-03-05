/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { omit } from "@itwin/core-bentley";
import { ECKindOfQuantity, ECPrimitiveProperty, ECProperty, IMetadataProvider } from "../hierarchy-builder/ECMetadata";
import { GenericInstanceFilter } from "../hierarchy-builder/GenericInstanceFilter";
import { IHierarchyLevelDefinitionsFactory } from "../hierarchy-builder/HierarchyDefinition";
import { RowsLimitExceededError } from "../hierarchy-builder/HierarchyErrors";
import { GroupingHierarchyNode, GroupingNodeKey, HierarchyNode, ParsedCustomHierarchyNode } from "../hierarchy-builder/HierarchyNode";
import { HierarchyProvider } from "../hierarchy-builder/HierarchyProvider";
import {
  ECSQL_COLUMN_NAME_FilteredChildrenPaths,
  ECSQL_COLUMN_NAME_IsFilterTarget,
  FilteredHierarchyNode,
} from "../hierarchy-builder/internal/FilteringHierarchyLevelDefinitionsFactory";
import { RowDef } from "../hierarchy-builder/internal/TreeNodesReader";
import { ECSqlQueryDef, ECSqlQueryReader, ECSqlQueryReaderOptions } from "../hierarchy-builder/queries/ECSqlCore";
import { ECSqlSelectClauseGroupingParams, NodeSelectClauseColumnNames } from "../hierarchy-builder/queries/NodeSelectQueryFactory";
import { ConcatenatedValue } from "../hierarchy-builder/values/ConcatenatedValue";
import { TypedPrimitiveValue } from "../hierarchy-builder/values/Values";
import { trimWhitespace } from "./queries/Utils";
import { ClassStubs, createClassStubs, createFakeQueryReader, ResolvablePromise, waitFor } from "./Utils";

describe("HierarchyProvider", () => {
  const metadataProvider = {} as unknown as IMetadataProvider;
  const queryExecutor = {
    createQueryReader: sinon.stub<[ECSqlQueryDef, (ECSqlQueryReaderOptions & { limit?: number | "unbounded" }) | undefined], ECSqlQueryReader>(),
  };

  beforeEach(() => {
    queryExecutor.createQueryReader.reset();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("loads root custom nodes", async () => {
    const node = { key: "custom", label: "custom", children: false };
    const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
      async defineHierarchyLevel({ parentNode }) {
        if (!parentNode) {
          return [
            {
              node,
            },
          ];
        }
        return [];
      },
    };
    const provider = new HierarchyProvider({
      metadataProvider,
      queryExecutor,
      hierarchyDefinition,
    });
    const nodes = await provider.getNodes({ parentNode: undefined });
    expect(nodes).to.deep.eq([{ ...node, parentKeys: [] }]);
  });

  it("loads root instance nodes", async () => {
    queryExecutor.createQueryReader.returns(
      createFakeQueryReader<RowDef>([
        {
          [NodeSelectClauseColumnNames.FullClassName]: "a.b",
          [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
          [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
        },
      ]),
    );
    const query: ECSqlQueryDef = {
      ecsql: "QUERY",
      bindings: [{ type: "string", value: "test binding" }],
      ctes: ["CTE"],
    };
    const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
      async defineHierarchyLevel({ parentNode }) {
        if (!parentNode) {
          return [
            {
              fullClassName: "x.y",
              query,
            },
          ];
        }
        return [];
      },
    };
    const provider = new HierarchyProvider({
      metadataProvider,
      queryExecutor,
      hierarchyDefinition,
    });
    const nodes = await provider.getNodes({ parentNode: undefined });
    expect(queryExecutor.createQueryReader).to.be.calledOnceWith(query, { rowFormat: "ECSqlPropertyNames" });
    expect(nodes).to.deep.eq([
      {
        key: {
          type: "instances",
          instanceKeys: [{ className: "a.b", id: "0x123" }],
        },
        parentKeys: [],
        label: "test label",
        children: false,
      } as HierarchyNode,
    ]);
  });

  it("loads child nodes", async () => {
    const rootNode = { key: "root", label: "root", parentKeys: [] };
    const childNode = { key: "child", label: "child" };
    const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
      async defineHierarchyLevel({ parentNode }) {
        if (!parentNode) {
          return [{ node: rootNode }];
        }
        if (parentNode === rootNode) {
          return [{ node: childNode }];
        }
        return [];
      },
    };
    const provider = new HierarchyProvider({
      metadataProvider,
      queryExecutor,
      hierarchyDefinition,
    });

    const nodes = await provider.getNodes({ parentNode: rootNode });
    const expectedChild = { ...childNode, parentKeys: [rootNode.key], children: false };
    expect(nodes).to.deep.eq([expectedChild]);
  });

  describe("Query scheduling", () => {
    it("executes configured amount of queries in parallel", async () => {
      const provider = new HierarchyProvider({
        hierarchyDefinition: {} as unknown as IHierarchyLevelDefinitionsFactory,
        metadataProvider,
        queryExecutor,
        queryConcurrency: 2,
      });

      const queryTimeout1 = new ResolvablePromise();
      queryExecutor.createQueryReader.onFirstCall().returns(
        (async function* (): ECSqlQueryReader {
          // the reader yields nothing, but waits for queryTimeout2 to resolve
          await queryTimeout1;
        })(),
      );

      const queryTimeout2 = new ResolvablePromise();
      queryExecutor.createQueryReader.onSecondCall().returns(
        (async function* (): ECSqlQueryReader {
          // the reader yields nothing, but waits for queryTimeout2 to resolve
          await queryTimeout2;
        })(),
      );

      queryExecutor.createQueryReader.onThirdCall().returns(createFakeQueryReader([]));

      void provider.queryScheduler.schedule({ ecsql: "1" }).next();
      await waitFor(() => expect(queryExecutor.createQueryReader).to.be.calledOnce);

      void provider.queryScheduler.schedule({ ecsql: "2" }).next();
      await waitFor(() => expect(queryExecutor.createQueryReader).to.be.calledTwice);

      void provider.queryScheduler.schedule({ ecsql: "3" }).next();
      // not called for the third time until one of the first queries complete
      await waitFor(() => expect(queryExecutor.createQueryReader).to.be.calledTwice, 100);

      await queryTimeout2.resolve(undefined);
      // now called
      await waitFor(() => expect(queryExecutor.createQueryReader).to.be.calledThrice);

      await queryTimeout1.resolve(undefined);
      // but not called anymore, since all queries are already scheduled
      await waitFor(() => expect(queryExecutor.createQueryReader).to.be.calledThrice, 100);
    });
  });

  describe("Custom parsing", async () => {
    it("calls hierarchy definition factory parser if supplied", async () => {
      const node = { key: "test", label: "test", children: false, custom: true };
      const parser = sinon.stub().returns(node);
      const row: RowDef = {
        [NodeSelectClauseColumnNames.FullClassName]: "a.b",
        [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
        [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
      };
      queryExecutor.createQueryReader.returns(createFakeQueryReader([row]));
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        parseNode: parser,
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: "QUERY" },
              },
            ];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      const nodes = await provider.getNodes({ parentNode: undefined });
      expect(parser).to.be.calledOnceWith(row);
      expect(nodes).to.deep.eq([{ ...node, parentKeys: [] }]);
    });
  });

  describe("Custom pre-processing", async () => {
    it("calls hierarchy definition factory pre-processor if supplied", async () => {
      const node = { key: "custom", label: "custom", children: false };
      const preprocess = sinon.stub().resolves({ ...node, isPreprocessed: true });
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        preProcessNode: preprocess,
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                node,
              },
            ];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      const nodes = await provider.getNodes({ parentNode: undefined });
      expect(preprocess).to.be.calledOnceWith({ ...node, parentKeys: [] });
      expect(nodes).to.deep.eq([{ ...node, isPreprocessed: true }]);
    });

    it("removes node from hierarchy if pre-processor returns `undefined`", async () => {
      const node = { key: "custom", label: "custom", children: false };
      const preprocess = sinon.stub().resolves(undefined);
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        preProcessNode: preprocess,
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                node,
              },
            ];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      const nodes = await provider.getNodes({ parentNode: undefined });
      expect(preprocess).to.be.calledOnceWith({ ...node, parentKeys: [] });
      expect(nodes).to.deep.eq([]);
    });
  });

  describe("Custom post-processing", async () => {
    it("calls hierarchy definition factory post-processor if supplied", async () => {
      const node = { key: "custom", label: "custom", children: false };
      const postprocess = sinon.stub().resolves({ ...node, isPostprocessed: true });
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        postProcessNode: postprocess,
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                node,
              },
            ];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      const nodes = await provider.getNodes({ parentNode: undefined });
      expect(postprocess).to.be.calledOnceWith({ ...node, parentKeys: [] });
      expect(nodes).to.deep.eq([{ ...node, isPostprocessed: true }]);
    });

    it("removes node from hierarchy if post-processor returns `undefined`", async () => {
      const node = { key: "custom", label: "custom", children: false };
      const postprocess = sinon.stub().resolves(undefined);
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        postProcessNode: postprocess,
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                node,
              },
            ];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      const nodes = await provider.getNodes({ parentNode: undefined });
      expect(postprocess).to.be.calledOnceWith({ ...node, parentKeys: [] });
      expect(nodes).to.deep.eq([]);
    });
  });

  describe("Grouping", () => {
    it("returns grouping node children", async () => {
      queryExecutor.createQueryReader.returns(
        createFakeQueryReader<RowDef>([
          {
            [NodeSelectClauseColumnNames.FullClassName]: "a.b",
            [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
            [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
            [NodeSelectClauseColumnNames.Grouping]: JSON.stringify({
              byLabel: true,
            } as ECSqlSelectClauseGroupingParams),
          },
        ]),
      );
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                fullClassName: "a.b",
                query: { ecsql: "QUERY" },
              },
            ];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });

      const rootNodes = await provider.getNodes({ parentNode: undefined });
      const expectedKey: GroupingNodeKey = {
        type: "label-grouping",
        label: "test label",
        groupId: undefined,
        groupedInstanceKeys: [{ className: "a.b", id: "0x123" }],
      };
      expect(rootNodes).to.deep.eq([
        {
          key: expectedKey,
          parentKeys: [],
          label: "test label",
          children: true,
          nonGroupingAncestor: undefined,
        } as GroupingHierarchyNode,
      ]);

      const childNodes = await provider.getNodes({ parentNode: rootNodes[0] });
      expect(childNodes).to.deep.eq([
        {
          key: {
            type: "instances",
            instanceKeys: [{ className: "a.b", id: "0x123" }],
          },
          parentKeys: [omit(expectedKey, ["groupedInstanceKeys"])],
          label: "test label",
          children: false,
        } as HierarchyNode,
      ]);
    });
  });

  describe("Hiding hierarchy levels", () => {
    it("hides root hierarchy level", async () => {
      const rootNode = { key: "root", label: "root", processingParams: { hideInHierarchy: true } };
      const childNode = { key: "visible child", label: "visible child" };
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [{ node: rootNode }];
          }
          if (parentNode.key === "root") {
            return [{ node: childNode }];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      const rootNodes = await provider.getNodes({ parentNode: undefined });
      expect(rootNodes).to.deep.eq([{ ...childNode, parentKeys: [rootNode.key], children: false }]);
    });

    it("determines children when immediate child node is hidden", async () => {
      const rootNode = { key: "root", label: "root" };
      const hiddenChildNode = { key: "hidden child", label: "hidden child", processingParams: { hideInHierarchy: true } };
      const visibleChildNode = { key: "visible child", label: "visible child" };
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [{ node: rootNode }];
          }
          if (parentNode.key === "root") {
            return [{ node: hiddenChildNode }];
          }
          if (parentNode.key === "hidden child") {
            return [{ node: visibleChildNode }];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      const rootNodes = await provider.getNodes({ parentNode: undefined });
      expect(rootNodes).to.deep.eq([{ ...rootNode, parentKeys: [], children: true }]);
      const childNodes = await provider.getNodes({ parentNode: rootNodes[0] });
      expect(childNodes).to.deep.eq([{ ...visibleChildNode, parentKeys: [rootNode.key, hiddenChildNode.key], children: false }]);
    });
  });

  describe("Hiding nodes without children", () => {
    it("hides node without children", async () => {
      const rootNode = { key: "root", label: "root" };
      const hiddenChildNode = { key: "hidden child", label: "hidden child", processingParams: { hideIfNoChildren: true } };
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [{ node: rootNode }];
          }
          if (parentNode.key === "root") {
            return [{ node: hiddenChildNode }];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      const rootNodes = await provider.getNodes({ parentNode: undefined });
      expect(rootNodes).to.deep.eq([{ ...rootNode, parentKeys: [], children: false }]);
      const childNodes = await provider.getNodes({ parentNode: rootNodes[0] });
      expect(childNodes).to.deep.eq([]);
    });

    it("doesn't hide node with children", async () => {
      const rootNode = { key: "root", label: "root" };
      const hiddenChildNode = { key: "hidden child", label: "hidden child", processingParams: { hideIfNoChildren: true } };
      const grandChildNode = { key: "grand child", label: "grand child", children: false };
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [{ node: rootNode }];
          }
          if (parentNode.key === "root") {
            return [{ node: hiddenChildNode }];
          }
          if (parentNode.key === "hidden child") {
            return [{ node: grandChildNode }];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      const rootNodes = await provider.getNodes({ parentNode: undefined });
      expect(rootNodes).to.deep.eq([{ ...rootNode, parentKeys: [], children: true }]);
      const childNodes = await provider.getNodes({ parentNode: rootNodes[0] });
      expect(childNodes).to.deep.eq([omit({ ...hiddenChildNode, parentKeys: [rootNode.key], children: true }, ["processingParams"])]);
      const grandChildNodes = await provider.getNodes({ parentNode: childNodes[0] });
      expect(grandChildNodes).to.deep.eq([{ ...grandChildNode, parentKeys: [rootNode.key, hiddenChildNode.key], children: false }]);
    });
  });

  describe("Labels formatting", () => {
    const formatter = sinon.fake(async (v: TypedPrimitiveValue) => `_${v.value.toString()}_`);
    let classStubs: ClassStubs;

    beforeEach(() => {
      classStubs = createClassStubs(metadataProvider);
    });
    afterEach(() => {
      formatter.resetHistory();
      classStubs.restore();
    });

    it("returns formatted string label", async () => {
      const { provider } = setupTest({
        node: createNode("test label"),
      });
      const rootNodes = await provider.getNodes({ parentNode: undefined });
      expect(formatter).to.be.calledOnceWith({ value: "test label", type: "String" });
      expect(rootNodes[0].label).to.eq("_test label_");
    });

    it("returns combined strings label", async () => {
      const { provider } = setupTest({
        node: createNode(["test1", "-", "test2"]),
      });
      const rootNodes = await provider.getNodes({ parentNode: undefined });
      expect(formatter).to.be.calledThrice;
      expect(formatter.firstCall).to.be.calledWith({ value: "test1", type: "String" });
      expect(formatter.secondCall).to.be.calledWith({ value: "-", type: "String" });
      expect(formatter.thirdCall).to.be.calledWith({ value: "test2", type: "String" });
      expect(rootNodes[0].label).to.eq("_test1__-__test2_");
    });

    it("returns formatted typed primitive values label", async () => {
      const { provider } = setupTest({
        node: createNode([
          { type: "Integer", value: 123 },
          { type: "String", value: "!" },
        ]),
      });
      const rootNodes = await provider.getNodes({ parentNode: undefined });
      expect(formatter).to.be.calledTwice;
      expect(formatter.firstCall).to.be.calledWithExactly({ type: "Integer", value: 123 });
      expect(formatter.secondCall).to.be.calledWithExactly({ type: "String", value: "!" });
      expect(rootNodes[0].label).to.eq("_123__!_");
    });

    it("returns formatted primitive property values label", async () => {
      classStubs.stubEntityClass({
        schemaName: "x",
        className: "y",
        properties: [
          {
            name: "p",
            isPrimitive: () => true,
            primitiveType: "String",
            extendedTypeName: "extended type",
            kindOfQuantity: Promise.resolve({ fullName: "s.koq" } as ECKindOfQuantity),
          } as ECPrimitiveProperty,
        ],
      });
      const { provider } = setupTest({
        node: createNode([{ className: "x.y", propertyName: "p", value: "abc" }]),
      });
      const rootNodes = await provider.getNodes({ parentNode: undefined });
      expect(formatter).to.be.calledOnceWithExactly({
        type: "String",
        extendedType: "extended type",
        koqName: "s.koq",
        value: "abc",
      });
      expect(rootNodes[0].label).to.eq("_abc_");
    });

    it("throws when label includes non-primitive property values", async () => {
      classStubs.stubEntityClass({
        schemaName: "x",
        className: "y",
        properties: [
          {
            name: "p",
            isPrimitive: () => false,
          } as ECProperty,
        ],
      });
      const { provider } = setupTest({
        node: createNode([{ className: "x.y", propertyName: "p", value: "abc" }]),
      });
      await expect(provider.getNodes({ parentNode: undefined })).to.eventually.be.rejected;
    });

    it("throws when label includes `IGeometry` property values", async () => {
      classStubs.stubEntityClass({
        schemaName: "x",
        className: "y",
        properties: [
          {
            name: "p",
            isPrimitive: () => true,
            primitiveType: "IGeometry",
          } as ECPrimitiveProperty,
        ],
      });
      const { provider } = setupTest({
        node: createNode([{ className: "x.y", propertyName: "p", value: "abc" }]),
      });
      await expect(provider.getNodes({ parentNode: undefined })).to.eventually.be.rejected;
    });

    it("throws when label includes `Binary` property values", async () => {
      classStubs.stubEntityClass({
        schemaName: "x",
        className: "y",
        properties: [
          {
            name: "p",
            isPrimitive: () => true,
            primitiveType: "Binary",
          } as ECPrimitiveProperty,
        ],
      });
      const { provider } = setupTest({
        node: createNode([{ className: "x.y", propertyName: "p", value: "abc" }]),
      });
      await expect(provider.getNodes({ parentNode: undefined })).to.eventually.be.rejected;
    });

    function setupTest(props: { node: ParsedCustomHierarchyNode }) {
      const { node } = props;
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel() {
          return [{ node }];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
        formatter,
      });
      return { hierarchyDefinition, provider };
    }

    function createNode(label: ConcatenatedValue | string): ParsedCustomHierarchyNode {
      return { key: "test", label, children: false };
    }
  });

  describe("Filtering", () => {
    let classStubs: ClassStubs;
    beforeEach(() => {
      classStubs = createClassStubs(metadataProvider);
    });
    afterEach(() => {
      classStubs.restore();
    });

    it("applies filtering on query definitions", async () => {
      classStubs.stubEntityClass({
        schemaName: "a",
        className: "b",
        is: async (fullClassName) => fullClassName === "a.b",
      });
      queryExecutor.createQueryReader.returns(
        createFakeQueryReader<RowDef & { [ECSQL_COLUMN_NAME_FilteredChildrenPaths]: string }>([
          {
            [NodeSelectClauseColumnNames.FullClassName]: "a.b",
            [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
            [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
            [ECSQL_COLUMN_NAME_FilteredChildrenPaths]: `[[{"className":"c.d","id":"0x456"}]]`,
          },
        ]),
      );
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                fullClassName: "a.b",
                query: { ecsql: "QUERY" },
              },
            ];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
        filtering: {
          paths: [
            [
              { className: "a.b", id: "0x123" },
              { className: "c.d", id: "0x456" },
            ],
          ],
        },
      });
      const nodes = await provider.getNodes({ parentNode: undefined });
      expect(queryExecutor.createQueryReader).to.be.calledOnceWith(
        sinon.match(
          (query) =>
            trimWhitespace(query.ctes[0]) ===
              trimWhitespace(
                `
                FilteringInfo(ECInstanceId, FilteredChildrenPaths) AS (
                  VALUES (0x123, '[[{"className":"c.d","id":"0x456"}]]')
                )
                `,
              ) &&
            trimWhitespace(query.ecsql) ===
              trimWhitespace(
                `
                SELECT
                    [q].*,
                    0 AS [${ECSQL_COLUMN_NAME_IsFilterTarget}],
                    [f].[FilteredChildrenPaths] AS [${ECSQL_COLUMN_NAME_FilteredChildrenPaths}]
                  FROM (QUERY) [q]
                  JOIN FilteringInfo [f] ON [f].[ECInstanceId] = [q].[ECInstanceId]
                `,
              ),
        ),
        { rowFormat: "ECSqlPropertyNames" },
      );
      expect(nodes).to.deep.eq([
        {
          key: {
            type: "instances",
            instanceKeys: [{ className: "a.b", id: "0x123" }],
          },
          parentKeys: [],
          label: "test label",
          children: false,
          filteredChildrenIdentifierPaths: [[{ className: "c.d", id: "0x456" }]],
          autoExpand: true,
        } as FilteredHierarchyNode,
      ]);
    });
  });

  describe("Error handling", () => {
    it("rethrows hierarchy definitions' factory errors", async () => {
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel() {
          throw new Error("test error");
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      await expect(provider.getNodes({ parentNode: undefined })).to.eventually.be.rejectedWith("test error");
    });

    it("rethrows query executor errors", async () => {
      queryExecutor.createQueryReader.returns(
        (async function* () {
          throw new Error("test error");
        })(),
      );
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel() {
          return [
            {
              fullClassName: "x.y",
              query: { ecsql: "QUERY" },
            },
          ];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      await expect(provider.getNodes({ parentNode: undefined })).to.eventually.be.rejectedWith("test error");
    });

    it("rethrows query executor errors thrown while determining children", async () => {
      queryExecutor.createQueryReader.returns(
        (async function* () {
          throw new Error("test error");
        })(),
      );
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [{ node: { key: "root", label: "root" } }];
          }
          return [
            {
              fullClassName: "x.y",
              query: { ecsql: "QUERY" },
            },
          ];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      await expect(provider.getNodes({ parentNode: undefined })).to.eventually.be.rejectedWith("test error");
    });

    it("sets children flag on parent node to `true` when determining children throws with `rows limit exceeded` error", async () => {
      queryExecutor.createQueryReader.returns(
        (async function* () {
          throw new RowsLimitExceededError(123);
        })(),
      );
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [{ node: { key: "root", label: "root" } }];
          }
          return [
            {
              fullClassName: "x.y",
              query: { ecsql: "QUERY" },
            },
          ];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });

      const rootNodes = await provider.getNodes({ parentNode: undefined });
      expect(rootNodes).to.deep.eq([{ key: "root", label: "root", parentKeys: [], children: true }]);

      await expect(provider.getNodes({ parentNode: rootNodes[0] })).to.eventually.be.rejectedWith(RowsLimitExceededError);
    });
  });

  describe("Caching", () => {
    it("doesn't query same root nodes more than once", async () => {
      queryExecutor.createQueryReader.returns(createFakeQueryReader([]));
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: "QUERY" },
              },
            ];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      await provider.getNodes({ parentNode: undefined });
      await provider.getNodes({ parentNode: undefined });
      expect(queryExecutor.createQueryReader).to.be.calledOnce;
    });

    it("doesn't query same child nodes more than once", async () => {
      queryExecutor.createQueryReader.returns(createFakeQueryReader([]));
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [{ node: { key: "root", label: "root" } }];
          }
          if (parentNode.key === "root") {
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: "QUERY" },
              },
            ];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      const rootNodes = await provider.getNodes({ parentNode: undefined });
      expect(rootNodes.length).to.eq(1);
      await provider.getNodes({ parentNode: rootNodes[0] });
      await provider.getNodes({ parentNode: rootNodes[0] });
      expect(queryExecutor.createQueryReader).to.be.calledOnce;
    });

    it("queries variations of the same hierarchy level", async () => {
      queryExecutor.createQueryReader.returns(createFakeQueryReader([]));
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode, instanceFilter }) {
          if (!parentNode) {
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: `QUERY WHERE ${JSON.stringify(instanceFilter)}` },
              },
            ];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      await provider.getNodes({ parentNode: undefined });
      await provider.getNodes({ parentNode: undefined, instanceFilter: {} as GenericInstanceFilter }); // variation of previous, so should cause a query
      await provider.getNodes({ parentNode: undefined, instanceFilter: {} as GenericInstanceFilter }); // same as previous, so this one one shouldn't cause a query
      expect(queryExecutor.createQueryReader).to.be.calledTwice;
    });

    it("queries instance nodes when requesting grouped children if the query is pushed-out of cache", async () => {
      createClassStubs(metadataProvider).stubEntityClass({ schemaName: "x", className: "y", classLabel: "Class Y" });
      queryExecutor.createQueryReader.callsFake((query) => {
        switch (query.ecsql) {
          case "ROOT":
            return createFakeQueryReader<RowDef>([
              {
                [NodeSelectClauseColumnNames.FullClassName]: `x.y`,
                [NodeSelectClauseColumnNames.ECInstanceId]: `0x1`,
                [NodeSelectClauseColumnNames.DisplayLabel]: `one`,
                [NodeSelectClauseColumnNames.HasChildren]: true,
                [NodeSelectClauseColumnNames.Grouping]: JSON.stringify({
                  byClass: true,
                } as ECSqlSelectClauseGroupingParams),
              },
            ]);
          case "CHILD":
            return createFakeQueryReader<RowDef>([
              {
                [NodeSelectClauseColumnNames.FullClassName]: `x.y`,
                [NodeSelectClauseColumnNames.ECInstanceId]: `0x2`,
                [NodeSelectClauseColumnNames.DisplayLabel]: `two`,
                [NodeSelectClauseColumnNames.HasChildren]: false,
              },
            ]);
        }
        return createFakeQueryReader([]);
      });
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: "ROOT" },
              },
            ];
          }
          if (parentNode.label === "one") {
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: "CHILD" },
              },
            ];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
        queryCacheSize: 1,
      });

      // requesting root nodes should query root instance nodes and return a class grouping node
      const groupingNodes = await provider.getNodes({ parentNode: undefined });
      expect(queryExecutor.createQueryReader).to.be.calledOnceWith(sinon.match((query) => query.ecsql === "ROOT"));
      expect(groupingNodes).to.deep.eq([
        {
          key: {
            type: "class-grouping",
            class: {
              name: "x.y",
              label: "Class Y",
            },
            groupedInstanceKeys: [{ className: "x.y", id: "0x1" }],
          },
          parentKeys: [],
          nonGroupingAncestor: undefined,
          label: "Class Y",
          children: true,
        } as GroupingHierarchyNode,
      ]);

      // requesting children for the class grouping node shouldn't execute a query and should return the instance node
      const rootInstanceNodes = await provider.getNodes({ parentNode: groupingNodes[0] });
      expect(queryExecutor.createQueryReader).to.be.calledOnce;
      expect(rootInstanceNodes).to.deep.eq([
        {
          key: {
            type: "instances",
            instanceKeys: [{ className: "x.y", id: "0x1" }],
          },
          parentKeys: [
            {
              type: "class-grouping",
              class: {
                name: "x.y",
                label: "Class Y",
              },
            },
          ],
          label: "one",
          children: true,
        } as HierarchyNode,
      ]);
      queryExecutor.createQueryReader.resetHistory();

      // requesting children for the root instance node should run a query that pushes the root nodes query out of cache
      const childInstanceNodes = await provider.getNodes({ parentNode: rootInstanceNodes[0] });
      expect(queryExecutor.createQueryReader).to.be.calledOnceWith(sinon.match((query) => query.ecsql === "CHILD"));
      expect(childInstanceNodes).to.deep.eq([
        {
          key: {
            type: "instances",
            instanceKeys: [{ className: "x.y", id: "0x2" }],
          },
          parentKeys: [
            {
              type: "class-grouping",
              class: {
                name: "x.y",
                label: "Class Y",
              },
            },
            {
              type: "instances",
              instanceKeys: [{ className: "x.y", id: "0x1" }],
            },
          ],
          label: "two",
          children: false,
        } as HierarchyNode,
      ]);
      queryExecutor.createQueryReader.resetHistory();

      // requesting children for the class grouping node again should re-execute the root query
      const rootInstanceNodes2 = await provider.getNodes({ parentNode: groupingNodes[0] });
      expect(queryExecutor.createQueryReader).to.be.calledOnceWith(sinon.match((query) => query.ecsql === "ROOT"));
      expect(rootInstanceNodes2).to.deep.eq(rootInstanceNodes);
    });
  });

  describe("setFormatter", () => {
    after(() => {
      sinon.restore();
    });

    it("getNodes doesn't requery with same props and a different formatter", async () => {
      queryExecutor.createQueryReader.returns(createFakeQueryReader([]));
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: "QUERY" },
              },
            ];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });

      await provider.getNodes({ parentNode: undefined });
      provider.setFormatter(async (val: TypedPrimitiveValue) => `_formatted_${JSON.stringify(val)}`);

      await provider.getNodes({ parentNode: undefined });
      expect(queryExecutor.createQueryReader).to.be.calledOnce;
    });

    it("getNodes uses formatter that is provided to setFormatter", async () => {
      const node = { key: "custom", label: "custom", children: false };
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                node,
              },
            ];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      expect(await provider.getNodes({ parentNode: undefined })).to.deep.eq([{ ...node, parentKeys: [] }]);
      provider.setFormatter(async (val: TypedPrimitiveValue) => `_formatted_${JSON.stringify(val)}`);
      expect(await provider.getNodes({ parentNode: undefined })).to.deep.eq([
        { ...node, label: `_formatted_${JSON.stringify({ value: node.label, type: "String" })}`, parentKeys: [] },
      ]);
    });

    it("getNodes uses default formatter when setFormatter is provided an undefined value", async () => {
      const node = { key: "custom", label: "custom", children: false };
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                node,
              },
            ];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
        formatter: async (val: TypedPrimitiveValue) => `_formatted_${JSON.stringify(val)}`,
      });
      expect(await provider.getNodes({ parentNode: undefined })).to.deep.eq([
        { ...node, label: `_formatted_${JSON.stringify({ value: node.label, type: "String" })}`, parentKeys: [] },
      ]);
      provider.setFormatter(undefined);
      expect(await provider.getNodes({ parentNode: undefined })).to.deep.eq([{ ...node, parentKeys: [] }]);
    });
  });

  describe("notifyDataSourceChanged", () => {
    it("getNodes clears cache on data source change", async () => {
      queryExecutor.createQueryReader.returns(createFakeQueryReader([]));
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel() {
          return [
            {
              fullClassName: "x.y",
              query: { ecsql: "QUERY" },
            },
          ];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      expect(await provider.getNodes({ parentNode: undefined })).to.deep.eq([]);
      expect(queryExecutor.createQueryReader).to.be.calledOnce;
      expect(await provider.getNodes({ parentNode: undefined })).to.deep.eq([]);
      expect(queryExecutor.createQueryReader).to.be.calledOnce;

      provider.notifyDataSourceChanged();
      expect(await provider.getNodes({ parentNode: undefined })).to.deep.eq([]);
      expect(queryExecutor.createQueryReader).to.be.calledTwice;
      expect(await provider.getNodes({ parentNode: undefined })).to.deep.eq([]);
      expect(queryExecutor.createQueryReader).to.be.calledTwice;
    });
  });
});
