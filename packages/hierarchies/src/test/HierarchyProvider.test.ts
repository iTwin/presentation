/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect, createAsyncIterator } from "presentation-test-utilities";
import sinon from "sinon";
import { omit } from "@itwin/core-bentley";
import { GenericInstanceFilter } from "@itwin/core-common";
import { ECSqlQueryDef, ECSqlQueryReaderOptions, InstanceKey, trimWhitespace, TypedPrimitiveValue } from "@itwin/presentation-shared";
import { DefineHierarchyLevelProps, HierarchyDefinition } from "../hierarchies/HierarchyDefinition";
import { RowsLimitExceededError } from "../hierarchies/HierarchyErrors";
import {
  GroupingHierarchyNode,
  HierarchyNode,
  ProcessedCustomHierarchyNode,
  ProcessedHierarchyNode,
  ProcessedInstanceHierarchyNode,
} from "../hierarchies/HierarchyNode";
import { GroupingNodeKey } from "../hierarchies/HierarchyNodeKey";
import { createHierarchyProvider } from "../hierarchies/HierarchyProvider";
import {
  ECSQL_COLUMN_NAME_FilteredChildrenPaths,
  ECSQL_COLUMN_NAME_HasFilterTargetAncestor,
  ECSQL_COLUMN_NAME_IsFilterTarget,
} from "../hierarchies/internal/FilteringHierarchyDefinition";
import { RowDef } from "../hierarchies/internal/TreeNodesReader";
import { LimitingECSqlQueryExecutor } from "../hierarchies/LimitingECSqlQueryExecutor";
import { NodeSelectClauseColumnNames, NodesQueryClauseFactory } from "../hierarchies/NodeSelectQueryFactory";
import { createIModelAccessStub } from "./Utils";

