/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect, createAsyncIterator, ResolvablePromise, waitFor } from "presentation-test-utilities";
import sinon from "sinon";
import { omit } from "@itwin/core-bentley";
import { GenericInstanceFilter } from "@itwin/core-common";
import {
  ConcatenatedValue,
  EC,
  ECSqlQueryDef,
  ECSqlQueryReader,
  ECSqlQueryReaderOptions,
  InstanceKey,
  trimWhitespace,
  TypedPrimitiveValue,
} from "@itwin/presentation-shared";
import { DefineHierarchyLevelProps, IHierarchyLevelDefinitionsFactory } from "../hierarchies/HierarchyDefinition";
import { RowsLimitExceededError } from "../hierarchies/HierarchyErrors";
import { GroupingHierarchyNode, GroupingNodeKey, HierarchyNode, ParsedCustomHierarchyNode } from "../hierarchies/HierarchyNode";
import { HierarchyProvider } from "../hierarchies/HierarchyProvider";
import {
  ECSQL_COLUMN_NAME_FilteredChildrenPaths,
  ECSQL_COLUMN_NAME_IsFilterTarget,
  FilteredHierarchyNode,
} from "../hierarchies/internal/FilteringHierarchyLevelDefinitionsFactory";
import { RowDef } from "../hierarchies/internal/TreeNodesReader";
import { ECSqlSelectClauseGroupingParams, NodeSelectClauseColumnNames } from "../hierarchies/NodeSelectQueryFactory";
import { createMetadataProviderStub } from "./Utils";

