/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect, createAsyncIterator, ResolvablePromise, waitFor } from "presentation-test-utilities";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BeEvent, omit } from "@itwin/core-bentley";
import { InstanceKey, trimWhitespace } from "@itwin/presentation-shared";
import { RowsLimitExceededError } from "../../hierarchies/HierarchyErrors.js";
import { HierarchyNode } from "../../hierarchies/HierarchyNode.js";
import {
  createMergedIModelHierarchyProvider,
  createIModelHierarchyProvider as origCreateIModelHierarchyProvider,
} from "../../hierarchies/imodel/IModelHierarchyProvider.js";
import { NodeSelectClauseColumnNames } from "../../hierarchies/imodel/NodeSelectQueryFactory.js";
import {
  ECSQL_COLUMN_NAME_SearchClassName,
  ECSQL_COLUMN_NAME_SearchECInstanceId,
} from "../../hierarchies/imodel/SearchHierarchyDefinition.js";
import {
  createIModelAccessStub,
  createInstanceLabelSelectClauseFactoryStub,
  createTestGenericNode,
  createTestGenericNodeKey,
  createTestInstanceKey,
  createTestSourceGenericNode,
} from "../Utils.js";

import type { GenericInstanceFilter } from "@itwin/core-common";
import type { EC, ECSqlQueryDef, TypedPrimitiveValue } from "@itwin/presentation-shared";
import type { GroupingHierarchyNode, ParentHierarchyNode } from "../../hierarchies/HierarchyNode.js";
import type { GroupingNodeKey, InstancesNodeKey } from "../../hierarchies/HierarchyNodeKey.js";
import type {
  DefineHierarchyLevelProps,
  HierarchyDefinition,
  NodeParser,
} from "../../hierarchies/imodel/IModelHierarchyDefinition.js";
import type {
  InstanceHierarchyNodeProcessingParams,
  ProcessedHierarchyNode,
  SourceInstanceHierarchyNode,
} from "../../hierarchies/imodel/IModelHierarchyNode.js";
import type { RowDef } from "../../hierarchies/imodel/TreeNodesReader.js";

