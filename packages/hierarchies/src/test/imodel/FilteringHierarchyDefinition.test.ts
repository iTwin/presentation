/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import { firstValueFrom, from, lastValueFrom, of, toArray } from "rxjs";
import sinon from "sinon";
import { ECClassHierarchyInspector, trimWhitespace } from "@itwin/presentation-shared";
import { FilteringPathAutoExpandDepthInPath, HierarchyFilteringPath, HierarchyFilteringPathOptions } from "../../hierarchies/HierarchyFiltering.js";
import { HierarchyNode } from "../../hierarchies/HierarchyNode.js";
import { HierarchyNodeIdentifiersPath } from "../../hierarchies/HierarchyNodeIdentifier.js";
import {
  applyECInstanceIdsFilter,
  applyECInstanceIdsSelector,
  ECSQL_COLUMN_NAME_FilterClassName,
  ECSQL_COLUMN_NAME_FilterECInstanceId,
  FilteringHierarchyDefinition,
} from "../../hierarchies/imodel/FilteringHierarchyDefinition.js";
import {
  GenericHierarchyNodeDefinition,
  HierarchyDefinitionParentNode,
  HierarchyLevelDefinition,
  InstanceNodesQueryDefinition,
} from "../../hierarchies/imodel/IModelHierarchyDefinition.js";
import { ProcessedGenericHierarchyNode, ProcessedGroupingHierarchyNode, SourceGenericHierarchyNode } from "../../hierarchies/imodel/IModelHierarchyNode.js";
import { NodeSelectClauseColumnNames } from "../../hierarchies/imodel/NodeSelectQueryFactory.js";
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

