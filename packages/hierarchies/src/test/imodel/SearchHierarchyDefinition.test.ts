/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { firstValueFrom, of, toArray } from "rxjs";
import sinon from "sinon";
import { trimWhitespace } from "@itwin/presentation-shared";
import { NodeSelectClauseColumnNames } from "../../hierarchies/imodel/NodeSelectQueryFactory.js";
import {
  applyECInstanceIdsSearch,
  applyECInstanceIdsSelector,
  ECSQL_COLUMN_NAME_SearchClassName,
  ECSQL_COLUMN_NAME_SearchECInstanceId,
  SearchHierarchyDefinition,
} from "../../hierarchies/imodel/SearchHierarchyDefinition.js";
import { createTestInstanceKey, createTestInstanceNodeKey, createTestProcessedGroupingNode, createTestProcessedInstanceNode } from "../Utils.js";

import type { ECClassHierarchyInspector } from "@itwin/presentation-shared";
import type { HierarchySearchTree } from "../../hierarchies/HierarchySearch.js";
import type { DefineHierarchyLevelProps, InstanceNodesQueryDefinition } from "../../hierarchies/imodel/IModelHierarchyDefinition.js";
import type {
  ProcessedGroupingHierarchyNode,
  ProcessedInstanceHierarchyNode,
  SourceInstanceHierarchyNode,
} from "../../hierarchies/imodel/IModelHierarchyNode.js";
import type { RxjsHierarchyDefinition } from "../../hierarchies/internal/RxjsHierarchyDefinition.js";