describe("createIModelHierarchyProvider", () => {
  let imodelAccess: ReturnType<typeof createIModelAccessStub> & { imodelKey: string };
  const sourceName = "test-source-name";

  const createIModelHierarchyProvider: typeof origCreateIModelHierarchyProvider = (props) =>
    origCreateIModelHierarchyProvider({
      ...props,
      // @ts-expect-error: using non-exposed way to override source name
      sourceName,
    });

  beforeEach(() => {
    imodelAccess = { ...createIModelAccessStub(), imodelKey: "test-imodel" };
  });

  it("loads root generic nodes", async () => {
    const node = createTestSourceGenericNode();
    using provider = createIModelHierarchyProvider({
      imodelAccess,
      hierarchyDefinition: {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [{ node }];
          }
          return [];
        },
      },
    });
    const nodes = await collect(provider.getNodes({ parentNode: undefined }));
    expect(nodes).toEqual([
      { ...node, key: createTestGenericNodeKey({ source: sourceName }), parentKeys: [], children: false },
    ]);
  });

  it("uses custom instanceLabelSelectClauseFactory when provided", async () => {
    imodelAccess.createQueryReader.mockReturnValue(
      createAsyncIterator<RowDef>([
        {
          [NodeSelectClauseColumnNames.FullClassName]: "a.b",
          [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
          [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
        },
      ]),
    );
    const instanceLabelSelectClauseFactory = createInstanceLabelSelectClauseFactoryStub();
    const createSelectClauseSpy = vi.spyOn(instanceLabelSelectClauseFactory, "createSelectClause");
    using provider = createIModelHierarchyProvider({
      imodelAccess,
      instanceLabelSelectClauseFactory,
      hierarchyDefinition: {
        async defineHierarchyLevel({ parentNode, createSelectClause }) {
          if (!parentNode) {
            return [
              {
                fullClassName: "a.b",
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: "this.ECClassId" },
                      ecInstanceId: { selector: "this.ECInstanceId" },
                      nodeLabel: { of: { classAlias: "this" } },
                    })}
                    FROM a.b
                  `,
                },
              },
            ];
          }
          return [];
        },
      },
    });
    await collect(provider.getNodes({ parentNode: undefined }));
    expect(createSelectClauseSpy).toHaveBeenCalled();
  });

  it("loads root instance nodes", async () => {
    imodelAccess.createQueryReader.mockReturnValue(
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
            return [{ fullClassName: "x.y", query }];
          }
          return [];
        },
      },
    });
    const nodes = await collect(provider.getNodes({ parentNode: undefined }));
    expect(imodelAccess.createQueryReader).toHaveBeenCalledExactlyOnceWith(
      query,
      expect.objectContaining({ rowFormat: "ECSqlPropertyNames", restartToken: expect.any(String) }),
    );
    expect(nodes).toEqual([
      {
        key: { type: "instances", instanceKeys: [{ className: "a.b", id: "0x123", imodelKey: "test-imodel" }] },
        parentKeys: [],
        label: "test label",
        children: false,
      } as HierarchyNode,
    ]);
  });

  it("loads child nodes", async () => {
    const rootNode = createTestGenericNode({ key: createTestGenericNodeKey({ id: "root" }) });
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
      key: createTestGenericNodeKey({ id: "child", source: sourceName }),
      parentKeys: [rootNode.key],
      children: false,
    };
    expect(nodes).toEqual([expectedChild]);
  });

  [
    {
      parentNode: createTestGenericNode({
        key: createTestGenericNodeKey({ id: "generic node", source: "unknown source" }),
      }) satisfies ParentHierarchyNode,
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
      using provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition });
      const spy = vi.spyOn(hierarchyDefinition, "defineHierarchyLevel");

      const nodes = await collect(provider.getNodes({ parentNode }));
      expect(nodes).toHaveLength(0);
      expect(spy).not.toHaveBeenCalled();
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
      expect(evt.numberOfListeners).toBe(1);
      provider[Symbol.dispose]();
      expect(evt.numberOfListeners).toBe(0);
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
      const spy = vi.fn();
      provider.hierarchyChanged.addListener(spy);

      evt.raiseEvent();
      expect(spy).toHaveBeenCalledOnce();
    });
  });

  describe("Custom parsing", async () => {
    it("calls hierarchy definition factory parser if supplied", async () => {
      const node: SourceInstanceHierarchyNode = {
        key: { type: "instances", instanceKeys: [{ className: "a.b", id: "0x123" }] },
        label: "test",
        children: false,
      };
      const parserMock = vi.fn().mockReturnValue(node);
      const parser: NodeParser = parserMock;
      const row: RowDef = {
        [NodeSelectClauseColumnNames.FullClassName]: "a.b",
        [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
        [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
      };
      imodelAccess.createQueryReader.mockReturnValue(createAsyncIterator([row]));
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          parseNode: parser,
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ fullClassName: "x.y", query: { ecsql: "QUERY" } }];
            }
            return [];
          },
        },
      });
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(parserMock).toHaveBeenCalledOnce();
      expect(parserMock.mock.calls[0][0]).toEqual({ row, parentNode: undefined, imodelKey: imodelAccess.imodelKey });
      expect(nodes).toEqual([
        {
          ...node,
          key: { ...node.key, instanceKeys: node.key.instanceKeys.map((k) => ({ ...k, imodelKey: "test-imodel" })) },
          parentKeys: [],
        },
      ]);
    });

    it("calls hierarchy definition factory parser that returns a promise if supplied", async () => {
      const node: SourceInstanceHierarchyNode = {
        key: { type: "instances", instanceKeys: [{ className: "a.b", id: "0x123" }] },
        label: "test",
        children: false,
      };
      const parserMock2 = vi.fn().mockResolvedValue(node);
      const parser: NodeParser = parserMock2;
      const row: RowDef = {
        [NodeSelectClauseColumnNames.FullClassName]: "a.b",
        [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
        [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
      };
      imodelAccess.createQueryReader.mockReturnValue(createAsyncIterator([row]));
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          parseNode: parser,
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ fullClassName: "x.y", query: { ecsql: "QUERY" } }];
            }
            return [];
          },
        },
      });
      const nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(parserMock2).toHaveBeenCalledOnce();
      expect(parserMock2.mock.calls[0][0]).toEqual({ row, parentNode: undefined, imodelKey: imodelAccess.imodelKey });
      expect(nodes).toEqual([
        {
          ...node,
          key: { ...node.key, instanceKeys: node.key.instanceKeys.map((k) => ({ ...k, imodelKey: "test-imodel" })) },
          parentKeys: [],
        },
      ]);
    });
  });

  describe("Custom processing", () => {
    class TestHierarchyDefinition implements HierarchyDefinition {
      public async preProcessNode<TNode>(props: { node: TNode; parentNode?: ParentHierarchyNode }) {
        return { ...props.node, isPreprocessed: true };
      }
      public async postProcessNode(props: { node: ProcessedHierarchyNode; parentNode?: ParentHierarchyNode }) {
        return { ...props.node, isPostprocessed: true };
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
        const parentNode = createTestGenericNode({ key: createTestGenericNodeKey({ id: "parent" }) });
        const node = createTestSourceGenericNode();
        const preprocess = vi
          .fn()
          .mockImplementation(async (preprocessProps) => ({ ...preprocessProps.node, isPreprocessed: true }));
        using provider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: {
            preProcessNode: preprocess,
            async defineHierarchyLevel(defineHierarchyLevelProps) {
              if (
                defineHierarchyLevelProps.parentNode?.key.type === "generic" &&
                defineHierarchyLevelProps.parentNode.key.id === "parent"
              ) {
                return [{ node }];
              }
              return [];
            },
          },
        });
        const nodes = await collect(provider.getNodes({ parentNode }));
        expect(preprocess).toHaveBeenCalledWith({
          node: { ...node, key: createTestGenericNodeKey({ source: sourceName }), parentKeys: [parentNode.key] },
          parentNode,
        });
        expect(nodes).toHaveLength(1);
        expect(nodes).toEqual(expect.arrayContaining([expect.objectContaining({ isPreprocessed: true })]));
      });

      it("removes node from hierarchy if pre-processor returns `undefined`", async () => {
        const node = createTestSourceGenericNode();
        const preprocess = vi.fn().mockResolvedValue(undefined);
        using provider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: {
            preProcessNode: preprocess,
            async defineHierarchyLevel({ parentNode }) {
              if (!parentNode) {
                return [{ node }];
              }
              return [];
            },
          },
        });
        const nodes = await collect(provider.getNodes({ parentNode: undefined }));
        expect(preprocess).toHaveBeenCalledWith({
          node: { ...node, key: createTestGenericNodeKey({ source: sourceName }), parentKeys: [] },
          parentNode: undefined,
        });
        expect(nodes).toEqual([]);
      });

      it("keeps `this` context", async () => {
        const definition = new TestHierarchyDefinition();
        const preprocessSpy = vi.spyOn(definition, "preProcessNode");
        using provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition: definition });
        await collect(provider.getNodes({ parentNode: undefined }));
        expect(preprocessSpy).toHaveBeenCalledOnce();
        expect(preprocessSpy.mock.contexts[0]).toBe(definition);
      });
    });

    describe("Post-processing", async () => {
      it("calls hierarchy definition factory post-processor if supplied", async () => {
        const parentNode = createTestGenericNode({ key: createTestGenericNodeKey({ id: "parent" }) });
        const node = createTestSourceGenericNode();
        const postprocess = vi.fn().mockResolvedValue({ ...node, isPostprocessed: true });
        using provider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: {
            postProcessNode: postprocess,
            async defineHierarchyLevel(defineHierarchyLevelProps) {
              if (
                defineHierarchyLevelProps.parentNode?.key.type === "generic" &&
                defineHierarchyLevelProps.parentNode.key.id === "parent"
              ) {
                return [{ node }];
              }
              return [];
            },
          },
        });
        const nodes = await collect(provider.getNodes({ parentNode }));
        expect(postprocess).toHaveBeenCalledWith({
          node: {
            ...node,
            key: createTestGenericNodeKey({ source: sourceName }),
            parentKeys: [parentNode.key],
            children: false,
          },
          parentNode,
        });
        expect(nodes).toHaveLength(1);
        expect(nodes).toEqual(expect.arrayContaining([expect.objectContaining({ isPostprocessed: true })]));
      });

      it("keeps `this` context", async () => {
        const definition = new TestHierarchyDefinition();
        const postprocessSpy = vi.spyOn(definition, "postProcessNode");
        using provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition: definition });
        await collect(provider.getNodes({ parentNode: undefined }));
        expect(postprocessSpy).toHaveBeenCalledOnce();
        expect(postprocessSpy.mock.contexts[0]).toBe(definition);
      });
    });
  });

  describe("Grouping", () => {
    it("returns grouping node children", async () => {
      const propertyClass = imodelAccess.stubEntityClass({
        schemaName: "a",
        className: "b",
        properties: [
          {
            name: "MyProperty",
            primitiveType: "Integer",
            isPrimitive: () => true,
            isNavigation: () => false,
          } as unknown as EC.PrimitiveProperty,
        ],
      });
      imodelAccess.createQueryReader.mockReturnValue(
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
              return [{ fullClassName: "a.b", query: { ecsql: "QUERY" } }];
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
      expect(rootNodes).toEqual([
        {
          key: expectedKey,
          parentKeys: [],
          groupedInstanceKeys: [{ className: "a.b", id: "0x123", imodelKey: "test-imodel" }],
          label: "123",
          children: true,
        } satisfies GroupingHierarchyNode,
      ]);

      const childNodes = await collect(provider.getNodes({ parentNode: rootNodes[0] }));
      expect(childNodes).toEqual([
        {
          key: { type: "instances", instanceKeys: [{ className: "a.b", id: "0x123", imodelKey: "test-imodel" }] },
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
      expect(rootNodes).toEqual([
        {
          ...childNode,
          key: createTestGenericNodeKey({ id: "visible child", source: sourceName }),
          parentKeys: [createTestGenericNodeKey({ id: "root", source: sourceName })],
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
      expect(rootNodes).toEqual([
        {
          ...rootNode,
          key: createTestGenericNodeKey({ id: "root", source: sourceName }),
          parentKeys: [],
          children: true,
        },
      ]);
      const childNodes = await collect(provider.getNodes({ parentNode: rootNodes[0] }));
      expect(childNodes).toEqual([
        {
          ...visibleChildNode,
          key: createTestGenericNodeKey({ id: "visible child", source: sourceName }),
          parentKeys: [
            createTestGenericNodeKey({ id: "root", source: sourceName }),
            createTestGenericNodeKey({ id: "hidden child", source: sourceName }),
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
        defineHierarchyLevel: vi.fn().mockImplementation(async ({ parentNode }) => {
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
      using provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes).toEqual([
        {
          ...rootNode,
          key: createTestGenericNodeKey({ id: "root", source: sourceName }),
          parentKeys: [],
          children: true,
        },
      ]);
      expect(hierarchyDefinition.defineHierarchyLevel).toHaveBeenCalledTimes(2);
      expect(hierarchyDefinition.defineHierarchyLevel).toHaveBeenNthCalledWith(1, {
        imodelAccess,
        parentNode: undefined,
        createSelectClause: expect.any(Function),
        createFilterClauses: expect.any(Function),
      });
      expect(hierarchyDefinition.defineHierarchyLevel).toHaveBeenNthCalledWith(2, {
        imodelAccess,
        parentNode: rootNodes[0],
        createSelectClause: expect.any(Function),
        createFilterClauses: expect.any(Function),
      });
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
      expect(rootNodes).toEqual([
        {
          ...rootNode,
          key: createTestGenericNodeKey({ id: "root", source: sourceName }),
          parentKeys: [],
          children: false,
        },
      ]);
      const childNodes = await collect(provider.getNodes({ parentNode: rootNodes[0] }));
      expect(childNodes).toEqual([]);
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
      expect(rootNodes).toEqual([
        {
          ...rootNode,
          key: createTestGenericNodeKey({ id: "root", source: sourceName }),
          parentKeys: [],
          children: true,
        },
      ]);
      const childNodes = await collect(provider.getNodes({ parentNode: rootNodes[0] }));
      expect(childNodes).toEqual([
        omit(
          {
            ...hiddenChildNode,
            key: createTestGenericNodeKey({ id: "hidden child", source: sourceName }),
            parentKeys: [createTestGenericNodeKey({ id: "root", source: sourceName })],
            children: true,
          },
          ["processingParams"],
        ),
      ]);
      const grandChildNodes = await collect(provider.getNodes({ parentNode: childNodes[0] }));
      expect(grandChildNodes).toEqual([
        {
          ...grandChildNode,
          key: createTestGenericNodeKey({ id: "grand child", source: sourceName }),
          parentKeys: [
            createTestGenericNodeKey({ id: "root", source: sourceName }),
            createTestGenericNodeKey({ id: "hidden child", source: sourceName }),
          ],
          children: false,
        },
      ]);
    });
  });

  describe("Labels formatting", () => {
    it("returns formatted label", async () => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const formatter = vi.fn().mockImplementation(async (v: TypedPrimitiveValue) => `_${v.value.toString()}_`);
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
      expect(formatter).toHaveBeenCalledExactlyOnceWith({ value: "test label", type: "String" });
      expect(rootNodes[0].label).toBe("_test label_");
    });
  });

  describe("Hierarchy search", () => {
    it("triggers `hierarchyChanged` event when search is set", () => {
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel() {
            return [];
          },
        },
      });

      const hierarchyChangedListener = vi.fn();
      provider.hierarchyChanged.addListener(hierarchyChangedListener);

      // setting a search should trigger `hierarchyChangedListener`
      const search = { paths: [] };
      provider.setHierarchySearch(search);
      expect(hierarchyChangedListener).toHaveBeenCalledWith({ searchChange: { newSearch: search } });
      hierarchyChangedListener.mockClear();

      // setting to `undefined` should trigger `hierarchyChangedListener`
      provider.setHierarchySearch(undefined);
      expect(hierarchyChangedListener).toHaveBeenCalledWith({ searchChange: { newSearch: undefined } });
    });

    it("applies search on query definitions", async () => {
      imodelAccess.stubEntityClass({ schemaName: "a", className: "b" });

      imodelAccess.createQueryReader.mockImplementation(() =>
        createAsyncIterator<
          RowDef & { [ECSQL_COLUMN_NAME_SearchECInstanceId]: string; [ECSQL_COLUMN_NAME_SearchClassName]: string }
        >([
          {
            [NodeSelectClauseColumnNames.FullClassName]: "a.b",
            [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
            [NodeSelectClauseColumnNames.DisplayLabel]: "test label",
            [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x123",
            [ECSQL_COLUMN_NAME_SearchClassName]: "a.b",
          },
        ]),
      );
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ fullClassName: "a.b", query: { ecsql: "QUERY" } }];
            }
            return [];
          },
        },
        search: {
          paths: [
            {
              identifier: { className: "a.b", id: "0x123" },
              children: [{ identifier: { className: "c.d", id: "0x456" } }],
            },
          ],
        },
      });
      let nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();
      {
        const [filteringQueryArg, filteringOptionsArg] = imodelAccess.createQueryReader.mock.calls[0];
        expect(trimWhitespace(filteringQueryArg.ctes?.[0])).toBe(
          trimWhitespace(
            `
                SearchInfo(ECInstanceId, SearchClassName) AS (
                SELECT
                  ECInstanceId,
                  'a.b' AS SearchClassName
                FROM
                  a.b
                WHERE
                  ECInstanceId IN (0x123)
              )`,
          ),
        );
        expect(trimWhitespace(filteringQueryArg.ecsql)).toBe(
          trimWhitespace(
            `
                SELECT
                    [q].*,
                    IdToHex([f].[ECInstanceId]) AS [${ECSQL_COLUMN_NAME_SearchECInstanceId}],
                    [f].[SearchClassName] AS [${ECSQL_COLUMN_NAME_SearchClassName}]
                  FROM (QUERY) [q]
                  JOIN SearchInfo [f] ON [f].[ECInstanceId] = [q].[ECInstanceId]
                `,
          ),
        );
        expect(filteringOptionsArg).toEqual(
          expect.objectContaining({ rowFormat: "ECSqlPropertyNames", restartToken: expect.any(String) }),
        );
      }
      expect(nodes).toEqual([
        {
          key: { type: "instances", instanceKeys: [{ className: "a.b", id: "0x123", imodelKey: "test-imodel" }] },
          parentKeys: [],
          label: "test label",
          children: false,
          search: { childrenTargetPaths: [{ identifier: { className: "c.d", id: "0x456" } }] },
        },
      ]);

      // reset the search and confirm the query is not searched anymore
      provider.setHierarchySearch(undefined);
      imodelAccess.createQueryReader.mockClear();
      nodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();
      {
        const [unfilteredQueryArg, unfilteredOptionsArg] = imodelAccess.createQueryReader.mock.calls[0];
        expect(unfilteredQueryArg.ecsql).toBe("QUERY");
        expect(unfilteredOptionsArg).toEqual(
          expect.objectContaining({ rowFormat: "ECSqlPropertyNames", restartToken: expect.any(String) }),
        );
      }
      expect(nodes).toEqual([
        {
          key: { type: "instances", instanceKeys: [{ className: "a.b", id: "0x123", imodelKey: "test-imodel" }] },
          parentKeys: [],
          label: "test label",
          children: false,
        },
      ]);
    });

    it("applies child nodes search when hierarchy search is set in-between requests", async () => {
      imodelAccess.stubEntityClass({ schemaName: "a", className: "b" });
      imodelAccess.stubEntityClass({ schemaName: "c", className: "d" });

      const rootNodePromise = new ResolvablePromise<
        RowDef & { [ECSQL_COLUMN_NAME_SearchECInstanceId]: string; [ECSQL_COLUMN_NAME_SearchClassName]: string }
      >();
      const childNodePromise = new ResolvablePromise<
        RowDef & { [ECSQL_COLUMN_NAME_SearchECInstanceId]: string; [ECSQL_COLUMN_NAME_SearchClassName]: string }
      >();
      imodelAccess.createQueryReader.mockImplementation(async function* ({ ecsql, ctes }) {
        if (ecsql.includes("ROOT QUERY")) {
          yield await rootNodePromise;
          return;
        }
        if (ecsql.includes("CHILDREN QUERY")) {
          // ctes is empty for non-searched case and has one item for searched case
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
              return [{ fullClassName: "a.b", query: { ecsql: "ROOT QUERY" } }];
            }
            return [{ fullClassName: "a.b", query: { ecsql: "CHILDREN QUERY" } }];
          },
        },
      });

      // request non-searched root nodes
      const defaultRootNodeIter = provider.getNodes({ parentNode: undefined }).next();
      await waitFor(() => expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce());

      // set the search and request nodes AFTER the root node query has been executed
      provider.setHierarchySearch({
        paths: [
          {
            identifier: { className: "a.b", id: "0x123" },
            children: [{ identifier: { className: "c.d", id: "0x456" } }],
          },
        ],
      });
      const searchedRootNodeIter = provider.getNodes({ parentNode: undefined }).next();

      // all requests are made in correct order, now resolve the responses
      await rootNodePromise.resolve({
        [NodeSelectClauseColumnNames.FullClassName]: "a.b",
        [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
        [NodeSelectClauseColumnNames.DisplayLabel]: "ab",
        [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x123",
        [ECSQL_COLUMN_NAME_SearchClassName]: "a.b",
      });
      await childNodePromise.resolve({
        [NodeSelectClauseColumnNames.FullClassName]: "c.d",
        [NodeSelectClauseColumnNames.ECInstanceId]: "0x456",
        [NodeSelectClauseColumnNames.DisplayLabel]: "cd",
        [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x456",
        [ECSQL_COLUMN_NAME_SearchClassName]: "c.d",
      });

      // setting instance search while a nodes request is in progress cancels the request - ensure we get undefined
      const defaultRootNode = (await defaultRootNodeIter).value;
      expect(defaultRootNode).toBeUndefined();

      // ensure the searched node resolves with `children: false` and has searching props
      const searchedRootNode = (await searchedRootNodeIter).value;
      expect(searchedRootNode).toMatchObject({
        key: { type: "instances", instanceKeys: [{ className: "a.b", id: "0x123" }] },
        children: false,
        search: { childrenTargetPaths: [{ identifier: { className: "c.d", id: "0x456" } }] },
      });

      // ensure requesting children for the searched node returns empty list
      const searchedChildren = await collect(provider.getNodes({ parentNode: searchedRootNode }));
      expect(searchedChildren).toHaveLength(0);
    });

    it("applies grouped nodes search when hierarchy search is set in-between requests", async () => {
      imodelAccess.stubEntityClass({ schemaName: "a", className: "b" });

      const rootNodePromise = new ResolvablePromise<RowDef>();
      imodelAccess.createQueryReader.mockImplementation(async function* ({ ecsql, ctes }) {
        if (ecsql.includes("ROOT QUERY")) {
          yield {
            [NodeSelectClauseColumnNames.FullClassName]: "a.b",
            [NodeSelectClauseColumnNames.ECInstanceId]: "0x456",
            [NodeSelectClauseColumnNames.DisplayLabel]: "ab",
            [NodeSelectClauseColumnNames.Grouping]: JSON.stringify({
              byLabel: true,
            } satisfies InstanceHierarchyNodeProcessingParams["grouping"]),
          };

          // ctes is empty for non-searched case and has one item for searched case
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
              return [{ fullClassName: "a.b", query: { ecsql: "ROOT QUERY" } }];
            }
            return [];
          },
        },
      });

      // request all root nodes
      const defaultRootNodeIter = provider.getNodes({ parentNode: undefined }).next();
      await waitFor(() => expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce());

      // set the search and request searched nodes AFTER the root node query has been executed
      provider.setHierarchySearch({ paths: [{ identifier: { className: "a.b", id: "0x456" } }] });
      const searchedRootNodeIter = provider.getNodes({ parentNode: undefined }).next();

      // all requests are made in correct order, now resolve the responses
      await rootNodePromise.resolve({
        [NodeSelectClauseColumnNames.FullClassName]: "a.b",
        [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
        [NodeSelectClauseColumnNames.DisplayLabel]: "ab",
        [NodeSelectClauseColumnNames.Grouping]: JSON.stringify({
          byLabel: true,
        } satisfies InstanceHierarchyNodeProcessingParams["grouping"]),
      });

      // setting instance search while a nodes request is in progress cancels the request - ensure we get undefined
      const defaultRootNode = (await defaultRootNodeIter).value;
      expect(defaultRootNode).toBeUndefined();

      // ensure we do get the searched grouping node
      const searchedRootNode = (await searchedRootNodeIter).value;
      expect(searchedRootNode).toMatchObject({
        key: { type: "label-grouping", label: "ab" },
      } satisfies Partial<HierarchyNode>);

      // ensure requesting children for the searched node returns one grouped node
      expect(await collect(provider.getNodes({ parentNode: searchedRootNode }))).toHaveLength(1);
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
              // simulate the root node matching requested instance search
              expect(requestedFilter).toBe(instanceFilter);
              return [{ node: rootNode }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "root") {
              // we're expecting the search to be used only for root nodes
              expect(requestedFilter).toBeUndefined();
              return requestedFilter ? [] : [{ node: childNode }];
            }
            return [];
          },
        },
      });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined, instanceFilter }));
      expect(rootNodes).toEqual([
        createTestGenericNode({ key: createTestGenericNodeKey({ id: "root", source: sourceName }), children: true }),
      ]);
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
      expect(keys).toEqual(groupingNode.groupedInstanceKeys);
    });

    it("returns empty list for parent generic node", async () => {
      const genericNode = createTestSourceGenericNode({ key: "custom", label: "test", children: false });
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
      expect(keys).toHaveLength(0);
    });

    it("returns instance nodes' keys", async () => {
      imodelAccess.createQueryReader.mockReturnValue(
        createAsyncIterator([
          { [0]: "a.b", [1]: "0x123", [2]: false },
          { [0]: "c:d", [1]: "0x456", [2]: false },
        ]),
      );
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ fullClassName: "x.y", query: { ecsql: "query" } }];
            }
            return [];
          },
        },
      });
      const keys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined }));
      expect(keys).toHaveLength(2);
      expect(keys).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ className: "a.b", id: "0x123" }),
          expect.objectContaining({ className: "c.d", id: "0x456" }),
        ]),
      );
    });

    it("returns child instance nodes' keys of hidden custom node", async () => {
      const customNode = {
        key: "custom",
        parentKeys: [],
        label: "test",
        children: false,
        processingParams: { hideInHierarchy: true },
      };
      imodelAccess.createQueryReader.mockReturnValue(createAsyncIterator([{ [0]: "a.b", [1]: "0x123", [2]: false }]));
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: customNode }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "custom") {
              return [{ fullClassName: "x.y", query: { ecsql: "query" } }];
            }
            return [];
          },
        },
      });
      const keys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined }));
      expect(keys).toHaveLength(1);
      expect(keys).toEqual(expect.arrayContaining([expect.objectContaining({ className: "a.b", id: "0x123" })]));
    });

    it("returns child instance nodes' keys of hidden instance node", async () => {
      imodelAccess.createQueryReader.mockReturnValueOnce(
        createAsyncIterator([{ [0]: "a.b", [1]: "0x123", [2]: true }]),
      );
      imodelAccess.createQueryReader.mockReturnValueOnce(
        createAsyncIterator([{ [0]: "c.d", [1]: "0x456", [2]: false }]),
      );
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ fullClassName: "x.y", query: { ecsql: "root" } }];
            }
            if (
              HierarchyNode.isInstancesNode(parentNode) &&
              parentNode.key.instanceKeys.some((k) => k.className === "a.b")
            ) {
              return [{ fullClassName: "x.y", query: { ecsql: "child" } }];
            }
            return [];
          },
        },
      });
      const keys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined }));
      expect(keys).toHaveLength(1);
      expect(keys).toEqual(expect.arrayContaining([expect.objectContaining({ className: "c.d", id: "0x456" })]));
    });

    it("merges same-class instance keys under a single parent node when requesting child node keys for hidden parent instance nodes", async () => {
      imodelAccess.createQueryReader.mockReturnValueOnce(
        createAsyncIterator([
          { [0]: "a.b", [1]: "0x123", [2]: true },
          { [0]: "a.b", [1]: "0x456", [2]: true },
        ]),
      );
      imodelAccess.createQueryReader.mockReturnValueOnce(
        createAsyncIterator([{ [0]: "c.d", [1]: "0x789", [2]: false }]),
      );
      const hierarchyDefinition = {
        defineHierarchyLevel: vi.fn().mockImplementation(async ({ parentNode }: DefineHierarchyLevelProps) => {
          if (!parentNode) {
            return [{ fullClassName: "x.y" as const, query: { ecsql: "root" } }];
          }
          if (
            HierarchyNode.isInstancesNode(parentNode) &&
            parentNode.key.instanceKeys.some((k) => k.className === "a.b")
          ) {
            return [{ fullClassName: "x.y" as const, query: { ecsql: "child" } }];
          }
          return [];
        }),
      };
      using provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition });
      const keys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined }));
      expect(keys).toHaveLength(1);
      expect(keys).toEqual(expect.arrayContaining([expect.objectContaining({ className: "c.d", id: "0x789" })]));
      expect(hierarchyDefinition.defineHierarchyLevel).toHaveBeenCalledTimes(2);
      {
        const secondCallArg = hierarchyDefinition.defineHierarchyLevel.mock.calls[1][0] as DefineHierarchyLevelProps;
        expect(secondCallArg.parentNode).toBeTruthy();
        expect(HierarchyNode.isInstancesNode(secondCallArg.parentNode!)).toBe(true);
        expect((secondCallArg.parentNode?.key as InstancesNodeKey).instanceKeys).toHaveLength(2);
        expect(
          InstanceKey.equals((secondCallArg.parentNode?.key as InstancesNodeKey).instanceKeys[0], {
            className: "a.b",
            id: "0x123",
          }),
        ).toBe(true);
        expect(
          InstanceKey.equals((secondCallArg.parentNode?.key as InstancesNodeKey).instanceKeys[1], {
            className: "a.b",
            id: "0x456",
          }),
        ).toBe(true);
      }
    });

    it("applies instance filter", async () => {
      imodelAccess.createQueryReader.mockReturnValue(
        createAsyncIterator([
          { [0]: "a.b", [1]: "0x123", [2]: false },
          { [0]: "a.b", [1]: "0x456", [2]: false },
        ]),
      );
      const hierarchyDefinition = {
        defineHierarchyLevel: vi
          .fn()
          .mockImplementation(
            async ({ parentNode, instanceFilter: requestedInstanceFilter }: DefineHierarchyLevelProps) => {
              if (parentNode === undefined && requestedInstanceFilter) {
                return [{ fullClassName: "x.y", query: { ecsql: "root" } }];
              }
              return [];
            },
          ),
      };
      using provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition });
      const keys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined, instanceFilter }));
      expect(keys).toHaveLength(2);
      expect(keys).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ className: "a.b", id: "0x123" }),
          expect.objectContaining({ className: "a.b", id: "0x456" }),
        ]),
      );
      expect(hierarchyDefinition.defineHierarchyLevel).toHaveBeenCalledOnce();
      {
        const firstCallArg = hierarchyDefinition.defineHierarchyLevel.mock.calls[0][0] as DefineHierarchyLevelProps;
        expect(firstCallArg.parentNode).toBeUndefined();
        expect(firstCallArg.instanceFilter).toBe(instanceFilter);
      }
    });

    it("applies hierarchy level size limit", async () => {
      imodelAccess.createQueryReader.mockReturnValue(createAsyncIterator([{ [0]: "a.b", [1]: "0x123", [2]: false }]));
      const hierarchyDefinition = {
        defineHierarchyLevel: vi.fn().mockImplementation(async ({ parentNode }: DefineHierarchyLevelProps) => {
          if (parentNode === undefined) {
            return [{ fullClassName: "x.y" as const, query: { ecsql: "root" } }];
          }
          return [];
        }),
      };
      using provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition });
      const keys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined, hierarchyLevelSizeLimit: 1 }));
      expect(keys).toHaveLength(1);
      expect(keys).toEqual(expect.arrayContaining([expect.objectContaining({ className: "a.b", id: "0x123" })]));
      expect(hierarchyDefinition.defineHierarchyLevel).toHaveBeenCalledOnce();
      expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();
      {
        const [, limitConfigArg] = imodelAccess.createQueryReader.mock.calls[0];
        expect(limitConfigArg?.limit).toBe(1);
      }
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
      await expect(provider.getNodes({ parentNode: undefined }).next()).rejects.toThrow("test error");
      await expect(provider.getNodeInstanceKeys({ parentNode: undefined }).next()).rejects.toThrow("test error");
    });

    it("rethrows query executor errors", async () => {
      imodelAccess.createQueryReader.mockImplementation(() =>
        (async function* () {
          throw new Error("test error");
        })(),
      );
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel() {
            return [{ fullClassName: "x.y", query: { ecsql: "QUERY" } }];
          },
        },
      });
      await expect(provider.getNodes({ parentNode: undefined }).next()).rejects.toThrow("test error");
      await expect(provider.getNodeInstanceKeys({ parentNode: undefined }).next()).rejects.toThrow("test error");
    });

    it("rethrows query executor errors thrown while determining children", async () => {
      imodelAccess.createQueryReader.mockImplementation(() =>
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
            return [{ fullClassName: "x.y", query: { ecsql: "QUERY" } }];
          },
        },
      });
      await expect(provider.getNodes({ parentNode: undefined }).next()).rejects.toThrow("test error");
    });

    it("sets children flag on parent node to `true` when determining children throws with `rows limit exceeded` error", async () => {
      imodelAccess.createQueryReader.mockImplementation(() =>
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
            return [{ fullClassName: "x.y", query: { ecsql: "QUERY" } }];
          },
        },
      });

      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes).toEqual([
        createTestGenericNode({ key: createTestGenericNodeKey({ id: "root", source: sourceName }), children: true }),
      ]);

      await expect(provider.getNodes({ parentNode: rootNodes[0] }).next()).rejects.toThrow(RowsLimitExceededError);
    });
  });

  describe("Caching", () => {
    it("doesn't query same root nodes more than once", async () => {
      imodelAccess.createQueryReader.mockReturnValue(createAsyncIterator([]));
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ fullClassName: "x.y", query: { ecsql: "QUERY" } }];
            }
            return [];
          },
        },
        queryCacheSize: 10,
      });
      await collect(provider.getNodes({ parentNode: undefined }));
      await collect(provider.getNodes({ parentNode: undefined }));
      expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();
    });

    it("doesn't query same child nodes more than once", async () => {
      imodelAccess.createQueryReader.mockReturnValue(createAsyncIterator([]));
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: createTestSourceGenericNode({ key: "root" }) }];
            }
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "root") {
              return [{ fullClassName: "x.y", query: { ecsql: "QUERY" } }];
            }
            return [];
          },
        },
        queryCacheSize: 10,
      });
      const rootNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(rootNodes).toHaveLength(1);
      await collect(provider.getNodes({ parentNode: rootNodes[0] }));
      await collect(provider.getNodes({ parentNode: rootNodes[0] }));
      expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();
    });

    it("queries the same nodes more than once when `queryCacheSize` is set to `0`", async () => {
      imodelAccess.createQueryReader.mockReturnValue(createAsyncIterator([]));
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ fullClassName: "x.y", query: { ecsql: "QUERY" } }];
            }
            return [];
          },
        },
        queryCacheSize: 0,
      });
      await collect(provider.getNodes({ parentNode: undefined }));
      await collect(provider.getNodes({ parentNode: undefined }));
      expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(2);
    });

    it("queries the same root nodes more than once when `ignoreCache` is set to true", async () => {
      imodelAccess.createQueryReader.mockReturnValue(createAsyncIterator([]));
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ fullClassName: "x.y", query: { ecsql: "QUERY" } }];
            }
            return [];
          },
        },
        queryCacheSize: 10,
      });
      await collect(provider.getNodes({ parentNode: undefined }));
      await collect(provider.getNodes({ parentNode: undefined, ignoreCache: true }));
      expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(2);
    });

    it("queries variations of the same hierarchy level", async () => {
      imodelAccess.createQueryReader.mockReturnValue(createAsyncIterator([]));
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode, instanceFilter }) {
            if (!parentNode) {
              return [{ fullClassName: "x.y", query: { ecsql: `QUERY WHERE ${JSON.stringify(instanceFilter)}` } }];
            }
            return [];
          },
        },
        queryCacheSize: 10,
      });
      await collect(provider.getNodes({ parentNode: undefined }));
      await collect(provider.getNodes({ parentNode: undefined, instanceFilter: {} as GenericInstanceFilter })); // variation of previous, so should cause a query
      await collect(provider.getNodes({ parentNode: undefined, instanceFilter: {} as GenericInstanceFilter })); // same as previous, so this one one shouldn't cause a query
      expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(2);
    });

    it("queries grouped instance nodes when requesting grouped children if the query is pushed-out of cache", async () => {
      imodelAccess.stubEntityClass({ schemaName: "x", className: "y", classLabel: "Class Y" });
      imodelAccess.createQueryReader.mockImplementation((query) => {
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
              return [{ fullClassName: "x.y", query: { ecsql: "ROOT" } }];
            }
            if (parentNode.label === "one") {
              return [{ fullClassName: "x.y", query: { ecsql: "CHILD" } }];
            }
            return [];
          },
        },
        queryCacheSize: 1,
      });

      // requesting root nodes should query root instance nodes and return a class grouping node
      const groupingNodes = await collect(provider.getNodes({ parentNode: undefined }));
      expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();
      expect(imodelAccess.createQueryReader.mock.calls[0][0].ecsql).toBe("ROOT");
      expect(groupingNodes).toEqual([
        {
          key: { type: "class-grouping", className: "x.y" },
          groupedInstanceKeys: [{ className: "x.y", id: "0x1", imodelKey: "test-imodel" }],
          parentKeys: [],
          label: "Class Y",
          children: true,
        } satisfies GroupingHierarchyNode,
      ]);

      // requesting children for the class grouping node shouldn't execute a query and should return the instance node
      const rootInstanceNodes = await collect(provider.getNodes({ parentNode: groupingNodes[0] }));
      expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();
      expect(rootInstanceNodes).toEqual([
        {
          key: { type: "instances", instanceKeys: [{ className: "x.y", id: "0x1", imodelKey: "test-imodel" }] },
          parentKeys: [{ type: "class-grouping", className: "x.y" }],
          label: "one",
          children: true,
        } as HierarchyNode,
      ]);
      imodelAccess.createQueryReader.mockClear();

      // requesting children for the root instance node should push grouping node child instance nodes out of cache
      const childInstanceNodes = await collect(provider.getNodes({ parentNode: rootInstanceNodes[0] }));
      expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();
      expect(imodelAccess.createQueryReader.mock.calls[0][0].ecsql).toBe("CHILD");
      expect(childInstanceNodes).toEqual([
        {
          key: { type: "instances", instanceKeys: [{ className: "x.y", id: "0x2", imodelKey: "test-imodel" }] },
          parentKeys: [
            { type: "class-grouping", className: "x.y" },
            { type: "instances", instanceKeys: [{ className: "x.y", id: "0x1", imodelKey: "test-imodel" }] },
          ],
          label: "two",
          children: false,
        } as HierarchyNode,
      ]);
      imodelAccess.createQueryReader.mockClear();

      // requesting children for the class grouping node again should re-execute the root query, searched by grouped instance ECInstanceIds
      const rootInstanceNodes2 = await collect(provider.getNodes({ parentNode: groupingNodes[0] }));
      expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();
      {
        const cachedQueryArg = imodelAccess.createQueryReader.mock.calls[0][0];
        expect(cachedQueryArg.ecsql).toContain("FROM (ROOT)");
        expect(cachedQueryArg.bindings).toHaveLength(1);
        expect(cachedQueryArg.bindings?.[0].value).toBe("0x1");
      }
      expect(rootInstanceNodes2).toEqual(rootInstanceNodes);
      imodelAccess.createQueryReader.mockClear();

      // requesting root nodes again should re-execute the root query, NOT searched by grouped instance ECInstanceIds
      const groupingNodes2 = await collect(provider.getNodes({ parentNode: undefined }));
      expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();
      {
        const rootQueryArg = imodelAccess.createQueryReader.mock.calls[0][0];
        expect(rootQueryArg.ecsql).toBe("ROOT");
        expect(rootQueryArg.bindings).toBeUndefined();
      }
      expect(groupingNodes2).toEqual(groupingNodes);
    });

    it("clears cache on data source change", async () => {
      imodelAccess.createQueryReader.mockReturnValue(createAsyncIterator([]));
      const imodelChanged = new BeEvent();
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        imodelChanged,
        hierarchyDefinition: {
          async defineHierarchyLevel() {
            return [{ fullClassName: "x.y", query: { ecsql: "QUERY" } }];
          },
        },
      });
      expect(await collect(provider.getNodes({ parentNode: undefined }))).toEqual([]);
      expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();
      expect(await collect(provider.getNodes({ parentNode: undefined }))).toEqual([]);
      expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();

      imodelChanged.raiseEvent();
      expect(await collect(provider.getNodes({ parentNode: undefined }))).toEqual([]);
      expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(2);
      expect(await collect(provider.getNodes({ parentNode: undefined }))).toEqual([]);
      expect(imodelAccess.createQueryReader).toHaveBeenCalledTimes(2);
    });
  });

  describe("setFormatter", () => {
    afterAll(() => {
      vi.restoreAllMocks();
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

      const hierarchyChangedListener = vi.fn();
      provider.hierarchyChanged.addListener(hierarchyChangedListener);

      // setting to custom formatter should trigger `hierarchyChangedListener` with the new formatter
      const formatter = async () => `doesn't matter`;
      provider.setFormatter(formatter);
      expect(hierarchyChangedListener).toHaveBeenCalledExactlyOnceWith({
        formatterChange: { newFormatter: formatter },
      });
      hierarchyChangedListener.mockClear();

      // setting to `undefined` should trigger `hierarchyChangedListener` with the default formatter
      provider.setFormatter(undefined);
      expect(hierarchyChangedListener).toHaveBeenCalledOnce();
      {
        const [listenerArg] = hierarchyChangedListener.mock.calls[0];
        expect(listenerArg.formatterChange).toBeDefined();
        expect(typeof listenerArg.formatterChange.newFormatter).toBe("function");
        expect(listenerArg.formatterChange.newFormatter).not.toBe(formatter);
      }
    });

    it("`getNodes` doesn't re-query with same props and a different formatter", async () => {
      imodelAccess.createQueryReader.mockImplementation(() =>
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
              return [{ fullClassName: "x.y", query: { ecsql: "QUERY" } }];
            }
            return [];
          },
        },
      });

      expect(await collect(provider.getNodes({ parentNode: undefined }))).toEqual(
        expect.arrayContaining([expect.objectContaining({ label: "test label" })]),
      );

      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      provider.setFormatter(async (val: TypedPrimitiveValue) => `_formatted_${val.value.toString()}`);
      expect(await collect(provider.getNodes({ parentNode: undefined }))).toEqual(
        expect.arrayContaining([expect.objectContaining({ label: "_formatted_test label" })]),
      );
      expect(imodelAccess.createQueryReader).toHaveBeenCalledOnce();
    });

    it("`getNodes` uses formatter that is provided to `setFormatter`", async () => {
      const node = createTestSourceGenericNode({ children: false });
      using provider = createIModelHierarchyProvider({
        imodelAccess,
        hierarchyDefinition: {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node }];
            }
            return [];
          },
        },
      });
      expect((await collect(provider.getNodes({ parentNode: undefined }))).map((n) => n.label)).toEqual([node.label]);
      provider.setFormatter(async (val: TypedPrimitiveValue) => `_formatted_${JSON.stringify(val)}`);
      expect((await collect(provider.getNodes({ parentNode: undefined }))).map((n) => n.label)).toEqual([
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
              return [{ node }];
            }
            return [];
          },
        },
        formatter: async (val: TypedPrimitiveValue) => `_formatted_${JSON.stringify(val)}`,
      });
      expect((await collect(provider.getNodes({ parentNode: undefined }))).map((n) => n.label)).toEqual([
        `_formatted_${JSON.stringify({ value: node.label, type: "String" })}`,
      ]);
      provider.setFormatter(undefined);
      expect((await collect(provider.getNodes({ parentNode: undefined }))).map((n) => n.label)).toEqual([node.label]);
    });
  });
});

