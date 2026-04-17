/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { firstValueFrom, of, toArray } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { trimWhitespace } from "@itwin/presentation-shared";
import { NodeSelectClauseColumnNames } from "../../hierarchies/imodel/NodeSelectQueryFactory.js";
import {
  applyECInstanceIdsSearch,
  applyECInstanceIdsSelector,
  ECSQL_COLUMN_NAME_SearchClassName,
  ECSQL_COLUMN_NAME_SearchECInstanceId,
  SearchHierarchyDefinition,
} from "../../hierarchies/imodel/SearchHierarchyDefinition.js";
import {
  createIModelAccessStub,
  createTestInstanceKey,
  createTestInstanceNodeKey,
  createTestProcessedGroupingNode,
  createTestProcessedInstanceNode,
} from "../Utils.js";

import type { ECClassHierarchyInspector, IInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";
import type { HierarchyNodeIdentifier } from "../../hierarchies/HierarchyNodeIdentifier.js";
import type { HierarchySearchTree } from "../../hierarchies/HierarchySearch.js";
import type {
  HierarchyLevelDefinition,
  InstanceNodesQueryDefinition,
} from "../../hierarchies/imodel/IModelHierarchyDefinition.js";
import type {
  ProcessedGroupingHierarchyNode,
  ProcessedInstanceHierarchyNode,
  SourceInstanceHierarchyNode,
} from "../../hierarchies/imodel/IModelHierarchyNode.js";
import type { NodesQueryClauseFactory } from "../../hierarchies/imodel/NodeSelectQueryFactory.js";
import type { RxjsHierarchyDefinition } from "../../hierarchies/internal/RxjsHierarchyDefinition.js";

describe("SearchHierarchyDefinition", () => {
  function createStubECClassHierarchyInspector(
    overrides?: Partial<ECClassHierarchyInspector>,
  ): ECClassHierarchyInspector {
    return { classDerivesFrom: vi.fn().mockResolvedValue(false), ...overrides };
  }

  function createStubSourceDefinition(overrides?: Partial<RxjsHierarchyDefinition>): RxjsHierarchyDefinition {
    return { defineHierarchyLevel: vi.fn().mockReturnValue(of([])), ...overrides };
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
      expect(result).toBe(node);
    });

    it("delegates to source's preProcessNode", async () => {
      const sourceNode = createTestProcessedInstanceNode({ label: "source" });
      const def = createSearchHierarchyDefinition({
        targetPaths: [],
        source: { preProcessNode: (() => of(sourceNode)) as RxjsHierarchyDefinition["preProcessNode"] },
      });
      const result = await firstValueFrom(def.preProcessNode({ node: createTestProcessedInstanceNode() }));
      expect(result).toBe(sourceNode);
    });

    it("filters out nodes with hideInHierarchy and isSearchTarget but no hasSearchTargetAncestor", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const node = createTestProcessedInstanceNode({
        processingParams: { hideInHierarchy: true },
        search: { isSearchTarget: true },
      });
      const result = await firstValueFrom(def.preProcessNode({ node }).pipe(toArray()));
      expect(result).toHaveLength(0);
    });

    it("does not filter nodes with hideInHierarchy and isSearchTarget when hasSearchTargetAncestor is true", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const node = createTestProcessedInstanceNode({
        processingParams: { hideInHierarchy: true },
        search: { isSearchTarget: true, hasSearchTargetAncestor: true },
      });
      const result = await firstValueFrom(def.preProcessNode({ node }));
      expect(result).toBe(node);
    });

    it("does not filter nodes without hideInHierarchy", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const node = createTestProcessedInstanceNode({ search: { isSearchTarget: true } });
      const result = await firstValueFrom(def.preProcessNode({ node }));
      expect(result).toBe(node);
    });

    it("does not filter nodes with hideInHierarchy but not isSearchTarget", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const node = createTestProcessedInstanceNode({ processingParams: { hideInHierarchy: true } });
      const result = await firstValueFrom(def.preProcessNode({ node }));
      expect(result).toBe(node);
    });
  });

  describe("postProcessNode", () => {
    it("passes non-grouping node through unchanged", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const node = createTestProcessedInstanceNode();
      const result = await firstValueFrom(def.postProcessNode({ node }));
      expect(result).toBe(node);
    });

    it("delegates to source's postProcessNode", async () => {
      const sourceNode = createTestProcessedInstanceNode({ label: "source" });
      const def = createSearchHierarchyDefinition({
        targetPaths: [],
        source: { postProcessNode: () => of(sourceNode) },
      });
      const result = await firstValueFrom(def.postProcessNode({ node: createTestProcessedInstanceNode() }));
      expect(result).toBe(sourceNode);
    });

    it("sets autoExpand on grouping node when direct child has search.options.autoExpand = true", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const child = createTestProcessedInstanceNode({ search: { options: { autoExpand: true } } });
      const groupingNode = createTestProcessedGroupingNode({
        children: [child],
      }) as unknown as ProcessedGroupingHierarchyNode;
      const result = await firstValueFrom(def.postProcessNode({ node: groupingNode }));
      expect(result.autoExpand).toBe(true);
    });

    it("sets autoExpand on grouping node when direct child has search.options.autoExpand.groupingLevel >= node level", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const child = createTestProcessedInstanceNode({ search: { options: { autoExpand: { groupingLevel: 1 } } } });
      const groupingNode = createTestProcessedGroupingNode({
        children: [child],
      }) as unknown as ProcessedGroupingHierarchyNode;
      const result = await firstValueFrom(def.postProcessNode({ node: groupingNode }));
      expect(result.autoExpand).toBe(true);
    });

    it("doesn't set autoExpand on grouping node when direct child autoExpand.groupingLevel < node level", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const child = createTestProcessedInstanceNode({ search: { options: { autoExpand: { groupingLevel: 0 } } } });
      const groupingNode = createTestProcessedGroupingNode({
        children: [child],
      }) as unknown as ProcessedGroupingHierarchyNode;
      const result = await firstValueFrom(def.postProcessNode({ node: groupingNode }));
      expect(result.autoExpand).toBeUndefined();
    });

    it("doesn't set autoExpand on grouping node when direct child has no search", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const child = createTestProcessedInstanceNode();
      const groupingNode = createTestProcessedGroupingNode({
        children: [child],
      }) as unknown as ProcessedGroupingHierarchyNode;
      const result = await firstValueFrom(def.postProcessNode({ node: groupingNode }));
      expect(result.autoExpand).toBeUndefined();
    });

    it("doesn't set autoExpand on grouping node when direct child has search but no autoExpand option", async () => {
      const def = createSearchHierarchyDefinition({ targetPaths: [] });
      const child = createTestProcessedInstanceNode({ search: { isSearchTarget: true } });
      const groupingNode = createTestProcessedGroupingNode({
        children: [child],
      }) as unknown as ProcessedGroupingHierarchyNode;
      const result = await firstValueFrom(def.postProcessNode({ node: groupingNode }));
      expect(result.autoExpand).toBeUndefined();
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
      expect(result.autoExpand).toBe(true);
    });
  });

  describe("parseNode", () => {
    function createSourceInstanceNode(overrides?: Partial<SourceInstanceHierarchyNode>): SourceInstanceHierarchyNode {
      return {
        label: "test",
        key: createTestInstanceNodeKey({
          instanceKeys: [createTestInstanceKey({ className: "Schema:Class", id: "0x1" })],
        }),
        ...overrides,
      };
    }

    it("returns parsed node unchanged when row has no search columns", async () => {
      const parsedNode = createSourceInstanceNode();
      const def = createSearchHierarchyDefinition({ targetPaths: [], source: { parseNode: () => of(parsedNode) } });
      const result = await firstValueFrom(def.parseNode({ row: {}, parentNode: undefined, imodelKey: "imodel" }));
      expect(result).toBe(parsedNode);
    });

    it("assigns search props when row has matching search columns and target paths match", async () => {
      const targetIdentifier: HierarchyNodeIdentifier = { className: "Schema:Class", id: "0x1", imodelKey: "imodel" };
      const targetPaths: HierarchySearchTree[] = [{ identifier: targetIdentifier }];
      const parsedNode = createSourceInstanceNode({
        key: createTestInstanceNodeKey({ instanceKeys: [{ className: "Schema:Class", id: "0x1" }] }),
      });
      const def = createSearchHierarchyDefinition({ targetPaths, source: { parseNode: () => of(parsedNode) } });
      const result = await firstValueFrom(
        def.parseNode({
          row: { [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x1", [ECSQL_COLUMN_NAME_SearchClassName]: "Schema:Class" },
          parentNode: undefined,
          imodelKey: "imodel",
        }),
      );
      expect(result.search).toBeDefined();
      expect(result.search!.isSearchTarget).toBe(true);
    });

    it("doesn't match when identifier id differs from row id", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { className: "Schema:Class", id: "0x2" } }];
      const parsedNode = createSourceInstanceNode({
        key: createTestInstanceNodeKey({ instanceKeys: [{ className: "Schema:Class", id: "0x1" }] }),
      });
      const def = createSearchHierarchyDefinition({ targetPaths, source: { parseNode: () => of(parsedNode) } });
      const result = await firstValueFrom(
        def.parseNode({
          row: { [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x1", [ECSQL_COLUMN_NAME_SearchClassName]: "Schema:Class" },
          parentNode: undefined,
          imodelKey: "imodel",
        }),
      );
      expect(result.search).toBeUndefined();
    });

    it("doesn't match generic node identifier", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { type: "generic", id: "0x1" } }];
      const parsedNode = createSourceInstanceNode({
        key: createTestInstanceNodeKey({ instanceKeys: [{ className: "Schema:Class", id: "0x1" }] }),
      });
      const def = createSearchHierarchyDefinition({ targetPaths, source: { parseNode: () => of(parsedNode) } });
      const result = await firstValueFrom(
        def.parseNode({
          row: { [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x1", [ECSQL_COLUMN_NAME_SearchClassName]: "Schema:Class" },
          parentNode: undefined,
          imodelKey: "imodel",
        }),
      );
      expect(result.search).toBeUndefined();
    });

    it("doesn't match when imodelKey differs", async () => {
      const targetPaths: HierarchySearchTree[] = [
        { identifier: { className: "Schema:Class", id: "0x1", imodelKey: "other-imodel" } },
      ];
      const parsedNode = createSourceInstanceNode({
        key: createTestInstanceNodeKey({ instanceKeys: [{ className: "Schema:Class", id: "0x1" }] }),
      });
      const def = createSearchHierarchyDefinition({ targetPaths, source: { parseNode: () => of(parsedNode) } });
      const result = await firstValueFrom(
        def.parseNode({
          row: { [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x1", [ECSQL_COLUMN_NAME_SearchClassName]: "Schema:Class" },
          parentNode: undefined,
          imodelKey: "imodel",
        }),
      );
      expect(result.search).toBeUndefined();
    });

    it("matches when identifier has no imodelKey", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { className: "Schema:Class", id: "0x1" } }];
      const parsedNode = createSourceInstanceNode({
        key: createTestInstanceNodeKey({ instanceKeys: [{ className: "Schema:Class", id: "0x1" }] }),
      });
      const def = createSearchHierarchyDefinition({ targetPaths, source: { parseNode: () => of(parsedNode) } });
      const result = await firstValueFrom(
        def.parseNode({
          row: { [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x1", [ECSQL_COLUMN_NAME_SearchClassName]: "Schema:Class" },
          parentNode: undefined,
          imodelKey: "imodel",
        }),
      );
      expect(result.search).toBeDefined();
      expect(result.search!.isSearchTarget).toBe(true);
    });

    it("falls back to classDerivesFrom when class names differ", async () => {
      const classDerivesFrom = vi.fn<ECClassHierarchyInspector["classDerivesFrom"]>();
      classDerivesFrom.mockImplementation(async (derived, candidate) => {
        if (derived === "Schema:Derived" && candidate === "Schema:Base") {
          return true;
        }
        return false;
      });

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
          row: { [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x1", [ECSQL_COLUMN_NAME_SearchClassName]: "Schema:Derived" },
          parentNode: undefined,
          imodelKey: "imodel",
        }),
      );
      expect(result.search).toBeDefined();
      expect(result.search!.isSearchTarget).toBe(true);
    });

    it("doesn't match when classDerivesFrom returns false for both directions", async () => {
      const classDerivesFrom = vi.fn<ECClassHierarchyInspector["classDerivesFrom"]>().mockResolvedValue(false);

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
          row: { [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x1", [ECSQL_COLUMN_NAME_SearchClassName]: "Schema:Derived" },
          parentNode: undefined,
          imodelKey: "imodel",
        }),
      );
      expect(result.search).toBeUndefined();
    });

    it("assigns autoExpand from search tree options", async () => {
      const targetPaths: HierarchySearchTree[] = [
        { identifier: { className: "Schema:Class", id: "0x1" }, options: { autoExpand: true } },
      ];
      const parsedNode = createSourceInstanceNode({
        key: createTestInstanceNodeKey({ instanceKeys: [{ className: "Schema:Class", id: "0x1" }] }),
      });
      const def = createSearchHierarchyDefinition({ targetPaths, source: { parseNode: () => of(parsedNode) } });
      const result = await firstValueFrom(
        def.parseNode({
          row: { [ECSQL_COLUMN_NAME_SearchECInstanceId]: "0x1", [ECSQL_COLUMN_NAME_SearchClassName]: "Schema:Class" },
          parentNode: undefined,
          imodelKey: "imodel",
        }),
      );
      expect(result.autoExpand).toBe(true);
    });
  });

  describe("defineHierarchyLevel", () => {
    const stubIModelAccess = { ...createIModelAccessStub(), imodelKey: "test-imodel" };
    const instanceLabelSelectClauseFactory: IInstanceLabelSelectClauseFactory = { createSelectClause: vi.fn() };
    const nodeSelectClauseFactory: NodesQueryClauseFactory = {
      createSelectClause: vi.fn(),
      createFilterClauses: vi.fn(),
    };
    const constProps = { imodelAccess: stubIModelAccess, instanceLabelSelectClauseFactory, nodeSelectClauseFactory };

    it("returns source definitions when search identifiers are not applicable to the level", async () => {
      const sourceDefs: HierarchyLevelDefinition = [{ fullClassName: "Schema:Class", query: { ecsql: "SELECT *" } }];
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
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode, ...constProps }));
      expect(result).toEqual(sourceDefs);
    });

    it("includes generic definitions matching search identifier", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { type: "generic", id: "test-key" } }];
      const genericDef = { node: { key: "test-key", label: "test" } };
      const def = createSearchHierarchyDefinition({
        targetPaths,
        sourceName: "test-source",
        source: { defineHierarchyLevel: () => of([genericDef]) },
      });
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, ...constProps }));
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("node.key", "test-key");
    });

    it("filters out generic definitions not matching search identifier", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { type: "generic", id: "other-key" } }];
      const genericDef = { node: { key: "test-key", label: "test" } };
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { defineHierarchyLevel: () => of([genericDef]) },
      });
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, ...constProps }));
      expect(result).toHaveLength(0);
    });

    it("filters out generic definitions when source doesn't match", async () => {
      const targetPaths: HierarchySearchTree[] = [
        { identifier: { type: "generic", id: "test-key", source: "other-source" } },
      ];
      const genericDef = { node: { key: "test-key", label: "test" } };
      const def = createSearchHierarchyDefinition({
        targetPaths,
        sourceName: "test-source",
        source: { defineHierarchyLevel: () => of([genericDef]) },
      });
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, ...constProps }));
      expect(result).toHaveLength(0);
    });

    it("applies ECInstanceIds search for instance definitions matching search identifier", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { className: "Schema:Class", id: "0x1" } }];
      const instanceDef: InstanceNodesQueryDefinition = {
        fullClassName: "Schema:Class",
        query: { ecsql: "SELECT * FROM Schema.Class" },
      };
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { defineHierarchyLevel: () => of([instanceDef]) },
        imodelAccess: stubIModelAccess,
      });
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, ...constProps }));
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("query.ecsql");
      expect(trimWhitespace((result[0] as InstanceNodesQueryDefinition).query.ecsql)).toContain("SearchInfo");
    });

    it("skips instance definitions with non-matching class", async () => {
      const targetPaths: HierarchySearchTree[] = [{ identifier: { className: "Schema:Other", id: "0x1" } }];
      const instanceDef: InstanceNodesQueryDefinition = {
        fullClassName: "Schema:Class",
        query: { ecsql: "SELECT * FROM Schema.Class" },
      };
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { defineHierarchyLevel: () => of([instanceDef]) },
        imodelAccess: stubIModelAccess,
      });
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, ...constProps }));
      expect(result).toHaveLength(0);
    });

    it("includes instance definitions when classDerivesFrom returns true", async () => {
      const baseClass = stubIModelAccess.stubEntityClass({ schemaName: "Schema", className: "Base" });
      stubIModelAccess.stubEntityClass({ schemaName: "Schema", className: "Derived", baseClass });

      const targetPaths: HierarchySearchTree[] = [{ identifier: { className: "Schema:Derived", id: "0x1" } }];
      const instanceDef: InstanceNodesQueryDefinition = {
        fullClassName: "Schema:Base",
        query: { ecsql: "SELECT * FROM Schema.Base" },
      };
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { defineHierarchyLevel: () => of([instanceDef]) },
        imodelAccess: stubIModelAccess,
      });
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, ...constProps }));
      expect(result).toHaveLength(1);
    });

    it("skips instance identifier with non-matching imodelKey", async () => {
      const targetPaths: HierarchySearchTree[] = [
        { identifier: { className: "Schema:Class", id: "0x1", imodelKey: "other-imodel" } },
      ];
      const instanceDef: InstanceNodesQueryDefinition = {
        fullClassName: "Schema:Class",
        query: { ecsql: "SELECT * FROM Schema.Class" },
      };
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { defineHierarchyLevel: () => of([instanceDef]) },
      });
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, ...constProps }));
      expect(result).toHaveLength(0);
    });

    it("deduplicates instance keys with same id and related classes", async () => {
      const baseClass = stubIModelAccess.stubEntityClass({ schemaName: "Schema", className: "Base" });
      stubIModelAccess.stubEntityClass({ schemaName: "Schema", className: "Derived", baseClass });

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
        imodelAccess: stubIModelAccess,
      });
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, ...constProps }));
      expect(result).toHaveLength(1);
      // The search CTE should contain only one ECInstanceId, not duplicated
      const searchCte = (result[0] as InstanceNodesQueryDefinition).query.ctes!.find((cte) =>
        cte.includes("SearchInfo"),
      );
      expect(searchCte).toBeDefined();
      expect(trimWhitespace(searchCte!)).toContain("0x1");
    });

    it("deduplicates instance keys via reverse class hierarchy check", async () => {
      const baseClass = stubIModelAccess.stubEntityClass({ schemaName: "Schema", className: "Base" });
      stubIModelAccess.stubEntityClass({ schemaName: "Schema", className: "Derived", baseClass });

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
        imodelAccess: stubIModelAccess,
      });
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, ...constProps }));
      expect(result).toHaveLength(1);
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
        search: { hasSearchTargetAncestor: true, childrenTargetPaths: targetPaths },
      };
      const def = createSearchHierarchyDefinition({
        targetPaths,
        source: { defineHierarchyLevel: () => of([instanceDef]) },
      });
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode, ...constProps }));
      expect(result).toHaveLength(1);
      // Should use selector (IdToHex + FullClassName) instead of search CTE
      const ecsql = trimWhitespace((result[0] as InstanceNodesQueryDefinition).query.ecsql);
      expect(ecsql).toContain(NodeSelectClauseColumnNames.FullClassName);
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
      const result = await firstValueFrom(def.defineHierarchyLevel({ parentNode: undefined, ...constProps }));
      expect(result).toHaveLength(0);
    });
  });
});

