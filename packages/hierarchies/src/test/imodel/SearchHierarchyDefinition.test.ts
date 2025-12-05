/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { firstValueFrom, from, lastValueFrom, of, toArray } from "rxjs";
import sinon from "sinon";
import { ECClassHierarchyInspector, trimWhitespace } from "@itwin/presentation-shared";
import { HierarchyNode } from "../../hierarchies/HierarchyNode.js";
import { HierarchyNodeIdentifiersPath } from "../../hierarchies/HierarchyNodeIdentifier.js";
import { HierarchySearchPath, HierarchySearchPathOptions, SearchPathRevealDepthInPath } from "../../hierarchies/HierarchySearch.js";
import {
  GenericHierarchyNodeDefinition,
  HierarchyDefinitionParentNode,
  HierarchyLevelDefinition,
  InstanceNodesQueryDefinition,
} from "../../hierarchies/imodel/IModelHierarchyDefinition.js";
import { ProcessedGenericHierarchyNode, ProcessedGroupingHierarchyNode, SourceGenericHierarchyNode } from "../../hierarchies/imodel/IModelHierarchyNode.js";
import { NodeSelectClauseColumnNames } from "../../hierarchies/imodel/NodeSelectQueryFactory.js";
import {
  applyECInstanceIdsFilter,
  applyECInstanceIdsSelector,
  ECSQL_COLUMN_NAME_FilterClassName,
  ECSQL_COLUMN_NAME_FilterECInstanceId,
  SearchHierarchyDefinition,
} from "../../hierarchies/imodel/SearchHierarchyDefinition.js";
import { RxjsHierarchyDefinition, RxjsNodeParser } from "../../hierarchies/internal/RxjsHierarchyDefinition.js";
import {
  createClassHierarchyInspectorStub,
  createTestGenericNodeKey,
  createTestInstanceKey,
  createTestNodeKey,
  createTestProcessedGenericNode,
  createTestProcessedGroupingNode,
  createTestProcessedInstanceNode,
  createTestSourceGenericNode,
} from "../Utils.js";

