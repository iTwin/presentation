/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable no-duplicate-imports */

import { expect } from "chai";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
import { expand, filter, first, firstValueFrom, from } from "rxjs";
import { assert, Id64String } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { createBisInstanceLabelSelectClauseFactory, InstanceKey } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyFiltering.HierarchyDefinitionImports
import { createNodesQueryClauseFactory, GroupingHierarchyNode, HierarchyDefinition, HierarchyNode } from "@itwin/presentation-hierarchies";
import { ECSqlBinding } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyFiltering.FindPathsImports
import { createIModelKey } from "@itwin/presentation-core-interop";
import { HierarchyNodeIdentifiersPath } from "@itwin/presentation-hierarchies";
import { ECSql, ECSqlQueryDef } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyFiltering.FilteringImports
import { createIModelHierarchyProvider } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyFiltering.HierarchyFilteringPathImport
import { HierarchyFilteringPath } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
import { buildIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { createIModelAccess } from "../Utils.js";
import { collectHierarchy } from "./Utils.js";

describe("Hierarchies", () => {
  describe("Learning snippets", () => {
    describe("Hierarchy filtering", () => {
      type IModelAccess = ReturnType<typeof createIModelAccess>;
      let imodel: IModelConnection;
      let elementIds: { [name: string]: Id64String };
      let elementKeys: { [name: string]: InstanceKey };

      before(async function () {
        await initialize();

        const res = await buildIModel(this, async (builder) => {
          const model = insertPhysicalModelWithPartition({ builder, codeValue: "model" });
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          const a = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, userLabel: "A" });
          const b = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, userLabel: "B", parentId: a.id });
          const c = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, userLabel: "C", parentId: b.id });
          const d = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, userLabel: "D", parentId: b.id });
          const e = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, userLabel: "E", parentId: a.id });
          const f = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, userLabel: "F", parentId: e.id });
          const g = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, userLabel: "G", parentId: a.id });
          return { a, b, c, d, e, f, g };
        });
        const { imodel: _, ...elements } = res;
        imodel = res.imodel;
        elementKeys = Object.entries(elements).reduce(
          (acc, [name, instanceKey]) => ({ ...acc, [name]: { ...instanceKey, imodelKey: createIModelKey(imodel) } }),
          {} as { [name: string]: InstanceKey },
        );
        elementIds = Object.entries(elements).reduce((acc, [name, instanceKey]) => ({ ...acc, [name]: instanceKey.id }), {} as { [name: string]: Id64String });
      });

      after(async () => {
        await terminate();
      });

      // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyFiltering.HierarchyDefinition
      function createHierarchyDefinition(imodelAccess: IModelAccess): HierarchyDefinition {
        const queryClauseFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
        });
        const createHierarchyLevelDefinition = async ({ whereClause, bindings }: { whereClause?: string; bindings?: ECSqlBinding[] }) => [
          {
            fullClassName: "BisCore.PhysicalElement",
            query: {
              ecsql: `
                SELECT ${await queryClauseFactory.createSelectClause({
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
        return {
          defineHierarchyLevel: async ({ parentNode }) => {
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

      it("creates expected unfiltered hierarchy", async function () {
        const imodelAccess = createIModelAccess(imodel);
        const hierarchyProvider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: createHierarchyDefinition(imodelAccess),
          filtering: undefined,
        });
        expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
          {
            label: "A",
            children: [
              {
                label: "B",
                children: [{ label: "C" }, { label: "D" }],
              },
              {
                label: "E",
                children: [{ label: "F" }],
              },
              {
                label: "G",
              },
            ],
          },
        ]);
      });

      it("creates hierarchy filtered by label", async function () {
        const imodelAccess = createIModelAccess(imodel);
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyFiltering.FindPathsByLabel
        // Define a function that returns `HierarchyNodeIdentifiersPath[]` based on given search string. In this case, we run
        // a query to find matching elements by their `UserLabel` property. Then, we construct paths to the root element using recursive
        // CTE. Finally, we return the paths in reverse order to start from the root element.
        async function createFilteredNodeIdentifierPaths(searchStrings: string[]): Promise<HierarchyNodeIdentifiersPath[]> {
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
          const result: HierarchyNodeIdentifiersPath[] = [];
          for await (const row of imodelAccess.createQueryReader(query, { rowFormat: "ECSqlPropertyNames" })) {
            result.push((JSON.parse(row.Path) as InstanceKey[]).reverse().map((key) => ({ ...key, imodelKey: createIModelKey(imodel) })));
          }
          return result;
        }
        // Find paths to elements whose label contains "C" or "E"
        const filterPaths = await createFilteredNodeIdentifierPaths(["C", "E"]);
        expect(filterPaths).to.deep.eq([
          // We expect to find two paths A -> B -> C and A -> E
          [elementKeys.a, elementKeys.e],
          [elementKeys.a, elementKeys.b, elementKeys.c],
        ]);
        // __PUBLISH_EXTRACT_END__

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyFiltering.ApplyFilterPaths
        // Construct a hierarchy provider for the filtered hierarchy
        const hierarchyProvider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: createHierarchyDefinition(imodelAccess),
          filtering: { paths: filterPaths },
        });
        // Collect the hierarchy & confirm we get what we expect - a hierarchy from root element "A" to target elements "C" and "E".
        // Note that "E" has a child "F", even though it's not a filter target. This is because subtrees under filter target nodes
        // (in this case - "E") are returned fully.
        expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
          {
            label: "A",
            children: [
              {
                label: "B",
                children: [{ label: "C" }],
              },
              {
                label: "E",
                children: [{ label: "F" }],
              },
            ],
          },
        ]);
        // __PUBLISH_EXTRACT_END__
      });

      it("creates hierarchy filtered by target instance ids", async function () {
        const imodelAccess = createIModelAccess(imodel);
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyFiltering.FindPathsByTargetElementId
        // Define a function that returns `HierarchyNodeIdentifiersPath[]` based on given target element IDs. In this case, we run
        // a query to find matching elements by their `ECInstanceId` property. Then, we construct paths to the root element using recursive
        // CTE. Finally, we return the paths in reverse order to start from the root element.
        async function createFilteredNodeIdentifierPaths(targetElementIds: Id64String[]): Promise<HierarchyNodeIdentifiersPath[]> {
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
            result.push((JSON.parse(row.Path) as InstanceKey[]).reverse().map((key) => ({ ...key, imodelKey: createIModelKey(imodel) })));
          }
          return result;
        }
        // Find paths to target elements "C" and "E"
        const filterPaths = await createFilteredNodeIdentifierPaths([elementIds.c, elementIds.e]);
        expect(filterPaths).to.deep.eq([
          // We expect to find two paths A -> B -> C and A -> E
          [elementKeys.a, elementKeys.e],
          [elementKeys.a, elementKeys.b, elementKeys.c],
        ]);
        // __PUBLISH_EXTRACT_END__

        // Construct a hierarchy provider for the filtered hierarchy
        const hierarchyProvider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: createHierarchyDefinition(imodelAccess),
          filtering: { paths: filterPaths },
        });
        // Collect the hierarchy & confirm we get what we expect - a hierarchy from root element "A" to target elements "C" and "E".
        // Note that "E" has a child "F", even though it's not a filter target. This is because subtrees under filter target nodes
        // (in this case - "E") are returned fully.
        expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
          {
            label: "A",
            children: [
              {
                label: "B",
                children: [{ label: "C" }],
              },
              {
                label: "E",
                children: [{ label: "F" }],
              },
            ],
          },
        ]);
      });

      it("sets auto-expand flag to parent nodes of the filter target", async function () {
        const imodelAccess = createIModelAccess(imodel);

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyFiltering.AutoExpand.FilteringPath
        // Get a grouping node that groups the "C" element
        const filteringPath: HierarchyFilteringPath = {
          // Path to the element "C"
          path: [elementKeys.a, elementKeys.b, elementKeys.c],
          // Supply options for the filtering path
          options: {
            // Auto-expand the hierarchy up to the target "C" node
            autoExpand: true,
          },
        };
        // __PUBLISH_EXTRACT_END__

        // Construct a hierarchy provider for the filtered hierarchy
        const hierarchyProvider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: createHierarchyDefinition(imodelAccess),
          filtering: {
            paths: [filteringPath],
          },
        });

        // Collect the hierarchy & confirm we get what we expect - a hierarchy from root element "A" to target element "C"
        // Note that all nodes except C have `autoExpand` flag.
        expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
          {
            label: "A",
            autoExpand: true,
            children: [
              {
                label: "B",
                autoExpand: true,
                children: [
                  {
                    label: "C",
                    autoExpand: undefined,
                  },
                ],
              },
            ],
          },
        ]);
      });

      it("sets auto-expand flag to parent nodes of the filter target until a given grouping node", async function () {
        const imodelAccess = createIModelAccess(imodel);
        const queryClauseFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
        });
        // Define a hierarchy such that all elements except root are grouped by label.
        const hierarchyDefinition: HierarchyDefinition = {
          defineHierarchyLevel: async ({ parentNode }) => {
            if (!parentNode) {
              return [
                {
                  fullClassName: "BisCore.PhysicalElement",
                  query: {
                    ecsql: `
                      SELECT ${await queryClauseFactory.createSelectClause({
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
                    SELECT ${await queryClauseFactory.createSelectClause({
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

        async function getSelectedGroupingNode(): Promise<GroupingHierarchyNode> {
          const provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition });
          return firstValueFrom(
            from(provider.getNodes({ parentNode: undefined })).pipe(
              expand((parentNode) => provider.getNodes({ parentNode })),
              filter((node) => HierarchyNode.isGroupingNode(node)),
              first((node) => InstanceKey.equals(node.groupedInstanceKeys[0], elementKeys.c)),
            ),
          );
        }

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyFiltering.AutoExpandUntilDepth.FilteringPath
        // Get a grouping node that groups the "C" element
        const groupingNode = await getSelectedGroupingNode();
        const filteringPath: HierarchyFilteringPath = {
          // Path to the element "C"
          path: [elementKeys.a, elementKeys.b, elementKeys.c],
          // Supply grouping node attributes with the path to the "C" element.
          options: {
            // Auto-expand the hierarchy up to and including the specified `depth`.
            autoExpand: { depth: groupingNode.parentKeys.length },
          },
        };
        // __PUBLISH_EXTRACT_END__

        // Construct a hierarchy provider for the filtered hierarchy
        const hierarchyProvider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition,
          filtering: {
            paths: [filteringPath],
          },
        });

        // Collect the hierarchy & confirm we get what we expect - a hierarchy from root element "A" to target element "C"
        // Note that all nodes before grouping node for label "C" have `autoExpand` flag.
        expect(await collectHierarchy(hierarchyProvider)).to.deep.eq([
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
                        // C grouping node. Doesn't have auto-expand flag.
                        nodeType: "label-grouping",
                        label: "C",
                        // Child is the filter target
                        children: [
                          {
                            nodeType: "instances",
                            label: "C",
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
    });
  });
});
