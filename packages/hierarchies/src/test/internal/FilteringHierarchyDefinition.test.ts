/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { ECClassHierarchyInspector, trimWhitespace } from "@itwin/presentation-shared";
import {
  CustomHierarchyNodeDefinition,
  HierarchyDefinition,
  HierarchyLevelDefinition,
  InstanceNodesQueryDefinition,
} from "../../hierarchies/HierarchyDefinition";
import { HierarchyNode, ParsedCustomHierarchyNode, ProcessedCustomHierarchyNode } from "../../hierarchies/HierarchyNode";
import { HierarchyNodeIdentifiersPath } from "../../hierarchies/HierarchyNodeIdentifier";
import { HierarchyFilteringPath } from "../../hierarchies/HierarchyProvider";
import {
  applyECInstanceIdsFilter,
  ECSQL_COLUMN_NAME_FilteredChildrenPaths,
  ECSQL_COLUMN_NAME_HasFilterTargetAncestor,
  ECSQL_COLUMN_NAME_IsFilterTarget,
  FilteringHierarchyDefinition,
} from "../../hierarchies/internal/FilteringHierarchyDefinition";
import * as reader from "../../hierarchies/internal/TreeNodesReader";
import { NodeSelectClauseColumnNames } from "../../hierarchies/NodeSelectQueryFactory";
import {
  createClassHierarchyInspectorStub,
  createTestInstanceKey,
  createTestParsedCustomNode,
  createTestProcessedCustomNode,
  createTestProcessedGroupingNode,
  createTestProcessedInstanceNode,
} from "../Utils";