describe("SearchHierarchyDefinition", () => {
  describe("parseNode", () => {
    it("uses `defaultNodeParser` when source definitions factory doesn't have one", async () => {
      const spy = sinon.spy();
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
      };
      const searchFactory = await createSearchHierarchyDefinition({ nodesParser: (rowProp) => of(spy(rowProp)) });
      await firstValueFrom(searchFactory.parseNode(row));
      expect(spy).to.be.calledOnceWithExactly(row);
    });

    it("uses source's node parser when it has one", async () => {
      const stub = sinon.stub().resolves({} as unknown as HierarchyNode);
      const sourceFactory = {
        parseNode: (rowProp: any) => from(stub(rowProp)),
      } as unknown as RxjsHierarchyDefinition;
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
      };
      const searchFactory = await createSearchHierarchyDefinition({
        sourceFactory,
      });
      await firstValueFrom(searchFactory.parseNode(row));
      expect(stub).to.be.calledOnceWithExactly(row);
    });

    it("sets node `search` attribute when `parentNode` is `undefined`", async () => {
      const sourceFactory = {} as unknown as RxjsHierarchyDefinition;

      const className = "TestSchema.TestName";
      const paths: HierarchyNodeIdentifiersPath[] = [
        [createTestInstanceKey({ id: "0x5", className }), createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })],
        [createTestInstanceKey({ id: "0x5", className }), createTestInstanceKey({ id: "0x3" })],
        [createTestInstanceKey({ id: "0x5", className })],
      ];
      const searchFactory = await createSearchHierarchyDefinition({
        ...sourceFactory,
        targetPaths: paths,
      });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x5",
        [ECSQL_COLUMN_NAME_FilterClassName]: className,
      };
      const node = await firstValueFrom(searchFactory.parseNode(row));
      expect(node.search).to.deep.eq({
        childrenTargetPaths: [
          { path: [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })], options: undefined },
          { path: [createTestInstanceKey({ id: "0x3" })], options: undefined },
        ],
        isSearchTarget: true,
        searchTargetOptions: undefined,
      });
    });

    it("sets correct childrenTargetPaths when parentNode paths have same id's and different classNames that don't derive from one another", async () => {
      const sourceFactory = {} as unknown as RxjsHierarchyDefinition;

      const className = "TestSchema.TestName";
      const className2 = "TestSchema.TestName2";
      const paths: HierarchyNodeIdentifiersPath[] = [
        [createTestInstanceKey({ id: "0x5", className }), createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })],
        [createTestInstanceKey({ id: "0x5", className, imodelKey: "randomKey" }), createTestInstanceKey({ id: "0x3" })],
        [createTestInstanceKey({ id: "0x5", className: className2 }), createTestInstanceKey({ id: "0x4" })],
        [createTestInstanceKey({ id: "0x5", className })],
      ];
      const searchFactory = await createSearchHierarchyDefinition({
        ...sourceFactory,
        // This is not necessary as parentNode paths will be used instead
        targetPaths: [],
      });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x5",
        [ECSQL_COLUMN_NAME_FilterClassName]: className,
      };
      const parentNode: HierarchyDefinitionParentNode = {
        label: "",
        parentKeys: [],
        key: { type: "generic", id: "" },
        search: { childrenTargetPaths: paths },
      };
      const node = await firstValueFrom(searchFactory.parseNode(row, parentNode));
      expect(node.search).to.deep.eq({
        childrenTargetPaths: [{ path: [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })], options: undefined }],
        isSearchTarget: true,
        searchTargetOptions: undefined,
      });
    });

    it("sets correct childrenTargetPaths when same identifier is in different positions of different paths", async () => {
      const sourceFactory = {} as unknown as RxjsHierarchyDefinition;

      const className = "TestSchema.TestName";
      const paths: HierarchySearchPath[] = [
        [createTestInstanceKey({ id: "0x4", className }), createTestInstanceKey({ id: "0x2" })],
        [createTestInstanceKey({ id: "0x3" }), createTestInstanceKey({ id: "0x4", className }), createTestInstanceKey({ id: "0x5" })],
      ];
      const searchFactory = await createSearchHierarchyDefinition({
        ...sourceFactory,
        // This is not necessary as parentNode paths will be used instead
        targetPaths: [],
      });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x4",
        [ECSQL_COLUMN_NAME_FilterClassName]: className,
      };
      const parentNode: HierarchyDefinitionParentNode = {
        label: "",
        parentKeys: [],
        key: { type: "generic", id: "" },
        search: { childrenTargetPaths: paths },
      };
      const node = await firstValueFrom(searchFactory.parseNode(row, parentNode));
      expect(node.search).to.deep.eq({
        childrenTargetPaths: [{ path: [createTestInstanceKey({ id: "0x2" })], options: undefined }],
      });
    });

    it("sets correct childrenTargetPaths when same identifier is in different positions of the same path", async () => {
      const sourceFactory = {} as unknown as RxjsHierarchyDefinition;

      const className = "TestSchema.TestName";
      const paths: HierarchySearchPath[] = [
        [
          createTestInstanceKey({ id: "0x3", className }),
          createTestInstanceKey({ id: "0x1" }),
          createTestInstanceKey({ id: "0x3", className }),
          createTestInstanceKey({ id: "0x2" }),
        ],
      ];
      const searchFactory = await createSearchHierarchyDefinition({
        ...sourceFactory,
        targetPaths: paths,
      });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x3",
        [ECSQL_COLUMN_NAME_FilterClassName]: className,
      };
      const parentNode: HierarchyDefinitionParentNode = {
        label: "",
        parentKeys: [],
        key: { type: "generic", id: "" },
        search: { childrenTargetPaths: paths },
      };
      const node = await firstValueFrom(searchFactory.parseNode(row, parentNode));
      expect(node.search).to.deep.eq({
        childrenTargetPaths: [
          {
            path: [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x3", className }), createTestInstanceKey({ id: "0x2" })],
            options: undefined,
          },
        ],
      });
    });

    it("sets correct childrenTargetPaths when nodes have same ids and different classNames that derive from one another", async () => {
      const sourceFactory = {} as unknown as RxjsHierarchyDefinition;
      const classHierarchyInspector = createClassHierarchyInspectorStub();

      const class1 = classHierarchyInspector.stubEntityClass({
        schemaName: "BisCore",
        className: "SourceQueryClassName",
      });
      const class2 = classHierarchyInspector.stubEntityClass({
        schemaName: "BisCore",
        className: "FilterPathClassName0",
        baseClass: class1,
      });
      const paths: HierarchyNodeIdentifiersPath[] = [
        [createTestInstanceKey({ id: "0x5", className: class1.fullName }), createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })],
        [createTestInstanceKey({ id: "0x5", className: class1.fullName }), createTestInstanceKey({ id: "0x3" })],
        [createTestInstanceKey({ id: "0x5", className: class2.fullName }), createTestInstanceKey({ id: "0x4" })],
      ];
      const searchFactory = await createSearchHierarchyDefinition({
        imodelAccess: { ...classHierarchyInspector, imodelKey: "someKey" },
        sourceFactory,
        targetPaths: [],
      });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x5",
        [ECSQL_COLUMN_NAME_FilterClassName]: class1.fullName,
      };
      const parentNode: HierarchyDefinitionParentNode = {
        label: "",
        parentKeys: [],
        key: { type: "generic", id: "" },
        search: { childrenTargetPaths: paths },
      };
      const node = await firstValueFrom(searchFactory.parseNode(row, parentNode));
      expect(node.search).to.deep.eq({
        childrenTargetPaths: [
          { path: [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })], options: undefined },
          { path: [createTestInstanceKey({ id: "0x3" })], options: undefined },
          { path: [createTestInstanceKey({ id: "0x4" })], options: undefined },
        ],
      });
    });

    it("sets correct childrenTargetPaths when path identifiers have same ids but different types", async () => {
      const sourceFactory = {} as unknown as RxjsHierarchyDefinition;
      const classHierarchyInspector = createClassHierarchyInspectorStub();

      const testClass = classHierarchyInspector.stubEntityClass({
        schemaName: "TestSchema",
        className: "TestClass",
      });
      const paths: HierarchyNodeIdentifiersPath[] = [
        [createTestInstanceKey({ id: "0x1", className: testClass.fullName }), createTestInstanceKey({ id: "0x2" })],
        [createTestGenericNodeKey({ id: "0x1" }), createTestInstanceKey({ id: "0x3" })],
      ];
      const searchFactory = await createSearchHierarchyDefinition({
        imodelAccess: { ...classHierarchyInspector, imodelKey: "someKey" },
        sourceFactory,
        targetPaths: paths,
      });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x1",
        [ECSQL_COLUMN_NAME_FilterClassName]: testClass.fullName,
      };
      const node = await firstValueFrom(searchFactory.parseNode(row, undefined));
      expect(node.search).to.deep.eq({
        childrenTargetPaths: [{ path: [createTestInstanceKey({ id: "0x2" })], options: undefined }],
      });
    });

    it("sets `searchTargetOptions` and `isSearchTarget` attributes from parent's `childrenTargetPaths`", async () => {
      const sourceFactory = {} as unknown as RxjsHierarchyDefinition;
      const className = "TestSchema.TestName";
      const filteringOptions: HierarchySearchPathOptions = {
        reveal: { depthInPath: 0 },
      };
      const paths = [{ path: [createTestInstanceKey({ id: "0x5", className })], options: filteringOptions }, [createTestInstanceKey({ id: "0x5", className })]];
      const searchFactory = await createSearchHierarchyDefinition({
        ...sourceFactory,
        // This is not necessary as parentNode paths will be used instead
        targetPaths: [],
      });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x5",
        [ECSQL_COLUMN_NAME_FilterClassName]: className,
      };
      const parentNode: HierarchyDefinitionParentNode = {
        label: "",
        parentKeys: [],
        key: { type: "generic", id: "" },
        search: { childrenTargetPaths: paths },
      };
      const node = await firstValueFrom(searchFactory.parseNode(row, parentNode));

      assert(node.search?.isSearchTarget);
      expect(node.search.searchTargetOptions).to.deep.eq(filteringOptions);
    });
  });

  describe("preProcessNode", () => {
    it("returns given node when source factory has no pre-processor", async () => {
      const node = createTestProcessedGenericNode();
      const searchFactory = await createSearchHierarchyDefinition();
      const result = await firstValueFrom(searchFactory.preProcessNode(node));
      expect(result).to.eq(node);
    });

    it("returns node pre-processed by source factory", async () => {
      const inputNode = createTestProcessedGenericNode();
      const sourceFactoryNode = createTestProcessedGenericNode();
      const stub = sinon.stub().resolves(sourceFactoryNode);
      const sourceFactory = {
        preProcessNode: (node: any) => from(stub(node)),
      } as unknown as RxjsHierarchyDefinition;
      const searchFactory = await createSearchHierarchyDefinition({
        sourceFactory,
      });
      const result = await firstValueFrom(searchFactory.preProcessNode(inputNode));
      expect(stub).to.be.calledOnceWithExactly(inputNode);
      expect(result).to.eq(sourceFactoryNode);
    });

    it("returns source search target node with `hideInHierarchy` flag if it has search target ancestor", async () => {
      const inputNode: ProcessedGenericHierarchyNode = {
        ...createTestProcessedGenericNode({
          processingParams: {
            hideInHierarchy: true,
          },
        }),
        search: {
          isSearchTarget: true,
          hasSearchTargetAncestor: true,
        },
      };
      const searchFactory = await createSearchHierarchyDefinition();
      const result = await firstValueFrom(searchFactory.preProcessNode(inputNode));
      expect(result).to.eq(inputNode);
    });

    it("returns `undefined` when node is search target without search target ancestor and has `hideInHierarchy` flag", async () => {
      const inputNode: ProcessedGenericHierarchyNode = {
        ...createTestProcessedGenericNode({
          processingParams: {
            hideInHierarchy: true,
          },
        }),
        search: {
          isSearchTarget: true,
          hasSearchTargetAncestor: false,
        },
      };
      const searchFactory = await createSearchHierarchyDefinition();
      const result = await firstValueFrom(searchFactory.preProcessNode(inputNode).pipe(toArray()));
      expect(result).to.deep.eq([]);
    });
  });

  describe("postProcessNode", () => {
    it("returns given node when source factory has no post-processor", async () => {
      const node = createTestProcessedGenericNode();
      const searchFactory = await createSearchHierarchyDefinition();
      const result = await firstValueFrom(searchFactory.postProcessNode(node));
      expect(result).to.eq(node);
    });

    it("returns node post-processed by source factory", async () => {
      const inputNode = createTestProcessedGenericNode();
      const sourceFactoryNode = createTestProcessedGenericNode();
      const stub = sinon.stub().resolves(sourceFactoryNode);
      const sourceFactory = {
        postProcessNode: (node: any) => from(stub(node)),
      } as unknown as RxjsHierarchyDefinition;
      const searchFactory = await createSearchHierarchyDefinition({
        sourceFactory,
      });
      const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
      expect(stub).to.be.calledOnceWithExactly(inputNode);
      expect(result).to.eq(sourceFactoryNode);
    });

    it("sets autoExpand on node when path's autoExpand is set to true and node is filter target", async () => {
      const inputNode = createTestProcessedInstanceNode({
        key: { type: "instances", instanceKeys: [{ id: "0x1", className: "bis:element" }] },
        filtering: {
          isFilterTarget: true,
          filterTargetOptions: {
            autoExpand: true,
          },
        },
      });
      const filteringFactory = await createFilteringHierarchyDefinition({
        nodeIdentifierPaths: [{ path: [inputNode.key.instanceKeys[0]], options: { autoExpand: true } }],
      });
      const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
      expect(result.autoExpand).to.be.true;
    });

    describe("handling non-grouping nodes' `autoExpand` flag", () => {
      [
        { condition: "`reveal: true`", reveal: true },
        { condition: "`reveal: false`", reveal: false },
        { condition: "`reveal: undefined`", reveal: undefined },
        { condition: "`depthInPath: 0`", reveal: { depthInPath: 0 } },
        { condition: "`depthInPath: 1`", reveal: { depthInPath: 1 } },
        { condition: "`depthInHierarchy: 0`", reveal: { depthInHierarchy: 0 } },
        { condition: "`depthInHierarchy: 1`", reveal: { depthInHierarchy: 1 } },
      ].forEach(({ condition, reveal }) => {
        it(`doesn't set auto-expand on filter target instances node when ${condition}`, async () => {
          const inputNode = createTestProcessedInstanceNode({
            parentKeys: [
              {
                type: "label-grouping",
                label: "some label",
              },
            ],
            key: { type: "instances", instanceKeys: [{ id: "0x1", className: "bis:element" }] },
          });
          const searchFactory = await createSearchHierarchyDefinition({
            targetPaths: [{ path: [inputNode.key.instanceKeys[0]], options: { reveal } }],
          });
          const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
          expect(result.autoExpand).to.be.undefined;
        });

        it(`doesn't set auto-expand on filter target generic node when ${condition}`, async () => {
          const inputNode = createTestProcessedGenericNode({
            parentKeys: [
              {
                type: "label-grouping",
                label: "some label",
              },
            ],
          });
          const searchFactory = await createSearchHierarchyDefinition({ targetPaths: [{ path: [inputNode.key], options: { reveal } }] });
          const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
          expect(result.autoExpand).to.be.undefined;
        });
      });

      [
        {
          expectation: true,
          cases: [
            { condition: "`reveal: true`", reveal: true },
            { condition: "`depthInPath: 1`", reveal: { depthInPath: 1 } },
            { condition: "`depthInHierarchy: 1`", reveal: { depthInHierarchy: 1 } },
          ],
        },
        {
          expectation: undefined,
          cases: [
            { condition: "`reveal: false`", reveal: false },
            { condition: "`reveal: false`", reveal: undefined },
            { condition: "`depthInPath: 0`", reveal: { depthInPath: 0 } },
            { condition: "`depthInHierarchy: 0`", reveal: { depthInHierarchy: 0 } },
          ],
        },
      ].forEach(({ expectation, cases }) => {
        cases.forEach(({ condition, reveal }) => {
          it(`${expectation ? "sets" : "doesn't set"} auto-expand on instances' node when it's an ancestor of filter target node and ${condition}`, async () => {
            const inputNode = createTestProcessedInstanceNode({
              key: { type: "instances", instanceKeys: [{ id: "0x1", className: "bis:element" }] },
              search: {
                childrenTargetPaths: [{ path: [{ id: "child", type: "generic" }], options: { reveal } }],
              },
            });
            const searchFactory = await createSearchHierarchyDefinition({
              targetPaths: [{ path: [inputNode.key.instanceKeys[0], { id: "child", type: "generic" }], options: { reveal } }],
            });
            const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
            expect(result.autoExpand).to.eq(expectation);
          });

          it(`${expectation ? "sets" : "doesn't set"} auto-expand on generic node when it's an ancestor of filter target node and ${condition}`, async () => {
            const inputNode = createTestProcessedGenericNode({
              search: {
                childrenTargetPaths: [{ path: [{ id: "child", type: "generic" }], options: { reveal } }],
              },
            });
            const searchFactory = await createSearchHierarchyDefinition({
              targetPaths: [{ path: [inputNode.key, { id: "child", type: "generic" }], options: { reveal } }],
            });
            const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
            expect(result.autoExpand).to.eq(expectation);
          });
        });
      });

      it("doesn't set auto-expand when filter paths don't match", async () => {
        [
          {
            inputNode: createTestProcessedInstanceNode({ key: { type: "instances", instanceKeys: [{ id: "0x1", className: "bis:Element" }] } }),
            filterPathNodeKey: { type: "generic" as const, id: "0x1" },
            imodelKey: "",
          },
          { inputNode: createTestProcessedGenericNode(), filterPathNodeKey: { id: "0x1", className: "bis:Element" }, imodelKey: "" },
          {
            inputNode: createTestProcessedInstanceNode({ key: { type: "instances", instanceKeys: [{ id: "0x1", className: "bis:Element" }] } }),
            filterPathNodeKey: { id: "0x2", className: "bis:Element", imodelKey: "" },
            imodelKey: "",
          },
          {
            inputNode: createTestProcessedInstanceNode({ key: { type: "instances", instanceKeys: [{ id: "0x1", className: "bis:Element" }] } }),
            filterPathNodeKey: { id: "0x1", className: "bis:Element", imodelKey: "a" },
            imodelKey: "b",
          },
        ].forEach(async ({ inputNode, filterPathNodeKey, imodelKey }) => {
          const imodelAccess = {
            classDerivesFrom: sinon.stub<[string, string], Promise<boolean>>().resolves(true),
            imodelKey,
          };
          const searchFactory = await createSearchHierarchyDefinition({
            imodelAccess,
            targetPaths: [
              {
                path: [filterPathNodeKey, { id: "0x2", className: "bis:Element" }],
                options: { reveal: true },
              },
            ],
          });
          const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
          expect(result.autoExpand).to.eq(undefined);
        });
      });
    });

    const commonGroupingNodeExpansionTestCases = (createGroupingNode: () => ProcessedGroupingHierarchyNode) => {
      it("doesn't set auto-expand on grouping nodes if none of the children have children search paths", async () => {
        const inputNode = createGroupingNode();
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.undefined;
      });

      it("doesn't set auto-expand on grouping nodes if children have children search paths list set without `reveal` option", async () => {
        const inputNode = {
          ...createGroupingNode(),
          children: [
            {
              ...createTestProcessedInstanceNode(),
              search: { childrenTargetPaths: [[createTestInstanceKey({ id: "0x1" })]] },
            },
          ],
        };
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.undefined;
      });

      it("doesn't set auto-expand on grouping nodes when all children search paths contain `reveal = false`", async () => {
        const inputNode = {
          ...createGroupingNode(),
          children: [
            {
              ...createTestProcessedInstanceNode(),
              search: {
                childrenTargetPaths: [{ path: [createTestInstanceKey({ id: "0x1" })], options: { reveal: false } }],
              },
            },
          ],
        };
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.undefined;
      });

      it("sets auto-expand when one of children search paths contains `reveal = true`", async () => {
        const inputNode = {
          ...createGroupingNode(),
          children: [
            {
              ...createTestProcessedInstanceNode(),
              search: {
                childrenTargetPaths: [
                  { path: [createTestInstanceKey({ id: "0x1" })], options: { reveal: false } },
                  { path: [createTestInstanceKey({ id: "0x2" })], options: { reveal: true } },
                ],
              },
            },
          ],
        };
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.true;
      });

      it("doesn't set auto-expand when one of search children has `isSearchedTarget = true` and `reveal = false` option", async () => {
        const inputNode = {
          ...createGroupingNode(),
          children: [
            {
              ...createTestProcessedInstanceNode(),
              search: { isSearchTarget: true, searchTargetOptions: { reveal: false } },
            },
          ],
        };
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.undefined;
      });

      it("sets auto-expand when one of children has `isSearchedTarget = true` and `reveal = true` option", async () => {
        const inputNode = {
          ...createGroupingNode(),
          children: [
            {
              ...createTestProcessedInstanceNode(),
              search: { isSearchTarget: true, searchTargetOptions: { reveal: true } },
            },
          ],
        };
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.true;
      });

      it("doesn't set auto-expand when one of nested filtered children has `filterTarget = true` and `reveal = false` option", async () => {
        const inputNode = {
          ...createGroupingNode(),
          children: [
            {
              ...createGroupingNode(),
              children: [
                {
                  ...createTestProcessedInstanceNode(),
                  search: { isSearchTarget: true, searchTargetOptions: { reveal: false } },
                },
              ],
            },
          ],
        };
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.undefined;
      });

      it("sets auto-expand when one of filtered nested children has `filterTarget = true` and `reveal = true` option", async () => {
        const inputNode = {
          ...createGroupingNode(),
          children: [
            {
              ...createGroupingNode(),
              children: [
                {
                  ...createTestProcessedInstanceNode(),
                  search: { isSearchTarget: true, searchTargetOptions: { reveal: true } },
                },
              ],
            },
          ],
        };
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.true;
      });

      it("doesn't set auto-expand when one of nested filtered children has `filterTarget = true` and `reveal = false` option", async () => {
        const inputNode = {
          ...createGroupingNode(),
          children: [
            {
              ...createGroupingNode(),
              children: [
                {
                  ...createTestProcessedInstanceNode(),
                  search: { isSearchTarget: true, searchTargetOptions: { reveal: false } },
                },
              ],
            },
          ],
        };
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.undefined;
      });

      it("sets auto-expand when one of filtered nested children has `filterTarget = true` and `reveal = true` option", async () => {
        const inputNode = {
          ...createGroupingNode(),
          children: [
            {
              ...createGroupingNode(),
              children: [
                {
                  ...createTestProcessedInstanceNode(),
                  search: { isSearchTarget: true, searchTargetOptions: { reveal: true } },
                },
              ],
            },
          ],
        };
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.true;
      });

      it("sets auto-expand on grouping node when it's at the root level and its children have depthInPath set to 0", async () => {
        const groupingNode = createGroupingNode();
        const inputNode: ProcessedGroupingHierarchyNode = {
          ...groupingNode,
          children: [
            {
              ...createTestProcessedInstanceNode(),
              search: {
                isSearchTarget: true,
                searchTargetOptions: { reveal: { depthInPath: 0 } },
                childrenTargetPaths: [],
              },
            },
            {
              ...createTestProcessedInstanceNode(),
              search: {
                isSearchTarget: true,
                searchTargetOptions: { reveal: { depthInPath: 0 } },
                childrenTargetPaths: [],
              },
            },
          ],
        };
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.true;
      });

      it("sets auto-expand on grouping node when its' child has depthInPath pointing to the child", async () => {
        const groupingNode = createGroupingNode();
        const inputNode: ProcessedGroupingHierarchyNode = {
          ...groupingNode,
          parentKeys: [createTestNodeKey()],
          children: [
            {
              ...createTestProcessedInstanceNode(),
              search: {
                childrenTargetPaths: [
                  {
                    path: [createTestInstanceKey()],
                    options: {
                      reveal: {
                        depthInPath: 1,
                      },
                    },
                  },
                ],
              },
            },
          ],
        };
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.true;
      });

      it("sets auto-expand when depthInPath is higher than grouping node depth", async () => {
        const groupingNode = createGroupingNode();
        const inputNode: ProcessedGroupingHierarchyNode = {
          ...groupingNode,
          parentKeys: [createTestNodeKey()],
          children: [
            {
              ...createTestProcessedInstanceNode(),
              search: {
                childrenTargetPaths: [
                  {
                    path: [createTestInstanceKey()],
                    options: {
                      reveal: {
                        depthInPath: 2,
                      },
                    },
                  },
                ],
              },
            },
          ],
        };
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.true;
      });

      it("doesn't set auto-expand when depthInHierarchy is smaller than grouping node depth", async () => {
        const groupingNode = createGroupingNode();
        const inputNode: ProcessedGroupingHierarchyNode = {
          ...groupingNode,
          parentKeys: [createTestNodeKey()],
          children: [
            {
              ...createTestProcessedInstanceNode(),
              search: {
                childrenTargetPaths: [
                  {
                    path: [createTestInstanceKey()],
                    options: {
                      reveal: {
                        depthInHierarchy: 1,
                      },
                    },
                  },
                ],
              },
            },
          ],
        };
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.undefined;
      });

      it("sets auto-expand when depthInHierarchy is higher than grouping node depth", async () => {
        const groupingNode = createGroupingNode();
        const inputNode: ProcessedGroupingHierarchyNode = {
          ...groupingNode,
          parentKeys: [createTestNodeKey()],
          children: [
            {
              ...createTestProcessedInstanceNode(),
              search: {
                childrenTargetPaths: [
                  {
                    path: [createTestInstanceKey()],
                    options: {
                      reveal: {
                        depthInHierarchy: 2,
                      },
                    },
                  },
                ],
              },
            },
          ],
        };
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.true;
      });

      it("sets auto-expand when depthInPath is equal than the filter target depth", async () => {
        const groupingNode = createGroupingNode();
        const inputNode: ProcessedGroupingHierarchyNode = {
          ...groupingNode,
          parentKeys: [createTestNodeKey()],
          children: [
            {
              ...createTestProcessedInstanceNode(),
              search: {
                isSearchTarget: true,
                searchTargetOptions: {
                  reveal: {
                    depthInPath: 1,
                  },
                },
              },
            },
          ],
        };
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.true;
      });

      it("sets auto-expand when depthInHierarchy is equal to filter target depth", async function () {
        const inputNode: ProcessedGroupingHierarchyNode = {
          ...createGroupingNode(),
          parentKeys: [createTestNodeKey()],
          children: [
            {
              ...createTestProcessedInstanceNode(),
              search: {
                isSearchTarget: true,
                searchTargetOptions: {
                  reveal: {
                    depthInHierarchy: 2,
                  },
                },
              },
            },
          ],
        };
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.true;
      });

      it("doesn't set auto-expand for grouping node whose child has autoExpand depthInPath pointing to parent", async function () {
        const inputNode: ProcessedGroupingHierarchyNode = {
          ...createGroupingNode(),
          parentKeys: [createTestNodeKey()],
          children: [
            {
              ...createTestProcessedInstanceNode(),
              search: {
                isSearchTarget: true,
                searchTargetOptions: {
                  reveal: {
                    depthInPath: 0,
                  },
                },
              },
            },
          ],
        };
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(!!result.autoExpand).to.be.false;
      });

      it("doesn't set auto-expand when depthInPath is smaller than the search target", async () => {
        const inputNode: ProcessedGroupingHierarchyNode = {
          ...createGroupingNode(),
          parentKeys: [createTestNodeKey(), createTestNodeKey()],
          children: [
            {
              ...createTestProcessedInstanceNode(),
              search: {
                isSearchTarget: true,
                searchTargetOptions: {
                  reveal: {
                    depthInPath: 1,
                  },
                },
              },
            },
          ],
        };
        const searchFactory = await createSearchHierarchyDefinition();
        const result = await firstValueFrom(searchFactory.postProcessNode(inputNode));
        expect(!!result.autoExpand).to.be.false;
      });
    };

    describe("class grouping nodes", () => {
      function createClassGroupingNode() {
        return createTestProcessedGroupingNode({
          key: {
            type: "class-grouping",
            className: "class name",
          },
          groupedInstanceKeys: [],
          children: [],
        });
      }

      commonGroupingNodeExpansionTestCases(createClassGroupingNode);
    });

    describe("label grouping nodes", () => {
      function createLabelGroupingNode() {
        return createTestProcessedGroupingNode({
          key: {
            type: "label-grouping",
            label: "label",
          },
          groupedInstanceKeys: [],
          children: [],
        });
      }

      commonGroupingNodeExpansionTestCases(createLabelGroupingNode);
    });

    describe("property value grouping nodes", () => {
      function createPropertyValueGroupingNode() {
        return createTestProcessedGroupingNode({
          key: {
            type: "property-grouping:value",
            propertyClassName: "class",
            propertyName: "property",
            formattedPropertyValue: "value",
          },
          groupedInstanceKeys: [],
          children: [],
        });
      }

      commonGroupingNodeExpansionTestCases(createPropertyValueGroupingNode);
    });

    describe("property value range grouping nodes", () => {
      function createPropertyValueRangeGroupingNode() {
        return createTestProcessedGroupingNode({
          key: {
            type: "property-grouping:range",
            propertyClassName: "class",
            propertyName: "property",
            fromValue: 0,
            toValue: 1,
          },
          groupedInstanceKeys: [],
          children: [],
        });
      }

      commonGroupingNodeExpansionTestCases(createPropertyValueRangeGroupingNode);
    });

    describe("property other values grouping nodes", () => {
      function createPropertyOtherValuesGroupingNode() {
        return createTestProcessedGroupingNode({
          key: {
            type: "property-grouping:other",
            properties: [
              { className: "class 1", propertyName: "property 1" },
              { className: "class 2", propertyName: "property 2" },
            ],
          },
          groupedInstanceKeys: [],
          children: [],
        });
      }

      commonGroupingNodeExpansionTestCases(createPropertyOtherValuesGroupingNode);
    });
  });

  describe("defineHierarchyLevel", () => {
    let classHierarchyInspector: ReturnType<typeof createClassHierarchyInspectorStub>;
    beforeEach(() => {
      classHierarchyInspector = createClassHierarchyInspectorStub();
    });

    it("returns source definitions when searched instance paths is undefined", async () => {
      const sourceDefinitions: HierarchyLevelDefinition = [
        {
          node: {} as unknown as SourceGenericHierarchyNode,
        },
      ];
      const sourceFactory: RxjsHierarchyDefinition = {
        defineHierarchyLevel: () => of(sourceDefinitions),
      };
      const searchFactory = await createSearchHierarchyDefinition({
        imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
        sourceFactory,
      });
      const result = await lastValueFrom(
        searchFactory.defineHierarchyLevel({
          parentNode: {
            ...createTestProcessedInstanceNode(),
            search: { childrenTargetPaths: undefined },
          },
        }),
      );
      expect(result).to.eq(sourceDefinitions);
    });

    it("returns no definitions when searched instance paths list is empty", async () => {
      const sourceFactory: RxjsHierarchyDefinition = {
        defineHierarchyLevel: () =>
          of([
            {
              node: {} as unknown as SourceGenericHierarchyNode,
            },
          ]),
      };
      const searchFactory = await createSearchHierarchyDefinition({
        imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
        sourceFactory,
      });
      const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
      expect(result).to.be.empty;
    });

    describe("search generic node definitions", () => {
      it("omits source generic node definition when using instance key search", async () => {
        const filterClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "FilterClassName" });
        const sourceDefinition: GenericHierarchyNodeDefinition = {
          node: createTestSourceGenericNode({
            key: "custom",
            children: false,
          }),
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [[{ className: filterClass.fullName, id: "0x123" }]],
        });
        const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.be.empty;
      });

      it("omits source generic node definition if search type doesn't match node's key", async () => {
        const sourceDefinition: GenericHierarchyNodeDefinition = {
          node: createTestSourceGenericNode({
            key: "custom",
            children: false,
          }),
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [[createTestGenericNodeKey({ id: "xxx" })]],
        });
        const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.be.empty;
      });

      it("omits source generic node definition when search search by empty path", async () => {
        const sourceDefinition: GenericHierarchyNodeDefinition = {
          node: createTestSourceGenericNode({
            key: "custom",
            children: false,
          }),
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [[]],
        });
        const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.be.empty;
      });

      it("omits source generic node definition if identifier source doesn't match imodel key", async () => {
        const sourceDefinition: GenericHierarchyNodeDefinition = {
          node: createTestSourceGenericNode({
            key: "custom",
            children: false,
          }),
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [[createTestGenericNodeKey({ id: "xxx", source: "other-source" })]],
        });
        const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.be.empty;
      });

      it("returns searched source custom node definitions when search type matches node's key", async () => {
        const sourceDefinition1: GenericHierarchyNodeDefinition = {
          node: createTestSourceGenericNode({
            key: "custom 1",
            children: false,
          }),
        };
        const sourceDefinition2: GenericHierarchyNodeDefinition = {
          node: createTestSourceGenericNode({
            key: "custom 2",
            children: false,
          }),
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition1, sourceDefinition2]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [{ path: [createTestGenericNodeKey({ id: "custom 2" })], options: { reveal: true } }],
        });
        const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.deep.eq([
          {
            node: {
              ...sourceDefinition2.node,
              search: { isSearchTarget: true, searchTargetOptions: { reveal: true } },
            },
          },
        ]);
      });

      it("returns source custom node definition searched with multiple matching paths having same beginning", async () => {
        const sourceDefinition: GenericHierarchyNodeDefinition = {
          node: createTestSourceGenericNode({
            key: "custom",
            children: false,
          }),
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [
            [createTestGenericNodeKey({ id: "custom" }), createTestGenericNodeKey({ id: "123" })],
            [createTestGenericNodeKey({ id: "custom" }), createTestGenericNodeKey({ id: "456" })],
          ],
        });
        const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.deep.eq([
          {
            node: {
              ...sourceDefinition.node,
              search: {
                childrenTargetPaths: [
                  { path: [createTestGenericNodeKey({ id: "123" })], options: undefined },
                  { path: [createTestGenericNodeKey({ id: "456" })], options: undefined },
                ],
              },
            },
          },
        ]);
      });

      it("applies path options to children paths", async () => {
        const sourceDefinition: GenericHierarchyNodeDefinition = {
          node: createTestSourceGenericNode({
            key: "custom",
            children: false,
          }),
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [
            { path: [createTestGenericNodeKey({ id: "custom" }), createTestGenericNodeKey({ id: "123" })], options: { reveal: true } },
            {
              path: [createTestGenericNodeKey({ id: "custom" }), createTestGenericNodeKey({ id: "456" })],
              options: { reveal: { depthInHierarchy: 1 } },
            },
            [createTestGenericNodeKey({ id: "custom" }), createTestGenericNodeKey({ id: "789" })],
          ],
        });
        const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.deep.eq([
          {
            node: {
              ...sourceDefinition.node,
              search: {
                childrenTargetPaths: [
                  { path: [createTestGenericNodeKey({ id: "123" })], options: { reveal: true } },
                  { path: [createTestGenericNodeKey({ id: "456" })], options: { reveal: { depthInHierarchy: 1 } } },
                  { path: [createTestGenericNodeKey({ id: "789" })], options: undefined },
                ],
              },
            },
          },
        ]);
      });

      it("applies correct search options to itself", async () => {
        const sourceDefinition: GenericHierarchyNodeDefinition = {
          node: createTestSourceGenericNode({
            key: "custom",
            children: false,
          }),
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [
            { path: [createTestGenericNodeKey({ id: "custom" }), createTestGenericNodeKey({ id: "123" })], options: { reveal: true } },
            { path: [createTestGenericNodeKey({ id: "custom" })], options: { reveal: false } },
            { path: [createTestGenericNodeKey({ id: "custom" })], options: { reveal: true } },
          ],
        });
        const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.deep.eq([
          {
            node: {
              ...sourceDefinition.node,
              search: {
                childrenTargetPaths: [{ path: [createTestGenericNodeKey({ id: "123" })], options: { reveal: true } }],
                isSearchTarget: true,
                searchTargetOptions: { reveal: true },
              },
            },
          },
        ]);
      });
    });

    describe("search instance node query definitions", () => {
      it("omits source instance node query definition when using custom node search", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName" });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [[createTestGenericNodeKey({ id: "xxx" })]],
        });
        const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.be.empty;
      });

      it("omits source instance node query definition if search class doesn't match query class", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName" });
        const filterPathClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "FilterPathClassName" });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [[{ className: filterPathClass.fullName, id: "0x123" }]],
        });
        const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.be.empty;
      });

      it("omits source instance node query definition when search search by empty path", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName" });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [[]],
        });
        const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.be.empty;
      });

      it("omits source instance node query definition if identifier source doesn't match imodel key", async () => {
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: "query.class",
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [[{ className: "search.class", id: "0x123", imodelKey: "other-source" }]],
        });
        const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.be.empty;
      });

      it("returns unfiltered source instance node query definitions when search search target parent node", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName" });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [],
        });
        const result = await lastValueFrom(
          searchFactory.defineHierarchyLevel({
            parentNode: {
              ...createTestProcessedInstanceNode(),
              search: {
                isSearchTarget: true,
                childrenTargetPaths: new Array<HierarchyNodeIdentifiersPath>(),
              },
            },
          }),
        );
        expect(result).to.deep.eq([applyECInstanceIdsSelector(sourceDefinition)]);
      });

      it("returns searched source instance node query definitions when search class matches query class", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "SourceQueryClassName",
        });
        const filterPathClass1 = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName1",
          baseClass: queryClass,
        });
        const filterPathClass2 = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName2",
        });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [
            [
              { className: filterPathClass1.fullName, id: "0x123" },
              { className: filterPathClass2.fullName, id: "0x456" },
            ],
            [{ className: filterPathClass1.fullName, id: "0x789" }],
          ],
        });
        const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.deep.eq([
          applyECInstanceIdsFilter(sourceDefinition, [
            {
              className: filterPathClass1.fullName,
              id: "0x123",
            },
            {
              className: filterPathClass1.fullName,
              id: "0x789",
            },
          ]),
        ]);
      });

      it("returns source instance node query definition searched with multiple matching paths", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName" });
        const filterPathClass1 = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName1",
          baseClass: queryClass,
        });
        const filterPathClass2 = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName2",
          baseClass: queryClass,
        });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [[{ className: filterPathClass1.fullName, id: "0x123" }], [{ className: filterPathClass2.fullName, id: "0x456" }]],
        });
        const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.deep.eq([
          applyECInstanceIdsFilter(sourceDefinition, [
            {
              className: filterPathClass1.fullName,
              id: "0x123",
            },
            {
              className: filterPathClass2.fullName,
              id: "0x456",
            },
          ]),
        ]);
      });

      it("returns source instance node query definition searched with multiple matching paths having same beginning", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName" });
        const filterPathClass0 = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName0",
          baseClass: queryClass,
        });
        const filterPathClass1 = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "FilterPathClassName1" });
        const filterPathClass2 = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "FilterPathClassName2" });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [
            [
              { className: filterPathClass0.fullName, id: "0x123" },
              { className: filterPathClass1.fullName, id: "0x456" },
            ],
            [
              { className: filterPathClass0.fullName, id: "0x123" },
              { className: filterPathClass2.fullName, id: "0x789" },
            ],
          ],
        });
        const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.deep.eq([
          applyECInstanceIdsFilter(sourceDefinition, [
            {
              className: filterPathClass0.fullName,
              id: "0x123",
            },
          ]),
        ]);
      });

      it("returns source instance node query definition searched with matching path beginning with derived class", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "SourceQueryClassName",
        });
        const filterPathClass0 = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName0",
          baseClass: queryClass,
        });
        const filterPathClass1 = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName1",
        });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [
            [{ className: queryClass.fullName, id: "0x123" }],
            [
              { className: filterPathClass0.fullName, id: "0x123" },
              { className: filterPathClass1.fullName, id: "0x456" },
            ],
          ],
        });
        const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.deep.eq([
          applyECInstanceIdsFilter(sourceDefinition, [
            {
              className: queryClass.fullName,
              id: "0x123",
            },
          ]),
        ]);
      });

      it("returns source instance node query definition searched with matching path beginning with base class", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "SourceQueryClassName",
        });
        const filterPathClass0 = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName0",
          baseClass: queryClass,
        });
        const filterPathClass1 = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "FilterPathClassName1" });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [
            [{ className: filterPathClass0.fullName, id: "0x123" }],
            [
              { className: queryClass.fullName, id: "0x123" },
              { className: filterPathClass1.fullName, id: "0x456" },
            ],
          ],
        });
        const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.deep.eq([
          applyECInstanceIdsFilter(sourceDefinition, [
            {
              className: filterPathClass0.fullName,
              id: "0x123",
            },
          ]),
        ]);
      });

      it("sets most nested grouping node as search target", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName" });
        const filterPathClass0 = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName0",
          baseClass: queryClass,
        });
        const autoExpandForGroupingNode1: SearchPathRevealDepthInPath = { depthInPath: 1 };
        const autoExpandForGroupingNode2: SearchPathRevealDepthInPath = { depthInPath: 3 };
        const autoExpandForGroupingNode3: SearchPathRevealDepthInPath = { depthInPath: 0 };
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const searchFactory = await createSearchHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          targetPaths: [
            {
              path: [{ className: filterPathClass0.fullName, id: "0x123" }],
              options: { reveal: autoExpandForGroupingNode1 },
            },
            {
              path: [{ className: filterPathClass0.fullName, id: "0x123" }],
              options: { reveal: autoExpandForGroupingNode2 },
            },
            {
              path: [{ className: filterPathClass0.fullName, id: "0x123" }],
              options: { reveal: autoExpandForGroupingNode3 },
            },
          ],
        });
        const result = await lastValueFrom(searchFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.deep.eq([
          applyECInstanceIdsFilter(sourceDefinition, [
            {
              className: filterPathClass0.fullName,
              id: "0x123",
            },
          ]),
        ]);
      });
    });

    it("uses search paths from parent node", async () => {
      const queryClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName" });
      const childFilterClass = classHierarchyInspector.stubEntityClass({
        schemaName: "BisCore",
        className: "ChildFilterClass",
        baseClass: queryClass,
      });
      const sourceDefinition: InstanceNodesQueryDefinition = {
        fullClassName: queryClass.fullName,
        query: {
          ecsql: "SOURCE_QUERY",
        },
      };
      const sourceFactory: RxjsHierarchyDefinition = {
        defineHierarchyLevel: () => of([sourceDefinition]),
      };
      const searchFactory = await createSearchHierarchyDefinition({
        imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
        sourceFactory,
        targetPaths: [], // this doesn't matter as we're going to look at what's in the parent node
      });
      const result = await lastValueFrom(
        searchFactory.defineHierarchyLevel({
          parentNode: {
            ...createTestProcessedGenericNode({
              key: createTestGenericNodeKey({ id: "custom" }),
              label: "custom node",
            }),
            search: {
              childrenTargetPaths: [[{ className: childFilterClass.fullName, id: "0x456" }]],
            },
          },
        }),
      );
      expect(result).to.deep.eq([
        applyECInstanceIdsFilter(sourceDefinition, [
          {
            className: childFilterClass.fullName,
            id: "0x456",
          },
        ]),
      ]);
    });

    it("returns all definitions for a search target parent node", async () => {
      const matchingSourceDefinition: GenericHierarchyNodeDefinition = {
        node: createTestSourceGenericNode({ key: "matches" }),
      };
      const nonMatchingSourceDefinition: GenericHierarchyNodeDefinition = {
        node: createTestSourceGenericNode({ key: "doesn't match" }),
      };
      const sourceFactory: RxjsHierarchyDefinition = {
        defineHierarchyLevel: () => of([matchingSourceDefinition, nonMatchingSourceDefinition]),
      };
      const searchFactory = await createSearchHierarchyDefinition({
        imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
        sourceFactory,
        targetPaths: [], // this doesn't matter as we're going to look at what's in the parent node
      });
      const result = await lastValueFrom(
        searchFactory.defineHierarchyLevel({
          parentNode: {
            ...createTestProcessedGenericNode({
              key: createTestGenericNodeKey({ id: "parent" }),
              label: "parent",
            }),
            search: {
              isSearchTarget: true,
              childrenTargetPaths: [[createTestGenericNodeKey({ id: "matches" })]],
            },
          },
        }),
      );
      expect(result).to.deep.eq([
        // both definitions are returned because the parent is search target
        {
          node: {
            ...matchingSourceDefinition.node,
            search: { hasSearchTargetAncestor: true, isSearchTarget: true, searchTargetOptions: undefined },
          },
        },
        {
          node: {
            ...nonMatchingSourceDefinition.node,
            search: { hasSearchTargetAncestor: true },
          },
        },
      ]);
    });
  });

  describe("applyECInstanceIdsFilter", () => {
    it("creates a valid CTE for searched instance paths", () => {
      const result = applyECInstanceIdsFilter(
        {
          fullClassName: "full-class-name",
          query: {
            ctes: ["source cte"],
            ecsql: "source query",
            bindings: [{ type: "string", value: "source binding" }],
          },
        },
        [
          {
            className: "test.class",
            id: "0x1",
          },
          {
            className: "test.class",
            id: "0x5",
          },
        ],
      );
      expect(result.fullClassName).to.eq("full-class-name");
      expect(result.query.ctes?.map(trimWhitespace)).to.deep.eq([
        "source cte",
        trimWhitespace(`
          FilteringInfo(ECInstanceId, FilterClassName) AS (
          SELECT
            ECInstanceId,
            'test.class' AS FilterClassName
          FROM
            test.class
          WHERE
            ECInstanceId IN (0x1, 0x5)
          )
        `),
      ]);
      expect(trimWhitespace(result.query.ecsql)).to.deep.eq(
        trimWhitespace(`
          SELECT
            [q].*,
            IdToHex([f].[ECInstanceId]) AS [${ECSQL_COLUMN_NAME_FilterECInstanceId}],
            [f].[FilterClassName] AS [${ECSQL_COLUMN_NAME_FilterClassName}]
          FROM (
            source query
          ) [q]
          JOIN FilteringInfo [f] ON [f].[ECInstanceId] = [q].[ECInstanceId]
        `),
      );
      expect(result.query.bindings).to.deep.eq([{ type: "string", value: "source binding" }]);
    });
  });
});

async function createSearchHierarchyDefinition(props?: {
  imodelAccess?: ECClassHierarchyInspector & { imodelKey: string };
  sourceFactory?: RxjsHierarchyDefinition;
  targetPaths?: HierarchySearchPath[];
  nodesParser?: RxjsNodeParser;
}) {
  const { imodelAccess, sourceFactory, targetPaths } = props ?? {};
  return new SearchHierarchyDefinition({
    imodelAccess: imodelAccess ?? { classDerivesFrom: async () => false, imodelKey: "" },
    source: sourceFactory ?? ({} as unknown as RxjsHierarchyDefinition),
    sourceName: "test-source-name",
    targetPaths: targetPaths ?? [],
    nodesParser: props?.nodesParser,
  });
}
