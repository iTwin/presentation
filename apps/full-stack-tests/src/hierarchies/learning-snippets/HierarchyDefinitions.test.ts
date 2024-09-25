/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */

import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
import { IModelConnection } from "@itwin/core-frontend";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyDefinitions.Imports
import { createClassBasedHierarchyDefinition, createNodesQueryClauseFactory, HierarchyDefinition, HierarchyNode } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
import { createHierarchyProvider } from "@itwin/presentation-hierarchies";
import { buildIModel } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation";
import { createIModelAccess } from "../Utils";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

describe("Hierarchies", () => {
  describe("Learning snippets", () => {
    describe("Hierarchy definitions", () => {
      let imodel: IModelConnection;

      before(async function () {
        await initialize();

        const res = await buildIModel(this, async (builder) => {
          const model = insertPhysicalModelWithPartition({ builder, codeValue: "model" });
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          const a = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, userLabel: "A" });
          const b = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, userLabel: "B" });
          return { a, b };
        });
        imodel = res.imodel;
      });

      after(async () => {
        await terminate();
      });

      it("creates a hierarchy using simple hierarchy definition", async function () {
        const imodelAccess = createIModelAccess(imodel);
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyDefinitions.Simple
        const hierarchyDefinition: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            // For root nodes, simply return one custom node
            if (!parentNode) {
              return [
                {
                  node: {
                    key: "physical-elements",
                    label: "Physical elements",
                  },
                },
              ];
            }
            // For the custom node, return a query that selects all physical elements
            if (parentNode.key === "physical-elements") {
              const queryClauseFactory = createNodesQueryClauseFactory({
                imodelAccess,
                instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
              });
              return [
                {
                  fullClassName: "BisCore.PhysicalElement",
                  query: {
                    ecsql: `
                      SELECT ${await queryClauseFactory.createSelectClause({
                        ecClassId: { selector: "x.ECClassId" },
                        ecInstanceId: { selector: "x.ECInstanceId" },
                        nodeLabel: { selector: "x.UserLabel" },
                      })}
                      FROM BisCore.PhysicalElement x
                    `,
                  },
                },
              ];
            }
            // Otherwise, return an empty array to indicate that there are no children
            return [];
          },
        };
        // __PUBLISH_EXTRACT_END__
        await validateHierarchy({
          provider: createHierarchyProvider({ imodelAccess, hierarchyDefinition }),
          expect: [
            NodeValidators.createForCustomNode({
              key: "physical-elements",
              label: "Physical elements",
              children: [NodeValidators.createForInstanceNode({ label: "A" }), NodeValidators.createForInstanceNode({ label: "B" })],
            }),
          ],
        });
      });

      it("uses hierarchy definition's parseNode callback", async function () {
        const imodelAccess = createIModelAccess(imodel);
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyDefinitions.ParseNode
        const hierarchyDefinition: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            // For root nodes, return all physical elements
            if (!parentNode) {
              return [
                {
                  fullClassName: "BisCore.PhysicalElement",
                  query: {
                    // Define the query without using `NodesQueryClauseFactory` - we'll parse the results manually. But to create
                    // an instances node we need at least a class name, instance id, and a label.
                    ecsql: `
                      SELECT
                        ec_classname(ECClassId, 's.c') ClassName,
                        ECInstanceId Id,
                        UserLabel Label
                      FROM
                        BisCore.PhysicalElement
                    `,
                  },
                },
              ];
            }
            // Otherwise, return an empty array to indicate that there are no children
            return [];
          },
          parseNode(row) {
            // Parse the row into an instance node
            return {
              key: {
                type: "instances",
                instanceKeys: [{ className: row.ClassName, id: row.Id }],
              },
              label: row.Label,
            };
          },
        };
        // __PUBLISH_EXTRACT_END__
        await validateHierarchy({
          provider: createHierarchyProvider({ imodelAccess, hierarchyDefinition }),
          expect: [NodeValidators.createForInstanceNode({ label: "A" }), NodeValidators.createForInstanceNode({ label: "B" })],
        });
      });

      it("uses hierarchy definition's preProcessNode callback", async function () {
        const imodelAccess = createIModelAccess(imodel);
        const externalService = {
          getExternalId: async <TNode extends { label: string }>(node: TNode) => {
            if (node.label === "A") {
              return "test-external-id";
            }
            return undefined;
          },
        };
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyDefinitions.PreProcessNode
        const hierarchyDefinition: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            // For root nodes, return all physical elements
            if (!parentNode) {
              const queryClauseFactory = createNodesQueryClauseFactory({
                imodelAccess,
                instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
              });
              return [
                {
                  fullClassName: "BisCore.PhysicalElement",
                  query: {
                    ecsql: `
                      SELECT ${await queryClauseFactory.createSelectClause({
                        ecClassId: { selector: "x.ECClassId" },
                        ecInstanceId: { selector: "x.ECInstanceId" },
                        nodeLabel: { selector: "x.UserLabel" },
                      })}
                      FROM BisCore.PhysicalElement x
                    `,
                  },
                },
              ];
            }
            // Otherwise, return an empty array to indicate that there are no children
            return [];
          },
          async preProcessNode(node) {
            // The pre-processor queries an external service to get an external ID for the node
            // and either adds it to the node's extended data or omits the node from the hierarchy
            // if the external ID is not found.
            const externalId = await externalService.getExternalId(node);
            if (externalId) {
              return { ...node, extendedData: { ...node.extendedData, externalId } };
            }
            return undefined;
          },
        };
        // __PUBLISH_EXTRACT_END__
        await validateHierarchy({
          provider: createHierarchyProvider({ imodelAccess, hierarchyDefinition }),
          expect: [
            NodeValidators.createForInstanceNode({
              label: "A",
              extendedData: { externalId: "test-external-id" },
            }),
          ],
        });
      });

      it("uses hierarchy definition's postProcessNode callback", async function () {
        const imodelAccess = createIModelAccess(imodel);
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyDefinitions.PostProcessNode
        const hierarchyDefinition: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            // For root nodes, return all physical elements grouped by class
            if (!parentNode) {
              const queryClauseFactory = createNodesQueryClauseFactory({
                imodelAccess,
                instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
              });
              return [
                {
                  fullClassName: "BisCore.PhysicalElement",
                  query: {
                    ecsql: `
                      SELECT ${await queryClauseFactory.createSelectClause({
                        ecClassId: { selector: "x.ECClassId" },
                        ecInstanceId: { selector: "x.ECInstanceId" },
                        nodeLabel: { selector: "x.UserLabel" },
                        grouping: {
                          byClass: true,
                        },
                        extendedData: {
                          // assign an iconId to all instance nodes
                          iconId: "icon-physical-element",
                        },
                      })}
                      FROM BisCore.PhysicalElement x
                    `,
                  },
                },
              ];
            }
            // Otherwise, return an empty array to indicate that there are no children
            return [];
          },
          async postProcessNode(node) {
            // All instance nodes will have an iconId assigned in the query, but grouping nodes won't - do it here
            if (HierarchyNode.isClassGroupingNode(node)) {
              return { ...node, extendedData: { ...node.extendedData, iconId: "icon-class-group" } };
            }
            return node;
          },
        };
        // __PUBLISH_EXTRACT_END__
        await validateHierarchy({
          provider: createHierarchyProvider({ imodelAccess, hierarchyDefinition }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              label: "Physical Object",
              extendedData: { iconId: "icon-class-group" },
              children: [
                NodeValidators.createForInstanceNode({ label: "A", extendedData: { iconId: "icon-physical-element" } }),
                NodeValidators.createForInstanceNode({ label: "B", extendedData: { iconId: "icon-physical-element" } }),
              ],
            }),
          ],
        });
      });

      it("creates hierarchy using class based hierarchy definition", async function () {
        const imodelAccess = createIModelAccess(imodel);
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyDefinitions.ClassBasedHierarchyDefinition
        const queryClauseFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
        });
        const hierarchyDefinition = createClassBasedHierarchyDefinition({
          classHierarchyInspector: imodelAccess,
          hierarchy: {
            // For root nodes, simply return one custom node
            rootNodes: async () => [
              {
                node: {
                  key: "physical-elements",
                  label: "Physical elements",
                },
              },
            ],
            childNodes: [
              {
                // For the custom node, return a query that selects all physical elements
                customParentNodeKey: "physical-elements",
                definitions: async () => [
                  {
                    fullClassName: "BisCore.PhysicalElement",
                    query: {
                      ecsql: `
                      SELECT ${await queryClauseFactory.createSelectClause({
                        ecClassId: { selector: "x.ECClassId" },
                        ecInstanceId: { selector: "x.ECInstanceId" },
                        nodeLabel: { selector: "x.UserLabel" },
                      })}
                      FROM BisCore.PhysicalElement x
                    `,
                    },
                  },
                ],
              },
            ],
          },
        });
        // __PUBLISH_EXTRACT_END__
        await validateHierarchy({
          provider: createHierarchyProvider({ imodelAccess, hierarchyDefinition }),
          expect: [
            NodeValidators.createForCustomNode({
              key: "physical-elements",
              label: "Physical elements",
              children: [NodeValidators.createForInstanceNode({ label: "A" }), NodeValidators.createForInstanceNode({ label: "B" })],
            }),
          ],
        });
      });
    });
  });
});
