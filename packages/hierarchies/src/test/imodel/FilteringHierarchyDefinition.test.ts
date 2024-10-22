/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { assert, expect } from "chai";
import sinon from "sinon";
import { ECClassHierarchyInspector, InstanceKey, trimWhitespace } from "@itwin/presentation-shared";
import { FilterTargetGroupingNodeInfo, HierarchyFilteringPath, HierarchyFilteringPathOptions } from "../../hierarchies/HierarchyFiltering.js";
import { HierarchyNode } from "../../hierarchies/HierarchyNode.js";
import { HierarchyNodeIdentifiersPath } from "../../hierarchies/HierarchyNodeIdentifier.js";
import {
  applyECInstanceIdsFilter,
  ECSQL_COLUMN_NAME_FilterClassName,
  ECSQL_COLUMN_NAME_FilterECInstanceId,
  ECSQL_COLUMN_NAME_HasFilterTargetAncestor,
  FilteringHierarchyDefinition,
  MatchedFilter,
} from "../../hierarchies/imodel/FilteringHierarchyDefinition.js";
import {
  GenericHierarchyNodeDefinition,
  HierarchyDefinition,
  HierarchyDefinitionParentNode,
  HierarchyLevelDefinition,
  InstanceNodesQueryDefinition,
} from "../../hierarchies/imodel/IModelHierarchyDefinition.js";
import { ProcessedGenericHierarchyNode, ProcessedGroupingHierarchyNode, SourceGenericHierarchyNode } from "../../hierarchies/imodel/IModelHierarchyNode.js";
import { NodeSelectClauseColumnNames } from "../../hierarchies/imodel/NodeSelectQueryFactory.js";
import * as reader from "../../hierarchies/imodel/TreeNodesReader.js";
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
  afterEach(() => {
    sinon.restore();
  });

  describe("parseNode", () => {
    let classHierarchyInspector: ReturnType<typeof createClassHierarchyInspectorStub>;
    beforeEach(() => {
      classHierarchyInspector = createClassHierarchyInspectorStub();
    });

    it("uses `defaultNodeParser` when source definitions factory doesn't have one", async () => {
      const defaultParserSpy = sinon.spy(reader, "defaultNodesParser");

      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
      };

      const filteringFactory = createFilteringHierarchyDefinition();
      await filteringFactory.parseNode(row);
      expect(defaultParserSpy).to.be.calledOnceWithExactly(row);
    });

    it("uses source's node parser when it has one", async () => {
      const sourceFactory = {
        parseNode: sinon.stub().returns({} as unknown as HierarchyNode),
      } as unknown as HierarchyDefinition;

      const defaultParserSpy = sinon.spy(reader, "defaultNodesParser");

      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
      };
      const filteringFactory = createFilteringHierarchyDefinition({
        sourceFactory,
      });
      await filteringFactory.parseNode(row);
      expect(defaultParserSpy).to.not.be.called;
      expect(sourceFactory.parseNode).to.be.calledOnceWithExactly(row);
    });

    it("sets filtered node attributes when parentNode is undefined", async () => {
      const sourceFactory = {} as unknown as HierarchyDefinition;

      const className = "TestSchema.TestName";
      const paths: HierarchyNodeIdentifiersPath[] = [
        [createTestInstanceKey({ id: "0x5", className }), createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })],
        [createTestInstanceKey({ id: "0x5", className }), createTestInstanceKey({ id: "0x3" })],
        [createTestInstanceKey({ id: "0x5", className })],
      ];
      const filteringFactory = createFilteringHierarchyDefinition({
        ...sourceFactory,
        nodeIdentifierPaths: paths,
      });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_HasFilterTargetAncestor]: 1,
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x5",
        [ECSQL_COLUMN_NAME_FilterClassName]: className,
      };
      const node = await filteringFactory.parseNode(row);
      expect(node.filtering).to.deep.eq({
        filteredChildrenIdentifierPaths: [[createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })], [createTestInstanceKey({ id: "0x3" })]],
        isFilterTarget: true,
        filterTargetOptions: undefined,
        hasFilterTargetAncestor: true,
      });
    });

    it("sets correct filteredChildrenIdentifierPaths when parentNode paths have same id's and different classNames that don't derive from one another", async () => {
      const sourceFactory = {} as unknown as HierarchyDefinition;

      const className = "TestSchema.TestName";
      const className2 = "TestSchema.TestName2";
      const paths: HierarchyNodeIdentifiersPath[] = [
        [createTestInstanceKey({ id: "0x5", className }), createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })],
        [createTestInstanceKey({ id: "0x5", className, imodelKey: "randomKey" }), createTestInstanceKey({ id: "0x3" })],
        [createTestInstanceKey({ id: "0x5", className: className2 }), createTestInstanceKey({ id: "0x4" })],
        [createTestInstanceKey({ id: "0x5", className })],
      ];
      const filteringFactory = createFilteringHierarchyDefinition({
        ...sourceFactory,
        // This is not necessary as parentNode paths will be used instead
        nodeIdentifierPaths: [],
      });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_HasFilterTargetAncestor]: 1,
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x5",
        [ECSQL_COLUMN_NAME_FilterClassName]: className,
      };
      const parentNode: HierarchyDefinitionParentNode = {
        label: "",
        parentKeys: [],
        key: { type: "generic", id: "" },
        filtering: { filteredChildrenIdentifierPaths: paths },
      };
      const node = await filteringFactory.parseNode(row, parentNode);
      expect(node.filtering).to.deep.eq({
        filteredChildrenIdentifierPaths: [[createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })]],
        isFilterTarget: true,
        filterTargetOptions: undefined,
        hasFilterTargetAncestor: true,
      });
    });

    it("sets correct filteredChildrenIdentifierPaths when same identifier is in different positions of different paths", async () => {
      const sourceFactory = {} as unknown as HierarchyDefinition;

      const className = "TestSchema.TestName";
      const paths: HierarchyFilteringPath[] = [
        [createTestInstanceKey({ id: "0x4", className }), createTestInstanceKey({ id: "0x2" })],
        [createTestInstanceKey({ id: "0x3" }), createTestInstanceKey({ id: "0x4", className }), createTestInstanceKey({ id: "0x5" })],
      ];
      const filteringFactory = createFilteringHierarchyDefinition({
        ...sourceFactory,
        // This is not necessary as parentNode paths will be used instead
        nodeIdentifierPaths: [],
      });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_HasFilterTargetAncestor]: 1,
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x4",
        [ECSQL_COLUMN_NAME_FilterClassName]: className,
      };
      const parentNode: HierarchyDefinitionParentNode = {
        label: "",
        parentKeys: [],
        key: { type: "generic", id: "" },
        filtering: { filteredChildrenIdentifierPaths: paths },
      };
      const node = await filteringFactory.parseNode(row, parentNode);
      expect(node.filtering).to.deep.eq({
        filteredChildrenIdentifierPaths: [[createTestInstanceKey({ id: "0x2" })]],
        hasFilterTargetAncestor: true,
      });
    });

    it("sets correct filteredChildrenIdentifierPaths when same identifier is in different positions of the same path", async () => {
      const sourceFactory = {} as unknown as HierarchyDefinition;

      const className = "TestSchema.TestName";
      const paths: HierarchyFilteringPath[] = [
        [
          createTestInstanceKey({ id: "0x3", className }),
          createTestInstanceKey({ id: "0x1" }),
          createTestInstanceKey({ id: "0x3", className }),
          createTestInstanceKey({ id: "0x2" }),
        ],
      ];
      const filteringFactory = createFilteringHierarchyDefinition({
        ...sourceFactory,
        nodeIdentifierPaths: paths,
      });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_HasFilterTargetAncestor]: 1,
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x3",
        [ECSQL_COLUMN_NAME_FilterClassName]: className,
      };
      const parentNode: HierarchyDefinitionParentNode = {
        label: "",
        parentKeys: [],
        key: { type: "generic", id: "" },
        filtering: { filteredChildrenIdentifierPaths: paths },
      };
      const node = await filteringFactory.parseNode(row, parentNode);
      expect(node.filtering).to.deep.eq({
        filteredChildrenIdentifierPaths: [
          [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x3", className }), createTestInstanceKey({ id: "0x2" })],
        ],
        hasFilterTargetAncestor: true,
      });
    });

    it("sets correct filteredChildrenIdentifierPaths when nodes have same id's and different classNames that derive from one another", async () => {
      const sourceFactory = {} as unknown as HierarchyDefinition;

      const class1 = classHierarchyInspector.stubEntityClass({
        schemaName: "BisCore",
        className: "SourceQueryClassName",
        is: async (other) => other === class1.fullName,
      });
      const class2 = classHierarchyInspector.stubEntityClass({
        schemaName: "BisCore",
        className: "FilterPathClassName0",
        is: async (other) => other === class1.fullName,
      });
      const paths: HierarchyNodeIdentifiersPath[] = [
        [createTestInstanceKey({ id: "0x5", className: class1.fullName }), createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })],
        [createTestInstanceKey({ id: "0x5", className: class1.fullName }), createTestInstanceKey({ id: "0x3" })],
        [createTestInstanceKey({ id: "0x5", className: class2.fullName }), createTestInstanceKey({ id: "0x4" })],
      ];
      const filteringFactory = createFilteringHierarchyDefinition({
        imodelAccess: { ...classHierarchyInspector, imodelKey: "someKey" },
        sourceFactory,
        nodeIdentifierPaths: [],
      });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_HasFilterTargetAncestor]: 1,
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x5",
        [ECSQL_COLUMN_NAME_FilterClassName]: class1.fullName,
      };
      const parentNode: HierarchyDefinitionParentNode = {
        label: "",
        parentKeys: [],
        key: { type: "generic", id: "" },
        filtering: { filteredChildrenIdentifierPaths: paths },
      };
      const node = await filteringFactory.parseNode(row, parentNode);
      expect(node.filtering).to.deep.eq({
        filteredChildrenIdentifierPaths: [
          [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })],
          [createTestInstanceKey({ id: "0x3" })],
          [createTestInstanceKey({ id: "0x4" })],
        ],
        hasFilterTargetAncestor: true,
      });
    });

    it("doesn't set auto-expand when filtered children paths is not set", async () => {
      const filteringFactory = createFilteringHierarchyDefinition();
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
      };
      const node = await filteringFactory.parseNode(row);
      expect(node.autoExpand).to.be.undefined;
    });

    it("doesn't set auto-expand when filtered children paths list is empty", async () => {
      const filteringFactory = createFilteringHierarchyDefinition({ nodeIdentifierPaths: [] });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
      };
      const node = await filteringFactory.parseNode(row);
      expect(node.autoExpand).to.be.undefined;
    });

    it("does not set auto-expand when filtered children paths list is provided without `autoExpand` option", async () => {
      const paths: HierarchyNodeIdentifiersPath[] = [
        [createTestInstanceKey({ id: "0x1", className: "TestSchema.TestName" }), createTestInstanceKey({ id: "0x2", className: "TestSchema.TestName" })],
      ];
      const filteringFactory = createFilteringHierarchyDefinition({ nodeIdentifierPaths: paths });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x1",
        [ECSQL_COLUMN_NAME_FilterClassName]: "TestSchema.TestName",
      };
      const node = await filteringFactory.parseNode(row);
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
      const filteringFactory = createFilteringHierarchyDefinition({ nodeIdentifierPaths: paths });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x1",
        [ECSQL_COLUMN_NAME_FilterClassName]: "TestSchema.TestName",
      };
      const node = await filteringFactory.parseNode(row);
      expect(node.autoExpand).to.be.undefined;
    });

    it("sets auto-expand when one of filtered children paths contains `autoExpand = true`", async () => {
      const paths = [
        {
          path: [
            createTestInstanceKey({ id: "0x1", className: "TestSchema.TestName" }),
            createTestInstanceKey({ id: "0x2", className: "TestSchema.TestName" }),
          ],
          options: { autoExpand: false },
        },
        {
          path: [
            createTestInstanceKey({ id: "0x1", className: "TestSchema.TestName" }),
            createTestInstanceKey({ id: "0x3", className: "TestSchema.TestName" }),
          ],
          options: { autoExpand: true },
        },
      ];
      const filteringFactory = createFilteringHierarchyDefinition({ nodeIdentifierPaths: paths });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x1",
        [ECSQL_COLUMN_NAME_FilterClassName]: "TestSchema.TestName",
      };
      const node = await filteringFactory.parseNode(row);
      expect(node.autoExpand).to.be.true;
    });

    it("sets `filtering.filterTargetOptions` and `filtering.isFilterTarget` attribute from parent node paths", async () => {
      const sourceFactory = {} as unknown as HierarchyDefinition;
      const className = "TestSchema.TestName";
      const filteringOptions: HierarchyFilteringPathOptions = {
        autoExpand: { key: { type: "class-grouping", className: "" }, depth: 0 },
      };
      const paths = [{ path: [createTestInstanceKey({ id: "0x5", className })], options: filteringOptions }, [createTestInstanceKey({ id: "0x5", className })]];
      const filteringFactory = createFilteringHierarchyDefinition({
        ...sourceFactory,
        // This is not necessary as parentNode paths will be used instead
        nodeIdentifierPaths: [],
      });
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_HasFilterTargetAncestor]: 1,
        [ECSQL_COLUMN_NAME_FilterECInstanceId]: "0x5",
        [ECSQL_COLUMN_NAME_FilterClassName]: className,
      };
      const parentNode: HierarchyDefinitionParentNode = {
        label: "",
        parentKeys: [],
        key: { type: "generic", id: "" },
        filtering: { filteredChildrenIdentifierPaths: paths },
      };
      const node = await filteringFactory.parseNode(row, parentNode);

      assert(node.filtering?.isFilterTarget);
      expect(node.filtering.filterTargetOptions).to.deep.eq(filteringOptions);
    });
  });

  describe("preProcessNode", () => {
    it("returns given node when source factory has no pre-processor", async () => {
      const node = createTestProcessedGenericNode();
      const filteringFactory = createFilteringHierarchyDefinition();
      const result = await filteringFactory.preProcessNode(node);
      expect(result).to.eq(node);
    });

    it("returns node pre-processed by source factory", async () => {
      const inputNode = createTestProcessedGenericNode();
      const sourceFactoryNode = createTestProcessedGenericNode();
      const sourceFactory = {
        preProcessNode: sinon.stub().returns(sourceFactoryNode),
      } as unknown as HierarchyDefinition;
      const filteringFactory = createFilteringHierarchyDefinition({
        sourceFactory,
      });
      const result = await filteringFactory.preProcessNode(inputNode);
      expect(sourceFactory.preProcessNode).to.be.calledOnceWithExactly(inputNode);
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
      const filteringFactory = createFilteringHierarchyDefinition();
      const result = await filteringFactory.preProcessNode(inputNode);
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
      const filteringFactory = createFilteringHierarchyDefinition();
      const result = await filteringFactory.preProcessNode(inputNode);
      expect(result).to.be.undefined;
    });
  });

  describe("postProcessNode", () => {
    it("returns given node when source factory has no post-processor", async () => {
      const node = createTestProcessedGenericNode();
      const filteringFactory = createFilteringHierarchyDefinition();
      const result = await filteringFactory.postProcessNode(node);
      expect(result).to.eq(node);
    });

    it("returns node post-processed by source factory", async () => {
      const inputNode = createTestProcessedGenericNode();
      const sourceFactoryNode = createTestProcessedGenericNode();
      const sourceFactory = {
        postProcessNode: sinon.stub().resolves(sourceFactoryNode),
      } as unknown as HierarchyDefinition;
      const filteringFactory = createFilteringHierarchyDefinition({
        sourceFactory,
      });
      const result = await filteringFactory.postProcessNode(inputNode);
      expect(sourceFactory.postProcessNode).to.be.calledOnceWithExactly(inputNode);
      expect(result).to.eq(sourceFactoryNode);
    });

    it("returns undefined when source factory post processor returns undefined", async () => {
      const inputNode = createTestProcessedGenericNode();
      const sourceFactory = {
        postProcessNode: sinon.stub().resolves(undefined),
      } as unknown as HierarchyDefinition;
      const filteringFactory = createFilteringHierarchyDefinition({
        sourceFactory,
      });
      const result = await filteringFactory.postProcessNode(inputNode);
      expect(sourceFactory.postProcessNode).to.be.calledOnceWithExactly(inputNode);
      expect(result).to.eq(undefined);
    });

    const commonGroupingNodeExpansionTestCases = (createGroupingNode: () => ProcessedGroupingHierarchyNode) => {
      it("doesn't set auto-expand on grouping nodes if none of the children have filtered children paths", async () => {
        const inputNode = createGroupingNode();
        const filteringFactory = createFilteringHierarchyDefinition();
        const result = await filteringFactory.postProcessNode(inputNode);
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
        const filteringFactory = createFilteringHierarchyDefinition();
        const result = await filteringFactory.postProcessNode(inputNode);
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
        const filteringFactory = createFilteringHierarchyDefinition();
        const result = await filteringFactory.postProcessNode(inputNode);
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
        const filteringFactory = createFilteringHierarchyDefinition();
        const result = await filteringFactory.postProcessNode(inputNode);
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
        const filteringFactory = createFilteringHierarchyDefinition();
        const result = await filteringFactory.postProcessNode(inputNode);
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
        const filteringFactory = createFilteringHierarchyDefinition();
        const result = await filteringFactory.postProcessNode(inputNode);
        expect(result.autoExpand).to.be.true;
      });

      it("doesn't set auto-expand when all child nodes target grouping node", async () => {
        const groupingNode = createGroupingNode();
        const inputNode: ProcessedGroupingHierarchyNode = {
          ...groupingNode,
          children: [
            {
              ...createTestProcessedInstanceNode(),
              filtering: {
                isFilterTarget: true,
                filterTargetOptions: { autoExpand: { key: groupingNode.key, depth: 0 } },
                filteredChildrenIdentifierPaths: [],
              },
            },
            {
              ...createTestProcessedInstanceNode(),
              filtering: {
                isFilterTarget: true,
                filterTargetOptions: { autoExpand: { key: groupingNode.key, depth: 0 } },
                filteredChildrenIdentifierPaths: [],
              },
            },
          ],
        };
        const filteringFactory = createFilteringHierarchyDefinition();
        const result = await filteringFactory.postProcessNode(inputNode);
        expect(result.autoExpand).to.be.undefined;
      });

      it("sets auto-expand when at least one child node targets another grouping node", async () => {
        const groupingNode = createGroupingNode();
        const otherGroupingNode = createGroupingNode();
        const inputNode: ProcessedGroupingHierarchyNode = {
          ...groupingNode,
          children: [
            {
              ...createTestProcessedInstanceNode(),
              filtering: {
                isFilterTarget: true,
                filterTargetOptions: { autoExpand: { key: groupingNode.key, depth: 0 } },
                filteredChildrenIdentifierPaths: [],
              },
            },
            {
              ...createTestProcessedInstanceNode(),
              filtering: {
                isFilterTarget: true,
                filterTargetOptions: { autoExpand: { key: otherGroupingNode.key, depth: 0 } },
                filteredChildrenIdentifierPaths: [],
              },
            },
          ],
        };
        const filteringFactory = createFilteringHierarchyDefinition();
        const result = await filteringFactory.postProcessNode(inputNode);
        expect(result.autoExpand).to.be.undefined;
      });

      it("sets auto-expand when node has hierarchy depth smaller than the filter target and same key", async () => {
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
                    key: groupingNode.key,
                    depth: 2,
                  },
                },
              },
            },
          ],
        };
        const filteringFactory = createFilteringHierarchyDefinition();
        const result = await filteringFactory.postProcessNode(inputNode);
        expect(result.autoExpand).to.be.true;
      });

      it("sets auto-expand when node has hierarchy depth smaller than the filter target and different key", async function () {
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
                    key: { type: "class-grouping", className: this.test!.title },
                    depth: 2,
                  },
                },
              },
            },
          ],
        };
        const filteringFactory = createFilteringHierarchyDefinition();
        const result = await filteringFactory.postProcessNode(inputNode);
        expect(result.autoExpand).to.be.true;
      });

      it("doesn't set auto-expand when node has same hierarchy depth and same keys as the filter target", async () => {
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
                    key: createGroupingNode().key,
                    depth: 1,
                  },
                },
              },
            },
          ],
        };
        const filteringFactory = createFilteringHierarchyDefinition();
        const result = await filteringFactory.postProcessNode(inputNode);
        expect(!!result.autoExpand).to.be.false;
      });

      it("doesn't set auto-expand when node has greater hierarchy depth than the filter target", async () => {
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
                    ...createTestProcessedGroupingNode(),
                    key: {
                      type: "class-grouping",
                      className: "foo",
                    },
                    depth: 1,
                  },
                },
              },
            },
          ],
        };
        const filteringFactory = createFilteringHierarchyDefinition();
        const result = await filteringFactory.postProcessNode(inputNode);
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
      const sourceFactory: HierarchyDefinition = {
        defineHierarchyLevel: async () => sourceDefinitions,
      };
      const filteringFactory = createFilteringHierarchyDefinition({
        imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
        sourceFactory,
      });
      const result = await filteringFactory.defineHierarchyLevel({
        parentNode: {
          ...createTestProcessedInstanceNode(),
          filtering: { filteredChildrenIdentifierPaths: undefined },
        },
      });
      expect(result).to.eq(sourceDefinitions);
    });

    it("returns no definitions when filtered instance paths list is empty", async () => {
      const sourceFactory: HierarchyDefinition = {
        defineHierarchyLevel: async () => [
          {
            node: {} as unknown as SourceGenericHierarchyNode,
          },
        ],
      };
      const filteringFactory = createFilteringHierarchyDefinition({
        imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
        sourceFactory,
      });
      const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
      expect(result).to.be.empty;
    });

    describe("filtering generic node definitions", () => {
      it("omits source generic node definition when using instance key filter", async () => {
        const filterClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "FilterClassName", is: async () => false });
        const sourceDefinition: GenericHierarchyNodeDefinition = {
          node: createTestSourceGenericNode({
            key: "custom",
            children: false,
          }),
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[{ className: filterClass.fullName, id: "0x123" }]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.be.empty;
      });

      it("omits source generic node definition if filter type doesn't match node's key", async () => {
        const sourceDefinition: GenericHierarchyNodeDefinition = {
          node: createTestSourceGenericNode({
            key: "custom",
            children: false,
          }),
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[createTestGenericNodeKey({ id: "xxx" })]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.be.empty;
      });

      it("omits source generic node definition when filter filtering by empty path", async () => {
        const sourceDefinition: GenericHierarchyNodeDefinition = {
          node: createTestSourceGenericNode({
            key: "custom",
            children: false,
          }),
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.be.empty;
      });

      it("omits source generic node definition if identifier source doesn't match imodel key", async () => {
        const sourceDefinition: GenericHierarchyNodeDefinition = {
          node: createTestSourceGenericNode({
            key: "custom",
            children: false,
          }),
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[createTestGenericNodeKey({ id: "xxx", source: "other-source" })]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
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
        const sourceFactory: HierarchyDefinition = {
          defineHierarchyLevel: async () => [sourceDefinition1, sourceDefinition2],
        };
        const filteringFactory = createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[createTestGenericNodeKey({ id: "custom 2" })], [createTestGenericNodeKey({ id: "custom 2" })]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.deep.eq([
          {
            node: {
              ...sourceDefinition2.node,
              filtering: { isFilterTarget: true, filterTargetOptions: undefined },
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
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [
            [createTestGenericNodeKey({ id: "custom" }), createTestGenericNodeKey({ id: "123" })],
            [createTestGenericNodeKey({ id: "custom" }), createTestGenericNodeKey({ id: "456" })],
          ],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.deep.eq([
          {
            node: {
              ...sourceDefinition.node,
              filtering: {
                filteredChildrenIdentifierPaths: [[createTestGenericNodeKey({ id: "123" })], [createTestGenericNodeKey({ id: "456" })]],
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
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const groupingNode: FilterTargetGroupingNodeInfo = { key: { type: "class-grouping", className: "class" }, depth: 0 };
        const filteringFactory = createFilteringHierarchyDefinition({
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
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.deep.eq([
          {
            node: {
              ...sourceDefinition.node,
              autoExpand: true,
              filtering: {
                filteredChildrenIdentifierPaths: [
                  { path: [createTestGenericNodeKey({ id: "123" })], options: { autoExpand: true } },
                  { path: [createTestGenericNodeKey({ id: "456" })], options: { autoExpand: groupingNode } },
                  [createTestGenericNodeKey({ id: "789" })],
                ],
              },
            },
          },
        ]);
      });
    });

    describe("filtering instance node query definitions", () => {
      it("omits source instance node query definition when using custom node filter", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[createTestGenericNodeKey({ id: "xxx" })]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.be.empty;
      });

      it("omits source instance node query definition if filter class doesn't match query class", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
        const filterPathClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "FilterPathClassName", is: async () => false });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[{ className: filterPathClass.fullName, id: "0x123" }]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.be.empty;
      });

      it("omits source instance node query definition when filter filtering by empty path", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.be.empty;
      });

      it("omits source instance node query definition if identifier source doesn't match imodel key", async () => {
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: "query.class",
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[{ className: "filter.class", id: "0x123", imodelKey: "other-source" }]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.be.empty;
      });

      it("returns unfiltered source instance node query definitions when filtering filter target parent node", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [],
        });
        const result = await filteringFactory.defineHierarchyLevel({
          parentNode: {
            ...createTestProcessedInstanceNode(),
            filtering: {
              isFilterTarget: true,
              filteredChildrenIdentifierPaths: new Array<HierarchyNodeIdentifiersPath>(),
            },
          },
        });
        expect(result).to.deep.eq([sourceDefinition]);
      });

      it("returns filtered source instance node query definitions when filter class matches query class", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
        const filterPathClass1 = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName1",
          is: async (other) => other === queryClass.fullName,
        });
        const filterPathClass2 = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "FilterPathClassName2", is: async () => false });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyDefinition({
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
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.deep.eq([
          applyECInstanceIdsFilter(
            sourceDefinition,
            [
              {
                id: { className: filterPathClass1.fullName, id: "0x123" },
              },
              {
                id: { className: filterPathClass1.fullName, id: "0x789" },
              },
            ] as Array<MatchedFilter<InstanceKey>>,
            false,
          ),
        ]);
      });

      it("returns source instance node query definition filtered with multiple matching paths", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
        const filterPathClass1 = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName1",
          is: async (other) => other === queryClass.fullName,
        });
        const filterPathClass2 = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName2",
          is: async (other) => other === queryClass.fullName,
        });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [[{ className: filterPathClass1.fullName, id: "0x123" }], [{ className: filterPathClass2.fullName, id: "0x456" }]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.deep.eq([
          applyECInstanceIdsFilter(
            sourceDefinition,
            [
              {
                id: { className: filterPathClass1.fullName, id: "0x123" },
              },
              {
                id: { className: filterPathClass2.fullName, id: "0x456" },
              },
            ] as Array<MatchedFilter<InstanceKey>>,
            false,
          ),
        ]);
      });

      it("returns source instance node query definition filtered with multiple matching paths having same beginning", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
        const filterPathClass0 = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName0",
          is: async (other) => other === queryClass.fullName,
        });
        const filterPathClass1 = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "FilterPathClassName1", is: async () => false });
        const filterPathClass2 = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "FilterPathClassName2", is: async () => false });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyDefinition({
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
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.deep.eq([
          applyECInstanceIdsFilter(
            sourceDefinition,
            [
              {
                id: { className: filterPathClass0.fullName, id: "0x123" },
              },
            ] as Array<MatchedFilter<InstanceKey>>,
            false,
          ),
        ]);
      });

      it("returns source instance node query definition filtered with matching path beginning with derived class", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "SourceQueryClassName",
          is: async (other) => other === queryClass.fullName,
        });
        const filterPathClass0 = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName0",
          is: async (other) => other === queryClass.fullName,
        });
        const filterPathClass1 = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "FilterPathClassName1", is: async () => false });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyDefinition({
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
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.deep.eq([
          applyECInstanceIdsFilter(
            sourceDefinition,
            [
              {
                id: { className: queryClass.fullName, id: "0x123" },
              },
            ] as Array<MatchedFilter<InstanceKey>>,
            false,
          ),
        ]);
      });

      it("returns source instance node query definition filtered with matching path beginning with base class", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "SourceQueryClassName",
          is: async (other) => other === queryClass.fullName,
        });
        const filterPathClass0 = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName0",
          is: async (other) => other === queryClass.fullName,
        });
        const filterPathClass1 = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "FilterPathClassName1", is: async () => false });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyDefinition({
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
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.deep.eq([
          applyECInstanceIdsFilter(
            sourceDefinition,
            [
              {
                id: { className: filterPathClass0.fullName, id: "0x123" },
              },
            ] as Array<MatchedFilter<InstanceKey>>,
            false,
          ),
        ]);
      });

      it("sets most nested grouping node as filter target", async () => {
        const queryClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
        const filterPathClass0 = classHierarchyInspector.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName0",
          is: async (other) => other === queryClass.fullName,
        });
        const groupingNode1: FilterTargetGroupingNodeInfo = { key: { type: "class-grouping", className: "class1" }, depth: 1 };
        const groupingNode2: FilterTargetGroupingNodeInfo = { key: { type: "class-grouping", className: "class2" }, depth: 3 };
        const groupingNode3: FilterTargetGroupingNodeInfo = { key: { type: "class-grouping", className: "class2" }, depth: 0 };
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyDefinition({
          imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
          sourceFactory,
          nodeIdentifierPaths: [
            {
              path: [{ className: filterPathClass0.fullName, id: "0x123" }],
              options: { autoExpand: groupingNode1 },
            },
            {
              path: [{ className: filterPathClass0.fullName, id: "0x123" }],
              options: { autoExpand: groupingNode2 },
            },
            {
              path: [{ className: filterPathClass0.fullName, id: "0x123" }],
              options: { autoExpand: groupingNode3 },
            },
          ],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.deep.eq([
          applyECInstanceIdsFilter(
            sourceDefinition,
            [
              {
                id: { className: filterPathClass0.fullName, id: "0x123" },
              },
            ] as Array<MatchedFilter<InstanceKey>>,
            false,
          ),
        ]);
      });
    });

    it("uses filtering paths from parent node", async () => {
      const queryClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
      const childFilterClass = classHierarchyInspector.stubEntityClass({
        schemaName: "BisCore",
        className: "ChildFilterClass",
        is: async (other) => other === queryClass.fullName,
      });
      const sourceDefinition: InstanceNodesQueryDefinition = {
        fullClassName: queryClass.fullName,
        query: {
          ecsql: "SOURCE_QUERY",
        },
      };
      const sourceFactory: HierarchyDefinition = {
        defineHierarchyLevel: async () => [sourceDefinition],
      };
      const filteringFactory = createFilteringHierarchyDefinition({
        imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
        sourceFactory,
        nodeIdentifierPaths: [], // this doesn't matter as we're going to look at what's in the parent node
      });
      const result = await filteringFactory.defineHierarchyLevel({
        parentNode: {
          ...createTestProcessedGenericNode({
            key: createTestGenericNodeKey({ id: "custom" }),
            label: "custom node",
          }),
          filtering: {
            filteredChildrenIdentifierPaths: [[{ className: childFilterClass.fullName, id: "0x456" }]],
          },
        },
      });
      expect(result).to.deep.eq([
        applyECInstanceIdsFilter(
          sourceDefinition,
          [
            {
              id: { className: childFilterClass.fullName, id: "0x456" },
            },
          ] as Array<MatchedFilter<InstanceKey>>,
          false,
        ),
      ]);
    });

    it("returns all definitions for a filter target parent node", async () => {
      const matchingSourceDefinition: GenericHierarchyNodeDefinition = {
        node: createTestSourceGenericNode({ key: "matches" }),
      };
      const nonMatchingSourceDefinition: GenericHierarchyNodeDefinition = {
        node: createTestSourceGenericNode({ key: "doesn't match" }),
      };
      const sourceFactory: HierarchyDefinition = {
        defineHierarchyLevel: async () => [matchingSourceDefinition, nonMatchingSourceDefinition],
      };
      const filteringFactory = createFilteringHierarchyDefinition({
        imodelAccess: { ...classHierarchyInspector, imodelKey: "test-imodel-key" },
        sourceFactory,
        nodeIdentifierPaths: [], // this doesn't matter as we're going to look at what's in the parent node
      });
      const result = await filteringFactory.defineHierarchyLevel({
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
      });
      expect(result).to.deep.eq([
        // this definition doesn't match parent's `filteredChildrenIdentifierPaths`, but is added because parent is a filter target
        {
          node: {
            ...nonMatchingSourceDefinition.node,
            filtering: { hasFilterTargetAncestor: true },
          },
        },
        // this definition is added with modifications to account for parent's `filteredChildrenIdentifierPaths`
        {
          node: {
            ...matchingSourceDefinition.node,
            filtering: { hasFilterTargetAncestor: true, isFilterTarget: true, filterTargetOptions: undefined },
          },
        },
      ]);
    });
  });

  describe("applyECInstanceIdsFilter", () => {
    it("creates a valid CTE for filtered instance paths", () => {
      const filteringOptions: HierarchyFilteringPathOptions = { autoExpand: { key: { type: "class-grouping", className: "test.class" }, depth: 123 } };
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
            id: { className: "test.class", id: "0x1" },
            isFilterTarget: false,
            childrenIdentifierPaths: [
              [
                { className: "a", id: "0x2" },
                { className: "b", id: "0x3" },
              ],
              [{ className: "c", id: "0x4" }],
            ],
          },
          {
            id: { className: "test.class", id: "0x5" },
            isFilterTarget: true,
            filterTargetOptions: filteringOptions,
            childrenIdentifierPaths: [[{ className: "d", id: "0x6" }]],
          },
        ],
        true,
      );
      expect(result.fullClassName).to.eq("full-class-name");
      expect(result.query.ctes?.map(trimWhitespace)).to.deep.eq([
        "source cte",
        trimWhitespace(`
          FilteringInfo(ECInstanceId, FilterClassName) AS (
          SELECT
            ECInstanceId,
            'test.class' AS FilterClassName
          FROM ONLY
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
            1 AS [${ECSQL_COLUMN_NAME_HasFilterTargetAncestor}],
            IdToHex([f].[ECInstanceId]) AS [${ECSQL_COLUMN_NAME_FilterECInstanceId}],
            [f].[FilterClassName] AS [${ECSQL_COLUMN_NAME_FilterClassName}]
          FROM (
            source query
          ) [q]
          LEFT JOIN FilteringInfo [f] ON [f].[ECInstanceId] = [q].[ECInstanceId]
        `),
      );
      expect(result.query.bindings).to.deep.eq([{ type: "string", value: "source binding" }]);
    });
  });
});

function createFilteringHierarchyDefinition(props?: {
  imodelAccess?: ECClassHierarchyInspector & { imodelKey: string };
  sourceFactory?: HierarchyDefinition;
  nodeIdentifierPaths?: HierarchyFilteringPath[];
}) {
  const { imodelAccess, sourceFactory, nodeIdentifierPaths } = props ?? {};
  return new FilteringHierarchyDefinition({
    imodelAccess: imodelAccess ?? { classDerivesFrom: async () => false, imodelKey: "" },
    source: sourceFactory ?? ({} as unknown as HierarchyDefinition),
    nodeIdentifierPaths: nodeIdentifierPaths ?? [],
  });
}
