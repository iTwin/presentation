/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect, createAsyncIterator, ResolvablePromise, waitFor } from "presentation-test-utilities";
import sinon from "sinon";
import { BeEvent, omit } from "@itwin/core-bentley";
import { GenericInstanceFilter } from "@itwin/core-common";
import { EC, ECSqlQueryDef, ECSqlQueryReaderOptions, InstanceKey, trimWhitespace, TypedPrimitiveValue } from "@itwin/presentation-shared";
import { RowsLimitExceededError } from "../../hierarchies/HierarchyErrors.js";
import { GroupingHierarchyNode, HierarchyNode, ParentHierarchyNode } from "../../hierarchies/HierarchyNode.js";
import { GroupingNodeKey } from "../../hierarchies/HierarchyNodeKey.js";
import { ECSQL_COLUMN_NAME_FilterClassName, ECSQL_COLUMN_NAME_FilterECInstanceId } from "../../hierarchies/imodel/FilteringHierarchyDefinition.js";
import { DefineHierarchyLevelProps, HierarchyDefinition, NodeParser } from "../../hierarchies/imodel/IModelHierarchyDefinition.js";
import { InstanceHierarchyNodeProcessingParams, ProcessedHierarchyNode, SourceInstanceHierarchyNode } from "../../hierarchies/imodel/IModelHierarchyNode.js";
import { createIModelHierarchyProvider } from "../../hierarchies/imodel/IModelHierarchyProvider.js";
import { LimitingECSqlQueryExecutor } from "../../hierarchies/imodel/LimitingECSqlQueryExecutor.js";
import { NodeSelectClauseColumnNames } from "../../hierarchies/imodel/NodeSelectQueryFactory.js";
import { RowDef } from "../../hierarchies/imodel/TreeNodesReader.js";
import { createIModelAccessStub, createTestGenericNode, createTestGenericNodeKey, createTestInstanceKey, createTestSourceGenericNode } from "../Utils.js";