describe("createMergedIModelHierarchyProvider", () => {
  it("throws when given empty iModels list", () => {
    expect(() =>
      createMergedIModelHierarchyProvider({
        imodels: [],
        hierarchyDefinition: { defineHierarchyLevel: async () => [] },
      }),
    ).toThrow("requires at least one iModel");
  });

  it("merges instance nodes from different providers", async () => {
    const imodelAccess1 = { ...createIModelAccessStub(), imodelKey: "imodel 1" };
    imodelAccess1.createQueryReader.mockReturnValue(
      createAsyncIterator([
        {
          [NodeSelectClauseColumnNames.FullClassName]: "a.b",
          [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
          [NodeSelectClauseColumnNames.DisplayLabel]: "test label 1",
          [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x123",
          [ECSQL_COLUMN_NAME_SearchClassName]: "a.b",
        },
      ]),
    );
    const imodelAccess2 = { ...createIModelAccessStub(), imodelKey: "imodel 2" };
    imodelAccess2.createQueryReader.mockReturnValue(
      createAsyncIterator([
        {
          [NodeSelectClauseColumnNames.FullClassName]: "a.b",
          [NodeSelectClauseColumnNames.ECInstanceId]: "0x123",
          [NodeSelectClauseColumnNames.DisplayLabel]: "test label 2",
          [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x123",
          [ECSQL_COLUMN_NAME_SearchClassName]: "a.b",
        },
      ]),
    );

    using provider = createMergedIModelHierarchyProvider({
      imodels: [{ imodelAccess: imodelAccess1 }, { imodelAccess: imodelAccess2 }],
      hierarchyDefinition: {
        defineHierarchyLevel: async ({ parentNode }) =>
          parentNode ? [] : [{ fullClassName: "a.b", query: { ecsql: "" } }],
      },
      search: {
        paths: [
          { identifier: { className: "a.b", id: "0x123", imodelKey: "imodel 1" }, options: { autoExpand: true } },
          {
            identifier: { className: "a.b", id: "0x123", imodelKey: "imodel 2" },
            children: [{ identifier: { className: "c.d", id: "0x456", imodelKey: "imodel 2" } }],
          },
        ],
      },
    });

    const nodes = await collect(provider.getNodes({ parentNode: undefined }));
    expect(nodes).toEqual([
      {
        key: {
          type: "instances",
          instanceKeys: [
            { className: "a.b", id: "0x123", imodelKey: "imodel 2" },
            { className: "a.b", id: "0x123", imodelKey: "imodel 1" },
          ],
        },
        parentKeys: [],
        label: "test label 2",
        children: false,
        search: {
          isSearchTarget: true,
          options: { autoExpand: true },
          childrenTargetPaths: [{ identifier: { className: "c.d", id: "0x456", imodelKey: "imodel 2" } }],
        },
        autoExpand: true,
      } satisfies HierarchyNode,
    ]);
  });
});
