/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { IMetadataProvider } from "../../hierarchy-builder/ECMetadata";
import {
  CustomHierarchyNodeDefinition,
  HierarchyDefinitionParentNode,
  HierarchyLevelDefinition,
  IHierarchyLevelDefinitionsFactory,
  InstanceNodesQueryDefinition,
} from "../../hierarchy-builder/HierarchyDefinition";
import { HierarchyNode, HierarchyNodeIdentifiersPath, ParsedCustomHierarchyNode, ParsedHierarchyNode } from "../../hierarchy-builder/HierarchyNode";
import {
  applyECInstanceIdsFilter,
  ECSQL_COLUMN_NAME_FilteredChildrenPaths,
  ECSQL_COLUMN_NAME_IsFilterTarget,
  FilteredHierarchyNode,
  FilteringHierarchyLevelDefinitionsFactory,
} from "../../hierarchy-builder/internal/FilteringHierarchyLevelDefinitionsFactory";
import * as reader from "../../hierarchy-builder/internal/TreeNodesReader";
import { NodeSelectClauseColumnNames } from "../../hierarchy-builder/queries/NodeSelectQueryFactory";
import { trimWhitespace } from "../queries/Utils";
import {
  ClassStubs,
  createClassStubs,
  createTestInstanceKey,
  createTestParsedCustomNode,
  createTestProcessedCustomNode,
  createTestProcessedGroupingNode,
  createTestProcessedInstanceNode,
} from "../Utils";