describe("HierarchyProvider", () => {
  let metadataProvider: ReturnType<typeof createMetadataProviderStub>;
  const queryExecutor = {
    createQueryReader: sinon.stub<[ECSqlQueryDef, (ECSqlQueryReaderOptions & { limit?: number | "unbounded" }) | undefined], ECSqlQueryReader>(),
  };

  beforeEach(() => {
    metadataProvider = createMetadataProviderStub();
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
    const nodes = await collect(provider.getNodes({ parentNode: undefined }));
    expect(nodes).to.deep.eq([{ ...node, parentKeys: [] }]);
  });

  it("loads root instance nodes", async () => {
    queryExecutor.createQueryReader.returns(
      createAsyncIterator<RowDef>([
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
    const nodes = await collect(provider.getNodes({ parentNode: undefined }));
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

    const nodes = await collect(provider.getNodes({ parentNode: rootNode }));
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

      queryExecutor.createQueryReader.onThirdCall().returns(createAsyncIterator([]));

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
      queryExecutor.createQueryReader.returns(createAsyncIterator([row]));
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
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
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
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
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
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
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
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
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
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(postprocess).to.be.calledOnceWith({ ...node, parentKeys: [] });
      expect(nodes).to.deep.eq([]);
    });
  });

  describe("Grouping", () => {
    it("returns grouping node children", async () => {
      queryExecutor.createQueryReader.returns(
        createAsyncIterator<RowDef>([
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

      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      const expectedKey: GroupingNodeKey = {
        type: "label-grouping",
        label: "test label",
        groupId: undefined,
      };
      expect(rootNodes).to.deep.eq([
        {
          key: expectedKey,
          parentKeys: [],
          groupedInstanceKeys: [{ className: "a.b", id: "0x123" }],
          label: "test label",
          children: true,
        } as GroupingHierarchyNode,
      ]);

      const childNodes = await collect(provider.getNodes({ parentNode: rootNodes[0] }));
      expect(childNodes).to.deep.eq([
        {
          key: {
            type: "instances",
            instanceKeys: [{ className: "a.b", id: "0x123" }],
          },
          parentKeys: [expectedKey],
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
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
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
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes).to.deep.eq([{ ...rootNode, parentKeys: [], children: true }]);
      const childNodes = await collect(provider.getNodes({ parentNode: rootNodes[0] }));
      expect(childNodes).to.deep.eq([{ ...visibleChildNode, parentKeys: [rootNode.key, hiddenChildNode.key], children: false }]);
    });

    // note: the feature of not checking children for nodes that say they do have them is very important for performance - this test
    // should not be removed
    it("doesn't load children of hidden child node when determining parent's children if the hidden child says it always has children", async () => {
      const rootNode = { key: "root", label: "root" };
      const hiddenChildNode = { key: "hidden child", label: "hidden child", processingParams: { hideInHierarchy: true }, children: true };
      const visibleChildNode = { key: "visible child", label: "visible child" };
      const hierarchyDefinition = {
        defineHierarchyLevel: sinon.fake(async ({ parentNode }) => {
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
        }),
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes).to.deep.eq([{ ...rootNode, parentKeys: [], children: true }]);
      expect(hierarchyDefinition.defineHierarchyLevel).to.be.calledTwice;
      expect(hierarchyDefinition.defineHierarchyLevel.firstCall).to.be.calledWith({ parentNode: undefined });
      expect(hierarchyDefinition.defineHierarchyLevel.secondCall).to.be.calledWith({ parentNode: omit(rootNodes[0], ["children"]) });
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
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes).to.deep.eq([{ ...rootNode, parentKeys: [], children: false }]);
      const childNodes = await collect(provider.getNodes({ parentNode: rootNodes[0] }));
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
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes).to.deep.eq([{ ...rootNode, parentKeys: [], children: true }]);
      const childNodes = await collect(provider.getNodes({ parentNode: rootNodes[0] }));
      expect(childNodes).to.deep.eq([omit({ ...hiddenChildNode, parentKeys: [rootNode.key], children: true }, ["processingParams"])]);
      const grandChildNodes = await collect(provider.getNodes({ parentNode: childNodes[0] }));
      expect(grandChildNodes).to.deep.eq([{ ...grandChildNode, parentKeys: [rootNode.key, hiddenChildNode.key], children: false }]);
    });
  });

  describe("Labels formatting", () => {
    const formatter = sinon.fake(async (v: TypedPrimitiveValue) => `_${v.value.toString()}_`);

    afterEach(() => {
      formatter.resetHistory();
    });

    it("returns formatted string label", async () => {
      const { provider } = setupTest({
        node: createNode("test label"),
      });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(formatter).to.be.calledOnceWith({ value: "test label", type: "String" });
      expect(rootNodes[0].label).to.eq("_test label_");
    });

    it("returns combined strings label", async () => {
      const { provider } = setupTest({
        node: createNode(["test1", "-", "test2"]),
      });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
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
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(formatter).to.be.calledTwice;
      expect(formatter.firstCall).to.be.calledWithExactly({ type: "Integer", value: 123 });
      expect(formatter.secondCall).to.be.calledWithExactly({ type: "String", value: "!" });
      expect(rootNodes[0].label).to.eq("_123__!_");
    });

    it("returns formatted primitive property values label", async () => {
      metadataProvider.stubEntityClass({
        schemaName: "x",
        className: "y",
        properties: [
          {
            name: "p",
            isPrimitive: () => true,
            primitiveType: "String",
            extendedTypeName: "extended type",
            kindOfQuantity: Promise.resolve({ fullName: "s.koq" } as EC.KindOfQuantity),
          } as EC.PrimitiveProperty,
        ],
      });
      const { provider } = setupTest({
        node: createNode([{ className: "x.y", propertyName: "p", value: "abc" }]),
      });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(formatter).to.be.calledOnceWithExactly({
        type: "String",
        extendedType: "extended type",
        koqName: "s.koq",
        value: "abc",
      });
      expect(rootNodes[0].label).to.eq("_abc_");
    });

    it("throws when label includes non-primitive property values", async () => {
      metadataProvider.stubEntityClass({
        schemaName: "x",
        className: "y",
        properties: [
          {
            name: "p",
            isPrimitive: () => false,
          } as EC.Property,
        ],
      });
      const { provider } = setupTest({
        node: createNode([{ className: "x.y", propertyName: "p", value: "abc" }]),
      });
      await expect(provider.getNodes({ parentNode: undefined }).next()).to.eventually.be.rejected;
    });

    it("throws when label includes `IGeometry` property values", async () => {
      metadataProvider.stubEntityClass({
        schemaName: "x",
        className: "y",
        properties: [
          {
            name: "p",
            isPrimitive: () => true,
            primitiveType: "IGeometry",
          } as EC.PrimitiveProperty,
        ],
      });
      const { provider } = setupTest({
        node: createNode([{ className: "x.y", propertyName: "p", value: "abc" }]),
      });
      await expect(provider.getNodes({ parentNode: undefined }).next()).to.eventually.be.rejected;
    });

    it("throws when label includes `Binary` property values", async () => {
      metadataProvider.stubEntityClass({
        schemaName: "x",
        className: "y",
        properties: [
          {
            name: "p",
            isPrimitive: () => true,
            primitiveType: "Binary",
          } as EC.PrimitiveProperty,
        ],
      });
      const { provider } = setupTest({
        node: createNode([{ className: "x.y", propertyName: "p", value: "abc" }]),
      });
      await expect(provider.getNodes({ parentNode: undefined }).next()).to.eventually.be.rejected;
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

  describe("Hierarchy filtering", () => {
    it("applies filtering on query definitions", async () => {
      metadataProvider.stubEntityClass({
        schemaName: "a",
        className: "b",
        is: async (fullClassName) => fullClassName === "a.b",
      });
      queryExecutor.createQueryReader.returns(
        createAsyncIterator<RowDef & { [ECSQL_COLUMN_NAME_FilteredChildrenPaths]: string }>([
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
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
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

  describe("Hierarchy level filtering", () => {
    const instanceFilter: GenericInstanceFilter = {
      propertyClassNames: ["x.y"],
      relatedInstances: [],
      rules: {
        operator: "and",
        rules: [
          {
            propertyName: "z",
            propertyTypeName: "string",
            sourceAlias: "this",
            operator: "is-equal",
            value: { rawValue: "test value", displayValue: "test value" },
          },
        ],
      },
    };

    it("filters hierarchy levels with nodes that are hidden if no children", async () => {
      const rootNode = { key: "root", label: "root", processingParams: { hideIfNoChildren: true } };
      const childNode = { key: "child", label: "child", children: true };
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode, instanceFilter: requestedFilter }) {
          if (!parentNode) {
            // simulate the root node matching requested instance filter
            expect(requestedFilter).to.eq(instanceFilter);
            return [{ node: rootNode }];
          }
          if (parentNode.key === "root") {
            // we're expecting the filter to be used only for root nodes
            expect(requestedFilter).to.be.undefined;
            return requestedFilter ? [] : [{ node: childNode }];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined, instanceFilter }));
      expect(rootNodes).to.deep.eq([{ key: "root", label: "root", parentKeys: [], children: true }]);
    });
  });

  describe("Hierarchy level instance keys", () => {
    it("returns grouped instance keys for parent grouping node", async () => {
      const groupingNode: GroupingHierarchyNode = {
        key: { type: "class-grouping", className: "x.y" },
        parentKeys: [],
        label: "test",
        children: true,
        groupedInstanceKeys: [
          { className: "a.b", id: "0x1" },
          { className: "c.d", id: "0x2" },
        ],
      };
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel() {
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      const keys = await collect(provider.getNodeInstanceKeys({ parentNode: groupingNode }));
      expect(keys).to.deep.eq(groupingNode.groupedInstanceKeys);
    });

    it("returns empty list for parent custom node", async () => {
      const customNode = {
        key: "custom",
        parentKeys: [],
        label: "test",
        children: false,
      };
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [{ node: customNode }];
          }
          return [];
        },
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      const keys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined }));
      expect(keys).to.be.empty;
    });

    it("returns instance nodes' keys", async () => {
      queryExecutor.createQueryReader.returns(
        createAsyncIterator([
          {
            [0]: "a.b",
            [1]: "0x123",
            [2]: false,
          },
          {
            [0]: "c:d",
            [1]: "0x456",
            [2]: false,
          },
        ]),
      );
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: "query" },
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
      const keys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined }));
      expect(keys)
        .to.have.lengthOf(2)
        .and.to.containSubset([
          { className: "a.b", id: "0x123" },
          { className: "c.d", id: "0x456" },
        ]);
    });

    it("returns child instance nodes' keys of hidden custom node", async () => {
      const customNode = {
        key: "custom",
        parentKeys: [],
        label: "test",
        children: false,
        processingParams: {
          hideInHierarchy: true,
        },
      };
      queryExecutor.createQueryReader.returns(
        createAsyncIterator([
          {
            [0]: "a.b",
            [1]: "0x123",
            [2]: false,
          },
        ]),
      );
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [{ node: customNode }];
          }
          if (HierarchyNode.isCustom(parentNode) && parentNode.key === "custom") {
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: "query" },
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
      const keys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined }));
      expect(keys)
        .to.have.lengthOf(1)
        .and.to.containSubset([{ className: "a.b", id: "0x123" }]);
    });

    it("returns child instance nodes' keys of hidden instance node", async () => {
      queryExecutor.createQueryReader.onFirstCall().returns(
        createAsyncIterator([
          {
            [0]: "a.b",
            [1]: "0x123",
            [2]: true,
          },
        ]),
      );
      queryExecutor.createQueryReader.onSecondCall().returns(
        createAsyncIterator([
          {
            [0]: "c.d",
            [1]: "0x456",
            [2]: false,
          },
        ]),
      );
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: "root" },
              },
            ];
          }
          if (HierarchyNode.isInstancesNode(parentNode) && parentNode.key.instanceKeys.some((k) => k.className === "a.b")) {
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: "child" },
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
      const keys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined }));
      expect(keys)
        .to.have.lengthOf(1)
        .and.to.containSubset([{ className: "c.d", id: "0x456" }]);
    });

    it("merges same-class instance keys under a single parent node when requesting child node keys for hidden parent instance nodes", async () => {
      queryExecutor.createQueryReader.onFirstCall().returns(
        createAsyncIterator([
          {
            [0]: "a.b",
            [1]: "0x123",
            [2]: true,
          },
          {
            [0]: "a.b",
            [1]: "0x456",
            [2]: true,
          },
        ]),
      );
      queryExecutor.createQueryReader.onSecondCall().returns(
        createAsyncIterator([
          {
            [0]: "c.d",
            [1]: "0x789",
            [2]: false,
          },
        ]),
      );
      const hierarchyDefinition = {
        defineHierarchyLevel: sinon.fake(async ({ parentNode }: DefineHierarchyLevelProps) => {
          if (!parentNode) {
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: "root" },
              },
            ];
          }
          if (HierarchyNode.isInstancesNode(parentNode) && parentNode.key.instanceKeys.some((k) => k.className === "a.b")) {
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: "child" },
              },
            ];
          }
          return [];
        }),
      };
      const provider = new HierarchyProvider({
        metadataProvider,
        queryExecutor,
        hierarchyDefinition,
      });
      const keys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined }));
      expect(keys)
        .to.have.lengthOf(1)
        .and.to.containSubset([{ className: "c.d", id: "0x789" }]);
      expect(hierarchyDefinition.defineHierarchyLevel).to.be.calledTwice;
      expect(hierarchyDefinition.defineHierarchyLevel.secondCall).to.be.calledWithMatch(
        (arg: DefineHierarchyLevelProps) =>
          arg.parentNode &&
          HierarchyNode.isInstancesNode(arg.parentNode) &&
          arg.parentNode.key.instanceKeys.length === 2 &&
          InstanceKey.equals(arg.parentNode.key.instanceKeys[0], { className: "a.b", id: "0x123" }) &&
          InstanceKey.equals(arg.parentNode.key.instanceKeys[1], { className: "a.b", id: "0x456" }),
      );
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
      await expect(provider.getNodes({ parentNode: undefined }).next()).to.eventually.be.rejectedWith("test error");
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
      await expect(provider.getNodes({ parentNode: undefined }).next()).to.eventually.be.rejectedWith("test error");
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
      await expect(provider.getNodes({ parentNode: undefined }).next()).to.eventually.be.rejectedWith("test error");
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

      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes).to.deep.eq([{ key: "root", label: "root", parentKeys: [], children: true }]);

      await expect(provider.getNodes({ parentNode: rootNodes[0] }).next()).to.eventually.be.rejectedWith(RowsLimitExceededError);
    });
  });

  describe("Caching", () => {
    it("doesn't query same root nodes more than once", async () => {
      queryExecutor.createQueryReader.returns(createAsyncIterator([]));
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
      await collect(provider.getNodes({ parentNode: undefined }));
      await collect(provider.getNodes({ parentNode: undefined }));
      expect(queryExecutor.createQueryReader).to.be.calledOnce;
    });

    it("doesn't query same child nodes more than once", async () => {
      queryExecutor.createQueryReader.returns(createAsyncIterator([]));
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
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes.length).to.eq(1);
      await collect(provider.getNodes({ parentNode: rootNodes[0] }));
      await collect(provider.getNodes({ parentNode: rootNodes[0] }));
      expect(queryExecutor.createQueryReader).to.be.calledOnce;
    });

    it("queries the same root nodes more than once when `ignoreCache` is set to true", async () => {
      queryExecutor.createQueryReader.returns(createAsyncIterator([]));
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
      await collect(provider.getNodes({ parentNode: undefined }));
      await collect(provider.getNodes({ parentNode: undefined, ignoreCache: true }));
      expect(queryExecutor.createQueryReader).to.be.calledTwice;
    });

    it("queries variations of the same hierarchy level", async () => {
      queryExecutor.createQueryReader.returns(createAsyncIterator([]));
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
      await collect(provider.getNodes({ parentNode: undefined }));
      await collect(provider.getNodes({ parentNode: undefined, instanceFilter: {} as GenericInstanceFilter })); // variation of previous, so should cause a query
      await collect(provider.getNodes({ parentNode: undefined, instanceFilter: {} as GenericInstanceFilter })); // same as previous, so this one one shouldn't cause a query
      expect(queryExecutor.createQueryReader).to.be.calledTwice;
    });

    it("queries grouped instance nodes when requesting grouped children if the query is pushed-out of cache", async () => {
      metadataProvider.stubEntityClass({ schemaName: "x", className: "y", classLabel: "Class Y" });
      queryExecutor.createQueryReader.callsFake((query) => {
        if (query.ecsql.includes("ROOT")) {
          return createAsyncIterator<RowDef>([
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
        } else if (query.ecsql.includes("CHILD")) {
          return createAsyncIterator<RowDef>([
            {
              [NodeSelectClauseColumnNames.FullClassName]: `x.y`,
              [NodeSelectClauseColumnNames.ECInstanceId]: `0x2`,
              [NodeSelectClauseColumnNames.DisplayLabel]: `two`,
              [NodeSelectClauseColumnNames.HasChildren]: false,
            },
          ]);
        }
        return createAsyncIterator([]);
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
      const groupingNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(queryExecutor.createQueryReader).to.be.calledOnceWith(sinon.match((query) => query.ecsql === "ROOT"));
      expect(groupingNodes).to.deep.eq([
        {
          key: {
            type: "class-grouping",
            className: "x.y",
          },
          groupedInstanceKeys: [{ className: "x.y", id: "0x1" }],
          parentKeys: [],
          label: "Class Y",
          children: true,
        } as GroupingHierarchyNode,
      ]);

      // requesting children for the class grouping node shouldn't execute a query and should return the instance node
      const rootInstanceNodes = await collect(provider.getNodes({ parentNode: groupingNodes[0] }));
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
              className: "x.y",
            },
          ],
          label: "one",
          children: true,
        } as HierarchyNode,
      ]);
      queryExecutor.createQueryReader.resetHistory();

      // requesting children for the root instance node should push grouping node child instance nodes out of cache
      const childInstanceNodes = await collect(provider.getNodes({ parentNode: rootInstanceNodes[0] }));
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
              className: "x.y",
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

      // requesting children for the class grouping node again should re-execute the root query, filtered by grouped instance ECInstanceIds
      const rootInstanceNodes2 = await collect(provider.getNodes({ parentNode: groupingNodes[0] }));
      expect(queryExecutor.createQueryReader).to.be.calledOnceWith(
        sinon.match((query: ECSqlQueryDef) => query.ecsql.includes("FROM (ROOT)") && query?.bindings?.length === 1 && query?.bindings?.at(0)?.value === "0x1"),
      );
      expect(rootInstanceNodes2).to.deep.eq(rootInstanceNodes);
    });
  });

  describe("setFormatter", () => {
    after(() => {
      sinon.restore();
    });

    it("getNodes doesn't requery with same props and a different formatter", async () => {
      queryExecutor.createQueryReader.returns(createAsyncIterator([]));
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

      await collect(provider.getNodes({ parentNode: undefined }));
      provider.setFormatter(async (val: TypedPrimitiveValue) => `_formatted_${JSON.stringify(val)}`);

      await collect(provider.getNodes({ parentNode: undefined }));
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
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([{ ...node, parentKeys: [] }]);
      provider.setFormatter(async (val: TypedPrimitiveValue) => `_formatted_${JSON.stringify(val)}`);
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([
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
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([
        { ...node, label: `_formatted_${JSON.stringify({ value: node.label, type: "String" })}`, parentKeys: [] },
      ]);
      provider.setFormatter(undefined);
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([{ ...node, parentKeys: [] }]);
    });
  });

  describe("notifyDataSourceChanged", () => {
    it("getNodes clears cache on data source change", async () => {
      queryExecutor.createQueryReader.returns(createAsyncIterator([]));
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
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([]);
      expect(queryExecutor.createQueryReader).to.be.calledOnce;
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([]);
      expect(queryExecutor.createQueryReader).to.be.calledOnce;

      provider.notifyDataSourceChanged();
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([]);
      expect(queryExecutor.createQueryReader).to.be.calledTwice;
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([]);
      expect(queryExecutor.createQueryReader).to.be.calledTwice;
    });
  });
});
