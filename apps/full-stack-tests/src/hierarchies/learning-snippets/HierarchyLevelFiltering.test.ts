/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */

import { collect, insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
import { IModelConnection } from "@itwin/core-frontend";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyLevelFiltering.Imports
import { createNodesQueryClauseFactory, HierarchyDefinition } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
import { createIModelHierarchyProvider, GenericInstanceFilter } from "@itwin/presentation-hierarchies";
import { buildIModel } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchy, validateHierarchyLevel } from "../HierarchyValidation";
import { createIModelAccess } from "../Utils";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

describe("Hierarchies", () => {
  describe("Learning snippets", () => {
    describe("Hierarchy level filtering", () => {
      let imodel: IModelConnection;

      before(async function () {
        await initialize();

        const res = await buildIModel(this, async (builder) => {
          const model = insertPhysicalModelWithPartition({ builder, codeValue: "model" });
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          const a = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, userLabel: "A" });
          const b = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, userLabel: "B", parentId: a.id });
          const c = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, userLabel: "C", parentId: b.id });
          return { a, b, c };
        });
        imodel = res.imodel;
      });

      after(async () => {
        await terminate();
      });

      it("creates filterable custom node", async function () {
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyLevelFiltering.CustomHierarchyNodeDefinition
        const hierarchyDefinition: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [
                {
                  node: {
                    key: "custom node",
                    label: "Custom Node",
                    supportsFiltering: true,
                  },
                },
              ];
            }
            return [];
          },
        };
        // __PUBLISH_EXTRACT_END__
        await validateHierarchy({
          provider: createIModelHierarchyProvider({ imodelAccess: createIModelAccess(imodel), hierarchyDefinition }),
          expect: [
            NodeValidators.createForCustomNode({
              key: "custom node",
              label: "Custom Node",
              supportsFiltering: true,
            }),
          ],
        });
      });

      it("creates filterable instances node", async function () {
        const imodelAccess = createIModelAccess(imodel);
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyLevelFiltering.InstanceNodesQueryDefinition
        const queryClauseFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
        });
        const hierarchyDefinition: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
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
          provider: createIModelHierarchyProvider({ imodelAccess: createIModelAccess(imodel), hierarchyDefinition }),
          expect: [
            NodeValidators.createForInstanceNode({
              label: "A",
              supportsFiltering: true,
            }),
          ],
        });
      });

      it("applies filter", async function () {
        const imodelAccess = createIModelAccess(imodel);
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyLevelFiltering.ApplyFilter
        const queryClauseFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
        });
        const hierarchyDefinition: HierarchyDefinition = {
          async defineHierarchyLevel(props) {
            // `createFilterClauses` function returns `from`, `joins`, and `where` clauses which need to be used in the
            // query in appropriate places
            const { from, joins, where } = await queryClauseFactory.createFilterClauses({
              // specify the content class whose instances are used to build nodes - this should
              // generally match the instance whose ECClassId and ECInstanceId are used in the SELECT clause
              contentClass: {
                fullName: "BisCore.PhysicalElement",
                alias: "this",
              },
              // specify the filter that we get from props for this hierarchy level
              filter: props.instanceFilter,
            });
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
        const provider = createIModelHierarchyProvider({ imodelAccess: createIModelAccess(imodel), hierarchyDefinition });
        const instanceFilter: GenericInstanceFilter = {
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
          nodes: await collect(provider.getNodes({ parentNode: undefined, instanceFilter })),
          expect: [NodeValidators.createForInstanceNode({ label: "B" }), NodeValidators.createForInstanceNode({ label: "C" })],
        });
      });
    });
  });
});