describe("createHierarchyProvider", () => {
  let imodelAccess: ReturnType<typeof createIModelAccessStub> & {
    createQueryReader: sinon.SinonStub<
      Parameters<LimitingECSqlQueryExecutor["createQueryReader"]>,
      ReturnType<LimitingECSqlQueryExecutor["createQueryReader"]>
    >;
  };

  beforeEach(() => {
    imodelAccess = {
      ...createIModelAccessStub(),
      createQueryReader: sinon.stub(),
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  it("loads root custom nodes", async () => {
    const node = { key: "custom", label: "custom", children: false };
    const provider = createHierarchyProvider({
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
    expect(nodes).to.deep.eq([{ ...node, parentKeys: [] }]);
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
    const provider = createHierarchyProvider({
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
    const provider = createHierarchyProvider({
      imodelAccess,
      hierarchyDefinition: {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [{ node: rootNode }];
          }
          if (parentNode === rootNode) {
            return [{ node: childNode }];
          }
          return [];
        },
      },
    });

    const nodes = await collect(provider.getNodes({ parentNode: rootNode }));
    const expectedChild = { ...childNode, parentKeys: [rootNode.key], children: false };
    expect(nodes).to.deep.eq([expectedChild]);
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
      imodelAccess.createQueryReader.returns(createAsyncIterator([row]));
      const provider = createHierarchyProvider({
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
      expect(nodes).to.deep.eq([{ ...node, parentKeys: [] }]);
    });
  });

  describe("Custom processing", () => {
    class TestHierarchyDefinition implements HierarchyDefinition {
      public node = { key: "custom", label: "custom", children: false };
      public preProcessStub = sinon.stub().resolves({ ...this.node, isPreprocessed: true });
      public postProcessStub = sinon.stub().resolves({ ...this.node, isPostprocessed: true });

      public async preProcessNode(node: ProcessedCustomHierarchyNode | ProcessedInstanceHierarchyNode) {
        return this.preProcessStub(node);
      }
      public async postProcessNode(node: ProcessedHierarchyNode) {
        return this.postProcessStub(node);
      }

      public async defineHierarchyLevel({ parentNode }: DefineHierarchyLevelProps) {
        const node = { key: "custom", label: "custom", children: false };
        if (!parentNode) {
          return [{ node }];
        }
        return [];
      }
    }

    describe("Pre-processing", async () => {
      it("calls hierarchy definition factory pre-processor if supplied", async () => {
        const node = { key: "custom", label: "custom", children: false };
        const preprocess = sinon.stub().resolves({ ...node, isPreprocessed: true });
        const provider = createHierarchyProvider({
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
        expect(preprocess).to.be.calledOnceWith({ ...node, parentKeys: [] });
        expect(nodes)
          .to.have.lengthOf(1)
          .and.to.containSubset([{ isPreprocessed: true }]);
      });

      it("removes node from hierarchy if pre-processor returns `undefined`", async () => {
        const node = { key: "custom", label: "custom", children: false };
        const preprocess = sinon.stub().resolves(undefined);
        const provider = createHierarchyProvider({
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
        expect(preprocess).to.be.calledOnceWith({ ...node, parentKeys: [] });
        expect(nodes).to.deep.eq([]);
      });

      it("keeps `this` context", async () => {
        const definition = new TestHierarchyDefinition();
        const provider = createHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: definition,
        });
        await collect(provider.getNodes({ parentNode: undefined }));
        expect(definition.preProcessStub).to.be.calledOnce;
      });
    });

    describe("Post-processing", async () => {
      it("calls hierarchy definition factory post-processor if supplied", async () => {
        const node = { key: "custom", label: "custom", children: false };
        const postprocess = sinon.stub().resolves({ ...node, isPostprocessed: true });
        const provider = createHierarchyProvider({
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
        expect(postprocess).to.be.calledOnceWith({ ...node, parentKeys: [] });
        expect(nodes)
          .to.have.lengthOf(1)
          .to.containSubset([{ isPostprocessed: true }]);
      });

      it("removes node from hierarchy if post-processor returns `undefined`", async () => {
        const node = { key: "custom", label: "custom", children: false };
        const postprocess = sinon.stub().resolves(undefined);
        const provider = createHierarchyProvider({
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
        expect(postprocess).to.be.calledOnceWith({ ...node, parentKeys: [] });
        expect(nodes).to.deep.eq([]);
      });

      it("keeps `this` context", async () => {
        const definition = new TestHierarchyDefinition();
        const provider = createHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: definition,
        });
        await collect(provider.getNodes({ parentNode: undefined }));
        expect(definition.postProcessStub).to.be.calledOnce;
      });
    });
  });

  describe("Grouping", () => {
    it("returns grouping node children", async () => {
      imodelAccess.createQueryReader.returns(
        createAsyncIterator<RowDef>([
          {
            [NodeSelectClauseColumnNames.FullClassName]: "a.b",
            [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
            [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
            [NodeSelectClauseColumnNames.Grouping]: JSON.stringify({
              byLabel: true,
            } satisfies Parameters<NodesQueryClauseFactory["createSelectClause"]>[0]["grouping"]),
          },
        ]),
      );
      const provider = createHierarchyProvider({
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
      const provider = createHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: rootNode }];
            }
            if (parentNode.key === "root") {
              return [{ node: childNode }];
            }
            return [];
          },
        },
      });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes).to.deep.eq([{ ...childNode, parentKeys: [rootNode.key], children: false }]);
    });

    it("determines children when immediate child node is hidden", async () => {
      const rootNode = { key: "root", label: "root" };
      const hiddenChildNode = { key: "hidden child", label: "hidden child", processingParams: { hideInHierarchy: true } };
      const visibleChildNode = { key: "visible child", label: "visible child" };
      const provider = createHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
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
      const provider = createHierarchyProvider({
        imodelAccess,
        hierarchyDefinition,
      });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes).to.deep.eq([{ ...rootNode, parentKeys: [], children: true }]);
      expect(hierarchyDefinition.defineHierarchyLevel).to.be.calledTwice;
      expect(hierarchyDefinition.defineHierarchyLevel.firstCall).to.be.calledWith({ parentNode: undefined });
      expect(hierarchyDefinition.defineHierarchyLevel.secondCall).to.be.calledWith({ parentNode: rootNodes[0] });
    });
  });

  describe("Hiding nodes without children", () => {
    it("hides node without children", async () => {
      const rootNode = { key: "root", label: "root" };
      const hiddenChildNode = { key: "hidden child", label: "hidden child", processingParams: { hideIfNoChildren: true } };
      const provider = createHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: rootNode }];
            }
            if (parentNode.key === "root") {
              return [{ node: hiddenChildNode }];
            }
            return [];
          },
        },
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
      const provider = createHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
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
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const formatter = sinon.fake(async (v: TypedPrimitiveValue) => `_${v.value.toString()}_`);

    afterEach(() => {
      formatter.resetHistory();
    });

    it("returns formatted label", async () => {
      const provider = createHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel() {
            return [{ node: { key: "test", label: "test label", children: false } }];
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
    it("applies filtering on query definitions", async () => {
      imodelAccess.stubEntityClass({
        schemaName: "a",
        className: "b",
        is: async (fullClassName) => fullClassName === "a.b",
      });
      imodelAccess.createQueryReader.returns(
        createAsyncIterator<RowDef & { [ECSQL_COLUMN_NAME_FilteredChildrenPaths]: string }>([
          {
            [NodeSelectClauseColumnNames.FullClassName]: "a.b",
            [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
            [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
            [ECSQL_COLUMN_NAME_FilteredChildrenPaths]: `[[{"className":"c.d","id":"0x456"}]]`,
          },
        ]),
      );
      const provider = createHierarchyProvider({
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
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(imodelAccess.createQueryReader).to.be.calledOnceWith(
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
                    0 AS [${ECSQL_COLUMN_NAME_HasFilterTargetAncestor}],
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
          filtering: {
            filteredChildrenIdentifierPaths: [[{ className: "c.d", id: "0x456" }]],
          },
          autoExpand: true,
        },
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
      const provider = createHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
      });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined, instanceFilter }));
      expect(rootNodes).to.deep.eq([{ key: "root", label: "root", parentKeys: [], children: true }]);
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
      const provider = createHierarchyProvider({
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

    it("returns empty list for parent custom node", async () => {
      const customNode = {
        key: "custom",
        parentKeys: [],
        label: "test",
        children: false,
      };
      const provider = createHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: customNode }];
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
      const provider = createHierarchyProvider({
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
      const provider = createHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
      const provider = createHierarchyProvider({
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
      const provider = createHierarchyProvider({
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
      const provider = createHierarchyProvider({
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
      const provider = createHierarchyProvider({
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
      const provider = createHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel() {
            throw new Error("test error");
          },
        },
      });
      await expect(provider.getNodes({ parentNode: undefined }).next()).to.eventually.be.rejectedWith("test error");
    });

    it("rethrows query executor errors", async () => {
      imodelAccess.createQueryReader.returns(
        (async function* () {
          throw new Error("test error");
        })(),
      );
      const provider = createHierarchyProvider({
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
    });

    it("rethrows query executor errors thrown while determining children", async () => {
      imodelAccess.createQueryReader.returns(
        (async function* () {
          throw new Error("test error");
        })(),
      );
      const provider = createHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
      });
      await expect(provider.getNodes({ parentNode: undefined }).next()).to.eventually.be.rejectedWith("test error");
    });

    it("sets children flag on parent node to `true` when determining children throws with `rows limit exceeded` error", async () => {
      imodelAccess.createQueryReader.returns(
        (async function* () {
          throw new RowsLimitExceededError(123);
        })(),
      );
      const provider = createHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
        },
      });

      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes).to.deep.eq([{ key: "root", label: "root", parentKeys: [], children: true }]);

      await expect(provider.getNodes({ parentNode: rootNodes[0] }).next()).to.eventually.be.rejectedWith(RowsLimitExceededError);
    });
  });

  describe("Caching", () => {
    it("doesn't query same root nodes more than once", async () => {
      imodelAccess.createQueryReader.returns(createAsyncIterator([]));
      const provider = createHierarchyProvider({
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
      const provider = createHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
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
      const provider = createHierarchyProvider({
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
      const provider = createHierarchyProvider({
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
      const provider = createHierarchyProvider({
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
              } satisfies Parameters<NodesQueryClauseFactory["createSelectClause"]>[0]["grouping"]),
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
      const provider = createHierarchyProvider({
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
          groupedInstanceKeys: [{ className: "x.y", id: "0x1" }],
          parentKeys: [],
          label: "Class Y",
          children: true,
        } as GroupingHierarchyNode,
      ]);

      // requesting children for the class grouping node shouldn't execute a query and should return the instance node
      const rootInstanceNodes = await collect(provider.getNodes({ parentNode: groupingNodes[0] }));
      expect(imodelAccess.createQueryReader).to.be.calledOnce;
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
      imodelAccess.createQueryReader.resetHistory();

      // requesting children for the root instance node should push grouping node child instance nodes out of cache
      const childInstanceNodes = await collect(provider.getNodes({ parentNode: rootInstanceNodes[0] }));
      expect(imodelAccess.createQueryReader).to.be.calledOnceWith(sinon.match((query) => query.ecsql === "CHILD"));
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
      imodelAccess.createQueryReader.resetHistory();

      // requesting children for the class grouping node again should re-execute the root query, filtered by grouped instance ECInstanceIds
      const rootInstanceNodes2 = await collect(provider.getNodes({ parentNode: groupingNodes[0] }));
      expect(imodelAccess.createQueryReader).to.be.calledOnceWith(
        sinon.match((query: ECSqlQueryDef) => query.ecsql.includes("FROM (ROOT)") && query?.bindings?.length === 1 && query?.bindings?.at(0)?.value === "0x1"),
      );
      expect(rootInstanceNodes2).to.deep.eq(rootInstanceNodes);
    });
  });

  describe("setFormatter", () => {
    after(() => {
      sinon.restore();
    });

    it("getNodes doesn't re-query with same props and a different formatter", async () => {
      imodelAccess.createQueryReader.returns(createAsyncIterator([]));
      const provider = createHierarchyProvider({
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

      await collect(provider.getNodes({ parentNode: undefined }));
      provider.setFormatter(async (val: TypedPrimitiveValue) => `_formatted_${JSON.stringify(val)}`);

      await collect(provider.getNodes({ parentNode: undefined }));
      expect(imodelAccess.createQueryReader).to.be.calledOnce;
    });

    it("getNodes uses formatter that is provided to setFormatter", async () => {
      const node = { key: "custom", label: "custom", children: false };
      const provider = createHierarchyProvider({
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
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([{ ...node, parentKeys: [] }]);
      provider.setFormatter(async (val: TypedPrimitiveValue) => `_formatted_${JSON.stringify(val)}`);
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([
        { ...node, label: `_formatted_${JSON.stringify({ value: node.label, type: "String" })}`, parentKeys: [] },
      ]);
    });

    it("getNodes uses default formatter when setFormatter is provided an undefined value", async () => {
      const node = { key: "custom", label: "custom", children: false };
      const provider = createHierarchyProvider({
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
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([
        { ...node, label: `_formatted_${JSON.stringify({ value: node.label, type: "String" })}`, parentKeys: [] },
      ]);
      provider.setFormatter(undefined);
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([{ ...node, parentKeys: [] }]);
    });
  });

  describe("notifyDataSourceChanged", () => {
    it("getNodes clears cache on data source change", async () => {
      imodelAccess.createQueryReader.returns(createAsyncIterator([]));
      const provider = createHierarchyProvider({
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
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([]);
      expect(imodelAccess.createQueryReader).to.be.calledOnce;
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([]);
      expect(imodelAccess.createQueryReader).to.be.calledOnce;

      provider.notifyDataSourceChanged();
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([]);
      expect(imodelAccess.createQueryReader).to.be.calledTwice;
      expect(await collect(provider.getNodes({ parentNode: undefined }))).to.deep.eq([]);
      expect(imodelAccess.createQueryReader).to.be.calledTwice;
    });
  });
});
