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
import { afterAll, describe, it, test } from "vitest";
import { IModelConnection } from "@itwin/core-frontend";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyDefinitions.Imports
import {
  createPredicateBasedHierarchyDefinition,
  DefineGenericNodeChildHierarchyLevelProps,
  HierarchyDefinition,
  HierarchyLevelDefinition,
  HierarchyNode,
} from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyDefinitions.HiddenClassesImports
import { ECSql } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__
import { createIModelHierarchyProvider } from "@itwin/presentation-hierarchies";
import { withEditTxn } from "@itwin/core-backend";
import { buildTestIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { importSchema } from "../../SchemaUtils.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { createIModelAccess } from "../Utils.js";

describe("Hierarchies", () => {
  describe("Learning snippets", () => {
    describe("Hierarchy definitions", () => {
      let imodelConnection: IModelConnection;

      test.beforeAll(async (_, suite) => {
        await initialize();

        const res = await buildTestIModel(suite.fullTestName!, async (imodel) => {
          return withEditTxn(imodel, (txn) => {
            const model = insertPhysicalModelWithPartition({ txn, codeValue: "model" });
            const category = insertSpatialCategory({ txn, codeValue: "category" });
            const a = insertPhysicalElement({ txn, modelId: model.id, categoryId: category.id, userLabel: "A" });
            const b = insertPhysicalElement({ txn, modelId: model.id, categoryId: category.id, userLabel: "B" });
            return { a, b };
          });
        });
        imodelConnection = res.imodelConnection;
      });

      afterAll(async () => {
        await terminate();
      });

      it("creates a hierarchy using simple hierarchy definition", async () => {
        const imodelAccess = createIModelAccess(imodelConnection);
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyDefinitions.Simple
        const hierarchyDefinition: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            // For root nodes, simply return one generic node
            if (!parentNode) {
              return [{ node: { key: "physical-elements", label: "Physical elements" } }];
            }
            // For the root node, return a query that selects all physical elements
            if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "physical-elements") {
              return [
                {
                  fullClassName: "BisCore.PhysicalElement",
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
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
          provider: createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition }),
          expect: [
            NodeValidators.createForGenericNode({
              key: "physical-elements",
              label: "Physical elements",
              children: [
                NodeValidators.createForInstanceNode({ label: "A" }),
                NodeValidators.createForInstanceNode({ label: "B" }),
              ],
            }),
          ],
        });
      });

      it("uses hierarchy definition's parseNode callback", async () => {
        const imodelAccess = createIModelAccess(imodelConnection);
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyDefinitions.ParseNode
        const hierarchyDefinition: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            // For root nodes, return all physical elements
            if (!parentNode) {
              return [
                {
                  fullClassName: "BisCore.PhysicalElement",
                  query: {
                    // Define the query without using `createSelectClause` - we'll parse the results manually. But to create
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
          parseNode({ row }) {
            // Parse the row into an instance node
            return {
              key: { type: "instances", instanceKeys: [{ className: row.ClassName, id: row.Id }] },
              label: row.Label,
            };
          },
        };
        // __PUBLISH_EXTRACT_END__
        await validateHierarchy({
          provider: createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition }),
          expect: [
            NodeValidators.createForInstanceNode({ label: "A" }),
            NodeValidators.createForInstanceNode({ label: "B" }),
          ],
        });
      });

      it("uses hierarchy definition's preProcessNode callback", async () => {
        const imodelAccess = createIModelAccess(imodelConnection);
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
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            // For root nodes, return all physical elements
            if (!parentNode) {
              return [
                {
                  fullClassName: "BisCore.PhysicalElement",
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
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
          async preProcessNode({ node }) {
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
          provider: createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition }),
          expect: [
            NodeValidators.createForInstanceNode({ label: "A", extendedData: { externalId: "test-external-id" } }),
          ],
        });
      });

      it("uses hierarchy definition's postProcessNode callback", async () => {
        const imodelAccess = createIModelAccess(imodelConnection);
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyDefinitions.PostProcessNode
        const hierarchyDefinition: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            // For root nodes, return all physical elements grouped by class
            if (!parentNode) {
              return [
                {
                  fullClassName: "BisCore.PhysicalElement",
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: "x.ECClassId" },
                        ecInstanceId: { selector: "x.ECInstanceId" },
                        nodeLabel: { selector: "x.UserLabel" },
                        grouping: { byClass: true },
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
          async postProcessNode({ node }) {
            // All instance nodes will have an iconId assigned in the query, but grouping nodes won't - do it here
            if (HierarchyNode.isClassGroupingNode(node)) {
              return { ...node, extendedData: { ...node.extendedData, iconId: "icon-class-group" } };
            }
            return node;
          },
        };
        // __PUBLISH_EXTRACT_END__
        await validateHierarchy({
          provider: createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition }),
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

      it("creates hierarchy using predicate based hierarchy definition", async () => {
        const imodelAccess = createIModelAccess(imodelConnection);
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyDefinitions.PredicateBasedHierarchyDefinition
        const hierarchyDefinition = createPredicateBasedHierarchyDefinition({
          imodelAccess,
          hierarchy: {
            // For root nodes, simply return one generic node
            rootNodes: async () => [{ node: { key: "physical-elements", label: "Physical elements" } }],
            childNodes: [
              {
                // For the root node, return a query that selects all physical elements
                parentGenericNodePredicate: async (parentKey) => parentKey.id === "physical-elements",
                definitions: async ({
                  createSelectClause,
                }: DefineGenericNodeChildHierarchyLevelProps): Promise<HierarchyLevelDefinition> => [
                  {
                    fullClassName: "BisCore.PhysicalElement",
                    query: {
                      ecsql: `
                      SELECT ${await createSelectClause({
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
          provider: createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition }),
          expect: [
            NodeValidators.createForGenericNode({
              key: "physical-elements",
              label: "Physical elements",
              children: [
                NodeValidators.createForInstanceNode({ label: "A" }),
                NodeValidators.createForInstanceNode({ label: "B" }),
              ],
            }),
          ],
        });
      });

      it("excludes instances of hidden classes from nodes and `hasChildren` selector", async () => {
        const { imodelConnection: hiddenClassesIModel, ...keys } = await buildTestIModel(async (imodel, testName) => {
          const schema = await importSchema(
            testName,
            imodel,
            `
              <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
              <ECEntityClass typeName="HiddenElement">
                <BaseClass>bis:PhysicalElement</BaseClass>
                <ECCustomAttributes>
                  <HiddenClass xmlns="CoreCustomAttributes.01.00.01" />
                </ECCustomAttributes>
              </ECEntityClass>
            `,
          );
          return withEditTxn(imodel, (txn) => {
            const model = insertPhysicalModelWithPartition({ txn, codeValue: "model" });
            const category = insertSpatialCategory({ txn, codeValue: "category" });
            const elementProps = { txn, modelId: model.id, categoryId: category.id };
            insertPhysicalElement({
              ...elementProps,
              classFullName: schema.items.HiddenElement.fullName,
              userLabel: "hidden root",
            });
            const withHiddenChild = insertPhysicalElement({ ...elementProps, userLabel: "with hidden child" });
            insertPhysicalElement({
              ...elementProps,
              classFullName: schema.items.HiddenElement.fullName,
              userLabel: "hidden child",
              parentId: withHiddenChild.id,
            });
            const withVisibleChild = insertPhysicalElement({ ...elementProps, userLabel: "with visible child" });
            const visibleChild = insertPhysicalElement({
              ...elementProps,
              userLabel: "visible child",
              parentId: withVisibleChild.id,
            });
            return { withHiddenChild, withVisibleChild, visibleChild };
          });
        });

        const imodelAccess = createIModelAccess(hiddenClassesIModel);
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.HierarchyDefinitions.HiddenClasses
        const hierarchyDefinition: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            const parentIds =
              parentNode && HierarchyNode.isInstancesNode(parentNode)
                ? parentNode.key.instanceKeys.map(({ id }) => id)
                : undefined;
            // Create a filter that excludes instances of `BisCore.PhysicalElement` sub-classes, hidden through
            // `HiddenClass` or `HiddenSchema` custom attributes. The tree of hidden classes is requested once and the
            // filter can be used to create clauses for multiple aliases.
            const hiddenClassesFilter = await ECSql.createHiddenClassesFilter({
              schemaProvider: imodelAccess,
              baseClassName: "BisCore.PhysicalElement",
            });
            const hiddenClassesClause = hiddenClassesFilter.createWhereClause("this");
            // The `hasChildren` selector has to exclude the same children as the child hierarchy level query does
            const childHiddenClassesClause = hiddenClassesFilter.createWhereClause("child");
            return [
              {
                fullClassName: "BisCore.PhysicalElement",
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: "this.ECClassId" },
                      ecInstanceId: { selector: "this.ECInstanceId" },
                      nodeLabel: { selector: "this.UserLabel" },
                      hasChildren: {
                        selector: `IFNULL((
                          SELECT 1
                          FROM BisCore.PhysicalElement child
                          WHERE child.Parent.Id = this.ECInstanceId ${childHiddenClassesClause ? `AND ${childHiddenClassesClause}` : ""}
                          LIMIT 1
                        ), 0)`,
                      },
                    })}
                    FROM BisCore.PhysicalElement this
                    WHERE ${parentIds ? "InVirtualSet(?, this.Parent.Id)" : "this.Parent.Id IS NULL"}
                      ${hiddenClassesClause ? `AND ${hiddenClassesClause}` : ""}
                  `,
                  bindings: parentIds ? [{ type: "idset", value: parentIds }] : [],
                },
              },
            ];
          },
        };
        // __PUBLISH_EXTRACT_END__

        await validateHierarchy({
          provider: createIModelHierarchyProvider({
            imodelAccess: createIModelAccess(hiddenClassesIModel),
            hierarchyDefinition,
          }),
          expect: [
            NodeValidators.createForInstanceNode({ instanceKeys: [keys.withHiddenChild], children: false }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.withVisibleChild],
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.visibleChild], children: false })],
            }),
          ],
        });
      });
    });
  });
});