describe("FilteringHierarchyDefinition", () => {
  describe("parseNode", () => {
    it("uses `defaultNodeParser` when source definitions factory doesn't have one", async () => {
      const spy = sinon.spy();
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
      };
      const filteringFactory = await createFilteringHierarchyDefinition({ nodesParser: (rowProp) => of(spy(rowProp)) });
      await firstValueFrom(filteringFactory.parseNode(row));
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
      const filteringFactory = await createFilteringHierarchyDefinition({
        sourceFactory,
      });
      await firstValueFrom(filteringFactory.parseNode(row));
      expect(stub).to.be.calledOnceWithExactly(row);
    });

    it("sets filtered node attributes when parentNode is undefined", async () => {
      const sourceFactory = {} as unknown as RxjsHierarchyDefinition;

      const className = "TestSchema.TestName";
      const paths: HierarchyNodeIdentifiersPath[] = [
        [createTestInstanceKey({ id: "0x5", className }), createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })],
        [createTestInstanceKey({ id: "0x5", className }), createTestInstanceKey({ id: "0x3" })],
        [createTestInstanceKey({ id: "0x5", className })],
      ];
      const filteringFactory = await createFilteringHierarchyDefinition({
        ...sourceFactory,
        nodeIdentifierPaths: paths,
      });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x5",
        [ECSQL_COLUMN_NAME_FilterClassName]: className,
      };
      const node = await firstValueFrom(filteringFactory.parseNode(row));
      expect(node.filtering).to.deep.eq({
        filteredChildrenIdentifierPaths: [
          { path: [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })], options: undefined },
          { path: [createTestInstanceKey({ id: "0x3" })], options: undefined },
        ],
        isFilterTarget: true,
        filterTargetOptions: undefined,
      });
    });

    it("sets correct filteredChildrenIdentifierPaths when parentNode paths have same id's and different classNames that don't derive from one another", async () => {
      const sourceFactory = {} as unknown as RxjsHierarchyDefinition;

      const className = "TestSchema.TestName";
      const className2 = "TestSchema.TestName2";
      const paths: HierarchyNodeIdentifiersPath[] = [
        [createTestInstanceKey({ id: "0x5", className }), createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })],
        [createTestInstanceKey({ id: "0x5", className, imodelKey: "randomKey" }), createTestInstanceKey({ id: "0x3" })],
        [createTestInstanceKey({ id: "0x5", className: className2 }), createTestInstanceKey({ id: "0x4" })],
        [createTestInstanceKey({ id: "0x5", className })],
      ];
      const filteringFactory = await createFilteringHierarchyDefinition({
        ...sourceFactory,
        // This is not necessary as parentNode paths will be used instead
        nodeIdentifierPaths: [],
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
        filtering: { filteredChildrenIdentifierPaths: paths },
      };
      const node = await firstValueFrom(filteringFactory.parseNode(row, parentNode));
      expect(node.filtering).to.deep.eq({
        filteredChildrenIdentifierPaths: [{ path: [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })], options: undefined }],
        isFilterTarget: true,
        filterTargetOptions: undefined,
      });
    });

    it("sets correct filteredChildrenIdentifierPaths when same identifier is in different positions of different paths", async () => {
      const sourceFactory = {} as unknown as RxjsHierarchyDefinition;

      const className = "TestSchema.TestName";
      const paths: HierarchyFilteringPath[] = [
        [createTestInstanceKey({ id: "0x4", className }), createTestInstanceKey({ id: "0x2" })],
        [createTestInstanceKey({ id: "0x3" }), createTestInstanceKey({ id: "0x4", className }), createTestInstanceKey({ id: "0x5" })],
      ];
      const filteringFactory = await createFilteringHierarchyDefinition({
        ...sourceFactory,
        // This is not necessary as parentNode paths will be used instead
        nodeIdentifierPaths: [],
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
        filtering: { filteredChildrenIdentifierPaths: paths },
      };
      const node = await firstValueFrom(filteringFactory.parseNode(row, parentNode));
      expect(node.filtering).to.deep.eq({
        filteredChildrenIdentifierPaths: [{ path: [createTestInstanceKey({ id: "0x2" })], options: undefined }],
      });
    });

    it("sets correct filteredChildrenIdentifierPaths when same identifier is in different positions of the same path", async () => {
      const sourceFactory = {} as unknown as RxjsHierarchyDefinition;

      const className = "TestSchema.TestName";
      const paths: HierarchyFilteringPath[] = [
        [
          createTestInstanceKey({ id: "0x3", className }),
          createTestInstanceKey({ id: "0x1" }),
          createTestInstanceKey({ id: "0x3", className }),
          createTestInstanceKey({ id: "0x2" }),
        ],
      ];
      const filteringFactory = await createFilteringHierarchyDefinition({
        ...sourceFactory,
        nodeIdentifierPaths: paths,
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
        filtering: { filteredChildrenIdentifierPaths: paths },
      };
      const node = await firstValueFrom(filteringFactory.parseNode(row, parentNode));
      expect(node.filtering).to.deep.eq({
        filteredChildrenIdentifierPaths: [
          {
            path: [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x3", className }), createTestInstanceKey({ id: "0x2" })],
            options: undefined,
          },
        ],
      });
    });

    it("sets correct filteredChildrenIdentifierPaths when nodes have same ids and different classNames that derive from one another", async () => {
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
      const filteringFactory = await createFilteringHierarchyDefinition({
        imodelAccess: { ...classHierarchyInspector, imodelKey: "someKey" },
        sourceFactory,
        nodeIdentifierPaths: [],
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
        filtering: { filteredChildrenIdentifierPaths: paths },
      };
      const node = await firstValueFrom(filteringFactory.parseNode(row, parentNode));
      expect(node.filtering).to.deep.eq({
        filteredChildrenIdentifierPaths: [
          { path: [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })], options: undefined },
          { path: [createTestInstanceKey({ id: "0x3" })], options: undefined },
          { path: [createTestInstanceKey({ id: "0x4" })], options: undefined },
        ],
      });
    });

    it("sets correct filteredChildrenIdentifierPaths when path identifiers have same ids but different types", async () => {
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
      const filteringFactory = await createFilteringHierarchyDefinition({
        imodelAccess: { ...classHierarchyInspector, imodelKey: "someKey" },
        sourceFactory,
        nodeIdentifierPaths: paths,
      });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x1",
        [ECSQL_COLUMN_NAME_FilterClassName]: testClass.fullName,
      };
      const node = await firstValueFrom(filteringFactory.parseNode(row, undefined));
      expect(node.filtering).to.deep.eq({
        filteredChildrenIdentifierPaths: [{ path: [createTestInstanceKey({ id: "0x2" })], options: undefined }],
      });
    });

    it("doesn't set auto-expand when filtered children paths is not set", async () => {
      const filteringFactory = await createFilteringHierarchyDefinition();
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
      };
      const node = await firstValueFrom(filteringFactory.parseNode(row));
      expect(node.autoExpand).to.be.undefined;
    });

    it("doesn't set auto-expand when filtered children paths list is empty", async () => {
      const filteringFactory = await createFilteringHierarchyDefinition({ nodeIdentifierPaths: [] });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
      };
      const node = await firstValueFrom(filteringFactory.parseNode(row));
      expect(node.autoExpand).to.be.undefined;
    });

    it("does't set auto-expand when filtered children paths list is provided without `autoExpand` option", async () => {
      const paths: HierarchyNodeIdentifiersPath[] = [
        [createTestInstanceKey({ id: "0x1", className: "TestSchema.TestName" }), createTestInstanceKey({ id: "0x2", className: "TestSchema.TestName" })],
      ];
      const filteringFactory = await createFilteringHierarchyDefinition({ nodeIdentifierPaths: paths });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x1",
        [ECSQL_COLUMN_NAME_FilterClassName]: "TestSchema.TestName",
      };
      const node = await firstValueFrom(filteringFactory.parseNode(row));
      expect(node.autoExpand).to.be.undefined;
    });

    it("doesn't set auto-expand when all filtered children paths contain `autoExpand = false`", async () => {
      const paths = [
        {
          path: [
            createTestInstanceKey({ id: "0x1", className: "TestSchema.TestName" }),
            createTestInstanceKey({ id: "0x2", className: "TestSchema.TestName" }),
          ],
          options: { autoExpand: false },
        },
      ];
      const filteringFactory = await createFilteringHierarchyDefinition({ nodeIdentifierPaths: paths });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x1",
        [ECSQL_COLUMN_NAME_FilterClassName]: "TestSchema.TestName",
      };
      const node = await firstValueFrom(filteringFactory.parseNode(row));
      expect(node.autoExpand).to.be.undefined;
    });

    it("doesn't set auto-expand on filter targets", async () => {
      const paths = [
        {
          path: [createTestInstanceKey({ id: "0x1", className: "TestSchema.TestName" })],
          options: { autoExpand: true },
        },
      ];
      const filteringFactory = await createFilteringHierarchyDefinition({ nodeIdentifierPaths: paths });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x1",
        [ECSQL_COLUMN_NAME_FilterClassName]: "TestSchema.TestName",
      };
      const node = await firstValueFrom(filteringFactory.parseNode(row));
      expect(node.autoExpand).to.be.undefined;
    });

    it("doesn't set auto-expand when all filtered children paths autoExpand depthInPath is equal to parent keys length", async () => {
      const paths: HierarchyFilteringPath[] = [
        {
          path: [
            createTestInstanceKey({ id: "0x1", className: "TestSchema.TestName" }),
            createTestInstanceKey({ id: "0x2", className: "TestSchema.TestName" }),
          ],
          options: { autoExpand: { depthInPath: 1 } },
        },
      ];
      const filteringFactory = await createFilteringHierarchyDefinition({ nodeIdentifierPaths: paths });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x2",
        [ECSQL_COLUMN_NAME_FilterClassName]: "TestSchema.TestName",
      };
      const node = await firstValueFrom(
        filteringFactory.parseNode(row, {
          key: { type: "instances", instanceKeys: [{ id: "0x1", className: "TestSchema.TestName" }] },
          label: "",
          parentKeys: [],
          filtering: {
            filteredChildrenIdentifierPaths: paths.map((path) => {
              const normalizedPath = HierarchyFilteringPath.normalize(path);
              return {
                path: normalizedPath.path.slice(1),
                options: normalizedPath.options,
              };
            }),
          },
        }),
      );
      expect(node.autoExpand).to.be.undefined;
    });

    it("doesn't set auto-expand when all filtered children paths autoExpand depthInPath is equal to node depth", async () => {
      const paths: HierarchyFilteringPath[] = [
        {
          path: [
            createTestInstanceKey({ id: "0x1", className: "TestSchema.TestName" }),
            createTestInstanceKey({ id: "0x2", className: "TestSchema.TestName" }),
          ],
          options: { autoExpand: { depthInPath: 1 } },
        },
      ];
      const filteringFactory = await createFilteringHierarchyDefinition({ nodeIdentifierPaths: paths });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x2",
        [ECSQL_COLUMN_NAME_FilterClassName]: "TestSchema.TestName",
      };
      const node = await firstValueFrom(filteringFactory.parseNode(row));
      expect(node.autoExpand).to.be.undefined;
    });

    it("doesn't set auto-expand when all filtered children paths autoExpand depthInPath is less than parent keys length", async () => {
      const paths: HierarchyFilteringPath[] = [
        {
          path: [
            createTestInstanceKey({ id: "0x1", className: "TestSchema.TestName" }),
            createTestInstanceKey({ id: "0x2", className: "TestSchema.TestName" }),
            createTestInstanceKey({ id: "0x3", className: "TestSchema.TestName" }),
            createTestInstanceKey({ id: "0x4", className: "TestSchema.TestName" }),
          ],
          options: { autoExpand: { depthInPath: 1 } },
        },
      ];
      const filteringFactory = await createFilteringHierarchyDefinition({ nodeIdentifierPaths: paths });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x3",
        [ECSQL_COLUMN_NAME_FilterClassName]: "TestSchema.TestName",
      };
      const node = await firstValueFrom(
        filteringFactory.parseNode(row, {
          key: { type: "instances", instanceKeys: [{ id: "0x2", className: "TestSchema.TestName" }] },
          label: "",
          parentKeys: [{ type: "instances", instanceKeys: [{ className: "TestSchema.TestName", id: "0x1" }] }],
          filtering: {
            filteredChildrenIdentifierPaths: paths.map((path) => {
              const normalizedPath = HierarchyFilteringPath.normalize(path);
              return {
                path: normalizedPath.path.slice(2),
                options: normalizedPath.options,
              };
            }),
          },
        }),
      );
      expect(node.autoExpand).to.be.undefined;
    });

    it("sets `filterTargetOptions` and `isFilterTarget` attributes from parent's `filteredChildrenIdentifierPaths`", async () => {
      const sourceFactory = {} as unknown as RxjsHierarchyDefinition;
      const className = "TestSchema.TestName";
      const filteringOptions: HierarchyFilteringPathOptions = {
        autoExpand: { depthInPath: 0 },
      };
      const paths = [{ path: [createTestInstanceKey({ id: "0x5", className })], options: filteringOptions }, [createTestInstanceKey({ id: "0x5", className })]];
      const filteringFactory = await createFilteringHierarchyDefinition({
        ...sourceFactory,
        // This is not necessary as parentNode paths will be used instead
        nodeIdentifierPaths: [],
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
        filtering: { filteredChildrenIdentifierPaths: paths },
      };
      const node = await firstValueFrom(filteringFactory.parseNode(row, parentNode));

      assert(node.filtering?.isFilterTarget);
      expect(node.filtering.filterTargetOptions).to.deep.eq(filteringOptions);
    });
  });

  describe("preProcessNode", () => {
    it("returns given node when source factory has no pre-processor", async () => {
      const node = createTestProcessedGenericNode();
      const filteringFactory = await createFilteringHierarchyDefinition();
      const result = await firstValueFrom(filteringFactory.preProcessNode(node));
      expect(result).to.eq(node);
    });

    it("returns node pre-processed by source factory", async () => {
      const inputNode = createTestProcessedGenericNode();
      const sourceFactoryNode = createTestProcessedGenericNode();
      const stub = sinon.stub().resolves(sourceFactoryNode);
      const sourceFactory = {
        preProcessNode: (node: any) => from(stub(node)),
      } as unknown as RxjsHierarchyDefinition;
      const filteringFactory = await createFilteringHierarchyDefinition({
        sourceFactory,
      });
      const result = await firstValueFrom(filteringFactory.preProcessNode(inputNode));
      expect(stub).to.be.calledOnceWithExactly(inputNode);
      expect(result).to.eq(sourceFactoryNode);
    });

    it("returns source filter target node with `hideInHierarchy` flag if it has filter target ancestor", async () => {
      const inputNode: ProcessedGenericHierarchyNode = {
        ...createTestProcessedGenericNode({
          processingParams: {
            hideInHierarchy: true,
          },
        }),
        filtering: {
          isFilterTarget: true,
          hasFilterTargetAncestor: true,
        },
      };
      const filteringFactory = await createFilteringHierarchyDefinition();
      const result = await firstValueFrom(filteringFactory.preProcessNode(inputNode));
      expect(result).to.eq(inputNode);
    });

    it("returns `undefined` when node is filter target without filter target ancestor and has `hideInHierarchy` flag", async () => {
      const inputNode: ProcessedGenericHierarchyNode = {
        ...createTestProcessedGenericNode({
          processingParams: {
            hideInHierarchy: true,
          },
        }),
        filtering: {
          isFilterTarget: true,
          hasFilterTargetAncestor: false,
        },
      };
      const filteringFactory = await createFilteringHierarchyDefinition();
      const result = await firstValueFrom(filteringFactory.preProcessNode(inputNode).pipe(toArray()));
      expect(result).to.deep.eq([]);
    });
  });

  describe("postProcessNode", () => {
    it("returns given node when source factory has no post-processor", async () => {
      const node = createTestProcessedGenericNode();
      const filteringFactory = await createFilteringHierarchyDefinition();
      const result = await firstValueFrom(filteringFactory.postProcessNode(node));
      expect(result).to.eq(node);
    });

    it("returns node post-processed by source factory", async () => {
      const inputNode = createTestProcessedGenericNode();
      const sourceFactoryNode = createTestProcessedGenericNode();
      const stub = sinon.stub().resolves(sourceFactoryNode);
      const sourceFactory = {
        postProcessNode: (node: any) => from(stub(node)),
      } as unknown as RxjsHierarchyDefinition;
      const filteringFactory = await createFilteringHierarchyDefinition({
        sourceFactory,
      });
      const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
      expect(stub).to.be.calledOnceWithExactly(inputNode);
      expect(result).to.eq(sourceFactoryNode);
    });

    describe("handling non-grouping nodes' `autoExpand` flag", () => {
      [
        { condition: "`autoExpand: true`", autoExpand: true },
        { condition: "`autoExpand: false`", autoExpand: false },
        { condition: "`depthInPath: 0`", autoExpand: { depthInPath: 0 } },
        { condition: "`depthInPath: 1`", autoExpand: { depthInPath: 1 } },
        { condition: "`depthInHierarchy: 0`", autoExpand: { depthInHierarchy: 0 } },
        { condition: "`depthInHierarchy: 1`", autoExpand: { depthInHierarchy: 1 } },
      ].forEach(({ condition, autoExpand }) => {
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
          const filteringFactory = await createFilteringHierarchyDefinition({
            nodeIdentifierPaths: [{ path: [inputNode.key.instanceKeys[0]], options: { autoExpand } }],
          });
          const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
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
          const filteringFactory = await createFilteringHierarchyDefinition({ nodeIdentifierPaths: [{ path: [inputNode.key], options: { autoExpand } }] });
          const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
          expect(result.autoExpand).to.be.undefined;
        });
      });

      [
        {
          expectation: true,
          cases: [
            { condition: "`autoExpand: true`", autoExpand: true },
            { condition: "`depthInPath: 1`", autoExpand: { depthInPath: 1 } },
            { condition: "`depthInHierarchy: 1`", autoExpand: { depthInHierarchy: 1 } },
          ],
        },
        {
          expectation: undefined,
          cases: [
            { condition: "`autoExpand: false`", autoExpand: false },
            { condition: "`depthInPath: 0`", autoExpand: { depthInPath: 0 } },
            { condition: "`depthInHierarchy: 0`", autoExpand: { depthInHierarchy: 0 } },
          ],
        },
      ].forEach(({ expectation, cases }) => {
        cases.forEach(({ condition, autoExpand }) => {
          it(`${expectation ? "sets" : "doesn't set"} auto-expand on root instances node when it has children and ${condition}`, async () => {
            const inputNode = createTestProcessedInstanceNode({ key: { type: "instances", instanceKeys: [{ id: "0x1", className: "bis:element" }] } });
            const childNode = createTestProcessedInstanceNode({ key: { type: "instances", instanceKeys: [{ id: "0x2", className: "bis:element" }] } });
            const filteringFactory = await createFilteringHierarchyDefinition({
              nodeIdentifierPaths: [{ path: [inputNode.key.instanceKeys[0], childNode.key.instanceKeys[0]], options: { autoExpand } }],
            });
            const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
            expect(result.autoExpand).to.eq(expectation);
          });

          it(`${expectation ? "sets" : "doesn't set"} auto-expand on root generic node when it has children and ${condition}`, async () => {
            const inputNode = createTestProcessedGenericNode();
            const filteringFactory = await createFilteringHierarchyDefinition({
              nodeIdentifierPaths: [{ path: [inputNode.key, { id: "child", type: "generic" }], options: { autoExpand } }],
            });
            const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
            expect(result.autoExpand).to.eq(expectation);
          });
        });
      });

      it("sets auto-expand when classes in filter path and node relate", async () => {
        const baseClass = "BisCore.GeometricElement3d";
        const derivedClass = "BisCore.GeometricElement";
        [
          { inputNodeClass: baseClass, filteringPathNodeClass: derivedClass },
          { inputNodeClass: derivedClass, filteringPathNodeClass: baseClass },
        ].forEach(async ({ inputNodeClass, filteringPathNodeClass }) => {
          const inputNode = createTestProcessedInstanceNode({ key: { type: "instances", instanceKeys: [{ id: "0x1", className: inputNodeClass }] } });
          const imodelAccess = {
            classDerivesFrom: sinon.stub<[string, string], boolean>().returns(false),
            imodelKey: "",
          };
          imodelAccess.classDerivesFrom.withArgs(baseClass, derivedClass).returns(true);
          const filteringFactory = await createFilteringHierarchyDefinition({
            imodelAccess,
            nodeIdentifierPaths: [
              {
                path: [
                  { id: "0x1", className: filteringPathNodeClass },
                  { id: "0x2", className: filteringPathNodeClass },
                ],
                options: { autoExpand: true },
              },
            ],
          });
          const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
          expect(result.autoExpand).to.eq(true);
          const imodelAccessWithPromise = {
            classDerivesFrom: sinon.stub<[string, string], Promise<boolean>>().resolves(false),
            imodelKey: "",
          };
          imodelAccess.classDerivesFrom.withArgs(baseClass, derivedClass).resolves(true);
          const filteringFactory2 = await createFilteringHierarchyDefinition({
            imodelAccess: imodelAccessWithPromise,
            nodeIdentifierPaths: [
              {
                path: [
                  { id: "0x1", className: filteringPathNodeClass },
                  { id: "0x2", className: filteringPathNodeClass },
                ],
                options: { autoExpand: true },
              },
            ],
          });
          const result2 = await firstValueFrom(filteringFactory2.postProcessNode(inputNode));
          expect(result2.autoExpand).to.eq(true);
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
          const filteringFactory = await createFilteringHierarchyDefinition({
            imodelAccess,
            nodeIdentifierPaths: [
              {
                path: [filterPathNodeKey, { id: "0x2", className: "bis:Element" }],
                options: { autoExpand: true },
              },
            ],
          });
          const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
          expect(result.autoExpand).to.eq(undefined);
        });
      });
    });

    it("sets filtering attributes on grouping node from it's parentNode", async () => {
      const filteredChildrenIdentifierPaths = [{ path: [{ id: "child", type: "generic" as const }] }];
      const parentNode = createTestProcessedGenericNode({
        filtering: {
          isFilterTarget: true,
          hasFilterTargetAncestor: true,
          filteredChildrenIdentifierPaths,
          filterTargetOptions: {
            autoExpand: true,
          },
        },
      });
      const groupingNode = createTestProcessedGroupingNode({
        key: {
          type: "label-grouping",
          label: "test",
        },
        groupedInstanceKeys: [],
        children: [],
        parentKeys: [parentNode.key],
      });
      const filteringFactory = await createFilteringHierarchyDefinition();
      const result = await firstValueFrom(filteringFactory.postProcessNode(groupingNode, parentNode));
      expect(result.filtering).to.deep.eq({
        hasFilterTargetAncestor: true,
        filteredChildrenIdentifierPaths,
      });
    });

    const commonGroupingNodeExpansionTestCases = (createGroupingNode: () => ProcessedGroupingHierarchyNode) => {
      it("doesn't set auto-expand on grouping nodes if none of the children have filtered children paths", async () => {
        const inputNode = createGroupingNode();
        const filteringFactory = await createFilteringHierarchyDefinition();
        const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.undefined;
      });

      it("doesn't set auto-expand on grouping nodes if children have filtered children paths list set without `autoExpand` option", async () => {
        const inputNode = {
          ...createGroupingNode(),
          children: [
            {
              ...createTestProcessedInstanceNode(),
              filtering: { filteredChildrenIdentifierPaths: [[createTestInstanceKey({ id: "0x1" })]] },
            },
          ],
        };
        const filteringFactory = await createFilteringHierarchyDefinition();
        const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.undefined;
      });

      it("doesn't set auto-expand on grouping nodes when all filtered children paths contain `autoExpand = false`", async () => {
        const inputNode = {
          ...createGroupingNode(),
          children: [
            {
              ...createTestProcessedInstanceNode(),
              filtering: {
                filteredChildrenIdentifierPaths: [{ path: [createTestInstanceKey({ id: "0x1" })], options: { autoExpand: false } }],
              },
            },
          ],
        };
        const filteringFactory = await createFilteringHierarchyDefinition();
        const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.undefined;
      });

      it("sets auto-expand when one of filtered children paths contains `autoExpand = true`", async () => {
        const inputNode = {
          ...createGroupingNode(),
          children: [
            {
              ...createTestProcessedInstanceNode(),
              filtering: {
                filteredChildrenIdentifierPaths: [
                  { path: [createTestInstanceKey({ id: "0x1" })], options: { autoExpand: false } },
                  { path: [createTestInstanceKey({ id: "0x2" })], options: { autoExpand: true } },
                ],
              },
            },
          ],
        };
        const filteringFactory = await createFilteringHierarchyDefinition();
        const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.true;
      });

      it("doesn't set auto-expand when one of filtered children has `filterTarget = true` and `autoExpand = false` option", async () => {
        const inputNode = {
          ...createGroupingNode(),
          children: [
            {
              ...createTestProcessedInstanceNode(),
              filtering: { isFilterTarget: true, filterTargetOptions: { autoExpand: false } },
            },
          ],
        };
        const filteringFactory = await createFilteringHierarchyDefinition();
        const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.undefined;
      });

      it("sets auto-expand when one of filtered children has `filterTarget = true` and `autoExpand = true` option", async () => {
        const inputNode = {
          ...createGroupingNode(),
          children: [
            {
              ...createTestProcessedInstanceNode(),
              filtering: { isFilterTarget: true, filterTargetOptions: { autoExpand: true } },
            },
          ],
        };
        const filteringFactory = await createFilteringHierarchyDefinition();
        const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.true;
      });

      it("sets auto-expand when grouping node at the root and children have depthInPath set to 0", async () => {
        const groupingNode = createGroupingNode();
        const inputNode: ProcessedGroupingHierarchyNode = {
          ...groupingNode,
          children: [
            {
              ...createTestProcessedInstanceNode(),
              filtering: {
                isFilterTarget: true,
                filterTargetOptions: { autoExpand: { depthInPath: 0 } },
                filteredChildrenIdentifierPaths: [],
              },
            },
            {
              ...createTestProcessedInstanceNode(),
              filtering: {
                isFilterTarget: true,
                filterTargetOptions: { autoExpand: { depthInPath: 0 } },
                filteredChildrenIdentifierPaths: [],
              },
            },
          ],
        };
        const filteringFactory = await createFilteringHierarchyDefinition();
        const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.true;
      });

      it("sets auto-expand when grouping node is between depthInPath and depthInPath -1 nodes", async () => {
        const groupingNode = createGroupingNode();
        const inputNode: ProcessedGroupingHierarchyNode = {
          ...groupingNode,
          parentKeys: [createTestNodeKey()],
          children: [
            {
              ...createTestProcessedInstanceNode(),
              filtering: {
                filteredChildrenIdentifierPaths: [
                  {
                    path: [createTestInstanceKey()],
                    options: {
                      autoExpand: {
                        depthInPath: 1,
                      },
                    },
                  },
                ],
              },
            },
          ],
        };
        const filteringFactory = await createFilteringHierarchyDefinition();
        const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
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
              filtering: {
                filteredChildrenIdentifierPaths: [
                  {
                    path: [createTestInstanceKey()],
                    options: {
                      autoExpand: {
                        depthInPath: 2,
                      },
                    },
                  },
                ],
              },
            },
          ],
        };
        const filteringFactory = await createFilteringHierarchyDefinition();
        const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
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
              filtering: {
                filteredChildrenIdentifierPaths: [
                  {
                    path: [createTestInstanceKey()],
                    options: {
                      autoExpand: {
                        depthInHierarchy: 1,
                      },
                    },
                  },
                ],
              },
            },
          ],
        };
        const filteringFactory = await createFilteringHierarchyDefinition();
        const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
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
              filtering: {
                filteredChildrenIdentifierPaths: [
                  {
                    path: [createTestInstanceKey()],
                    options: {
                      autoExpand: {
                        depthInHierarchy: 2,
                      },
                    },
                  },
                ],
              },
            },
          ],
        };
        const filteringFactory = await createFilteringHierarchyDefinition();
        const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
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
              filtering: {
                isFilterTarget: true,
                filterTargetOptions: {
                  autoExpand: {
                    depthInPath: 1,
                  },
                },
              },
            },
          ],
        };
        const filteringFactory = await createFilteringHierarchyDefinition();
        const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.true;
      });

      it("sets auto-expand when depthInHierarchy is equal to filter target depth", async function () {
        const inputNode: ProcessedGroupingHierarchyNode = {
          ...createGroupingNode(),
          parentKeys: [createTestNodeKey()],
          children: [
            {
              ...createTestProcessedInstanceNode(),
              filtering: {
                isFilterTarget: true,
                filterTargetOptions: {
                  autoExpand: {
                    depthInHierarchy: 2,
                  },
                },
              },
            },
          ],
        };
        const filteringFactory = await createFilteringHierarchyDefinition();
        const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
        expect(result.autoExpand).to.be.true;
      });

      it("doesn't set auto-expand for grouping node whose child has autoExpand depthInPath pointing to parent", async function () {
        const inputNode: ProcessedGroupingHierarchyNode = {
          ...createGroupingNode(),
          parentKeys: [createTestNodeKey()],
          children: [
            {
              ...createTestProcessedInstanceNode(),
              filtering: {
                isFilterTarget: true,
                filterTargetOptions: {
                  autoExpand: {
                    depthInPath: 0,
                  },
                },
              },
            },
          ],
        };
        const filteringFactory = await createFilteringHierarchyDefinition();
        const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
        expect(!!result.autoExpand).to.be.false;
      });

      it("doesn't set auto-expand when grouping nodes depth between depthInPath and depthInPath +1", async () => {
        const inputNode: ProcessedGroupingHierarchyNode = {
          ...createGroupingNode(),
          parentKeys: [createTestNodeKey(), createTestNodeKey()],
          children: [
            {
              ...createTestProcessedInstanceNode(),
              filtering: {
                isFilterTarget: true,
                filterTargetOptions: {
                  autoExpand: {
                    depthInPath: 1,
                  },
                },
              },
            },
          ],
        };
        const filteringFactory = await createFilteringHierarchyDefinition();
        const result = await firstValueFrom(filteringFactory.postProcessNode(inputNode));
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

    it("returns source definitions when filtered instance paths is undefined", async () => {
      const sourceDefinitions: HierarchyLevelDefinition = [
        {
          node: {} as unknown as SourceGenericHierarchyNode,
        },
      ];
      const sourceFactory: RxjsHierarchyDefinition = {
        defineHierarchyLevel: () => of(sourceDefinitions),
      };
      const filteringFactory = await createFilteringHierarchyDefinition({
        imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
        sourceFactory,
      });
      const result = await lastValueFrom(
        filteringFactory.defineHierarchyLevel({
          parentNode: {
            ...createTestProcessedInstanceNode(),
            filtering: { filteredChildrenIdentifierPaths: undefined },
          },
        }),
      );
      expect(result).to.eq(sourceDefinitions);
    });

    it("returns no definitions when filtered instance paths list is empty", async () => {
      const sourceFactory: RxjsHierarchyDefinition = {
        defineHierarchyLevel: () =>
          of([
            {
              node: {} as unknown as SourceGenericHierarchyNode,
            },
          ]),
      };
      const filteringFactory = await createFilteringHierarchyDefinition({
        imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
        sourceFactory,
      });
      const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
      expect(result).to.be.empty;
    });

    describe("filtering generic node definitions", () => {
      it("omits source generic node definition when using instance key filter", async () => {
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
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[{ className: filterClass.fullName, id: "0x123" }]],
        });
        const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.be.empty;
      });

      it("omits source generic node definition if filter type doesn't match node's key", async () => {
        const sourceDefinition: GenericHierarchyNodeDefinition = {
          node: createTestSourceGenericNode({
            key: "custom",
            children: false,
          }),
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[createTestGenericNodeKey({ id: "xxx" })]],
        });
        const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.be.empty;
      });

      it("omits source generic node definition when filter filtering by empty path", async () => {
        const sourceDefinition: GenericHierarchyNodeDefinition = {
          node: createTestSourceGenericNode({
            key: "custom",
            children: false,
          }),
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[]],
        });
        const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
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
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[createTestGenericNodeKey({ id: "xxx", source: "other-source" })]],
        });
        const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.be.empty;
      });

      it("returns filtered source custom node definitions when filter type matches node's key", async () => {
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
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [{ path: [createTestGenericNodeKey({ id: "custom 2" })], options: { autoExpand: true } }],
        });
        const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.deep.eq([
          {
            node: {
              ...sourceDefinition2.node,
              filtering: { isFilterTarget: true, filterTargetOptions: { autoExpand: true } },
            },
          },
        ]);
      });

      it("returns source custom node definition filtered with multiple matching paths having same beginning", async () => {
        const sourceDefinition: GenericHierarchyNodeDefinition = {
          node: createTestSourceGenericNode({
            key: "custom",
            children: false,
          }),
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [
            [createTestGenericNodeKey({ id: "custom" }), createTestGenericNodeKey({ id: "123" })],
            [createTestGenericNodeKey({ id: "custom" }), createTestGenericNodeKey({ id: "456" })],
          ],
        });
        const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.deep.eq([
          {
            node: {
              ...sourceDefinition.node,
              filtering: {
                filteredChildrenIdentifierPaths: [
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
        const groupingNode: FilteringPathAutoExpandDepthInPath = { depthInPath: 0 };
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [
            { path: [createTestGenericNodeKey({ id: "custom" }), createTestGenericNodeKey({ id: "123" })], options: { autoExpand: true } },
            {
              path: [createTestGenericNodeKey({ id: "custom" }), createTestGenericNodeKey({ id: "456" })],
              options: { autoExpand: groupingNode },
            },
            [createTestGenericNodeKey({ id: "custom" }), createTestGenericNodeKey({ id: "789" })],
          ],
        });
        const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.deep.eq([
          {
            node: {
              ...sourceDefinition.node,
              filtering: {
                filteredChildrenIdentifierPaths: [
                  { path: [createTestGenericNodeKey({ id: "123" })], options: { autoExpand: true } },
                  { path: [createTestGenericNodeKey({ id: "456" })], options: { autoExpand: groupingNode } },
                  { path: [createTestGenericNodeKey({ id: "789" })], options: undefined },
                ],
              },
            },
          },
        ]);
      });

      it("applies correct filtering options to itself", async () => {
        const sourceDefinition: GenericHierarchyNodeDefinition = {
          node: createTestSourceGenericNode({
            key: "custom",
            children: false,
          }),
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [
            { path: [createTestGenericNodeKey({ id: "custom" }), createTestGenericNodeKey({ id: "123" })], options: { autoExpand: true } },
            { path: [createTestGenericNodeKey({ id: "custom" })], options: { autoExpand: false } },
            { path: [createTestGenericNodeKey({ id: "custom" })], options: { autoExpand: true } },
          ],
        });
        const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.deep.eq([
          {
            node: {
              ...sourceDefinition.node,
              filtering: {
                filteredChildrenIdentifierPaths: [{ path: [createTestGenericNodeKey({ id: "123" })], options: { autoExpand: true } }],
                isFilterTarget: true,
                filterTargetOptions: { autoExpand: true },
              },
            },
          },
        ]);
      });
    });

    describe("filtering instance node query definitions", () => {
      it("omits source instance node query definition when using custom node filter", async () => {
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
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[createTestGenericNodeKey({ id: "xxx" })]],
        });
        const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.be.empty;
      });

      it("omits source instance node query definition if filter class doesn't match query class", async () => {
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
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[{ className: filterPathClass.fullName, id: "0x123" }]],
        });
        const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.be.empty;
      });

      it("omits source instance node query definition when filter filtering by empty path", async () => {
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
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[]],
        });
        const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
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
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[{ className: "filter.class", id: "0x123", imodelKey: "other-source" }]],
        });
        const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.be.empty;
      });

      it("returns unfiltered source instance node query definitions when filtering filter target parent node", async () => {
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
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [],
        });
        const result = await lastValueFrom(
          filteringFactory.defineHierarchyLevel({
            parentNode: {
              ...createTestProcessedInstanceNode(),
              filtering: {
                isFilterTarget: true,
                filteredChildrenIdentifierPaths: new Array<HierarchyNodeIdentifiersPath>(),
              },
            },
          }),
        );
        expect(result).to.deep.eq([applyECInstanceIdsSelector(sourceDefinition)]);
      });

      it("returns filtered source instance node query definitions when filter class matches query class", async () => {
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
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [
            [
              { className: filterPathClass1.fullName, id: "0x123" },
              { className: filterPathClass2.fullName, id: "0x456" },
            ],
            [{ className: filterPathClass1.fullName, id: "0x789" }],
          ],
        });
        const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
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

      it("returns source instance node query definition filtered with multiple matching paths", async () => {
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
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[{ className: filterPathClass1.fullName, id: "0x123" }], [{ className: filterPathClass2.fullName, id: "0x456" }]],
        });
        const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
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

      it("returns source instance node query definition filtered with multiple matching paths having same beginning", async () => {
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
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [
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
        const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.deep.eq([
          applyECInstanceIdsFilter(sourceDefinition, [
            {
              className: filterPathClass0.fullName,
              id: "0x123",
            },
          ]),
        ]);
      });

      it("returns source instance node query definition filtered with matching path beginning with derived class", async () => {
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
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [
            [{ className: queryClass.fullName, id: "0x123" }],
            [
              { className: filterPathClass0.fullName, id: "0x123" },
              { className: filterPathClass1.fullName, id: "0x456" },
            ],
          ],
        });
        const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.deep.eq([
          applyECInstanceIdsFilter(sourceDefinition, [
            {
              className: queryClass.fullName,
              id: "0x123",
            },
          ]),
        ]);
      });

      it("returns source instance node query definition filtered with matching path beginning with base class", async () => {
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
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [
            [{ className: filterPathClass0.fullName, id: "0x123" }],
            [
              { className: queryClass.fullName, id: "0x123" },
              { className: filterPathClass1.fullName, id: "0x456" },
            ],
          ],
        });
        const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
        expect(result).to.deep.eq([
          applyECInstanceIdsFilter(sourceDefinition, [
            {
              className: filterPathClass0.fullName,
              id: "0x123",
            },
          ]),
        ]);
      });

      it("sets most nested grouping node as filter target", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName" });
        const filterPathClass0 = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName0",
          baseClass: queryClass,
        });
        const autoExpandForGroupingNode1: FilteringPathAutoExpandDepthInPath = { depthInPath: 1 };
        const autoExpandForGroupingNode2: FilteringPathAutoExpandDepthInPath = { depthInPath: 3 };
        const autoExpandForGroupingNode3: FilteringPathAutoExpandDepthInPath = { depthInPath: 0 };
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory: RxjsHierarchyDefinition = {
          defineHierarchyLevel: () => of([sourceDefinition]),
        };
        const filteringFactory = await createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [
            {
              path: [{ className: filterPathClass0.fullName, id: "0x123" }],
              options: { autoExpand: autoExpandForGroupingNode1 },
            },
            {
              path: [{ className: filterPathClass0.fullName, id: "0x123" }],
              options: { autoExpand: autoExpandForGroupingNode2 },
            },
            {
              path: [{ className: filterPathClass0.fullName, id: "0x123" }],
              options: { autoExpand: autoExpandForGroupingNode3 },
            },
          ],
        });
        const result = await lastValueFrom(filteringFactory.defineHierarchyLevel({ parentNode: undefined }));
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

    it("uses filtering paths from parent node", async () => {
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
      const filteringFactory = await createFilteringHierarchyDefinition({
        imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
        sourceFactory,
        nodeIdentifierPaths: [], // this doesn't matter as we're going to look at what's in the parent node
      });
      const result = await lastValueFrom(
        filteringFactory.defineHierarchyLevel({
          parentNode: {
            ...createTestProcessedGenericNode({
              key: createTestGenericNodeKey({ id: "custom" }),
              label: "custom node",
            }),
            filtering: {
              filteredChildrenIdentifierPaths: [[{ className: childFilterClass.fullName, id: "0x456" }]],
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

    it("returns all definitions for a filter target parent node", async () => {
      const matchingSourceDefinition: GenericHierarchyNodeDefinition = {
        node: createTestSourceGenericNode({ key: "matches" }),
      };
      const nonMatchingSourceDefinition: GenericHierarchyNodeDefinition = {
        node: createTestSourceGenericNode({ key: "doesn't match" }),
      };
      const sourceFactory: RxjsHierarchyDefinition = {
        defineHierarchyLevel: () => of([matchingSourceDefinition, nonMatchingSourceDefinition]),
      };
      const filteringFactory = await createFilteringHierarchyDefinition({
        imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
        sourceFactory,
        nodeIdentifierPaths: [], // this doesn't matter as we're going to look at what's in the parent node
      });
      const result = await lastValueFrom(
        filteringFactory.defineHierarchyLevel({
          parentNode: {
            ...createTestProcessedGenericNode({
              key: createTestGenericNodeKey({ id: "parent" }),
              label: "parent",
            }),
            filtering: {
              isFilterTarget: true,
              filteredChildrenIdentifierPaths: [[createTestGenericNodeKey({ id: "matches" })]],
            },
          },
        }),
      );
      expect(result).to.deep.eq([
        // both definitions are returned because the parent is filter target
        {
          node: {
            ...matchingSourceDefinition.node,
            filtering: { hasFilterTargetAncestor: true, isFilterTarget: true, filterTargetOptions: undefined },
          },
        },
        {
          node: {
            ...nonMatchingSourceDefinition.node,
            filtering: { hasFilterTargetAncestor: true },
          },
        },
      ]);
    });
  });

  describe("applyECInstanceIdsFilter", () => {
    it("creates a valid CTE for filtered instance paths", () => {
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

async function createFilteringHierarchyDefinition(props?: {
  imodelAccess?: ECClassHierarchyInspector & { imodelKey: string };
  sourceFactory?: RxjsHierarchyDefinition;
  nodeIdentifierPaths?: HierarchyFilteringPath[];
  nodesParser?: RxjsNodeParser;
}) {
  const { imodelAccess, sourceFactory, nodeIdentifierPaths } = props ?? {};
  return new FilteringHierarchyDefinition({
    imodelAccess: imodelAccess ?? { classDerivesFrom: async () => false, imodelKey: "" },
    source: sourceFactory ?? ({} as unknown as RxjsHierarchyDefinition),
    nodeIdentifierPaths: nodeIdentifierPaths ?? [],
    nodesParser: props?.nodesParser,
  });
}