describe("createIModelHierarchyProvider", () => {
  let imodelAccess: ReturnType<typeof createIModelAccessStub> & {
    createQueryReader: sinon.SinonStub<
      Parameters<LimitingECSqlQueryExecutor["createQueryReader"]>,
      ReturnType<LimitingECSqlQueryExecutor["createQueryReader"]>
    >;
    imodelKey: string;
  };

  beforeEach(() => {
    imodelAccess = {
      ...createIModelAccessStub(),
      createQueryReader: sinon.stub(),
      imodelKey: "test-imodel",
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  it("loads root generic nodes", async () => {
    const node = createTestSourceGenericNode();
    using provider = createIModelHierarchyProvider({
      imodelAccess,
      hierarchyDefinition: {
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
      },
    });
    const nodes = await collect(provider.getNodes({ parentNode: undefined }));
    expect(nodes).to.deep.eq([{ ...node, key: createTestGenericNodeKey({ source: imodelAccess.imodelKey }), parentKeys: [], children: false }]);
  });

  it("loads root instance nodes", async () => {
    imodelAccess.createQueryReader.returns(
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
    using provider = createIModelHierarchyProvider({
      imodelAccess,
      hierarchyDefinition: {
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
      },
    });
    const nodes = await collect(provider.getNodes({ parentNode: undefined }));
    expect(imodelAccess.createQueryReader).to.be.calledOnceWith(query, { rowFormat: "ECSqlPropertyNames" });
    expect(nodes).to.deep.eq([
      {
        key: {
          type: "instances",
          instanceKeys: [{ className: "a.b", id: "0x123", imodelKey: "test-imodel" }],
        },
        parentKeys: [],
        label: "test label",
        children: false,
      } as HierarchyNode,
    ]);
  });

  it("loads child nodes", async () => {
    const rootNode = createTestGenericNode({ key: createTestGenericNodeKey({ id: "root", source: imodelAccess.imodelKey }) });
    const childNode = createTestSourceGenericNode({ key: "child" });
    using provider = createIModelHierarchyProvider({
      imodelAccess,
      hierarchyDefinition: {
        async defineHierarchyLevel({ parentNode }) {
          if (parentNode && HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "root") {
            return [{ node: childNode }];
          }
          return [];
        },
      },
    });

    const nodes = await collect(provider.getNodes({ parentNode: rootNode }));
    const expectedChild = {
      ...childNode,
      key: createTestGenericNodeKey({ id: "child", source: imodelAccess.imodelKey }),
      parentKeys: [rootNode.key],
      children: false,
    };
    expect(nodes).to.deep.eq([expectedChild]);
  });

  [
    {
      parentNode: createTestGenericNode({ key: createTestGenericNodeKey({ id: "generic node", source: "unknown source" }) }) satisfies ParentHierarchyNode,
    },
    {
      parentNode: {
        key: { type: "instances" as const, instanceKeys: [createTestInstanceKey({ imodelKey: "unknown imodel" })] },
        label: "instances node",
        parentKeys: [],
      } satisfies ParentHierarchyNode,
    },
  ].forEach(({ parentNode }) => {
    it(`doesn't load children for ${parentNode.key.type} parent of different source`, async () => {
      const hierarchyDefinition: HierarchyDefinition = {
        async defineHierarchyLevel() {
          return [];
        },
      };
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition,
      });
      const spy = sinon.spy(hierarchyDefinition, "defineHierarchyLevel");

      const nodes = await collect(provider.getNodes({ parentNode }));
      expect(nodes).to.be.empty;
      expect(spy).to.not.be.called;
    });
  });

  describe("Reacting to iModel data changes", () => {
    it("unsubscribes from `imodelChanged` event when disposed", () => {
      const evt = new BeEvent();
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        imodelChanged: evt,
        hierarchyDefinition: {
          async defineHierarchyLevel() {
            return [];
          },
        },
      });
      expect(evt.numberOfListeners).to.eq(1);
      provider[Symbol.dispose]();
      expect(evt.numberOfListeners).to.eq(0);
    });

    it("raises `hierarchyChanged` event on `imodelChanged` event", () => {
      const evt = new BeEvent();
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        imodelChanged: evt,
        hierarchyDefinition: {
          async defineHierarchyLevel() {
            return [];
          },
        },
      });
      const spy = sinon.spy();
      provider.hierarchyChanged.addListener(spy);

      evt.raiseEvent();
      expect(spy).to.be.calledOnce;
    });
  });

  describe("Custom parsing", async () => {
    it("calls hierarchy definition factory parser if supplied", async () => {
      const node: SourceInstanceHierarchyNode = {
        key: { type: "instances", instanceKeys: [{ className: "a.b", id: "0x123" }] },
        label: "test",
        children: false,
      };
      const parser: NodeParser = sinon.stub().returns(node);
      const row: RowDef = {
        [NodeSelectClauseColumnNames.FullClassName]: "a.b",
        [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
        [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
      };
      imodelAccess.createQueryReader.returns(createAsyncIterator([row]));
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
      });
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(parser).to.be.calledOnceWith(row);
      expect(nodes).to.deep.eq([
        { ...node, key: { ...node.key, instanceKeys: node.key.instanceKeys.map((k) => ({ ...k, imodelKey: "test-imodel" })) }, parentKeys: [] },
      ]);
    });

    it("calls hierarchy definition factory parser that returns a promise if supplied", async () => {
      const node: SourceInstanceHierarchyNode = {
        key: { type: "instances", instanceKeys: [{ className: "a.b", id: "0x123" }] },
        label: "test",
        children: false,
      };
      const parser: NodeParser = sinon.stub().resolves(node);
      const row: RowDef = {
        [NodeSelectClauseColumnNames.FullClassName]: "a.b",
        [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
        [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
      };
      imodelAccess.createQueryReader.returns(createAsyncIterator([row]));
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
      });
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(parser).to.be.calledOnceWith(row);
      expect(nodes).to.deep.eq([
        { ...node, key: { ...node.key, instanceKeys: node.key.instanceKeys.map((k) => ({ ...k, imodelKey: "test-imodel" })) }, parentKeys: [] },
      ]);
    });
  });

  describe("Custom processing", () => {
    class TestHierarchyDefinition implements HierarchyDefinition {
      public async preProcessNode<TNode>(node: TNode) {
        return { ...node, isPreprocessed: true };
      }
      public async postProcessNode(node: ProcessedHierarchyNode) {
        return { ...node, isPostprocessed: true };
      }
      public async defineHierarchyLevel({ parentNode }: DefineHierarchyLevelProps) {
        if (!parentNode) {
          return [{ node: createTestSourceGenericNode() }];
        }
        return [];
      }
    }

    describe("Pre-processing", async () => {
      it("calls hierarchy definition factory pre-processor if supplied", async () => {
        const node = createTestSourceGenericNode();
        // const preprocess = sinon.stub().resolves({ ...node, isPreprocessed: true });
        using provider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: {
            preProcessNode: async (n) => ({ ...n, isPreprocessed: true }),
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
          },
        });
        const nodes = await collect(provider.getNodes({ parentNode: undefined }));
        expect(nodes)
          .to.have.lengthOf(1)
          .and.to.containSubset([{ isPreprocessed: true }]);
      });

      it("removes node from hierarchy if pre-processor returns `undefined`", async () => {
        const node = createTestSourceGenericNode();
        const preprocess = sinon.stub().resolves(undefined);
        using provider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: {
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
          },
        });
        const nodes = await collect(provider.getNodes({ parentNode: undefined }));
        expect(preprocess).to.be.calledOnceWith({ ...node, key: createTestGenericNodeKey({ source: imodelAccess.imodelKey }), parentKeys: [] });
        expect(nodes).to.deep.eq([]);
      });

      it("keeps `this` context", async () => {
        const definition = new TestHierarchyDefinition();
        const preprocessSpy = sinon.spy(definition, "preProcessNode");
        using provider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: definition,
        });
        await collect(provider.getNodes({ parentNode: undefined }));
        expect(preprocessSpy).to.be.calledOnce.and.calledOn(definition);
      });
    });

    describe("Post-processing", async () => {
      it("calls hierarchy definition factory post-processor if supplied", async () => {
        const node = createTestSourceGenericNode();
        const postprocess = sinon.stub().resolves({ ...node, isPostprocessed: true });
        using provider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: {
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
          },
        });
        const nodes = await collect(provider.getNodes({ parentNode: undefined }));
        expect(postprocess).to.be.calledOnceWith({
          ...node,
          key: createTestGenericNodeKey({ source: imodelAccess.imodelKey }),
          parentKeys: [],
          children: false,
        });
        expect(nodes)
          .to.have.lengthOf(1)
          .to.containSubset([{ isPostprocessed: true }]);
      });

      it("keeps `this` context", async () => {
        const definition = new TestHierarchyDefinition();
        const postprocessSpy = sinon.spy(definition, "postProcessNode");
        using provider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: definition,
        });
        await collect(provider.getNodes({ parentNode: undefined }));
        expect(postprocessSpy).to.be.calledOnce.and.calledOn(definition);
      });
    });
  });

  describe("Grouping", () => {
    it("returns grouping node children", async () => {
      const propertyClass = imodelAccess.stubEntityClass({
        schemaName: "a",
        className: "b",
        properties: [{ name: "MyProperty", primitiveType: "Integer", isPrimitive: () => true, isNavigation: () => false } as unknown as EC.PrimitiveProperty],
      });
      imodelAccess.createQueryReader.returns(
        createAsyncIterator<RowDef>([
          {
            [NodeSelectClauseColumnNames.FullClassName]: "a.b",
            [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
            [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
            [NodeSelectClauseColumnNames.Grouping]: JSON.stringify({
              byProperties: {
                propertiesClassName: propertyClass.fullName,
                propertyGroups: [{ propertyName: "MyProperty", propertyValue: 123 }],
              },
            } satisfies InstanceHierarchyNodeProcessingParams["grouping"]),
          },
        ]),
      );
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
      });

      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      const expectedKey: GroupingNodeKey = {
        type: "property-grouping:value",
        propertyClassName: propertyClass.fullName,
        propertyName: "MyProperty",
        formattedPropertyValue: "123",
      };
      expect(rootNodes).to.deep.eq([
        {
          key: expectedKey,
          parentKeys: [],
          groupedInstanceKeys: [{ className: "a.b", id: "0x123", imodelKey: "test-imodel" }],
          label: "123",
          children: true,
        } satisfies GroupingHierarchyNode,
      ]);

      const childNodes = await collect(provider.getNodes({ parentNode: rootNodes[0] }));
      expect(childNodes).to.deep.eq([
        {
          key: {
            type: "instances",
            instanceKeys: [{ className: "a.b", id: "0x123", imodelKey: "test-imodel" }],
          },
          parentKeys: [expectedKey],
          label: "test label",
          children: false,
        } satisfies HierarchyNode,
      ]);
    });
  });

  describe("Hiding hierarchy levels", () => {
    it("hides root hierarchy level", async () => {
      const rootNode = createTestSourceGenericNode({ key: "root", processingParams: { hideInHierarchy: true } });
      const childNode = createTestSourceGenericNode({ key: "visible child" });
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: rootNode }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "root") {
              return [{ node: childNode }];
            }
            return [];
          },
        },
      });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes).to.deep.eq([
        {
          ...childNode,
          key: createTestGenericNodeKey({ id: "visible child", source: imodelAccess.imodelKey }),
          parentKeys: [createTestGenericNodeKey({ id: "root", source: imodelAccess.imodelKey })],
          children: false,
        },
      ]);
    });

    it("determines children when immediate child node is hidden", async () => {
      const rootNode = createTestSourceGenericNode({ key: "root" });
      const hiddenChildNode = createTestSourceGenericNode({
        key: "hidden child",
        processingParams: { hideInHierarchy: true },
      });
      const visibleChildNode = createTestSourceGenericNode({ key: "visible child" });
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: rootNode }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "root") {
              return [{ node: hiddenChildNode }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "hidden child") {
              return [{ node: visibleChildNode }];
            }
            return [];
          },
        },
      });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes).to.deep.eq([
        { ...rootNode, key: createTestGenericNodeKey({ id: "root", source: imodelAccess.imodelKey }), parentKeys: [], children: true },
      ]);
      const childNodes = await collect(provider.getNodes({ parentNode: rootNodes[0] }));
      expect(childNodes).to.deep.eq([
        {
          ...visibleChildNode,
          key: createTestGenericNodeKey({ id: "visible child", source: imodelAccess.imodelKey }),
          parentKeys: [
            createTestGenericNodeKey({ id: "root", source: imodelAccess.imodelKey }),
            createTestGenericNodeKey({ id: "hidden child", source: imodelAccess.imodelKey }),
          ],
          children: false,
        },
      ]);
    });

    // note: the feature of not checking children for nodes that say they do have them is very important for performance - this test
    // should not be removed
    it("doesn't load children of hidden child node when determining parent's children if the hidden child says it always has children", async () => {
      const rootNode = createTestSourceGenericNode({ key: "root" });
      const hiddenChildNode = createTestSourceGenericNode({
        key: "hidden child",
        processingParams: { hideInHierarchy: true },
        children: true,
      });
      const visibleChildNode = createTestSourceGenericNode({ key: "visible child" });
      const hierarchyDefinition = {
        defineHierarchyLevel: sinon.fake(async ({ parentNode }) => {
          if (!parentNode) {
            return [{ node: rootNode }];
          }
          if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "root") {
            return [{ node: hiddenChildNode }];
          }
          if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "hidden child") {
            return [{ node: visibleChildNode }];
          }
          return [];
        }),
      };
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition,
      });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes).to.deep.eq([
        { ...rootNode, key: createTestGenericNodeKey({ id: "root", source: imodelAccess.imodelKey }), parentKeys: [], children: true },
      ]);
      expect(hierarchyDefinition.defineHierarchyLevel).to.be.calledTwice;
      expect(hierarchyDefinition.defineHierarchyLevel.firstCall).to.be.calledWith({ parentNode: undefined });
      expect(hierarchyDefinition.defineHierarchyLevel.secondCall).to.be.calledWith({ parentNode: rootNodes[0] });
    });
  });

  describe("Hiding nodes without children", () => {
    it("hides node without children", async () => {
      const rootNode = createTestSourceGenericNode({ key: "root" });
      const hiddenChildNode = createTestSourceGenericNode({
        key: "hidden child",
        processingParams: { hideIfNoChildren: true },
      });
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: rootNode }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "root") {
              return [{ node: hiddenChildNode }];
            }
            return [];
          },
        },
      });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes).to.deep.eq([
        { ...rootNode, key: createTestGenericNodeKey({ id: "root", source: imodelAccess.imodelKey }), parentKeys: [], children: false },
      ]);
      const childNodes = await collect(provider.getNodes({ parentNode: rootNodes[0] }));
      expect(childNodes).to.deep.eq([]);
    });

    it("doesn't hide node with children", async () => {
      const rootNode = createTestSourceGenericNode({ key: "root" });
      const hiddenChildNode = createTestSourceGenericNode({
        key: "hidden child",
        processingParams: { hideIfNoChildren: true },
      });
      const grandChildNode = createTestSourceGenericNode({ key: "grand child", children: false });
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: rootNode }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "root") {
              return [{ node: hiddenChildNode }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "hidden child") {
              return [{ node: grandChildNode }];
            }
            return [];
          },
        },
      });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes).to.deep.eq([
        { ...rootNode, key: createTestGenericNodeKey({ id: "root", source: imodelAccess.imodelKey }), parentKeys: [], children: true },
      ]);
      const childNodes = await collect(provider.getNodes({ parentNode: rootNodes[0] }));
      expect(childNodes).to.deep.eq([
        omit(
          {
            ...hiddenChildNode,
            key: createTestGenericNodeKey({ id: "hidden child", source: imodelAccess.imodelKey }),
            parentKeys: [createTestGenericNodeKey({ id: "root", source: imodelAccess.imodelKey })],
            children: true,
          },
          ["processingParams"],
        ),
      ]);
      const grandChildNodes = await collect(provider.getNodes({ parentNode: childNodes[0] }));
      expect(grandChildNodes).to.deep.eq([
        {
          ...grandChildNode,
          key: createTestGenericNodeKey({ id: "grand child", source: imodelAccess.imodelKey }),
          parentKeys: [
            createTestGenericNodeKey({ id: "root", source: imodelAccess.imodelKey }),
            createTestGenericNodeKey({ id: "hidden child", source: imodelAccess.imodelKey }),
          ],
          children: false,
        },
      ]);
    });
  });

  describe("Labels formatting", () => {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const formatter = sinon.fake(async (v: TypedPrimitiveValue) => `_${v.value.toString()}_`);

    afterEach(() => {
      formatter.resetHistory();
    });

    it("returns formatted label", async () => {
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel() {
            return [{ node: createTestSourceGenericNode({ label: "test label", children: false }) }];
          },
        },
        formatter,
      });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(formatter).to.be.calledOnceWith({ value: "test label", type: "String" });
      expect(rootNodes[0].label).to.eq("_test label_");
    });
  });

  describe("Hierarchy filtering", () => {
    it("triggers `hierarchyChanged` event when filter is set", () => {
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel() {
            return [];
          },
        },
      });

      const hierarchyChangedListener = sinon.spy();
      provider.hierarchyChanged.addListener(hierarchyChangedListener);

      // setting a filter should trigger `hierarchyChangedListener`
      const filter = { paths: [] };
      provider.setHierarchyFilter(filter);
      expect(hierarchyChangedListener).to.be.calledOnceWith({ filterChange: { newFilter: filter } });
      hierarchyChangedListener.resetHistory();

      // setting to `undefined` should trigger `hierarchyChangedListener`
      provider.setHierarchyFilter(undefined);
      expect(hierarchyChangedListener).to.be.calledOnceWith({ filterChange: { newFilter: undefined } });
    });

    it("applies filtering on query definitions", async () => {
      imodelAccess.stubEntityClass({
        schemaName: "a",
        className: "b",
        is: async (fullClassName) => fullClassName === "a.b",
      });

      imodelAccess.createQueryReader.callsFake(() =>
        createAsyncIterator<
          RowDef & {
            [ECSQL_COLUMN_NAME_FilterECInstanceId]: string;
            [ECSQL_COLUMN_NAME_FilterClassName]: string;
          }
        >([
          {
            [NodeSelectClauseColumnNames.FullClassName]: "a.b",
            [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
            [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
            [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x123",
            [ECSQL_COLUMN_NAME_FilterClassName]: "a.b",
          },
        ]),
      );
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
        filtering: {
          paths: [
            [
              { className: "a.b", id: "0x123" },
              { className: "c.d", id: "0x456" },
            ],
          ],
        },
      });
      let nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(imodelAccess.createQueryReader).to.be.calledOnceWith(
        sinon.match(
          (query) =>
            trimWhitespace(query.ctes[0]) ===
              trimWhitespace(
                `
                FilteringInfo(ECInstanceId, FilterClassName) AS (
                SELECT
                  ECInstanceId,
                  'a.b' AS FilterClassName
                FROM
                  a.b
                WHERE
                  ECInstanceId IN (0x123)
              )`,
              ) &&
            trimWhitespace(query.ecsql) ===
              trimWhitespace(
                `
                SELECT
                    [q].*,
                    IdToHex([f].[ECInstanceId]) AS [${ECSQL_COLUMN_NAME_FilterECInstanceId}],
                    [f].[FilterClassName] AS [${ECSQL_COLUMN_NAME_FilterClassName}]
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
            instanceKeys: [{ className: "a.b", id: "0x123", imodelKey: "test-imodel" }],
          },
          parentKeys: [],
          label: "test label",
          children: false,
          filtering: {
            filteredChildrenIdentifierPaths: [{ path: [{ className: "c.d", id: "0x456" }], options: undefined }],
          },
        },
      ]);

      // reset the filter and confirm the query is not filtered anymore
      provider.setHierarchyFilter(undefined);
      imodelAccess.createQueryReader.resetHistory();
      nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(imodelAccess.createQueryReader).to.be.calledOnceWith(
        sinon.match((query) => query.ecsql === "QUERY"),
        { rowFormat: "ECSqlPropertyNames" },
      );
      expect(nodes).to.deep.eq([
        {
          key: {
            type: "instances",
            instanceKeys: [{ className: "a.b", id: "0x123", imodelKey: "test-imodel" }],
          },
          parentKeys: [],
          label: "test label",
          children: false,
        },
      ]);
    });

    it("applies child nodes filter when hierarchy filter is set in-between requests", async () => {
      imodelAccess.stubEntityClass({
        schemaName: "a",
        className: "b",
        is: async (fullClassName) => fullClassName === "a.b",
      });
      imodelAccess.stubEntityClass({
        schemaName: "c",
        className: "d",
        is: async (fullClassName) => fullClassName === "c.d",
      });

      const rootNodePromise = new ResolvablePromise<
        RowDef & {
          [ECSQL_COLUMN_NAME_FilterECInstanceId]: string;
          [ECSQL_COLUMN_NAME_FilterClassName]: string;
        }
      >();
      const childNodePromise = new ResolvablePromise<
        RowDef & {
          [ECSQL_COLUMN_NAME_FilterECInstanceId]: string;
          [ECSQL_COLUMN_NAME_FilterClassName]: string;
        }
      >();
      imodelAccess.createQueryReader.callsFake(async function* ({ ecsql, ctes }) {
        if (ecsql.includes("ROOT QUERY")) {
          yield await rootNodePromise;
          return;
        }
        if (ecsql.includes("CHILDREN QUERY")) {
          // ctes is empty for non-filtered case and has one item for filtered case
          if (!ctes?.length) {
            yield await childNodePromise;
          }
          return;
        }
      });
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: "a.b",
                  query: { ecsql: "ROOT QUERY" },
                },
              ];
            }
            return [
              {
                fullClassName: "a.b",
                query: { ecsql: "CHILDREN QUERY" },
              },
            ];
          },
        },
      });

      // request non-filtered root nodes
      const unfilteredRootNodeIter = provider.getNodes({ parentNode: undefined }).next();
      await waitFor(() => expect(imodelAccess.createQueryReader).to.be.calledOnce);

      // set the filter and request filtered nodes AFTER the root node query has been executed
      provider.setHierarchyFilter({
        paths: [
          [
            { className: "a.b", id: "0x123" },
            { className: "c.d", id: "0x456" },
          ],
        ],
      });
      const filteredRootNodeIter = provider.getNodes({ parentNode: undefined }).next();

      // all requests are made in correct order, now resolve the responses
      await rootNodePromise.resolve({
        [NodeSelectClauseColumnNames.FullClassName]: "a.b",
        [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
        [NodeSelectClauseColumnNames.DisplayLabel]: "ab",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x123",
        [ECSQL_COLUMN_NAME_FilterClassName]: "a.b",
      });
      await childNodePromise.resolve({
        [NodeSelectClauseColumnNames.FullClassName]: "c.d",
        [NodeSelectClauseColumnNames.ECInstanceId]: "0x456",
        [NodeSelectClauseColumnNames.DisplayLabel]: "cd",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x456",
        [ECSQL_COLUMN_NAME_FilterClassName]: "c.d",
      });

      // setting instance filter while a nodes request is in progress cancels the request - ensure we get undefined
      const unfilteredRootNode = (await unfilteredRootNodeIter).value;
      expect(unfilteredRootNode).to.be.undefined;

      // ensure the filtered node resolves with `children: false` and has filtering props
      const filteredRootNode = (await filteredRootNodeIter).value;
      expect(filteredRootNode).to.containSubset({
        key: {
          type: "instances",
          instanceKeys: [{ className: "a.b", id: "0x123" }],
        },
        children: false,
        filtering: {
          filteredChildrenIdentifierPaths: [{ path: [{ className: "c.d", id: "0x456" }], options: undefined }],
        },
      });

      // ensure requesting children for the filtered node returns empty list
      const filteredChildren = await collect(provider.getNodes({ parentNode: filteredRootNode }));
      expect(filteredChildren).to.be.empty;
    });

    it("applies grouped nodes filter when hierarchy filter is set in-between requests", async () => {
      imodelAccess.stubEntityClass({
        schemaName: "a",
        className: "b",
        is: async (fullClassName) => fullClassName === "a.b",
      });

      const rootNodePromise = new ResolvablePromise<RowDef>();
      imodelAccess.createQueryReader.callsFake(async function* ({ ecsql, ctes }) {
        if (ecsql.includes("ROOT QUERY")) {
          yield {
            [NodeSelectClauseColumnNames.FullClassName]: "a.b",
            [NodeSelectClauseColumnNames.ECInstanceId]: "0x456",
            [NodeSelectClauseColumnNames.DisplayLabel]: "ab",
            [NodeSelectClauseColumnNames.Grouping]: JSON.stringify({
              byLabel: true,
            } satisfies InstanceHierarchyNodeProcessingParams["grouping"]),
          };

          // ctes is empty for non-filtered case and has one item for filtered case
          if (!ctes?.length) {
            yield await rootNodePromise;
          }
          return;
        }
      });
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: "a.b",
                  query: { ecsql: "ROOT QUERY" },
                },
              ];
            }
            return [];
          },
        },
      });

      // request non-filtered root nodes
      const unfilteredRootNodeIter = provider.getNodes({ parentNode: undefined }).next();
      await waitFor(() => expect(imodelAccess.createQueryReader).to.be.calledOnce);

      // set the filter and request filtered nodes AFTER the root node query has been executed
      provider.setHierarchyFilter({
        paths: [[{ className: "a.b", id: "0x456" }]],
      });
      const filteredRootNodeIter = provider.getNodes({ parentNode: undefined }).next();

      // all requests are made in correct order, now resolve the responses
      await rootNodePromise.resolve({
        [NodeSelectClauseColumnNames.FullClassName]: "a.b",
        [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
        [NodeSelectClauseColumnNames.DisplayLabel]: "ab",
        [NodeSelectClauseColumnNames.Grouping]: JSON.stringify({
          byLabel: true,
        } satisfies InstanceHierarchyNodeProcessingParams["grouping"]),
      });

      // setting instance filter while a nodes request is in progress cancels the request - ensure we get undefined
      const unfilteredRootNode = (await unfilteredRootNodeIter).value;
      expect(unfilteredRootNode).to.be.undefined;

      // ensure we do get the filtered grouping node
      const filteredRootNode = (await filteredRootNodeIter).value;
      expect(filteredRootNode).to.containSubset({
        key: {
          type: "label-grouping",
          label: "ab",
        },
      } satisfies Partial<HierarchyNode>);

      // ensure requesting children for the filtered node returns one grouped node
      expect(await collect(provider.getNodes({ parentNode: filteredRootNode }))).to.have.lengthOf(1);
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
      const rootNode = createTestSourceGenericNode({ key: "root", processingParams: { hideIfNoChildren: true } });
      const childNode = createTestSourceGenericNode({ key: "child", children: true });
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode, instanceFilter: requestedFilter }) {
            if (!parentNode) {
              // simulate the root node matching requested instance filter
              expect(requestedFilter).to.eq(instanceFilter);
              return [{ node: rootNode }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "root") {
              // we're expecting the filter to be used only for root nodes
              expect(requestedFilter).to.be.undefined;
              return requestedFilter ? [] : [{ node: childNode }];
            }
            return [];
          },
        },
      });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined, instanceFilter }));
      expect(rootNodes).to.deep.eq([createTestGenericNode({ key: createTestGenericNodeKey({ id: "root", source: imodelAccess.imodelKey }), children: true })]);
    });
  });

  describe("Hierarchy level instance keys", () => {
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
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel() {
            return [];
          },
        },
      });
      const keys = await collect(provider.getNodeInstanceKeys({ parentNode: groupingNode }));
      expect(keys).to.deep.eq(groupingNode.groupedInstanceKeys);
    });

    it("returns empty list for parent generic node", async () => {
      const genericNode = createTestSourceGenericNode({
        key: "custom",
        label: "test",
        children: false,
      });
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: genericNode }];
            }
            return [];
          },
        },
      });
      const keys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined }));
      expect(keys).to.be.empty;
    });

    it("returns instance nodes' keys", async () => {
      imodelAccess.createQueryReader.returns(
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
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
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
      imodelAccess.createQueryReader.returns(
        createAsyncIterator([
          {
            [0]: "a.b",
            [1]: "0x123",
            [2]: false,
          },
        ]),
      );
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: customNode }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "custom") {
              return [
                {
                  fullClassName: "x.y",
                  query: { ecsql: "query" },
                },
              ];
            }
            return [];
          },
        },
      });
      const keys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined }));
      expect(keys)
        .to.have.lengthOf(1)
        .and.to.containSubset([{ className: "a.b", id: "0x123" }]);
    });

    it("returns child instance nodes' keys of hidden instance node", async () => {
      imodelAccess.createQueryReader.onFirstCall().returns(
        createAsyncIterator([
          {
            [0]: "a.b",
            [1]: "0x123",
            [2]: true,
          },
        ]),
      );
      imodelAccess.createQueryReader.onSecondCall().returns(
        createAsyncIterator([
          {
            [0]: "c.d",
            [1]: "0x456",
            [2]: false,
          },
        ]),
      );
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
      });
      const keys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined }));
      expect(keys)
        .to.have.lengthOf(1)
        .and.to.containSubset([{ className: "c.d", id: "0x456" }]);
    });

    it("merges same-class instance keys under a single parent node when requesting child node keys for hidden parent instance nodes", async () => {
      imodelAccess.createQueryReader.onFirstCall().returns(
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
      imodelAccess.createQueryReader.onSecondCall().returns(
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
      using provider = createIModelHierarchyProvider({
        imodelAccess,
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

    it("applies instance filter", async () => {
      imodelAccess.createQueryReader.returns(
        createAsyncIterator([
          {
            [0]: "a.b",
            [1]: "0x123",
            [2]: false,
          },
          {
            [0]: "a.b",
            [1]: "0x456",
            [2]: false,
          },
        ]),
      );
      const hierarchyDefinition = {
        defineHierarchyLevel: sinon.fake(async ({ parentNode, instanceFilter: requestedInstanceFilter }: DefineHierarchyLevelProps) => {
          if (parentNode === undefined && requestedInstanceFilter) {
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: "root" },
              },
            ];
          }
          return [];
        }),
      };
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition,
      });
      const keys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined, instanceFilter }));
      expect(keys)
        .to.have.lengthOf(2)
        .and.to.containSubset([
          { className: "a.b", id: "0x123" },
          { className: "a.b", id: "0x456" },
        ]);
      expect(hierarchyDefinition.defineHierarchyLevel).to.be.calledOnce;
      expect(hierarchyDefinition.defineHierarchyLevel.firstCall).to.be.calledWithMatch(
        (arg: DefineHierarchyLevelProps) => arg.parentNode === undefined && arg.instanceFilter === instanceFilter,
      );
    });

    it("applies hierarchy level size limit", async () => {
      imodelAccess.createQueryReader.returns(
        createAsyncIterator([
          {
            [0]: "a.b",
            [1]: "0x123",
            [2]: false,
          },
        ]),
      );
      const hierarchyDefinition = {
        defineHierarchyLevel: sinon.fake(async ({ parentNode }: DefineHierarchyLevelProps) => {
          if (parentNode === undefined) {
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: "root" },
              },
            ];
          }
          return [];
        }),
      };
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition,
      });
      const keys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined, hierarchyLevelSizeLimit: 1 }));
      expect(keys)
        .to.have.lengthOf(1)
        .and.to.containSubset([{ className: "a.b", id: "0x123" }]);
      expect(hierarchyDefinition.defineHierarchyLevel).to.be.calledOnce;
      expect(imodelAccess.createQueryReader).to.be.calledOnce;
      expect(imodelAccess.createQueryReader).to.be.calledWithMatch(
        sinon.match.any,
        (config?: ECSqlQueryReaderOptions & { limit?: number | "unbounded" }) => config?.limit === 1,
      );
    });
  });

  describe("Error handling", () => {
    it("rethrows hierarchy definitions' factory errors", async () => {
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel() {
            throw new Error("test error");
          },
        },
      });
      await expect(provider.getNodes({ parentNode: undefined }).next()).to.eventually.be.rejectedWith("test error");
      await expect(provider.getNodeInstanceKeys({ parentNode: undefined }).next()).to.eventually.be.rejectedWith("test error");
    });

    it("rethrows query executor errors", async () => {
      imodelAccess.createQueryReader.callsFake(() =>
        (async function* () {
          throw new Error("test error");
        })(),
      );
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel() {
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: "QUERY" },
              },
            ];
          },
        },
      });
      await expect(provider.getNodes({ parentNode: undefined }).next()).to.eventually.be.rejectedWith("test error");
      await expect(provider.getNodeInstanceKeys({ parentNode: undefined }).next()).to.eventually.be.rejectedWith("test error");
    });

    it("rethrows query executor errors thrown while determining children", async () => {
      imodelAccess.createQueryReader.callsFake(() =>
        (async function* () {
          throw new Error("test error");
        })(),
      );
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: createTestSourceGenericNode({ key: "root" }) }];
            }
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: "QUERY" },
              },
            ];
          },
        },
      });
      await expect(provider.getNodes({ parentNode: undefined }).next()).to.eventually.be.rejectedWith("test error");
    });

    it("sets children flag on parent node to `true` when determining children throws with `rows limit exceeded` error", async () => {
      imodelAccess.createQueryReader.callsFake(() =>
        (async function* () {
          throw new RowsLimitExceededError(123);
        })(),
      );
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: createTestSourceGenericNode({ key: "root" }) }];
            }
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: "QUERY" },
              },
            ];
          },
        },
      });

      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes).to.deep.eq([createTestGenericNode({ key: createTestGenericNodeKey({ id: "root", source: imodelAccess.imodelKey }), children: true })]);

      await expect(provider.getNodes({ parentNode: rootNodes[0] }).next()).to.eventually.be.rejectedWith(RowsLimitExceededError);
    });
  });

  describe("Caching", () => {
    it("doesn't query same root nodes more than once", async () => {
      imodelAccess.createQueryReader.returns(createAsyncIterator([]));
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
        queryCacheSize: 10,
      });
      await collect(provider.getNodes({ parentNode: undefined }));
      await collect(provider.getNodes({ parentNode: undefined }));
      expect(imodelAccess.createQueryReader).to.be.calledOnce;
    });

    it("doesn't query same child nodes more than once", async () => {
      imodelAccess.createQueryReader.returns(createAsyncIterator([]));
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: createTestSourceGenericNode({ key: "root" }) }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "root") {
              return [
                {
                  fullClassName: "x.y",
                  query: { ecsql: "QUERY" },
                },
              ];
            }
            return [];
          },
        },
        queryCacheSize: 10,
      });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes.length).to.eq(1);
      await collect(provider.getNodes({ parentNode: rootNodes[0] }));
      await collect(provider.getNodes({ parentNode: rootNodes[0] }));
      expect(imodelAccess.createQueryReader).to.be.calledOnce;
    });

    it("queries the same nodes more than once when `queryCacheSize` is set to `0`", async () => {
      imodelAccess.createQueryReader.returns(createAsyncIterator([]));
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
        queryCacheSize: 0,
      });
      await collect(provider.getNodes({ parentNode: undefined }));
      await collect(provider.getNodes({ parentNode: undefined }));
      expect(imodelAccess.createQueryReader).to.be.calledTwice;
    });

    it("queries the same root nodes more than once when `ignoreCache` is set to true", async () => {
      imodelAccess.createQueryReader.returns(createAsyncIterator([]));
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
        queryCacheSize: 10,
      });
      await collect(provider.getNodes({ parentNode: undefined }));
      await collect(provider.getNodes({ parentNode: undefined, ignoreCache: true }));
      expect(imodelAccess.createQueryReader).to.be.calledTwice;
    });

    it("queries variations of the same hierarchy level", async () => {
      imodelAccess.createQueryReader.returns(createAsyncIterator([]));
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
        queryCacheSize: 10,
      });
      await collect(provider.getNodes({ parentNode: undefined }));
      await collect(provider.getNodes({ parentNode: undefined, instanceFilter: {} as GenericInstanceFilter })); // variation of previous, so should cause a query
      await collect(provider.getNodes({ parentNode: undefined, instanceFilter: {} as GenericInstanceFilter })); // same as previous, so this one one shouldn't cause a query
      expect(imodelAccess.createQueryReader).to.be.calledTwice;
    });

    it("queries grouped instance nodes when requesting grouped children if the query is pushed-out of cache", async () => {
      imodelAccess.stubEntityClass({ schemaName: "x", className: "y", classLabel: "Class Y" });
      imodelAccess.createQueryReader.callsFake((query) => {
        if (query.ecsql.includes("ROOT")) {
          return createAsyncIterator<RowDef>([
            {
              [NodeSelectClauseColumnNames.FullClassName]: `x.y`,
              [NodeSelectClauseColumnNames.ECInstanceId]: `0x1`,
              [NodeSelectClauseColumnNames.DisplayLabel]: `one`,
              [NodeSelectClauseColumnNames.HasChildren]: true,
              [NodeSelectClauseColumnNames.Grouping]: JSON.stringify({
                byClass: true,
              } satisfies InstanceHierarchyNodeProcessingParams["grouping"]),
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
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
        queryCacheSize: 1,
      });

      // requesting root nodes should query root instance nodes and return a class grouping node
      const groupingNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(imodelAccess.createQueryReader).to.be.calledOnceWith(sinon.match((query) => query.ecsql === "ROOT"));
      expect(groupingNodes).to.deep.eq([
        {
          key: {
            type: "class-grouping",
            className: "x.y",
          },
          groupedInstanceKeys: [{ className: "x.y", id: "0x1", imodelKey: "test-imodel" }],
          parentKeys: [],
          label: "Class Y",
          children: true,
        } satisfies GroupingHierarchyNode,
      ]);

      // requesting children for the class grouping node shouldn't execute a query and should return the instance node
      const rootInstanceNodes = await collect(provider.getNodes({ parentNode: groupingNodes[0] }));
      expect(imodelAccess.createQueryReader).to.be.calledOnce;
      expect(rootInstanceNodes).to.deep.eq([
        {
          key: {
            type: "instances",
            instanceKeys: [{ className: "x.y", id: "0x1", imodelKey: "test-imodel" }],
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
      imodelAccess.createQueryReader.resetHistory();

      // requesting children for the root instance node should push grouping node child instance nodes out of cache
      const childInstanceNodes = await collect(provider.getNodes({ parentNode: rootInstanceNodes[0] }));
      expect(imodelAccess.createQueryReader).to.be.calledOnceWith(sinon.match((query) => query.ecsql === "CHILD"));
      expect(childInstanceNodes).to.deep.eq([
        {
          key: {
            type: "instances",
            instanceKeys: [{ className: "x.y", id: "0x2", imodelKey: "test-imodel" }],
          },
          parentKeys: [
            {
              type: "class-grouping",
              className: "x.y",
            },
            {
              type: "instances",
              instanceKeys: [{ className: "x.y", id: "0x1", imodelKey: "test-imodel" }],
            },
          ],
          label: "two",
          children: false,
        } as HierarchyNode,
      ]);
      imodelAccess.createQueryReader.resetHistory();

      // requesting children for the class grouping node again should re-execute the root query, filtered by grouped instance ECInstanceIds
      const rootInstanceNodes2 = await collect(provider.getNodes({ parentNode: groupingNodes[0] }));
      expect(imodelAccess.createQueryReader).to.be.calledOnceWith(
        sinon.match((query: ECSqlQueryDef) => query.ecsql.includes("FROM (ROOT)") && query?.bindings?.length === 1 && query?.bindings?.at(0)?.value === "0x1"),
      );
      expect(rootInstanceNodes2).to.deep.eq(rootInstanceNodes);
      imodelAccess.createQueryReader.resetHistory();

      // requesting root nodes again should re-execute the root query, NOT filtered by grouped instance ECInstanceIds
      const groupingNodes2 = await collect(provider.getNodes({ parentNode: undefined }));
      expect(imodelAccess.createQueryReader).to.be.calledOnceWith(
        sinon.match((query: ECSqlQueryDef) => query.ecsql === "ROOT" && query?.bindings === undefined),
      );
      expect(groupingNodes2).to.deep.eq(groupingNodes);
    });

    it("clears cache on data source change", async () => {
      imodelAccess.createQueryReader.returns(createAsyncIterator([]));
      const imodelChanged = new BeEvent();
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        imodelChanged,
        hierarchyDefinition: {
          async defineHierarchyLevel() {
            return [
              {
                fullClassName: "x.y",
                query: { ecsql: "QUERY" },
              },
            ];
          },
        },
      });
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([]);
      expect(imodelAccess.createQueryReader).to.be.calledOnce;
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([]);
      expect(imodelAccess.createQueryReader).to.be.calledOnce;

      imodelChanged.raiseEvent();
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([]);
      expect(imodelAccess.createQueryReader).to.be.calledTwice;
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([]);
      expect(imodelAccess.createQueryReader).to.be.calledTwice;
    });
  });

  describe("setFormatter", () => {
    after(() => {
      sinon.restore();
    });

    it("raises `hierarchyChanged` event with new formatter", async () => {
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel() {
            return [];
          },
        },
      });

      const hierarchyChangedListener = sinon.spy();
      provider.hierarchyChanged.addListener(hierarchyChangedListener);

      // setting to custom formatter should trigger `hierarchyChangedListener` with the new formatter
      const formatter = async () => `doesn't matter`;
      provider.setFormatter(formatter);
      expect(hierarchyChangedListener).to.be.calledOnceWith({ formatterChange: { newFormatter: formatter } });
      hierarchyChangedListener.resetHistory();

      // setting to `undefined` should trigger `hierarchyChangedListener` with the default formatter
      provider.setFormatter(undefined);
      expect(hierarchyChangedListener).to.be.calledOnceWith({
        formatterChange: { newFormatter: sinon.match((x) => typeof x === "function" && x !== formatter) },
      });
    });

    it("`getNodes` doesn't re-query with same props and a different formatter", async () => {
      imodelAccess.createQueryReader.callsFake(() =>
        createAsyncIterator<RowDef>([
          {
            [NodeSelectClauseColumnNames.FullClassName]: "a.b",
            [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
            [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
            [NodeSelectClauseColumnNames.HasChildren]: false,
          },
        ]),
      );
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
      });

      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.containSubset([{ label: "test label" }]);

      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      provider.setFormatter(async (val: TypedPrimitiveValue) => `_formatted_${val.value.toString()}`);
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.containSubset([{ label: "_formatted_test label" }]);
      expect(imodelAccess.createQueryReader).to.be.calledOnce;
    });

    it("`getNodes` uses formatter that is provided to `setFormatter`", async () => {
      const node = createTestSourceGenericNode({ children: false });
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
      });
      expect((await collect(provider.getNodes({ parentNode: undefined }))).map((n) => n.label)).to.deep.eq([node.label]);
      provider.setFormatter(async (val: TypedPrimitiveValue) => `_formatted_${JSON.stringify(val)}`);
      expect((await collect(provider.getNodes({ parentNode: undefined }))).map((n) => n.label)).to.deep.eq([
        `_formatted_${JSON.stringify({ value: node.label, type: "String" })}`,
      ]);
    });

    it("`getNodes` uses default formatter when `setFormatter` is provided an `undefined` value", async () => {
      const node = createTestSourceGenericNode({ children: false });
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
        formatter: async (val: TypedPrimitiveValue) => `_formatted_${JSON.stringify(val)}`,
      });
      expect((await collect(provider.getNodes({ parentNode: undefined }))).map((n) => n.label)).to.deep.eq([
        `_formatted_${JSON.stringify({ value: node.label, type: "String" })}`,
      ]);
      provider.setFormatter(undefined);
      expect((await collect(provider.getNodes({ parentNode: undefined }))).map((n) => n.label)).to.deep.eq([node.label]);
    });
  });
});
