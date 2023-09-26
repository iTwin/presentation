/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { InstanceKeyPath } from "../../hierarchy-builder/EC";
import { HierarchyLevelDefinition, IHierarchyLevelDefinitionsFactory, InstanceNodesQueryDefinition } from "../../hierarchy-builder/HierarchyDefinition";
import { HierarchyNode } from "../../hierarchy-builder/HierarchyNode";
import {
  applyECInstanceIdsFilter,
  ECSQL_COLUMN_NAME_FilteredChildrenPaths,
  FilteredHierarchyNode,
  FilteringHierarchyLevelDefinitionsFactory,
} from "../../hierarchy-builder/internal/FilteringHierarchyLevelDefinitionsFactory";
import * as reader from "../../hierarchy-builder/internal/TreeNodesReader";
import { IMetadataProvider } from "../../hierarchy-builder/Metadata";
import { trimWhitespace } from "../queries/Utils";
import { createGetClassStub, createTestInstanceKey, TStubClassFunc } from "../Utils";

describe("FilteringHierarchyLevelDefinitionsFactory", () => {
  describe("parseNode", () => {
    it("uses `defaultNodeParser` when source definitions factory doesn't have one", () => {
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const defaultParserSpy = sinon.spy(reader, "defaultNodesParser");
      const row = {};
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
      const row = {};
      filteringFactory.parseNode(row);
      expect(defaultParserSpy).to.not.be.called;
      expect(sourceFactory.parseNode).to.be.calledOnceWithExactly(row);
    });

    it("sets filtered children paths", () => {
      const sourceFactory = {} as unknown as IHierarchyLevelDefinitionsFactory;
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
      });
      const paths: InstanceKeyPath[] = [
        [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })],
        [createTestInstanceKey({ id: "0x3" })],
        [createTestInstanceKey({ id: "0x4" })],
      ];
      const row = {
        [ECSQL_COLUMN_NAME_FilteredChildrenPaths]: JSON.stringify(paths),
      };
      const node = filteringFactory.parseNode(row);
      expect(node.filteredChildrenPaths).to.deep.eq(paths);
    });

    it("doesn't set auto-expand when filtered children paths is not set", () => {
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const row = {};
      const node = filteringFactory.parseNode(row);
      expect(node.autoExpand).to.be.undefined;
    });

    it("doesn't set auto-expand when filtered children paths list is empty", () => {
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const row = {
        [ECSQL_COLUMN_NAME_FilteredChildrenPaths]: JSON.stringify([]),
      };
      const node = filteringFactory.parseNode(row);
      expect(node.autoExpand).to.be.undefined;
    });

    it("sets auto-expand when filtered children paths list is not empty", () => {
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const paths: InstanceKeyPath[] = [[createTestInstanceKey({ id: "0x1" })]];
      const row = {
        [ECSQL_COLUMN_NAME_FilteredChildrenPaths]: JSON.stringify(paths),
      };
      const node = filteringFactory.parseNode(row);
      expect(node.autoExpand).to.be.true;
    });
  });

  describe("postProcessNode", () => {
    it("returns given node when source factory has no post-processor", () => {
      const node = createTestNode();
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const result = filteringFactory.postProcessNode(node);
      expect(result).to.eq(node);
    });

    it("returns node post-processed by source factory", () => {
      const inputNode = createTestNode();
      const sourceFactoryNode = createTestNode();
      const sourceFactory = {
        postProcessNode: sinon.stub().returns(sourceFactoryNode),
      } as unknown as IHierarchyLevelDefinitionsFactory;
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
      });
      const result = filteringFactory.postProcessNode(inputNode);
      expect(sourceFactory.postProcessNode).to.be.calledOnceWithExactly(inputNode);
      expect(result).to.eq(sourceFactoryNode);
    });

    it("doesn't set auto-expand on class grouping nodes if none of the children have filtered children paths", () => {
      const inputNode = createClassGroupingNode();
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const result = filteringFactory.postProcessNode(inputNode);
      expect(result.autoExpand).to.be.undefined;
    });

    it("sets auto-expand on class grouping nodes if any child has filtered children paths", () => {
      const inputNode = {
        ...createClassGroupingNode(),
        children: [
          {
            ...createTestNode(),
            filteredChildrenPaths: [],
          },
        ],
      };
      const filteringFactory = createFilteringHierarchyLevelsFactory();
      const result = filteringFactory.postProcessNode(inputNode);
      expect(result.autoExpand).to.be.true;
    });

    function createTestNode(): HierarchyNode {
      return {
        key: "test",
        label: "test node",
        children: [],
      };
    }

    function createClassGroupingNode(): HierarchyNode {
      return {
        ...createTestNode(),
        key: {
          type: "class-grouping",
          class: { id: "0x1", label: "class label", name: "class name" },
        },
      };
    }
  });

  describe("defineHierarchyLevel", () => {
    const metadataProvider = {} as unknown as IMetadataProvider;
    let stubClass: TStubClassFunc;
    beforeEach(() => {
      stubClass = createGetClassStub(metadataProvider).stubClass;
    });

    it("returns source definitions when filtered instance paths list is empty", async () => {
      const sourceDefinitions: HierarchyLevelDefinition = [];
      const sourceFactory = {
        defineHierarchyLevel: sinon.stub().resolves(sourceDefinitions),
      } as unknown as IHierarchyLevelDefinitionsFactory;
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
      });
      const result = await filteringFactory.defineHierarchyLevel(undefined);
      expect(result).to.eq(sourceDefinitions);
    });

    it("returns source custom node definitions", async () => {
      const sourceDefinitions: HierarchyLevelDefinition = [
        {
          node: {
            key: "custom",
            label: "custom label",
            children: undefined,
          },
        },
      ];
      const sourceFactory = {
        defineHierarchyLevel: sinon.stub().resolves(sourceDefinitions),
      } as unknown as IHierarchyLevelDefinitionsFactory;
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
        instanceKeyPaths: [[createTestInstanceKey()]],
      });
      const result = await filteringFactory.defineHierarchyLevel(undefined);
      expect(result).to.deep.eq(sourceDefinitions);
    });

    it("omits source instance node query definition if filter class doesn't match query class", async () => {
      const queryClass = stubClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
      const filterPathClass = stubClass({ schemaName: "BisCore", className: "FilterPathClassName", is: async () => false });
      const sourceDefinition: InstanceNodesQueryDefinition = {
        fullClassName: queryClass.name,
        query: {
          ecsql: "SOURCE_QUERY",
        },
      };
      const sourceFactory = {
        defineHierarchyLevel: sinon.stub().resolves([sourceDefinition]),
      } as unknown as IHierarchyLevelDefinitionsFactory;
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
        instanceKeyPaths: [[{ className: filterPathClass.name, id: "0x123" }]],
      });
      const result = await filteringFactory.defineHierarchyLevel(undefined);
      expect(result).to.be.empty;
    });

    it("returns source instance node query definition when filter filtering by empty path", async () => {
      const queryClass = stubClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
      const sourceDefinition: InstanceNodesQueryDefinition = {
        fullClassName: queryClass.name,
        query: {
          ecsql: "SOURCE_QUERY",
        },
      };
      const sourceFactory = {
        defineHierarchyLevel: sinon.stub().resolves([sourceDefinition]),
      } as unknown as IHierarchyLevelDefinitionsFactory;
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
        instanceKeyPaths: [[]],
      });
      const result = await filteringFactory.defineHierarchyLevel(undefined);
      expect(result).to.deep.eq([sourceDefinition]);
    });

    it("returns filtered source instance node query definitions when filter class matches query class", async () => {
      const queryClass = stubClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
      const filterPathClass1 = stubClass({ schemaName: "BisCore", className: "FilterPathClassName1", is: async (other) => other === queryClass.name });
      const filterPathClass2 = stubClass({ schemaName: "BisCore", className: "FilterPathClassName2", is: async () => false });
      const sourceDefinition: InstanceNodesQueryDefinition = {
        fullClassName: queryClass.name,
        query: {
          ecsql: "SOURCE_QUERY",
        },
      };
      const sourceFactory = {
        defineHierarchyLevel: sinon.stub().resolves([sourceDefinition]),
      } as unknown as IHierarchyLevelDefinitionsFactory;
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
        instanceKeyPaths: [
          [
            { className: filterPathClass1.name, id: "0x123" },
            { className: filterPathClass2.name, id: "0x456" },
          ],
        ],
      });
      const result = await filteringFactory.defineHierarchyLevel(undefined);
      expect(result).to.deep.eq([applyECInstanceIdsFilter(sourceDefinition, { "0x123": [[{ className: filterPathClass2.name, id: "0x456" }]] })]);
    });

    it("returns source instance node query definition filtered with multiple matching paths", async () => {
      const queryClass = stubClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
      const filterPathClass1 = stubClass({ schemaName: "BisCore", className: "FilterPathClassName1", is: async (other) => other === queryClass.name });
      const filterPathClass2 = stubClass({ schemaName: "BisCore", className: "FilterPathClassName2", is: async (other) => other === queryClass.name });
      const sourceDefinition: InstanceNodesQueryDefinition = {
        fullClassName: queryClass.name,
        query: {
          ecsql: "SOURCE_QUERY",
        },
      };
      const sourceFactory = {
        defineHierarchyLevel: sinon.stub().resolves([sourceDefinition]),
      } as unknown as IHierarchyLevelDefinitionsFactory;
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
        instanceKeyPaths: [[{ className: filterPathClass1.name, id: "0x123" }], [{ className: filterPathClass2.name, id: "0x456" }]],
      });
      const result = await filteringFactory.defineHierarchyLevel(undefined);
      expect(result).to.deep.eq([applyECInstanceIdsFilter(sourceDefinition, { "0x123": [], "0x456": [] })]);
    });

    it("returns source instance node query definition filtered with multiple matching paths having same beginning", async () => {
      const queryClass = stubClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
      const filterPathClass0 = stubClass({ schemaName: "BisCore", className: "FilterPathClassName0", is: async (other) => other === queryClass.name });
      const filterPathClass1 = stubClass({ schemaName: "BisCore", className: "FilterPathClassName1", is: async () => false });
      const filterPathClass2 = stubClass({ schemaName: "BisCore", className: "FilterPathClassName2", is: async () => false });
      const sourceDefinition: InstanceNodesQueryDefinition = {
        fullClassName: queryClass.name,
        query: {
          ecsql: "SOURCE_QUERY",
        },
      };
      const sourceFactory = {
        defineHierarchyLevel: sinon.stub().resolves([sourceDefinition]),
      } as unknown as IHierarchyLevelDefinitionsFactory;
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
        instanceKeyPaths: [
          [
            { className: filterPathClass0.name, id: "0x123" },
            { className: filterPathClass1.name, id: "0x456" },
          ],
          [
            { className: filterPathClass0.name, id: "0x123" },
            { className: filterPathClass2.name, id: "0x789" },
          ],
        ],
      });
      const result = await filteringFactory.defineHierarchyLevel(undefined);
      expect(result).to.deep.eq([
        applyECInstanceIdsFilter(sourceDefinition, {
          "0x123": [[{ className: filterPathClass1.name, id: "0x456" }], [{ className: filterPathClass2.name, id: "0x789" }]],
        }),
      ]);
    });

    it("uses filtering paths from parent node", async () => {
      const queryClass = stubClass({ schemaName: "BisCore", className: "SourceQueryClassName", is: async () => false });
      const rootFilterClass = stubClass({ schemaName: "BisCore", className: "RootFilterClass", is: async (other) => other === queryClass.name });
      const childFilterClass = stubClass({ schemaName: "BisCore", className: "ChildFilterClass", is: async (other) => other === queryClass.name });
      const sourceDefinition: InstanceNodesQueryDefinition = {
        fullClassName: queryClass.name,
        query: {
          ecsql: "SOURCE_QUERY",
        },
      };
      const sourceFactory = {
        defineHierarchyLevel: sinon.stub().resolves([sourceDefinition]),
      } as unknown as IHierarchyLevelDefinitionsFactory;
      const filteringFactory = createFilteringHierarchyLevelsFactory({
        sourceFactory,
        instanceKeyPaths: [[{ className: rootFilterClass.name, id: "0x123" }]],
      });
      const result = await filteringFactory.defineHierarchyLevel({
        key: "custom",
        label: "custom node",
        children: undefined,
        filteredChildrenPaths: [[{ className: childFilterClass.name, id: "0x456" }]],
      } as FilteredHierarchyNode);
      expect(result).to.deep.eq([applyECInstanceIdsFilter(sourceDefinition, { "0x456": [] })]);
    });
  });

  describe("applyECInstanceIdsFilter", () => {
    it("creates a valid CTE for filtered instance paths", () => {
      const paths = {
        "0x1": [
          [
            { className: "a", id: "0x2" },
            { className: "b", id: "0x3" },
          ],
          [{ className: "c", id: "0x4" }],
        ],
        "0x5": [[{ className: "d", id: "0x6" }]],
      };
      const result = applyECInstanceIdsFilter(
        {
          fullClassName: "full-class-name",
          query: {
            ctes: ["source cte"],
            ecsql: "source query",
            bindings: [{ type: "string", value: "source binding" }],
          },
        },
        paths,
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
            [f].[FilteredChildrenPaths] AS [${ECSQL_COLUMN_NAME_FilteredChildrenPaths}]
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

function createFilteringHierarchyLevelsFactory(props?: {
  metadataProvider?: IMetadataProvider;
  sourceFactory?: IHierarchyLevelDefinitionsFactory;
  instanceKeyPaths?: InstanceKeyPath[];
}) {
  const { metadataProvider, sourceFactory, instanceKeyPaths } = props ?? {};
  return new FilteringHierarchyLevelDefinitionsFactory({
    metadataProvider: metadataProvider ?? ({} as unknown as IMetadataProvider),
    source: sourceFactory ?? ({} as unknown as IHierarchyLevelDefinitionsFactory),
    instanceKeyPaths: instanceKeyPaths ?? [],
  });
}