describe("SearchHierarchyDefinition", () => {
  afterEach(() => {
    sinon.restore();
  });

  function createStubECClassHierarchyInspector(overrides?: Partial<ECClassHierarchyInspector>): ECClassHierarchyInspector {
    return {
      classDerivesFrom: sinon.stub().resolves(false),
      ...overrides,
    };
  }

  function createStubSourceDefinition(overrides?: Partial<RxjsHierarchyDefinition>): RxjsHierarchyDefinition {
    return {
      defineHierarchyLevel: sinon.stub().returns(of([])),
      ...overrides,
    };
  }

  function createSearchHierarchyDefinition(props: {
    targetPaths: HierarchySearchTree[];
    source?: Partial<RxjsHierarchyDefinition>;
    imodelAccess?: Partial<ECClassHierarchyInspector>;
    sourceName?: string;
  }) {
    return new SearchHierarchyDefinition({
      imodelAccess: createStubECClassHierarchyInspector(props.imodelAccess),
      source: createStubSourceDefinition(props.source),
      sourceName: props.sourceName ?? "test-source",
      targetPaths: props.targetPaths,
    });
  }

  describe("preProcessNode", () => {
    it("passes node through when source has no preProcessNode", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const node = createTestProcessedInstanceNode({ label: "test" });
      const result = await firstValueFrom(def.preProcessNode({ node }));
      expect(result).to.eq(node);
    });

    it("delegates to source's preProcessNode", async () => {
      const sourceNode = createTestProcessedInstanceNode({ label: "source" });
      const def = createSearchHierarchyDefinition({
        targetPaths: [],
        source: { preProcessNode: (() => of(sourceNode)) as RxjsHierarchyDefinition["preProcessNode"] },
      });
      const result = await firstValueFrom(def.preProcessNode({ node: createTestProcessedInstanceNode() }));
      expect(result).to.eq(sourceNode);
    });

    it("filters out nodes with hideInHierarchy and isSearchTarget but no hasSearchTargetAncestor", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const node = createTestProcessedInstanceNode({
        processingParams: { hideInHierarchy: true },
        search: { isSearchTarget: true },
      });
      const result = await firstValueFrom(def.preProcessNode({ node }).pipe(toArray()));
      expect(result).to.be.empty;
    });

    it("does not filter nodes with hideInHierarchy and isSearchTarget when hasSearchTargetAncestor is true", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const node = createTestProcessedInstanceNode({
        processingParams: { hideInHierarchy: true },
        search: { isSearchTarget: true, hasSearchTargetAncestor: true },
      });
      const result = await firstValueFrom(def.preProcessNode({ node }));
      expect(result).to.eq(node);
    });

    it("does not filter nodes without hideInHierarchy", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const node = createTestProcessedInstanceNode({
        search: { isSearchTarget: true },
      });
      const result = await firstValueFrom(def.preProcessNode({ node }));
      expect(result).to.eq(node);
    });

    it("does not filter nodes with hideInHierarchy but not isSearchTarget", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const node = createTestProcessedInstanceNode({
        processingParams: { hideInHierarchy: true },
      });
      const result = await firstValueFrom(def.preProcessNode({ node }));
      expect(result).to.eq(node);
    });
  });

  describe("postProcessNode", () => {
    it("passes non-grouping node through unchanged", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const node = createTestProcessedInstanceNode();
      const result = await firstValueFrom(def.postProcessNode({ node }));
      expect(result).to.eq(node);
    });

    it("delegates to source's postProcessNode", async () => {
      const sourceNode = createTestProcessedInstanceNode({ label: "source" });
      const def = createSearchHierarchyDefinition({
        targetPaths: [],
        source: { postProcessNode: () => of(sourceNode) },
      });
      const result = await firstValueFrom(def.postProcessNode({ node: createTestProcessedInstanceNode() }));
      expect(result).to.eq(sourceNode);
    });

    it("sets autoExpand on grouping node when direct child has search.options.autoExpand = true", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const child = createTestProcessedInstanceNode({ search: { options: { autoExpand: true } } });
      const groupingNode = createTestProcessedGroupingNode({ children: [child] }) as unknown as ProcessedGroupingHierarchyNode;
      const result = await firstValueFrom(def.postProcessNode({ node: groupingNode }));
      expect(result.autoExpand).to.be.true;
    });

    it("sets autoExpand on grouping node when direct child has search.options.autoExpand.groupingLevel >= node level", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const child = createTestProcessedInstanceNode({ search: { options: { autoExpand: { groupingLevel: 1 } } } });
      const groupingNode = createTestProcessedGroupingNode({ children: [child] }) as unknown as ProcessedGroupingHierarchyNode;
      const result = await firstValueFrom(def.postProcessNode({ node: groupingNode }));
      expect(result.autoExpand).to.be.true;
    });

    it("doesn't set autoExpand on grouping node when direct child autoExpand.groupingLevel < node level", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const child = createTestProcessedInstanceNode({ search: { options: { autoExpand: { groupingLevel: 0 } } } });
      const groupingNode = createTestProcessedGroupingNode({ children: [child] }) as unknown as ProcessedGroupingHierarchyNode;
      const result = await firstValueFrom(def.postProcessNode({ node: groupingNode }));
      expect(result.autoExpand).to.be.undefined;
    });

    it("doesn't set autoExpand on grouping node when direct child has no search", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const child = createTestProcessedInstanceNode();
      const groupingNode = createTestProcessedGroupingNode({ children: [child] }) as unknown as ProcessedGroupingHierarchyNode;
      const result = await firstValueFrom(def.postProcessNode({ node: groupingNode }));
      expect(result.autoExpand).to.be.undefined;
    });

    it("doesn't set autoExpand on grouping node when direct child has search but no autoExpand option", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const child = createTestProcessedInstanceNode({ search: { isSearchTarget: true } });
      const groupingNode = createTestProcessedGroupingNode({ children: [child] }) as unknown as ProcessedGroupingHierarchyNode;
      const result = await firstValueFrom(def.postProcessNode({ node: groupingNode }));
      expect(result.autoExpand).to.be.undefined;
    });

    it("recurses into nested grouping nodes", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const child = createTestProcessedInstanceNode({ search: { options: { autoExpand: true } } });
      const innerGrouping = createTestProcessedGroupingNode({
        key: { type: "label-grouping", label: "inner" },
        children: [child],
      }) as unknown as ProcessedGroupingHierarchyNode;
      const outerGrouping = createTestProcessedGroupingNode({
        children: [innerGrouping as unknown as ProcessedInstanceHierarchyNode],
      }) as unknown as ProcessedGroupingHierarchyNode;
      const result = await firstValueFrom(def.postProcessNode({ node: outerGrouping }));
      expect(result.autoExpand).to.be.true;
    });
  });

  describe("parseNode", () => {
    function createSourceInstanceNode(overrides?: Partial<SourceInstanceHierarchyNode>): SourceInstanceHierarchyNode {
      return {
        label: "test",
        key: createTestInstanceNodeKey({ instanceKeys: [createTestInstanceKey({ className: "Schema:Class", id: "0x1" })] }),
        ...overrides,
      };
    }

    it("returns parsed node unchanged when row has no search columns", async () => {
      const parsedNode = createSourceInstanceNode();
      const def = createSearchHierarchyDefinition({
        targetPaths: [],
        source: { parseNode: () => of(parsedNode) },
      });
      const result = await firstValueFrom(def.parseNode({ row: {}, parentNode: undefined, imodelKey: "imodel" }));
      expect(result).to.eq(parsedNode);
    });

    it("assigns search props when row has matching search columns and target paths match", async () => {
      const targetIdentifier = { className: "Schema:Class", id: "0x1", imodelKey: "imodel" };
      const targetPaths: HierarchySearchTree[] = [{ identifier: targetIdentifier }];
      const parsedNode = createSourceInstanceNode({
        key: createTestInstanceNodeKey({ instanceKeys: [{ className: "Schema:Class", id: "0x1" }] }),
      });
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { parseNode: () => of(parsedNode) },
      });
      const result = await firstValueFrom(
        def.parseNode({
          row: {
            [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x1",
            [ECSQL_COLUMN_NAME_SearchClassName]: "Schema:Class",
          },
          parentNode: undefined,
          imodelKey: "imodel",
        }),
      );
      expect(result.search).to.not.be.undefined;
      expect(result.search!.isSearchTarget).to.be.true;
    });

    it("doesn't match when identifier id differs from row id", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { className: "Schema:Class", id: "0x2" } }];
      const parsedNode = createSourceInstanceNode({
        key: createTestInstanceNodeKey({ instanceKeys: [{ className: "Schema:Class", id: "0x1" }] }),
      });
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { parseNode: () => of(parsedNode) },
      });
      const result = await firstValueFrom(
        def.parseNode({
          row: {
            [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x1",
            [ECSQL_COLUMN_NAME_SearchClassName]: "Schema:Class",
          },
          parentNode: undefined,
          imodelKey: "imodel",
        }),
      );
      expect(result.search).to.be.undefined;
    });

    it("doesn't match generic node identifier", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { type: "generic", id: "0x1" } }];
      const parsedNode = createSourceInstanceNode({
        key: createTestInstanceNodeKey({ instanceKeys: [{ className: "Schema:Class", id: "0x1" }] }),
      });
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { parseNode: () => of(parsedNode) },
      });
      const result = await firstValueFrom(
        def.parseNode({
          row: {
            [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x1",
            [ECSQL_COLUMN_NAME_SearchClassName]: "Schema:Class",
          },
          parentNode: undefined,
          imodelKey: "imodel",
        }),
      );
      expect(result.search).to.be.undefined;
    });

    it("doesn't match when imodelKey differs", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { className: "Schema:Class", id: "0x1", imodelKey: "other-imodel" } }];
      const parsedNode = createSourceInstanceNode({
        key: createTestInstanceNodeKey({ instanceKeys: [{ className: "Schema:Class", id: "0x1" }] }),
      });
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { parseNode: () => of(parsedNode) },
      });
      const result = await firstValueFrom(
        def.parseNode({
          row: {
            [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x1",
            [ECSQL_COLUMN_NAME_SearchClassName]: "Schema:Class",
          },
          parentNode: undefined,
          imodelKey: "imodel",
        }),
      );
      expect(result.search).to.be.undefined;
    });

    it("matches when identifier has no imodelKey", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { className: "Schema:Class", id: "0x1" } }];
      const parsedNode = createSourceInstanceNode({
        key: createTestInstanceNodeKey({ instanceKeys: [{ className: "Schema:Class", id: "0x1" }] }),
      });
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { parseNode: () => of(parsedNode) },
      });
      const result = await firstValueFrom(
        def.parseNode({
          row: {
            [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x1",
            [ECSQL_COLUMN_NAME_SearchClassName]: "Schema:Class",
          },
          parentNode: undefined,
          imodelKey: "imodel",
        }),
      );
      expect(result.search).to.not.be.undefined;
      expect(result.search!.isSearchTarget).to.be.true;
    });

    it("falls back to classDerivesFrom when class names differ", async () => {
      const classDerivesFrom = sinon.stub();
      classDerivesFrom.withArgs("Schema:Base", "Schema:Derived").resolves(false);
      classDerivesFrom.withArgs("Schema:Derived", "Schema:Base").resolves(true);
      classDerivesFrom.resolves(false);

      const targetPaths: HierarchySearchTree[] = [{ identifier: { className: "Schema:Base", id: "0x1" } }];
      const parsedNode = createSourceInstanceNode({
        key: createTestInstanceNodeKey({ instanceKeys: [{ className: "Schema:Derived", id: "0x1" }] }),
      });
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { parseNode: () => of(parsedNode) },
        imodelAccess: { classDerivesFrom },
      });
      const result = await firstValueFrom(
        def.parseNode({
          row: {
            [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x1",
            [ECSQL_COLUMN_NAME_SearchClassName]: "Schema:Derived",
          },
          parentNode: undefined,
          imodelKey: "imodel",
        }),
      );
      expect(result.search).to.not.be.undefined;
      expect(result.search!.isSearchTarget).to.be.true;
    });

    it("doesn't match when classDerivesFrom returns false for both directions", async () => {
      const classDerivesFrom = sinon.stub().resolves(false);

      const targetPaths: HierarchySearchTree[] = [{ identifier: { className: "Schema:Unrelated", id: "0x1" } }];
      const parsedNode = createSourceInstanceNode({
        key: createTestInstanceNodeKey({ instanceKeys: [{ className: "Schema:Derived", id: "0x1" }] }),
      });
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { parseNode: () => of(parsedNode) },
        imodelAccess: { classDerivesFrom },
      });
      const result = await firstValueFrom(
        def.parseNode({
          row: {
            [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x1",
            [ECSQL_COLUMN_NAME_SearchClassName]: "Schema:Derived",
          },
          parentNode: undefined,
          imodelKey: "imodel",
        }),
      );
      expect(result.search).to.be.undefined;
    });

    it("assigns autoExpand from search tree options", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { className: "Schema:Class", id: "0x1" }, options: { autoExpand: true } }];
      const parsedNode = createSourceInstanceNode({
        key: createTestInstanceNodeKey({ instanceKeys: [{ className: "Schema:Class", id: "0x1" }] }),
      });
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { parseNode: () => of(parsedNode) },
      });
      const result = await firstValueFrom(
        def.parseNode({
          row: {
            [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x1",
            [ECSQL_COLUMN_NAME_SearchClassName]: "Schema:Class",
          },
          parentNode: undefined,
          imodelKey: "imodel",
        }),
      );
      expect(result.autoExpand).to.be.true;
    });
  });

  describe("defineHierarchyLevel", () => {
    const stubIModelAccess: DefineHierarchyLevelProps["imodelAccess"] = {
      classDerivesFrom: sinon.stub().resolves(false),
      getSchema: sinon.stub().resolves(undefined),
      imodelKey: "test-imodel",
    } as unknown as DefineHierarchyLevelProps["imodelAccess"];

    it("returns source definitions when search identifiers are not applicable to the level", async () => {
      const sourceDefs = [{ fullClassName: "Schema:Class", query: { ecsql: "SELECT *" } }];
      const parentNode = {
        key: createTestInstanceNodeKey({ instanceKeys: [{ className: "Schema:Parent", id: "0x2" }] }),
        label: "parent",
        parentKeys: [],
        search: { isSearchTarget: true },
      };
      const def = createSearchHierarchyDefinition({
        targetPaths: [{ identifier: { className: "Schema:Class", id: "0x1" } }],
        source: { defineHierarchyLevel: () => of(sourceDefs) },
      });
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode, imodelAccess: stubIModelAccess }));
      expect(result).to.deep.eq(sourceDefs);
    });

    it("includes generic definitions matching search identifier", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { type: "generic", id: "test-key" } }];
      const genericDef = { node: { key: "test-key", label: "test" } };
      const def = createSearchHierarchyDefinition({
        targetPaths,
        sourceName: "test-source",
        source: { defineHierarchyLevel: () => of([genericDef]) },
      });
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, imodelAccess: stubIModelAccess }));
      expect(result).to.have.length(1);
      expect(result[0]).to.have.nested.property("node.key", "test-key");
    });

    it("filters out generic definitions not matching search identifier", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { type: "generic", id: "other-key" } }];
      const genericDef = { node: { key: "test-key", label: "test" } };
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { defineHierarchyLevel: () => of([genericDef]) },
      });
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, imodelAccess: stubIModelAccess }));
      expect(result).to.have.length(0);
    });

    it("filters out generic definitions when source doesn't match", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { type: "generic", id: "test-key", source: "other-source" } }];
      const genericDef = { node: { key: "test-key", label: "test" } };
      const def = createSearchHierarchyDefinition({
        targetPaths,
        sourceName: "test-source",
        source: { defineHierarchyLevel: () => of([genericDef]) },
      });
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, imodelAccess: stubIModelAccess }));
      expect(result).to.have.length(0);
    });

    it("applies ECInstanceIds search for instance definitions matching search identifier", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { className: "Schema:Class", id: "0x1" } }];
      const instanceDef: InstanceNodesQueryDefinition = {
        fullClassName: "Schema:Class",
        query: { ecsql: "SELECT * FROM Schema.Class" },
      };
      const classDerivesFrom = sinon.stub().resolves(false);
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { defineHierarchyLevel: () => of([instanceDef]) },
        imodelAccess: { classDerivesFrom },
      });
      const imodelAccess = { ...stubIModelAccess, classDerivesFrom } as unknown as DefineHierarchyLevelProps["imodelAccess"];
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, imodelAccess }));
      expect(result).to.have.length(1);
      expect(result[0]).to.have.nested.property("query.ecsql");
      expect(trimWhitespace((result[0] as InstanceNodesQueryDefinition).query.ecsql)).to.contain("SearchInfo");
    });

    it("skips instance definitions with non-matching class", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { className: "Schema:Other", id: "0x1" } }];
      const instanceDef: InstanceNodesQueryDefinition = {
        fullClassName: "Schema:Class",
        query: { ecsql: "SELECT * FROM Schema.Class" },
      };
      const classDerivesFrom = sinon.stub().resolves(false);
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { defineHierarchyLevel: () => of([instanceDef]) },
        imodelAccess: { classDerivesFrom },
      });
      const imodelAccess = { ...stubIModelAccess, classDerivesFrom } as unknown as DefineHierarchyLevelProps["imodelAccess"];
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, imodelAccess }));
      expect(result).to.have.length(0);
    });

    it("includes instance definitions when classDerivesFrom returns true", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { className: "Schema:Derived", id: "0x1" } }];
      const instanceDef: InstanceNodesQueryDefinition = {
        fullClassName: "Schema:Base",
        query: { ecsql: "SELECT * FROM Schema.Base" },
      };
      const classDerivesFrom = sinon.stub();
      classDerivesFrom.withArgs("Schema:Derived", "Schema:Base").resolves(true);
      classDerivesFrom.resolves(false);
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { defineHierarchyLevel: () => of([instanceDef]) },
        imodelAccess: { classDerivesFrom },
      });
      const imodelAccess = { ...stubIModelAccess, classDerivesFrom } as unknown as DefineHierarchyLevelProps["imodelAccess"];
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, imodelAccess }));
      expect(result).to.have.length(1);
    });

    it("skips instance identifier with non-matching imodelKey", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { className: "Schema:Class", id: "0x1", imodelKey: "other-imodel" } }];
      const instanceDef: InstanceNodesQueryDefinition = {
        fullClassName: "Schema:Class",
        query: { ecsql: "SELECT * FROM Schema.Class" },
      };
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { defineHierarchyLevel: () => of([instanceDef]) },
      });
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, imodelAccess: stubIModelAccess }));
      expect(result).to.have.length(0);
    });

    it("deduplicates instance keys with same id and related classes", async () => {
      const classDerivesFrom = sinon.stub();
      classDerivesFrom.withArgs("Schema:Derived", "Schema:Base").resolves(true);
      classDerivesFrom.resolves(false);
      const targetPaths: HierarchySearchTree[] = [
        { identifier: { className: "Schema:Derived", id: "0x1" } },
        { identifier: { className: "Schema:Base", id: "0x1" } },
      ];
      const instanceDef: InstanceNodesQueryDefinition = {
        fullClassName: "Schema:Base",
        query: { ecsql: "SELECT * FROM Schema.Base" },
      };
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { defineHierarchyLevel: () => of([instanceDef]) },
        imodelAccess: { classDerivesFrom },
      });
      const imodelAccess = { ...stubIModelAccess, classDerivesFrom } as unknown as DefineHierarchyLevelProps["imodelAccess"];
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, imodelAccess }));
      expect(result).to.have.length(1);
      // The search CTE should contain only one ECInstanceId, not duplicated
      const searchCte = (result[0] as InstanceNodesQueryDefinition).query.ctes!.find((cte) => cte.includes("SearchInfo"));
      expect(searchCte).to.not.be.undefined;
      expect(trimWhitespace(searchCte!)).to.contain("0x1");
    });

    it("deduplicates instance keys via reverse class hierarchy check", async () => {
      const classDerivesFrom = sinon.stub();
      // Only the reverse direction succeeds — entry.className doesn't derive from x.className, but x.className derives from entry.className
      classDerivesFrom.withArgs("Schema:Derived", "Schema:Base").resolves(true);
      classDerivesFrom.resolves(false);
      const targetPaths: HierarchySearchTree[] = [
        { identifier: { className: "Schema:Base", id: "0x1" } },
        { identifier: { className: "Schema:Derived", id: "0x1" } },
      ];
      const instanceDef: InstanceNodesQueryDefinition = {
        fullClassName: "Schema:Base",
        query: { ecsql: "SELECT * FROM Schema.Base" },
      };
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { defineHierarchyLevel: () => of([instanceDef]) },
        imodelAccess: { classDerivesFrom },
      });
      const imodelAccess = { ...stubIModelAccess, classDerivesFrom } as unknown as DefineHierarchyLevelProps["imodelAccess"];
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, imodelAccess }));
      expect(result).to.have.length(1);
    });

    it("applies ECInstanceIds selector when parent has search target ancestor", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { className: "Schema:Class", id: "0x1" } }];
      const instanceDef: InstanceNodesQueryDefinition = {
        fullClassName: "Schema:Class",
        query: { ecsql: "SELECT * FROM Schema.Class" },
      };
      const parentNode = {
        key: createTestInstanceNodeKey({ instanceKeys: [{ className: "Schema:Parent", id: "0x2" }] }),
        label: "parent",
        parentKeys: [],
        search: {
          hasSearchTargetAncestor: true,
          childrenTargetPaths: targetPaths,
        },
      };
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { defineHierarchyLevel: () => of([instanceDef]) },
      });
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode, imodelAccess: stubIModelAccess }));
      expect(result).to.have.length(1);
      // Should use selector (IdToHex + FullClassName) instead of search CTE
      const ecsql = trimWhitespace((result[0] as InstanceNodesQueryDefinition).query.ecsql);
      expect(ecsql).to.contain(NodeSelectClauseColumnNames.FullClassName);
    });

    it("skips generic identifiers when looking for instance definitions", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { type: "generic", id: "test-key" } }];
      const instanceDef: InstanceNodesQueryDefinition = {
        fullClassName: "Schema:Class",
        query: { ecsql: "SELECT * FROM Schema.Class" },
      };
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { defineHierarchyLevel: () => of([instanceDef]) },
      });
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, imodelAccess: stubIModelAccess }));
      expect(result).to.have.length(0);
    });
  });
});

