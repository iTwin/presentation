/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { IHierarchyLevelDefinitionsFactory } from "../hierarchy-builder/HierarchyDefinition";
import { HierarchyNode, ParsedCustomHierarchyNode } from "../hierarchy-builder/HierarchyNode";
import { HierarchyProvider } from "../hierarchy-builder/HierarchyProvider";
import { ECSQL_COLUMN_NAME_FilteredChildrenPaths, FilteredHierarchyNode } from "../hierarchy-builder/internal/FilteringHierarchyLevelDefinitionsFactory";
import { RowsLimitExceededError } from "../hierarchy-builder/internal/TreeNodesReader";
import { ECKindOfQuantity, ECPrimitiveProperty, ECProperty, IMetadataProvider } from "../hierarchy-builder/Metadata";
import { ECSqlBinding, ECSqlQueryReader, ECSqlQueryReaderOptions } from "../hierarchy-builder/queries/ECSql";
import { NodeSelectClauseColumnNames } from "../hierarchy-builder/queries/NodeSelectClauseFactory";
import { ConcatenatedValue } from "../hierarchy-builder/values/ConcatenatedValue";
import { TypedPrimitiveValue } from "../hierarchy-builder/values/Values";
import { trimWhitespace } from "./queries/Utils";
import { createFakeQueryReader, createGetClassStub } from "./Utils";

