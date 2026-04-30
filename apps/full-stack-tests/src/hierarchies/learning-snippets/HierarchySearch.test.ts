/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */

import {
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { afterAll, describe, expect, it, test } from "vitest";
import { assert, Id64String } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { InstanceKey } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchySearch.HierarchyDefinitionImports
import {
  HierarchyDefinition,
  HierarchyLevelDefinition,
  HierarchyNode,
  HierarchySearchTree,
} from "@itwin/presentation-hierarchies";
import { ECSqlBinding } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchySearch.FindPathsImports
import { createIModelKey } from "@itwin/presentation-core-interop";
import { HierarchyNodeIdentifiersPath } from "@itwin/presentation-hierarchies";
import { ECSql, ECSqlQueryDef } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchySearch.SearchImports
import { createIModelHierarchyProvider } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchySearch.HierarchySearchPathImport
import { HierarchySearchPath } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
import { withEditTxn } from "@itwin/core-backend";
import { buildTestIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { createIModelAccess } from "../Utils.js";
import { collectHierarchy } from "./Utils.js";

describe("Hierarchies", () => {
  describe("Learning snippets", () => {
    describe("Hierarchy search", () => {
      let imodelConnection: IModelConnection;
      let elementIds: { [name: string]: Id64String };
      let elementKeys: { [name: string]: InstanceKey };

      test.beforeAll(async (_context, suite) => {
        await initialize();

        const res = await buildTestIModel(suite.fullTestName!, async (imodel) => {
          return withEditTxn(imodel, (txn) => {
            const model = insertPhysicalModelWithPartition({ txn, codeValue: "model" });
            const category = insertSpatialCategory({ txn, codeValue: "category" });
            const a = insertPhysicalElement({ txn, modelId: model.id, categoryId: category.id, userLabel: "A" });
            const b = insertPhysicalElement({
              txn,
              modelId: model.id,
              categoryId: category.id,
              userLabel: "B",
              parentId: a.id,
            });
            const c = insertPhysicalElement({
              txn,
              modelId: model.id,
              categoryId: category.id,
              userLabel: "C",
              parentId: b.id,
            });
            const d = insertPhysicalElement({
              txn,
              modelId: model.id,
              categoryId: category.id,
              userLabel: "D",
              parentId: b.id,
            });
            const e = insertPhysicalElement({
              txn,
              modelId: model.id,
              categoryId: category.id,
              userLabel: "E",
              parentId: a.id,
            });
            const f = insertPhysicalElement({
              txn,
              modelId: model.id,
              categoryId: category.id,
              userLabel: "F",
              parentId: e.id,
            });
            const g = insertPhysicalElement({
              txn,
              modelId: model.id,
              categoryId: category.id,
              userLabel: "G",
              parentId: a.id,
            });
            return { a, b, c, d, e, f, g };
          });
        });
        const { imodelConnection: _, ...elements } = res;
        imodelConnection = res.imodelConnection;
        elementKeys = Object.entries(elements).reduce(
          (acc, [name, instanceKey]) => ({
            ...acc,
            [name]: { ...instanceKey, imodelKey: createIModelKey(imodelConnection) },
          }),
          {} as { [name: string]: InstanceKey },
        );
        elementIds = Object.entries(elements).reduce(
          (acc, [name, instanceKey]) => ({ ...acc, [name]: instanceKey.id }),
          {} as { [name: string]: Id64String },
        );
      });

      afterAll(async () => {
        await terminate();
      });

      // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchySearch.HierarchyDefinition
      function createHierarchyDefinition(): HierarchyDefinition {
        return {
          defineHierarchyLevel: async ({ parentNode, createSelectClause }) => {
            const createHierarchyLevelDefinition = async ({
              whereClause,
              bindings,
            }: {
              whereClause?: string;
              bindings?: ECSqlBinding[];
            }): Promise<HierarchyLevelDefinition> => [
              {
                fullClassName: "BisCore.PhysicalElement",
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: "this.ECClassId" },
                      ecInstanceId: { selector: "this.ECInstanceId" },
                      nodeLabel: { selector: "this.UserLabel" },
                    })}
                    FROM BisCore.PhysicalElement this
                    ${whereClause ? `WHERE ${whereClause}` : ""}
                  `,
                  bindings,
                },
              },
            ];
            if (!parentNode) {
              // For root nodes, return root BisCore.PhysicalElement instances
              return createHierarchyLevelDefinition({ whereClause: "this.Parent IS NULL" });
            }
            // We know that parent nodes are instances nodes, so just use a type guard
            assert(HierarchyNode.isInstancesNode(parentNode));
            // For child nodes, return children of the BisCore.PhysicalElement that the parent node is based on
            return createHierarchyLevelDefinition({
              // We know that all nodes are based on one instance, so no need to handle multi-instance keys situation
              whereClause: "this.Parent.Id = ?",
              bindings: [{ type: "id", value: parentNode.key.instanceKeys[0].id }],
            });
          },
        };
      }
      // __PUBLISH_EXTRACT_END__

      it("creates expected default hierarchy", async () => {
        const imodelAccess = createIModelAccess(imodelConnection);
        const hierarchyProvider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: createHierarchyDefinition(),
          search: undefined,
        });
        expect(await collectHierarchy(hierarchyProvider)).toMatchObject([
          {
            label: "A",
            children: [
              { label: "B", children: [{ label: "C" }, { label: "D" }] },
              { label: "E", children: [{ label: "F" }] },
              { label: "G" },
            ],
          },
        ]);
      });

      it("creates hierarchy searched by label", async () => {
        const imodelAccess = createIModelAccess(imodelConnection);
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchySearch.FindPathsByLabel
        // Define a function that returns `HierarchySearchTree[]` based on given search string. In this case, we run
        // a query to find matching elements by their `UserLabel` property. Then, we construct paths to the root element using recursive
        // CTE. Finally, we use `HierarchySearchTree` builder to create a search tree based on those paths.
        async function createHierarchySearchTree(searchStrings: string[]): Promise<HierarchySearchTree[]> {
          const query: ECSqlQueryDef = {
            ctes: [
              `MatchingElements(Path, ParentId) AS (
                SELECT
                  json_array(${ECSql.createInstanceKeySelector({ alias: "e" })}),
                  e.Parent.Id
                FROM BisCore.PhysicalElement e
                WHERE ${searchStrings.map(() => `e.UserLabel LIKE '%' || ? || '%'`).join(" OR ")}
                UNION ALL
                SELECT
                  json_insert(
                    ce.Path,
                    '$[#]', ${ECSql.createInstanceKeySelector({ alias: "pe" })}
                  ),
                  pe.Parent.Id
                FROM MatchingElements ce
                JOIN BisCore.PhysicalElement pe ON pe.ECInstanceId = ce.ParentId
              )`,
            ],
            ecsql: `SELECT Path FROM MatchingElements WHERE ParentId IS NULL`,
            bindings: searchStrings.map((searchString) => ({ type: "string", value: searchString })),
          };
          const searchTreeBuilder = HierarchySearchTree.createBuilder();
          for await (const row of imodelAccess.createQueryReader(query, { rowFormat: "ECSqlPropertyNames" })) {
            searchTreeBuilder.accept({
              path: (JSON.parse(row.Path) as InstanceKey[])
                .reverse()
                .map((key) => ({ ...key, imodelKey: createIModelKey(imodelConnection) })),
            });
          }
          return searchTreeBuilder.getTree();
        }
        // Find paths to elements whose label contains "C" or "E"
        const searchPaths = await createHierarchySearchTree(["C", "E"]);
        expect(searchPaths).toEqual([
          // We expect to find two paths A -> B -> C and A -> E
          {
            identifier: elementKeys.a,
            children: [
              { identifier: elementKeys.b, children: [{ identifier: elementKeys.c }] },
              { identifier: elementKeys.e },
            ],
          },
        ]);
        // __PUBLISH_EXTRACT_END__

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchySearch.ApplySearchPaths
        // Construct a hierarchy provider for the searched hierarchy
        const hierarchyProvider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: createHierarchyDefinition(),
          search: { paths: searchPaths },
        });
        // Collect the hierarchy & confirm we get what we expect - a hierarchy from root element "A" to target elements "C" and "E".
        // Note that "E" has a child "F", even though it's not a search target. This is because subtrees under search target nodes
        // (in this case - "E") are returned fully.
        expect(await collectHierarchy(hierarchyProvider)).toMatchObject([
          {
            label: "A",
            children: [
              { label: "B", children: [{ label: "C" }] },
              { label: "E", children: [{ label: "F" }] },
            ],
          },
        ]);
        // __PUBLISH_EXTRACT_END__
      });

      it("creates hierarchy searched by target instance ids", async () => {
        const imodelAccess = createIModelAccess(imodelConnection);
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchySearch.FindPathsByTargetElementId
        // Define a function that returns `HierarchyNodeIdentifiersPath[]` based on given target element IDs. In this case, we run
        // a query to find matching elements by their `ECInstanceId` property. Then, we construct paths to the root element using recursive
        // CTE. Finally, we return the paths in reverse order to start from the root element.
        async function createSearchTargetPaths(
          targetElementIds: Id64String[],
        ): Promise<HierarchyNodeIdentifiersPath[]> {
          const query: ECSqlQueryDef = {
            ctes: [
              `MatchingElements(Path, ParentId) AS (
                SELECT
                  json_array(${ECSql.createInstanceKeySelector({ alias: "e" })}),
                  e.Parent.Id
                FROM BisCore.PhysicalElement e
                WHERE e.ECInstanceId IN (${targetElementIds.map(() => "?").join(",")})
                UNION ALL
                SELECT
                  json_insert(
                    ce.Path,
                    '$[#]', ${ECSql.createInstanceKeySelector({ alias: "pe" })}
                  ),
                  pe.Parent.Id
                FROM MatchingElements ce
                JOIN BisCore.PhysicalElement pe ON pe.ECInstanceId = ce.ParentId
              )`,
            ],
            ecsql: `SELECT Path FROM MatchingElements WHERE ParentId IS NULL`,
            bindings: targetElementIds.map((id) => ({ type: "id", value: id })),
          };
          const result: HierarchyNodeIdentifiersPath[] = [];
          for await (const row of imodelAccess.createQueryReader(query, { rowFormat: "ECSqlPropertyNames" })) {
            result.push(
              (JSON.parse(row.Path) as InstanceKey[])
                .reverse()
                .map((key) => ({ ...key, imodelKey: createIModelKey(imodelConnection) })),
            );
          }
          return result;
        }
        // Find paths to target elements "C" and "E"
        const searchPaths = await createSearchTargetPaths([elementIds.c, elementIds.e]);
        expect(searchPaths).toEqual([
          // We expect to find two paths A -> B -> C and A -> E
          [elementKeys.a, elementKeys.e],
          [elementKeys.a, elementKeys.b, elementKeys.c],
        ]);
        // __PUBLISH_EXTRACT_END__

        // Construct a hierarchy provider for the searched hierarchy
        const hierarchyProvider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: createHierarchyDefinition(),
          search: { paths: await HierarchySearchTree.createFromPathsList(searchPaths) },
        });
        // Collect the hierarchy & confirm we get what we expect - a hierarchy from root element "A" to target elements "C" and "E".
        // Note that "E" has a child "F", even though it's not a search target. This is because subtrees under search target nodes
        // (in this case - "E") are returned fully.
        expect(await collectHierarchy(hierarchyProvider)).toMatchObject([
          {
            label: "A",
            children: [
              { label: "B", children: [{ label: "C" }] },
              { label: "E", children: [{ label: "F" }] },
            ],
          },
        ]);
      });

      it("sets auto-expand flag to parent nodes of the revealed search target", async () => {
        const imodelAccess = createIModelAccess(imodelConnection);

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchySearch.Reveal.SearchPath
        const searchPath: HierarchySearchPath = {
          // Path to the element "C"
          path: [elementKeys.a, elementKeys.b, elementKeys.c],
          // Supply options for the search path
          options: {
            // Reveal the target "C" node in hierarchy by setting auto-expand flag on all its ancestor nodes
            reveal: true,
          },
        };
        // __PUBLISH_EXTRACT_END__

        // Construct a hierarchy provider for the searched hierarchy
        const hierarchyProvider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: createHierarchyDefinition(),
          search: { paths: await HierarchySearchTree.createFromPathsList([searchPath]) },
        });

        // Collect the hierarchy & confirm we get what we expect - a hierarchy from root element "A" to target element "C"
        // Note that all nodes except C have `autoExpand` flag.
        expect(await collectHierarchy(hierarchyProvider)).toMatchObject([
          { label: "A", autoExpand: true, children: [{ label: "B", autoExpand: true, children: [{ label: "C" }] }] },
        ]);
      });

      it("sets auto-expand flag to parent nodes of the search target until specified groupingLevel", async () => {
        const imodelAccess = createIModelAccess(imodelConnection);
        // Define a hierarchy such that all elements except root are grouped by label.
        const hierarchyDefinition: HierarchyDefinition = {
          defineHierarchyLevel: async ({ parentNode, createSelectClause }) => {
            if (!parentNode) {
              return [
                {
                  fullClassName: "BisCore.PhysicalElement",
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: "this.ECClassId" },
                        ecInstanceId: { selector: "this.ECInstanceId" },
                        nodeLabel: { selector: "this.UserLabel" },
                      })}
                      FROM BisCore.PhysicalElement this
                      WHERE this.Parent IS NULL
                    `,
                  },
                },
              ];
            }

            assert(HierarchyNode.isInstancesNode(parentNode));
            return [
              {
                fullClassName: "BisCore.PhysicalElement",
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: "this.ECClassId" },
                      ecInstanceId: { selector: "this.ECInstanceId" },
                      nodeLabel: { selector: "this.UserLabel" },
                      grouping: { byLabel: true, byClass: true },
                    })}
                    FROM BisCore.PhysicalElement this
                    WHERE this.Parent.Id = ?
                  `,
                  bindings: [{ type: "id", value: parentNode.key.instanceKeys[0].id }],
                },
              },
            ];
          },
        };

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchySearch.RevealGroupingLevel.SearchPath
        // Hierarchy has this structure: A -> class grouping node -> label grouping node -> B -> class grouping node -> label grouping node -> C.
        // Hierarchy has two grouping nodes that group C element: one class grouping and one label grouping node.
        const searchPath: HierarchySearchPath = {
          // Path to the element "C"
          path: [elementKeys.a, elementKeys.b, elementKeys.c],
          options: {
            // Reveal the C's label grouping node by specifying its grouping level.
            // Note that grouping level is counted from the nearest non-grouping ancestor node.
            reveal: { groupingLevel: 2 },
          },
        };
        // __PUBLISH_EXTRACT_END__

        // Construct a hierarchy provider for the searched hierarchy
        const hierarchyProvider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition,
          search: { paths: await HierarchySearchTree.createFromPathsList([searchPath]) },
        });

        // Collect the hierarchy & confirm we get what we expect - a hierarchy from root element "A" to target element "C"
        // Note that all nodes before grouping node for label "C" have `autoExpand` flag.
        expect(await collectHierarchy(hierarchyProvider)).toEqual([
          {
            // Root node. Has auto-expand flag.
            nodeType: "instances",
            label: "A",
            autoExpand: true,
            children: [
              {
                // B class grouping node. Has auto-expand flag.
                nodeType: "class-grouping",
                label: "Physical Object",
                autoExpand: true,
                children: [
                  {
                    // B label grouping node. Has auto-expand flag.
                    nodeType: "label-grouping",
                    label: "B",
                    autoExpand: true,
                    children: [
                      {
                        // B instance node. Has auto-expand flag.
                        nodeType: "instances",
                        label: "B",
                        autoExpand: true,
                        children: [
                          {
                            // C class grouping node. Has auto-expand flag.
                            nodeType: "class-grouping",
                            label: "Physical Object",
                            autoExpand: true,
                            children: [
                              {
                                // C label grouping node. Doesn't have auto-expand flag.
                                nodeType: "label-grouping",
                                label: "C",
                                // Child is the search target
                                children: [{ nodeType: "instances", label: "C" }],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ]);
      });

      it("sets auto-expand flag to parent nodes of the search target until specified depthInPath", async () => {
        const imodelAccess = createIModelAccess(imodelConnection);
        // Define a hierarchy such that all elements except root are grouped by label.
        const hierarchyDefinition: HierarchyDefinition = {
          defineHierarchyLevel: async ({ parentNode, createSelectClause }) => {
            if (!parentNode) {
              return [
                {
                  fullClassName: "BisCore.PhysicalElement",
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: "this.ECClassId" },
                        ecInstanceId: { selector: "this.ECInstanceId" },
                        nodeLabel: { selector: "this.UserLabel" },
                      })}
                      FROM BisCore.PhysicalElement this
                      WHERE this.Parent IS NULL
                    `,
                  },
                },
              ];
            }

            assert(HierarchyNode.isInstancesNode(parentNode));
            return [
              {
                fullClassName: "BisCore.PhysicalElement",
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: "this.ECClassId" },
                      ecInstanceId: { selector: "this.ECInstanceId" },
                      nodeLabel: { selector: "this.UserLabel" },
                      grouping: { byLabel: true },
                    })}
                    FROM BisCore.PhysicalElement this
                    WHERE this.Parent.Id = ?
                  `,
                  bindings: [{ type: "id", value: parentNode.key.instanceKeys[0].id }],
                },
              },
            ];
          },
        };

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchySearch.AutoExpandUntilDepthInPath.SearchPath
        // Hierarchy has this structure: A -> label grouping node -> B -> label grouping node -> C.
        const searchPath: HierarchySearchPath = {
          // Path to the element "C"
          path: [elementKeys.a, elementKeys.b, elementKeys.c],
          options: {
            // Reveal node "B" (index in search path equals `1`) in hierarchy by setting auto-expand flag on all its ancestors
            reveal: { depthInPath: 1 },
          },
        };
        // __PUBLISH_EXTRACT_END__

        // Construct a hierarchy provider for the searched hierarchy
        const hierarchyProvider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition,
          search: { paths: await HierarchySearchTree.createFromPathsList([searchPath]) },
        });

        // Collect the hierarchy & confirm we get what we expect - a hierarchy from root element "A" to target element "C"
        // Note that all nodes before grouping node for label "C" have `autoExpand` flag.
        expect(await collectHierarchy(hierarchyProvider)).toEqual([
          {
            // Root node. Has auto-expand flag.
            nodeType: "instances",
            label: "A",
            autoExpand: true,
            children: [
              {
                // B grouping node. Has auto-expand flag.
                nodeType: "label-grouping",
                label: "B",
                autoExpand: true,
                children: [
                  {
                    // B instance node. Has auto-expand flag.
                    nodeType: "instances",
                    label: "B",
                    children: [
                      {
                        // C grouping node. Doesn't have auto-expand flag.
                        nodeType: "label-grouping",
                        label: "C",
                        // Child is the search target
                        children: [{ nodeType: "instances", label: "C" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ]);
      });

      it("sets auto-expand flag on search target when `HierarchySearchPathOptions.autoExpand` flag is set", async function () {
        const imodelAccess = createIModelAccess(imodelConnection);
        // Define a hierarchy such that all elements except root are grouped by label.
        const hierarchyDefinition: HierarchyDefinition = {
          defineHierarchyLevel: async ({ parentNode, createSelectClause }) => {
            if (!parentNode) {
              return [
                {
                  fullClassName: "BisCore.PhysicalElement",
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: "this.ECClassId" },
                        ecInstanceId: { selector: "this.ECInstanceId" },
                        nodeLabel: { selector: "this.UserLabel" },
                      })}
                      FROM BisCore.PhysicalElement this
                      WHERE this.Parent IS NULL
                    `,
                  },
                },
              ];
            }

            assert(HierarchyNode.isInstancesNode(parentNode));
            return [
              {
                fullClassName: "BisCore.PhysicalElement",
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: "this.ECClassId" },
                      ecInstanceId: { selector: "this.ECInstanceId" },
                      nodeLabel: { selector: "this.UserLabel" },
                      grouping: { byLabel: true },
                    })}
                    FROM BisCore.PhysicalElement this
                    WHERE this.Parent.Id = ?
                  `,
                  bindings: [{ type: "id", value: parentNode.key.instanceKeys[0].id }],
                },
              },
            ];
          },
        };

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchySearch.AutoExpand.SearchPath
        const searchPath: HierarchySearchPath = {
          // Path to the element "C"
          path: [elementKeys.a, elementKeys.b, elementKeys.c],
          options: {
            // Auto-expand all nodes up to element "C".
            reveal: true,
            // Auto-expand the search target ("C" node) as well.
            autoExpand: true,
          },
        };
        // __PUBLISH_EXTRACT_END__

        // Construct a hierarchy provider for the search hierarchy
        const hierarchyProvider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition,
          search: { paths: await HierarchySearchTree.createFromPathsList([searchPath]) },
        });

        // Collect the hierarchy & confirm we get what we expect - a hierarchy from root element "A" to target element "C"
        // Note that all nodes before grouping node for label "C" have `autoExpand` flag.
        expect(await collectHierarchy(hierarchyProvider)).toEqual([
          {
            // Root node. Has auto-expand flag.
            nodeType: "instances",
            label: "A",
            autoExpand: true,
            children: [
              {
                // B grouping node. Has auto-expand flag.
                nodeType: "label-grouping",
                label: "B",
                autoExpand: true,
                children: [
                  {
                    // B instance node. Has auto-expand flag.
                    nodeType: "instances",
                    label: "B",
                    autoExpand: true,
                    children: [
                      {
                        // C grouping node. Has auto-expand flag.
                        nodeType: "label-grouping",
                        label: "C",
                        autoExpand: true,
                        // Child is the search target. Has auto-expand flag.
                        children: [{ nodeType: "instances", label: "C", autoExpand: true }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ]);
      });
    });
  });
});