describe("applyECInstanceIdsSearch", () => {
  it("creates a valid CTE for search instance paths", () => {
    const result = applyECInstanceIdsSearch(
      {
        fullClassName: "SchemaName.ClassName",
        query: { ctes: ["source cte"], ecsql: "source query", bindings: [{ type: "string", value: "source binding" }] },
      },
      [
        { className: "test.class", id: "0x1" },
        { className: "test.class", id: "0x5" },
      ],
    );
    expect(result.fullClassName).toBe("SchemaName.ClassName");
    expect(result.query.ctes?.map(trimWhitespace)).toEqual([
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
    expect(trimWhitespace(result.query.ecsql)).toEqual(
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
    expect(result.query.bindings).toEqual([{ type: "string", value: "source binding" }]);
  });
});

describe("applyECInstanceIdsSelector", () => {
  it("wraps query with search columns using IdToHex and FullClassName", () => {
    const result = applyECInstanceIdsSelector({
      fullClassName: "SchemaName.ClassName",
      query: { ctes: ["source cte"], ecsql: "source query", bindings: [{ type: "string", value: "source binding" }] },
    });
    expect(result.fullClassName).toBe("SchemaName.ClassName");
    expect(result.query.ctes).toEqual(["source cte"]);
    expect(trimWhitespace(result.query.ecsql)).toEqual(
      trimWhitespace(`
        SELECT
          [q].*,
          IdToHex([q].[ECInstanceId]) AS [${ECSQL_COLUMN_NAME_SearchECInstanceId}],
          [q].[${NodeSelectClauseColumnNames.FullClassName}] AS [${ECSQL_COLUMN_NAME_SearchClassName}]
        FROM (source query) [q]
      `),
    );
    expect(result.query.bindings).toEqual([{ type: "string", value: "source binding" }]);
  });
});