describe("FilteringHierarchyDefinition", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("parseNode", () => {
    it("uses `defaultNodeParser` when source definitions factory doesn't have one", () => {
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const defaultParserSpy = sinon.spy(reader, "defaultNodesParser");
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
      };
      filteringFactory.parseNode(row);
      expect(defaultParserSpy).to.be.calledOnceWithExactly(row);
    });

    it("uses source's node parser when it has one", () => {
      const sourceFactory = {
        parseNode: sinon.stub().returns({} as unknown as HierarchyNode),
      } as unknown as HierarchyDefinition;
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
      });
      const defaultParserSpy = sinon.spy(reader, "defaultNodesParser");
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
      };
      filteringFactory.parseNode(row);
      expect(defaultParserSpy).to.not.be.called;
      expect(sourceFactory.parseNode).to.be.calledOnceWithExactly(row);
    });

    it("sets filtered node attributes", () => {
      const sourceFactory = {} as unknown as HierarchyDefinition;
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
      });
      const paths: HierarchyNodeIdentifiersPath[] = [
        [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })],
        [createTestInstanceKey({ id: "0x3" })],
        [createTestInstanceKey({ id: "0x4" })],
      ];
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilteredChildrenPaths]: JSON.stringify(paths),
        [ECSQL_COLUMN_NAME_IsFilterTarget]: 1,
        [ECSQL_COLUMN_NAME_HasFilterTargetAncestor]: 1,
      };
      const node = filteringFactory.parseNode(row);
      expect(node.filtering).to.deep.eq({
        filteredChildrenIdentifierPaths: paths,
        isFilterTarget: true,
        hasFilterTargetAncestor: true,
      });
    });

    it("doesn't set auto-expand when filtered children paths is not set", () => {
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
      };
      const node = filteringFactory.parseNode(row);
      expect(node.autoExpand).to.be.undefined;
    });

    it("doesn't set auto-expand when filtered children paths list is empty", () => {
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilteredChildrenPaths]: JSON.stringify([]),
      };
      const node = filteringFactory.parseNode(row);
      expect(node.autoExpand).to.be.undefined;
    });

    it("does not set auto-expand when filtered children paths list is provided without `autoExpand` option", () => {
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const paths: HierarchyNodeIdentifiersPath[] = [[createTestInstanceKey({ id: "0x1" })]];
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilteredChildrenPaths]: JSON.stringify(paths),
      };
      const node = filteringFactory.parseNode(row);
      expect(node.autoExpand).to.be.undefined;
    });

    it("doesn't set auto-expand when all filtered children paths contain `autoExpand = false`", () => {
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const paths = [{ path: [createTestInstanceKey({ id: "0x1" })], options: { autoExpand: false } }];
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilteredChildrenPaths]: JSON.stringify(paths),
      };
      const node = filteringFactory.parseNode(row);
      expect(node.autoExpand).to.be.undefined;
    });

    it("sets auto-expand when one of filtered children paths contains `autoExpand = true`", () => {
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const paths = [
        { path: [createTestInstanceKey({ id: "0x1" })], options: { autoExpand: false } },
        { path: [createTestInstanceKey({ id: "0x2" })], options: { autoExpand: true } },
      ];
      const row = {
        [NodeSelectClauseColumnNames.FullClassName]: "",
        [ECSQL_COLUMN_NAME_FilteredChildrenPaths]: JSON.stringify(paths),
      };
      const node = filteringFactory.parseNode(row);
      expect(node.autoExpand).to.be.true;
    });
  });

  describe("preProcessNode", () => {
    it("returns given node when source factory has no pre-processor", async () => {
      const node = createTestProcessedCustomNode();
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const result = await filteringFactory.preProcessNode(node);
      expect(result).to.eq(node);
    });

    it("returns node pre-processed by source factory", async () => {
      const inputNode = createTestProcessedCustomNode();
      const sourceFactoryNode = createTestProcessedCustomNode();
      const sourceFactory = {
        preProcessNode: sinon.stub().returns(sourceFactoryNode),
      } as unknown as HierarchyDefinition;
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
      });
      const result = await filteringFactory.preProcessNode(inputNode);
      expect(sourceFactory.preProcessNode).to.be.calledOnceWithExactly(inputNode);
      expect(result).to.eq(sourceFactoryNode);
    });

    it("returns source filter target node with `hideInHierarchy` flag if it has filter target ancestor", async () => {
      const inputNode: ProcessedCustomHierarchyNode = {
        ...createTestProcessedCustomNode({
          processingParams: {
            hideInHierarchy: true,
          },
        }),
        filtering: {
          isFilterTarget: true,
          hasFilterTargetAncestor: true,
        },
      };
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const result = await filteringFactory.preProcessNode(inputNode);
      expect(result).to.eq(inputNode);
    });

    it("returns `undefined` when node is filter target without filter target ancestor and has `hideInHierarchy` flag", async () => {
      const inputNode: ProcessedCustomHierarchyNode = {
        ...createTestProcessedCustomNode({
          processingParams: {
            hideInHierarchy: true,
          },
        }),
        filtering: {
          isFilterTarget: true,
          hasFilterTargetAncestor: false,
        },
      };
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const result = await filteringFactory.preProcessNode(inputNode);
      expect(result).to.be.undefined;
    });
  });

  describe("postProcessNode", () => {
    it("returns given node when source factory has no post-processor", async () => {
      const node = createTestProcessedCustomNode();
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const result = await filteringFactory.postProcessNode(node);
      expect(result).to.eq(node);
    });

    it("returns node post-processed by source factory", async () => {
      const inputNode = createTestProcessedCustomNode();
      const sourceFactoryNode = createTestProcessedCustomNode();
      const sourceFactory = {
        postProcessNode: sinon.stub().resolves(sourceFactoryNode),
      } as unknown as HierarchyDefinition;
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
      });
      const result = await filteringFactory.postProcessNode(inputNode);
      expect(sourceFactory.postProcessNode).to.be.calledOnceWithExactly(inputNode);
      expect(result).to.eq(sourceFactoryNode);
    });

    it("returns undefined when source factory post processor returns undefined", async () => {
      const inputNode = createTestProcessedCustomNode();
      const sourceFactory = {
        postProcessNode: sinon.stub().resolves(undefined),
      } as unknown as HierarchyDefinition;
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
      });
      const result = await filteringFactory.postProcessNode(inputNode);
      expect(sourceFactory.postProcessNode).to.be.calledOnceWithExactly(inputNode);
      expect(result).to.eq(undefined);
    });

    it("doesn't set auto-expand on class grouping nodes if none of the children have filtered children paths", async () => {
      const inputNode = createClassGroupingNode();
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const result = await filteringFactory.postProcessNode(inputNode);
      expect(result.autoExpand).to.be.undefined;
    });

    it("does not set auto-expand on class grouping nodes if children have filtered children paths list set without `autoExpand` option", async () => {
      const inputNode = {
        ...createClassGroupingNode(),
        children: [
          {
            ...createTestProcessedInstanceNode(),
            filtering: { filteredChildrenIdentifierPaths: [[createTestInstanceKey({ id: "0x1" })]] },
          },
        ],
      };
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const result = await filteringFactory.postProcessNode(inputNode);
      expect(result.autoExpand).to.be.undefined;
    });

    it("doesn't set auto-expand on class grouping nodes when all filtered children paths contain `autoExpand = false`", async () => {
      const inputNode = {
        ...createClassGroupingNode(),
        children: [
          {
            ...createTestProcessedInstanceNode(),
            filtering: { filteredChildrenIdentifierPaths: [{ path: [createTestInstanceKey({ id: "0x1" })], options: { autoExpand: false } }] },
          },
        ],
      };
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const result = await filteringFactory.postProcessNode(inputNode);
      expect(result.autoExpand).to.be.undefined;
    });

    it("sets auto-expand when one of filtered children paths contains `autoExpand = true`", async () => {
      const inputNode = {
        ...createClassGroupingNode(),
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
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const result = await filteringFactory.postProcessNode(inputNode);
      expect(result.autoExpand).to.be.true;
    });

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
  });

  describe("defineHierarchyLevel", () => {
    let classHierarchyInspector: ReturnType<typeof createClassHierarchyInspectorStub>;
    beforeEach(() => {
      classHierarchyInspector = createClassHierarchyInspectorStub();
    });

    it("returns source definitions when filtered instance paths is undefined", async () => {
      const sourceDefinitions: HierarchyLevelDefinition = [
        {
          node: {} as unknown as ParsedCustomHierarchyNode,
        },
      ];
      const sourceFactory: HierarchyDefinition = {
        defineHierarchyLevel: async () => sourceDefinitions,
      };
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        classHierarchy: classHierarchyInspector,
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
            node: {} as unknown as ParsedCustomHierarchyNode,
          },
        ],
      };
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        classHierarchy: classHierarchyInspector,
        sourceFactory,
      });
      const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
      expect(result).to.be.empty;
    });

    describe("filtering custom node definitions", () => {
      it("omits source custom node definition when using instance key filter", async () => {
        const filterClass = classHierarchyInspector.stubEntityClass({ schemaName: "BisCore", className: "FilterClassName", is: async () => false });
        const sourceDefinition: CustomHierarchyNodeDefinition = {
          node: {
            key: "custom",
            label: "custom",
            children: false,
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          classHierarchy: classHierarchyInspector,
          sourceFactory,
          nodeIdentifierPaths: [[{ className: filterClass.fullName, id: "0x123" }]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.be.empty;
      });

      it("omits source custom node definition if filter type doesn't match node's key", async () => {
        const sourceDefinition: CustomHierarchyNodeDefinition = {
          node: {
            key: "custom",
            label: "custom",
            children: false,
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          classHierarchy: classHierarchyInspector,
          sourceFactory,
          nodeIdentifierPaths: [[{ key: "xxx" }]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.be.empty;
      });

      it("omits source custom node definition when filter filtering by empty path", async () => {
        const sourceDefinition: CustomHierarchyNodeDefinition = {
          node: {
            key: "custom",
            label: "custom",
            children: false,
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          classHierarchy: classHierarchyInspector,
          sourceFactory,
          nodeIdentifierPaths: [[]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.be.empty;
      });

      it("returns filtered source custom node definitions when filter type matches node's key", async () => {
        const sourceDefinition1: CustomHierarchyNodeDefinition = {
          node: {
            key: "custom 1",
            label: "custom label 1",
          },
        };
        const sourceDefinition2: CustomHierarchyNodeDefinition = {
          node: {
            key: "custom 2",
            label: "custom label 2",
          },
        };
        const sourceFactory: HierarchyDefinition = {
          defineHierarchyLevel: async () => [sourceDefinition1, sourceDefinition2],
        };
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          classHierarchy: classHierarchyInspector,
          sourceFactory,
          nodeIdentifierPaths: [[{ key: "custom 2" }]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.deep.eq([
          {
            node: {
              ...sourceDefinition2.node,
              filtering: { isFilterTarget: true },
            },
          },
        ]);
      });

      it("returns source custom node definition filtered with multiple matching paths having same beginning", async () => {
        const sourceDefinition: CustomHierarchyNodeDefinition = {
          node: {
            key: "custom",
            label: "custom",
            children: false,
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          classHierarchy: classHierarchyInspector,
          sourceFactory,
          nodeIdentifierPaths: [
            [{ key: "custom" }, { key: "123" }],
            [{ key: "custom" }, { key: "456" }],
          ],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.deep.eq([
          {
            node: {
              ...sourceDefinition.node,
              filtering: {
                filteredChildrenIdentifierPaths: [[{ key: "123" }], [{ key: "456" }]],
              },
            },
          },
        ]);
      });

      it("applies path options to children paths", async () => {
        const sourceDefinition: CustomHierarchyNodeDefinition = {
          node: {
            key: "custom",
            label: "custom",
            children: false,
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as HierarchyDefinition;
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          classHierarchy: classHierarchyInspector,
          sourceFactory,
          nodeIdentifierPaths: [{ path: [{ key: "custom" }, { key: "123" }], options: { autoExpand: true } }, [{ key: "custom" }, { key: "456" }]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.deep.eq([
          {
            node: {
              ...sourceDefinition.node,
              autoExpand: true,
              filtering: {
                filteredChildrenIdentifierPaths: [{ path: [{ key: "123" }], options: { autoExpand: true } }, [{ key: "456" }]],
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
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          classHierarchy: classHierarchyInspector,
          sourceFactory,
          nodeIdentifierPaths: [[{ key: "xxx" }]],
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
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          classHierarchy: classHierarchyInspector,
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
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          classHierarchy: classHierarchyInspector,
          sourceFactory,
          nodeIdentifierPaths: [[]],
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
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          classHierarchy: classHierarchyInspector,
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
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          classHierarchy: classHierarchyInspector,
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
                isFilterTarget: false,
                childrenIdentifierPaths: [[{ className: filterPathClass2.fullName, id: "0x456" }]],
              },
              { id: { className: filterPathClass1.fullName, id: "0x789" }, isFilterTarget: true, childrenIdentifierPaths: [] },
            ],
            false,
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
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          classHierarchy: classHierarchyInspector,
          sourceFactory,
          nodeIdentifierPaths: [[{ className: filterPathClass1.fullName, id: "0x123" }], [{ className: filterPathClass2.fullName, id: "0x456" }]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.deep.eq([
          applyECInstanceIdsFilter(
            sourceDefinition,
            [
              { id: { className: filterPathClass1.fullName, id: "0x123" }, isFilterTarget: true, childrenIdentifierPaths: [] },
              { id: { className: filterPathClass2.fullName, id: "0x456" }, isFilterTarget: true, childrenIdentifierPaths: [] },
            ],
            false,
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
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          classHierarchy: classHierarchyInspector,
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
                isFilterTarget: false,
                childrenIdentifierPaths: [[{ className: filterPathClass1.fullName, id: "0x456" }], [{ className: filterPathClass2.fullName, id: "0x789" }]],
              },
            ],
            false,
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
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          classHierarchy: classHierarchyInspector,
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
                id: { className: filterPathClass0.fullName, id: "0x123" },
                isFilterTarget: true,
                childrenIdentifierPaths: [[{ className: filterPathClass1.fullName, id: "0x456" }]],
              },
            ],
            false,
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
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          classHierarchy: classHierarchyInspector,
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
                isFilterTarget: true,
                childrenIdentifierPaths: [[{ className: filterPathClass1.fullName, id: "0x456" }]],
              },
            ],
            false,
            false,
          ),
        ]);
      });

      it("applies path options to children paths", async () => {
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
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          classHierarchy: classHierarchyInspector,
          sourceFactory,
          nodeIdentifierPaths: [
            {
              path: [
                { className: filterPathClass0.fullName, id: "0x123" },
                { className: filterPathClass1.fullName, id: "0x456" },
              ],
              options: { autoExpand: true },
            },
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
                isFilterTarget: false,
                childrenIdentifierPaths: [
                  { path: [{ className: filterPathClass1.fullName, id: "0x456" }], options: { autoExpand: true } },
                  [{ className: filterPathClass2.fullName, id: "0x789" }],
                ],
              },
            ],
            false,
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
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        classHierarchy: classHierarchyInspector,
        sourceFactory,
        nodeIdentifierPaths: [], // this doesn't matter as we're going to look at what's in the parent node
      });
      const result = await filteringFactory.defineHierarchyLevel({
        parentNode: {
          ...createTestProcessedCustomNode({
            key: "custom",
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
          [{ id: { className: childFilterClass.fullName, id: "0x456" }, isFilterTarget: true, childrenIdentifierPaths: [] }],
          false,
          false,
        ),
      ]);
    });

    it("returns all definitions for a filter target parent node", async () => {
      const matchingSourceDefinition: CustomHierarchyNodeDefinition = {
        node: createTestParsedCustomNode({ key: "matches" }),
      };
      const nonMatchingSourceDefinition: CustomHierarchyNodeDefinition = {
        node: createTestParsedCustomNode({ key: "doesn't match" }),
      };
      const sourceFactory: HierarchyDefinition = {
        defineHierarchyLevel: async () => [matchingSourceDefinition, nonMatchingSourceDefinition],
      };
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        classHierarchy: classHierarchyInspector,
        sourceFactory,
        nodeIdentifierPaths: [], // this doesn't matter as we're going to look at what's in the parent node
      });
      const result = await filteringFactory.defineHierarchyLevel({
        parentNode: {
          ...createTestProcessedCustomNode({
            key: "parent",
            label: "parent",
          }),
          filtering: {
            isFilterTarget: true,
            filteredChildrenIdentifierPaths: [[{ key: "matches" }]],
          },
        },
      });
      expect(result).to.deep.eq([
        // this definition doesn't match parent's `filteredChildrenIdentifierPaths`, but is added because parent is a filter target
        nonMatchingSourceDefinition,
        // this definition is added with modifications to account for parent's `filteredChildrenIdentifierPaths`
        {
          node: {
            ...matchingSourceDefinition.node,
            filtering: { isFilterTarget: true },
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
            childrenIdentifierPaths: [[{ className: "d", id: "0x6" }]],
          },
        ],
        true,
        true,
      );
      expect(result.fullClassName).to.eq("full-class-name");
      expect(result.query.ctes?.map(trimWhitespace)).to.deep.eq([
        "source cte",
        trimWhitespace(`
          FilteringInfo(ECInstanceId, IsFilterTarget, FilteredChildrenPaths) AS (
            VALUES (0x1, CAST(0 AS BOOLEAN), '${JSON.stringify([
              [
                { className: "a", id: "0x2" },
                { className: "b", id: "0x3" },
              ],
              [{ className: "c", id: "0x4" }],
            ])}')
            UNION ALL
            VALUES (0x5, CAST(1 AS BOOLEAN), '${JSON.stringify([[{ className: "d", id: "0x6" }]])}')
          )
        `),
      ]);
      expect(trimWhitespace(result.query.ecsql)).to.deep.eq(
        trimWhitespace(`
          SELECT
            [q].*,
            [f].[IsFilterTarget] AS [${ECSQL_COLUMN_NAME_IsFilterTarget}],
            1 AS [${ECSQL_COLUMN_NAME_HasFilterTargetAncestor}],
            [f].[FilteredChildrenPaths] AS [${ECSQL_COLUMN_NAME_FilteredChildrenPaths}]
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

function createFilteringHierarchyLevelsFactory(props?: {
  classHierarchy?: ECClassHierarchyInspector;
  sourceFactory?: HierarchyDefinition;
  nodeIdentifierPaths?: HierarchyFilteringPath[];
}) {
  const { classHierarchy, sourceFactory, nodeIdentifierPaths } = props ?? {};
  return new FilteringHierarchyDefinition({
    classHierarchy: classHierarchy ?? { classDerivesFrom: async () => false },
    source: sourceFactory ?? ({} as unknown as HierarchyDefinition),
    nodeIdentifierPaths: nodeIdentifierPaths ?? [],
  });
}