describe("FilteringHierarchyLevelDefinitionsFactory", () => {
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
      } as unknown as IHierarchyLevelDefinitionsFactory;
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

    it("sets filtered children paths", () => {
      const sourceFactory = {} as unknown as IHierarchyLevelDefinitionsFactory;
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
      };
      const node: FilteredHierarchyNode<ParsedHierarchyNode> = filteringFactory.parseNode(row);
      expect(node.filteredChildrenIdentifierPaths).to.deep.eq(paths);
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

    it("sets auto-expand when filtered children paths list is not empty", () => {
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const paths: HierarchyNodeIdentifiersPath[] = [[createTestInstanceKey({ id: "0x1" })]];
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
      } as unknown as IHierarchyLevelDefinitionsFactory;
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
      });
      const result = await filteringFactory.preProcessNode(inputNode);
      expect(sourceFactory.preProcessNode).to.be.calledOnceWithExactly(inputNode);
      expect(result).to.eq(sourceFactoryNode);
    });

    it("returns `undefined` when node is filter target and has `hideInHierarchy` flag", async () => {
      const inputNode: FilteredHierarchyNode = {
        ...createTestProcessedCustomNode({
          processingParams: {
            hideInHierarchy: true,
          },
        }),
        isFilterTarget: true,
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
      } as unknown as IHierarchyLevelDefinitionsFactory;
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
      } as unknown as IHierarchyLevelDefinitionsFactory;
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

    it("sets auto-expand on class grouping nodes if any child has filtered children paths", async () => {
      const inputNode = {
        ...createClassGroupingNode(),
        children: [
          {
            ...createTestProcessedInstanceNode(),
            filteredChildrenIdentifierPaths: [],
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
          class: { label: "class label", name: "class name" },
        },
        children: [],
      });
    }
  });

  describe("defineHierarchyLevel", () => {
    const metadataProvider = {} as unknown as IMetadataProvider;
    let classStubs: ClassStubs;
    beforeEach(() => {
      classStubs = createClassStubs(metadataProvider);
    });

    it("returns source definitions when filtered instance paths is undefined", async () => {
      const sourceDefinitions: HierarchyLevelDefinition = [
        {
          node: {} as unknown as ParsedCustomHierarchyNode,
        },
      ];
      const sourceFactory: IHierarchyLevelDefinitionsFactory = {
        defineHierarchyLevel: async () => sourceDefinitions,
      };
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
      });
      const result = await filteringFactory.defineHierarchyLevel({
        parentNode: { filteredChildrenIdentifierPaths: undefined } as unknown as HierarchyDefinitionParentNode,
      });
      expect(result).to.eq(sourceDefinitions);
    });

    it("returns no definitions when filtered instance paths list is empty", async () => {
      const sourceFactory: IHierarchyLevelDefinitionsFactory = {
        defineHierarchyLevel: async () => [
          {
            node: {} as unknown as ParsedCustomHierarchyNode,
          },
        ],
      };
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
      });
      const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
      expect(result).to.be.empty;
    });

    describe("filtering custom node definitions", () => {
      it("omits source custom node definition when using instance key filter", async () => {
        const filterClass = classStubs.stubEntityClass({ schemaName: "BisCore", className: "FilterClassName", is: async () => false });
        const sourceDefinition: CustomHierarchyNodeDefinition = {
          node: {
            key: "custom",
            label: "custom",
            children: false,
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as IHierarchyLevelDefinitionsFactory;
        const filteringFactory = createFilteringHierarchyLevelsFactory({
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
        } as unknown as IHierarchyLevelDefinitionsFactory;
        const filteringFactory = createFilteringHierarchyLevelsFactory({
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
        } as unknown as IHierarchyLevelDefinitionsFactory;
        const filteringFactory = createFilteringHierarchyLevelsFactory({
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
        const sourceFactory: IHierarchyLevelDefinitionsFactory = {
          defineHierarchyLevel: async () => [sourceDefinition1, sourceDefinition2],
        };
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          sourceFactory,
          nodeIdentifierPaths: [[{ key: "custom 2" }]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.deep.eq([
          {
            node: {
              ...sourceDefinition2.node,
              isFilterTarget: true,
            } as FilteredHierarchyNode<ParsedHierarchyNode>,
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
        } as unknown as IHierarchyLevelDefinitionsFactory;
        const filteringFactory = createFilteringHierarchyLevelsFactory({
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
              autoExpand: true,
              filteredChildrenIdentifierPaths: [[{ key: "123" }], [{ key: "456" }]],
            } as FilteredHierarchyNode,
          },
        ]);
      });
    });

    describe("filtering instance node query definitions", () => {
      it("omits source instance node query definition when using custom node filter", async () => {
        const queryClass = classStubs.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as IHierarchyLevelDefinitionsFactory;
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          sourceFactory,
          nodeIdentifierPaths: [[{ key: "xxx" }]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.be.empty;
      });

      it("omits source instance node query definition if filter class doesn't match query class", async () => {
        const queryClass = classStubs.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
        const filterPathClass = classStubs.stubEntityClass({ schemaName: "BisCore", className: "FilterPathClassName", is: async () => false });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as IHierarchyLevelDefinitionsFactory;
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          sourceFactory,
          nodeIdentifierPaths: [[{ className: filterPathClass.fullName, id: "0x123" }]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.be.empty;
      });

      it("omits source instance node query definition when filter filtering by empty path", async () => {
        const queryClass = classStubs.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as IHierarchyLevelDefinitionsFactory;
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          sourceFactory,
          nodeIdentifierPaths: [[]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.be.empty;
      });

      it("returns unfiltered source instance node query definitions when filtering filter target parent node", async () => {
        const queryClass = classStubs.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as IHierarchyLevelDefinitionsFactory;
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          sourceFactory,
          nodeIdentifierPaths: [],
        });
        const result = await filteringFactory.defineHierarchyLevel({
          parentNode: {
            isFilterTarget: true,
            filteredChildrenIdentifierPaths: new Array<HierarchyNodeIdentifiersPath>(),
          } as FilteredHierarchyNode<HierarchyDefinitionParentNode>,
        });
        expect(result).to.deep.eq([sourceDefinition]);
      });

      it("returns filtered source instance node query definitions when filter class matches query class", async () => {
        const queryClass = classStubs.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
        const filterPathClass1 = classStubs.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName1",
          is: async (other) => other === queryClass.fullName,
        });
        const filterPathClass2 = classStubs.stubEntityClass({ schemaName: "BisCore", className: "FilterPathClassName2", is: async () => false });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as IHierarchyLevelDefinitionsFactory;
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          sourceFactory,
          nodeIdentifierPaths: [
            [
              { className: filterPathClass1.fullName, id: "0x123" },
              { className: filterPathClass2.fullName, id: "0x456" },
            ],
          ],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.deep.eq([
          applyECInstanceIdsFilter(
            sourceDefinition,
            [{ id: { className: filterPathClass1.fullName, id: "0x123" }, childrenIdentifierPaths: [[{ className: filterPathClass2.fullName, id: "0x456" }]] }],
            false,
            false,
          ),
        ]);
      });

      it("returns source instance node query definition filtered with multiple matching paths", async () => {
        const queryClass = classStubs.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
        const filterPathClass1 = classStubs.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName1",
          is: async (other) => other === queryClass.fullName,
        });
        const filterPathClass2 = classStubs.stubEntityClass({
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
        } as unknown as IHierarchyLevelDefinitionsFactory;
        const filteringFactory = createFilteringHierarchyLevelsFactory({
          sourceFactory,
          nodeIdentifierPaths: [[{ className: filterPathClass1.fullName, id: "0x123" }], [{ className: filterPathClass2.fullName, id: "0x456" }]],
        });
        const result = await filteringFactory.defineHierarchyLevel({ parentNode: undefined });
        expect(result).to.deep.eq([
          applyECInstanceIdsFilter(
            sourceDefinition,
            [
              { id: { className: filterPathClass1.fullName, id: "0x123" }, childrenIdentifierPaths: [] },
              { id: { className: filterPathClass2.fullName, id: "0x456" }, childrenIdentifierPaths: [] },
            ],
            true,
            false,
          ),
        ]);
      });

      it("returns source instance node query definition filtered with multiple matching paths having same beginning", async () => {
        const queryClass = classStubs.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
        const filterPathClass0 = classStubs.stubEntityClass({
          schemaName: "BisCore",
          className: "FilterPathClassName0",
          is: async (other) => other === queryClass.fullName,
        });
        const filterPathClass1 = classStubs.stubEntityClass({ schemaName: "BisCore", className: "FilterPathClassName1", is: async () => false });
        const filterPathClass2 = classStubs.stubEntityClass({ schemaName: "BisCore", className: "FilterPathClassName2", is: async () => false });
        const sourceDefinition: InstanceNodesQueryDefinition = {
          fullClassName: queryClass.fullName,
          query: {
            ecsql: "SOURCE_QUERY",
          },
        };
        const sourceFactory = {
          defineHierarchyLevel: async () => [sourceDefinition],
        } as unknown as IHierarchyLevelDefinitionsFactory;
        const filteringFactory = createFilteringHierarchyLevelsFactory({
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
                childrenIdentifierPaths: [[{ className: filterPathClass1.fullName, id: "0x456" }], [{ className: filterPathClass2.fullName, id: "0x789" }]],
              },
            ],
            false,
            false,
          ),
        ]);
      });
    });

    it("uses filtering paths from parent node", async () => {
      const queryClass = classStubs.stubEntityClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
      const childFilterClass = classStubs.stubEntityClass({
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
      const sourceFactory: IHierarchyLevelDefinitionsFactory = {
        defineHierarchyLevel: async () => [sourceDefinition],
      };
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
        nodeIdentifierPaths: [], // this doesn't matter as we're going to look at what's in the parent node
      });
      const result = await filteringFactory.defineHierarchyLevel({
        parentNode: {
          key: "custom",
          label: "custom node",
          filteredChildrenIdentifierPaths: [[{ className: childFilterClass.fullName, id: "0x456" }]],
        } as FilteredHierarchyNode<HierarchyDefinitionParentNode>,
      });
      expect(result).to.deep.eq([
        applyECInstanceIdsFilter(sourceDefinition, [{ id: { className: childFilterClass.fullName, id: "0x456" }, childrenIdentifierPaths: [] }], true, false),
      ]);
    });

    it("returns all definitions for a filter target parent node", async () => {
      const matchingSourceDefinition: CustomHierarchyNodeDefinition = {
        node: createTestParsedCustomNode({ key: "matches" }),
      };
      const nonMatchingSourceDefinition: CustomHierarchyNodeDefinition = {
        node: createTestParsedCustomNode({ key: "doesn't match" }),
      };
      const sourceFactory: IHierarchyLevelDefinitionsFactory = {
        defineHierarchyLevel: async () => [matchingSourceDefinition, nonMatchingSourceDefinition],
      };
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
        nodeIdentifierPaths: [], // this doesn't matter as we're going to look at what's in the parent node
      });
      const result = await filteringFactory.defineHierarchyLevel({
        parentNode: {
          key: "parent",
          label: "parent",
          isFilterTarget: true,
          filteredChildrenIdentifierPaths: [[{ key: "matches" }]],
        } as FilteredHierarchyNode<HierarchyDefinitionParentNode>,
      });
      expect(result).to.deep.eq([
        // this definition is added with modifications to account for parent's `filteredChildrenIdentifierPaths`
        {
          node: {
            ...matchingSourceDefinition.node,
            isFilterTarget: true,
          },
        },
        // this definition doesn't match parent's `filteredChildrenIdentifierPaths`, but is added because parent is a filter target
        nonMatchingSourceDefinition,
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
          FilteringInfo(ECInstanceId, FilteredChildrenPaths) AS (
            VALUES (0x1, '${JSON.stringify([
              [
                { className: "a", id: "0x2" },
                { className: "b", id: "0x3" },
              ],
              [{ className: "c", id: "0x4" }],
            ])}')
            UNION ALL
            VALUES (0x5, '${JSON.stringify([[{ className: "d", id: "0x6" }]])}')
          )
        `),
      ]);
      expect(trimWhitespace(result.query.ecsql)).to.deep.eq(
        trimWhitespace(`
          SELECT
            [q].*,
            1 AS [${ECSQL_COLUMN_NAME_IsFilterTarget}],
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
  metadataProvider?: IMetadataProvider;
  sourceFactory?: IHierarchyLevelDefinitionsFactory;
  nodeIdentifierPaths?: HierarchyNodeIdentifiersPath[];
}) {
  const { metadataProvider, sourceFactory, nodeIdentifierPaths } = props ?? {};
  return new FilteringHierarchyLevelDefinitionsFactory({
    metadataProvider: metadataProvider ?? ({} as unknown as IMetadataProvider),
    source: sourceFactory ?? ({} as unknown as IHierarchyLevelDefinitionsFactory),
    nodeIdentifierPaths: nodeIdentifierPaths ?? [],
  });
}