describe("HierarchyProvider", () => {
  const metadataProvider = {} as unknown as IMetadataProvider;
  const queryExecutor = {
    createQueryReader: sinon.stub<[string, ECSqlBinding[] | undefined, ECSqlQueryReaderOptions | undefined], ECSqlQueryReader>(),
  };

  beforeEach(() => {
    queryExecutor.createQueryReader.reset();
  });

  it("loads root custom nodes", async () => {
    const node = { key: "custom", label: "custom", children: false };
    const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
      async defineHierarchyLevel(parentNode) {
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
    const nodes = await provider.getNodes(undefined);
    expect(nodes).to.deep.eq([{ ...node, parentKeys: [] }]);
  });

  it("loads root instance nodes", async () => {
    queryExecutor.createQueryReader.returns(
      createFakeQueryReader([
        {
          [NodeSelectClauseColumnNames.FullClassName]: "a.b",
          [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
          [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
        },
      ]),
    );
    const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
      async defineHierarchyLevel(parentNode) {
        if (!parentNode) {
          return [
            {
              fullClassName: "x.y",
              query: {
                ecsql: "QUERY",
                bindings: [{ type: "string", value: "test binding" }],
                ctes: ["CTE"],
              },
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
    const nodes = await provider.getNodes(undefined);
    expect(queryExecutor.createQueryReader).to.be.calledOnceWith(
      sinon.match((ecsql) => trimWhitespace(ecsql) === "WITH RECURSIVE CTE SELECT * FROM (QUERY) LIMIT 1001"),
      [{ type: "string", value: "test binding" }],
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
      } as HierarchyNode,
    ]);
  });

  it("loads child nodes", async () => {
    const rootNode = { key: "root", label: "root", parentKeys: [] };
    const childNode = { key: "child", label: "child" };
    const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
      async defineHierarchyLevel(parentNode) {
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

    const nodes = await provider.getNodes(rootNode);
    const expectedChild = { ...childNode, parentKeys: [rootNode.key], children: false };
    expect(nodes).to.deep.eq([expectedChild]);
  });

  describe("Custom parsing", async () => {
    it("calls hierarchy definition factory parser if supplied", async () => {
      const node = { key: "test", label: "test", children: false, custom: true };
      const parser = sinon.stub().returns(node);
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "a.b",
        [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
        [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
      };
      queryExecutor.createQueryReader.returns(createFakeQueryReader([row]));
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        parseNode: parser,
        async defineHierarchyLevel(parentNode) {
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
      const nodes = await provider.getNodes(undefined);
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
        async defineHierarchyLevel(parentNode) {
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
      const nodes = await provider.getNodes(undefined);
      expect(preprocess).to.be.calledOnceWith({ ...node, parentKeys: [] });
      expect(nodes).to.deep.eq([{ ...node, isPreprocessed: true }]);
    });

    it("removes node from hierarchy if pre-processor returns `undefined`", async () => {
      const node = { key: "custom", label: "custom", children: false };
      const preprocess = sinon.stub().resolves(undefined);
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        preProcessNode: preprocess,
        async defineHierarchyLevel(parentNode) {
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
      const nodes = await provider.getNodes(undefined);
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
        async defineHierarchyLevel(parentNode) {
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
      const nodes = await provider.getNodes(undefined);
      expect(postprocess).to.be.calledOnceWith({ ...node, parentKeys: [] });
      expect(nodes).to.deep.eq([{ ...node, isPostprocessed: true }]);
    });

    it("removes node from hierarchy if post-processor returns `undefined`", async () => {
      const node = { key: "custom", label: "custom", children: false };
      const postprocess = sinon.stub().resolves(undefined);
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        postProcessNode: postprocess,
        async defineHierarchyLevel(parentNode) {
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
      const nodes = await provider.getNodes(undefined);
      expect(postprocess).to.be.calledOnceWith({ ...node, parentKeys: [] });
      expect(nodes).to.deep.eq([]);
    });
  });

  describe("Hiding hierarchy levels", () => {
    it("hides root hierarchy level", async () => {
      const rootNode = { key: "root", label: "root", processingParams: { hideInHierarchy: true } };
      const childNode = { key: "visible child", label: "visible child" };
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel(parentNode) {
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
      const rootNodes = await provider.getNodes(undefined);
      expect(rootNodes).to.deep.eq([{ ...childNode, parentKeys: [rootNode.key], children: false }]);
    });

    it("determines children when immediate child node is hidden", async () => {
      const rootNode = { key: "root", label: "root" };
      const hiddenChildNode = { key: "hidden child", label: "hidden child", processingParams: { hideInHierarchy: true } };
      const visibleChildNode = { key: "visible child", label: "visible child" };
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel(parentNode) {
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
      const rootNodes = await provider.getNodes(undefined);
      expect(rootNodes).to.deep.eq([{ ...rootNode, parentKeys: [], children: true }]);
      const childNodes = await provider.getNodes(rootNodes[0]);
      expect(childNodes).to.deep.eq([{ ...visibleChildNode, parentKeys: [rootNode.key, hiddenChildNode.key], children: false }]);
    });
  });

  describe("Hiding nodes without children", () => {
    it("hides node without children", async () => {
      const rootNode = { key: "root", label: "root" };
      const hiddenChildNode = { key: "hidden child", label: "hidden child", processingParams: { hideIfNoChildren: true } };
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel(parentNode) {
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
      const rootNodes = await provider.getNodes(undefined);
      expect(rootNodes).to.deep.eq([{ ...rootNode, parentKeys: [], children: false }]);
      const childNodes = await provider.getNodes(rootNodes[0]);
      expect(childNodes).to.deep.eq([]);
    });

    it("doesn't hide node with children", async () => {
      const rootNode = { key: "root", label: "root" };
      const hiddenChildNode = { key: "hidden child", label: "hidden child", processingParams: { hideIfNoChildren: true } };
      const grandChildNode = { key: "grand child", label: "grand child", children: false };
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel(parentNode) {
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
      const rootNodes = await provider.getNodes(undefined);
      expect(rootNodes).to.deep.eq([{ ...rootNode, parentKeys: [], children: true }]);
      const childNodes = await provider.getNodes(rootNodes[0]);
      expect(childNodes).to.deep.eq([{ ...hiddenChildNode, parentKeys: [rootNode.key], children: true }]);
      const grandChildNodes = await provider.getNodes(childNodes[0]);
      expect(grandChildNodes).to.deep.eq([{ ...grandChildNode, parentKeys: [rootNode.key, hiddenChildNode.key], children: false }]);
    });
  });

  describe("Labels formatting", () => {
    const formatter = sinon.fake(async (v: TypedPrimitiveValue) => `_${v.value.toString()}_`);

    beforeEach(() => {
      formatter.resetHistory();
    });

    it("returns formatted string label", async () => {
      const { provider } = setupTest({
        node: createNode("test label"),
      });
      const rootNodes = await provider.getNodes(undefined);
      expect(formatter).to.be.calledOnceWith({ value: "test label", type: "String" });
      expect(rootNodes[0].label).to.eq("_test label_");
    });

    it("returns combined strings label", async () => {
      const { provider } = setupTest({
        node: createNode(["test1", "-", "test2"]),
      });
      const rootNodes = await provider.getNodes(undefined);
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
      const rootNodes = await provider.getNodes(undefined);
      expect(formatter).to.be.calledTwice;
      expect(formatter.firstCall).to.be.calledWithExactly({ type: "Integer", value: 123 });
      expect(formatter.secondCall).to.be.calledWithExactly({ type: "String", value: "!" });
      expect(rootNodes[0].label).to.eq("_123__!_");
    });

    it("returns formatted primitive property values label", async () => {
      const stubClass = createGetClassStub(metadataProvider).stubClass;
      stubClass({
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
      const rootNodes = await provider.getNodes(undefined);
      expect(formatter).to.be.calledOnceWithExactly({
        type: "String",
        extendedType: "extended type",
        koqName: "s.koq",
        value: "abc",
      });
      expect(rootNodes[0].label).to.eq("_abc_");
    });

    it("throws when label includes non-primitive property values", async () => {
      const stubClass = createGetClassStub(metadataProvider).stubClass;
      stubClass({
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
      await expect(provider.getNodes(undefined)).to.eventually.be.rejected;
    });

    it("throws when label includes `IGeometry` property values", async () => {
      const stubClass = createGetClassStub(metadataProvider).stubClass;
      stubClass({
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
      await expect(provider.getNodes(undefined)).to.eventually.be.rejected;
    });

    it("throws when label includes `Binary` property values", async () => {
      const stubClass = createGetClassStub(metadataProvider).stubClass;
      stubClass({
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
      await expect(provider.getNodes(undefined)).to.eventually.be.rejected;
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
    it("applies filtering on query definitions", async () => {
      const stubClass = createGetClassStub(metadataProvider).stubClass;
      stubClass({
        schemaName: "a",
        className: "b",
        is: async (fullClassName) => fullClassName === "a.b",
      });
      queryExecutor.createQueryReader.returns(
        createFakeQueryReader([
          {
            [NodeSelectClauseColumnNames.FullClassName]: "a.b",
            [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
            [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
            [ECSQL_COLUMN_NAME_FilteredChildrenPaths]: `[[{"className":"c.d","id":"0x456"}]]`,
          },
        ]),
      );
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel(parentNode) {
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
      const nodes = await provider.getNodes(undefined);
      expect(queryExecutor.createQueryReader).to.be.calledOnceWith(
        sinon.match(
          (ecsql) =>
            trimWhitespace(ecsql) ===
            trimWhitespace(
              `
                WITH RECURSIVE FilteringInfo(ECInstanceId, FilteredChildrenPaths) AS (
                  VALUES (0x123, '[[{"className":"c.d","id":"0x456"}]]')
                )
                SELECT * FROM (
                  SELECT
                    [q].*,
                    [f].[FilteredChildrenPaths] AS [FilteredChildrenPaths]
                  FROM (QUERY) [q]
                  JOIN FilteringInfo [f] ON [f].[ECInstanceId] = [q].[ECInstanceId]
                )
                LIMIT 1001
              `,
            ),
        ),
        undefined,
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
      await expect(provider.getNodes(undefined)).to.eventually.be.rejectedWith("test error");
    });

    it("rethrows query executor errors", async () => {
      queryExecutor.createQueryReader.returns({
        async *[Symbol.asyncIterator]() {
          throw new Error("test error");
        },
      });
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
      await expect(provider.getNodes(undefined)).to.eventually.be.rejectedWith("test error");
    });

    it("rethrows query executor errors thrown while determining children", async () => {
      queryExecutor.createQueryReader.returns({
        async *[Symbol.asyncIterator]() {
          throw new Error("test error");
        },
      });
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel(parent) {
          if (!parent) {
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
      await expect(provider.getNodes(undefined)).to.eventually.be.rejectedWith("test error");
    });

    it("sets children flag on parent node to `true` when determining children throws with `rows limit exceeded` error", async () => {
      queryExecutor.createQueryReader.returns({
        async *[Symbol.asyncIterator]() {
          throw new RowsLimitExceededError(999);
        },
      });
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel(parent) {
          if (!parent) {
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

      const rootNodes = await provider.getNodes(undefined);
      expect(rootNodes).to.deep.eq([{ key: "root", label: "root", parentKeys: [], children: true }]);

      await expect(provider.getNodes(rootNodes[0])).to.eventually.be.rejectedWith(RowsLimitExceededError);
    });
  });

  describe("Caching", () => {
    it("doesn't query same root nodes more than once", async () => {
      queryExecutor.createQueryReader.returns(createFakeQueryReader([]));
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel(parentNode) {
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
      await provider.getNodes(undefined);
      await provider.getNodes(undefined);
      expect(queryExecutor.createQueryReader).to.be.calledOnce;
    });

    it("doesn't query same child nodes more than once", async () => {
      queryExecutor.createQueryReader.returns(createFakeQueryReader([]));
      const hierarchyDefinition: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel(parentNode) {
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
      const rootNodes = await provider.getNodes(undefined);
      expect(rootNodes.length).to.eq(1);
      await provider.getNodes(rootNodes[0]);
      await provider.getNodes(rootNodes[0]);
      expect(queryExecutor.createQueryReader).to.be.calledOnce;
    });
  });
});