describe("applyECInstanceIdsSearch", () => {
  it("creates a valid CTE for search instance paths", () => {
    const result = applyECInstanceIdsSearch(
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
          SearchInfo(ECInstanceId, SearchClassName) AS (
          SELECT
            ECInstanceId,
            'test.class' AS SearchClassName
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
            IdToHex([f].[ECInstanceId]) AS [${ECSQL_COLUMN_NAME_SearchECInstanceId}],
            [f].[SearchClassName] AS [${ECSQL_COLUMN_NAME_SearchClassName}]
          FROM (
            source query
          ) [q]
          JOIN SearchInfo [f] ON [f].[ECInstanceId] = [q].[ECInstanceId]
        `),
    );
    expect(result.query.bindings).to.deep.eq([{ type: "string", value: "source binding" }]);
  });
});

describe("applyECInstanceIdsSelector", () => {
  it("wraps query with search columns using IdToHex and FullClassName", () => {
    const result = applyECInstanceIdsSelector({
      fullClassName: "full-class-name",
      query: {
        ctes: ["source cte"],
        ecsql: "source query",
        bindings: [{ type: "string", value: "source binding" }],
      },
    });
    expect(result.fullClassName).to.eq("full-class-name");
    expect(result.query.ctes).to.deep.eq(["source cte"]);
    expect(trimWhitespace(result.query.ecsql)).to.deep.eq(
      trimWhitespace(`
        SELECT
          [q].*,
          IdToHex([q].[ECInstanceId]) AS [${ECSQL_COLUMN_NAME_SearchECInstanceId}],
          [q].[${NodeSelectClauseColumnNames.FullClassName}] AS [${ECSQL_COLUMN_NAME_SearchClassName}]
        FROM (source query) [q]
      `),
    );
    expect(result.query.bindings).to.deep.eq([{ type: "string", value: "source binding" }]);
  });
});
