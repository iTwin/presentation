/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */

import {
  collect,
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { afterAll, describe, it, test } from "vitest";
import { IModelConnection } from "@itwin/core-frontend";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyLevelFiltering.Imports
import { HierarchyDefinition } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
import { createIModelHierarchyProvider, GenericInstanceFilter } from "@itwin/presentation-hierarchies";
import { withEditTxn } from "@itwin/core-backend";
import { buildTestIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { NodeValidators, validateHierarchy, validateHierarchyLevel } from "../HierarchyValidation.js";
import { createIModelAccess } from "../Utils.js";

describe("Hierarchies", () => {
  describe("Learning snippets", () => {
    describe("Hierarchy level filtering", () => {
      let imodelConnection: IModelConnection;

      test.beforeAll(async (_, suite) => {
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
            return { a, b, c };
          });
        });
        imodelConnection = res.imodelConnection;
      });

      afterAll(async () => {
        await terminate();
      });

      it("creates filterable generic node", async () => {
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyLevelFiltering.GenericHierarchyNodeDefinition
        const hierarchyDefinition: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [{ node: { key: "custom node", label: "Custom Node", supportsFiltering: true } }];
            }
            return [];
          },
        };
        // __PUBLISH_EXTRACT_END__
        await validateHierarchy({
          provider: createIModelHierarchyProvider({
            imodelAccess: createIModelAccess(imodelConnection),
            hierarchyDefinition,
          }),
          expect: [
            NodeValidators.createForGenericNode({ key: "custom node", label: "Custom Node", supportsFiltering: true }),
          ],
        });
      });

      it("creates filterable instances node", async () => {
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyLevelFiltering.InstanceNodesQueryDefinition
        const hierarchyDefinition: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
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
                        supportsFiltering: true, // could also pass a selector to set this conditionally
                      })}
                      FROM BisCore.PhysicalElement this
                      WHERE this.Parent IS NULL
                    `,
                  },
                },
              ];
            }
            return [];
          },
        };
        // __PUBLISH_EXTRACT_END__
        await validateHierarchy({
          provider: createIModelHierarchyProvider({
            imodelAccess: createIModelAccess(imodelConnection),
            hierarchyDefinition,
          }),
          expect: [NodeValidators.createForInstanceNode({ label: "A", supportsFiltering: true })],
        });
      });

      it("applies filter", async () => {
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyLevelFiltering.ApplyFilter
        const hierarchyDefinition: HierarchyDefinition = {
          async defineHierarchyLevel({ instanceFilter, createSelectClause, createFilterClauses }) {
            // `createFilterClauses` function returns `from`, `joins`, and `where` clauses which need to be used in the
            // query in appropriate places
            const { from, joins, where } = await createFilterClauses({
              // specify the content class whose instances are used to build nodes - this should
              // generally match the instance whose ECClassId and ECInstanceId are used in the SELECT clause
              contentClass: { fullName: "BisCore.PhysicalElement", alias: "this" },
              // specify the filter that we get from props for this hierarchy level
              filter: instanceFilter,
            });
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
                    FROM ${from} this
                    ${joins}
                    ${where ? `WHERE ${where}` : ""}
                  `,
                },
              },
            ];
          },
        };
        // __PUBLISH_EXTRACT_END__
        const provider = createIModelHierarchyProvider({
          imodelAccess: createIModelAccess(imodelConnection),
          hierarchyDefinition,
        });
        const testInstanceFilter: GenericInstanceFilter = {
          propertyClassNames: ["BisCore.PhysicalElement"],
          relatedInstances: [],
          rules: {
            operator: "or",
            rules: [
              {
                operator: "is-equal",
                sourceAlias: "this",
                propertyName: "UserLabel",
                propertyTypeName: "string",
                value: { displayValue: "B", rawValue: "B" },
              },
              {
                operator: "is-equal",
                sourceAlias: "this",
                propertyName: "UserLabel",
                propertyTypeName: "string",
                value: { displayValue: "C", rawValue: "C" },
              },
            ],
          },
        };
        validateHierarchyLevel({
          nodes: await collect(provider.getNodes({ parentNode: undefined, instanceFilter: testInstanceFilter })),
          expect: [
            NodeValidators.createForInstanceNode({ label: "B" }),
            NodeValidators.createForInstanceNode({ label: "C" }),
          ],
        });
      });
    });
  });
});
