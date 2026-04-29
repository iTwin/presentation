/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  collect,
  insertDrawingModelWithPartition,
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertPhysicalPartition,
  insertPhysicalSubModel,
  insertPhysicalType,
  insertRepositoryLink,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { afterAll, describe, it, test } from "vitest";
import { IModel } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.HierarchyProviderImports
import { createIModelHierarchyProvider } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.HierarchyNodeImport
import { HierarchyNode } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.PredicateBasedHierarchyDefinitionImports
import { createPredicateBasedHierarchyDefinition } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.ManualHierarchyDefinitionImports
import { HierarchyDefinition } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.HierarchyNodesDefinitionImports
import {
  DefineHierarchyLevelProps,
  HierarchyLevelDefinition,
  HierarchyNodesDefinition,
  InstancesNodeKey,
} from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
import { buildTestIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { importSchema } from "../../SchemaUtils.js";
import { NodeValidators, validateHierarchy, validateHierarchyLevel } from "../HierarchyValidation.js";
import { createIModelAccess } from "../Utils.js";

describe("Hierarchies", () => {
  describe("Learning snippets", () => {
    describe("Migration from Presentation Rules", () => {
      let emptyIModel: IModelConnection;

      test.beforeAll(async (_, suite) => {
        await initialize();
        emptyIModel = (await buildTestIModel(suite.fullTestName!)).imodelConnection;
      });

      afterAll(async () => {
        await terminate();
      });

      describe("Basic concepts", () => {
        it("creates a hierarchy provider", async () => {
          const imodel = emptyIModel;
          const imodelAccess = createIModelAccess(imodel);
          const hierarchyDefinition = createPredicateBasedHierarchyDefinition({
            classHierarchyInspector: imodelAccess,
            hierarchy: { rootNodes: async () => [{ node: { key: "test", label: "Root node" } }], childNodes: [] },
          });
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.HierarchyProviderUsage
          const provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition });
          for await (const node of provider.getNodes({ parentNode: undefined })) {
            // do something with the node
          }
          // __PUBLISH_EXTRACT_END__
          await validateHierarchy({
            provider,
            expect: [NodeValidators.createForGenericNode({ key: "test", label: "Root node" })],
          });
        });
      });

      describe("Migrating hierarchy rules", () => {
        it("creates predicate based hierarchy definition", async () => {
          const imodelAccess = createIModelAccess(emptyIModel);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.PredicateBasedHierarchyDefinitionUsage
          const hierarchyDefinition = createPredicateBasedHierarchyDefinition({
            classHierarchyInspector: imodelAccess,
            hierarchy: {
              rootNodes: async () => [
                /* define root node specifications here */
              ],
              childNodes: [
                {
                  parentGenericNodePredicate: async (parentKey) => parentKey.id === "MyCustomParentNodeKey",
                  definitions: async () => [
                    /* definitions for "MyCustomParentNode" parent node's children go here */
                  ],
                },
                {
                  parentInstancesNodePredicate: async () => true,
                  definitions: async () => [
                    /* definitions for all instances' parent nodes children go here */
                  ],
                },
                {
                  parentInstancesNodePredicate: "BisCore.Model",
                  definitions: async () => [
                    /* definitions for `BisCore.Model` parent node's children go here */
                  ],
                },
              ],
            },
          });
          // __PUBLISH_EXTRACT_END__
        });

        it("creates manual hierarchy definition", async () => {
          const imodelAccess = createIModelAccess(emptyIModel);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.ManuallyCreatingHierarchyDefinition
          const hierarchyDefinition: HierarchyDefinition = {
            defineHierarchyLevel: async ({ parentNode }) => {
              if (!parentNode) {
                return [
                  /* define root node specifications here */
                ];
              }
              if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "MyCustomParentNodeKey") {
                return [
                  /* definitions for "MyCustomParentNode" parent node's children go here */
                ];
              }
              if (HierarchyNode.isInstancesNode(parentNode)) {
                // depending on whether the hierarchy definition requests node merging, an instances node may have one or more
                // instance keys; here, for simplicity, let's assume all nodes only have one instance key
                if (await imodelAccess.classDerivesFrom(parentNode.key.instanceKeys[0].className, "BisCore.Model")) {
                  return [
                    /* definitions for `BisCore.Model` parent node's children go here */
                  ];
                }
              }
              return [];
            },
          };
          // __PUBLISH_EXTRACT_END__
        });
      });

      describe("Migrating hierarchy specifications", () => {
        it("creates custom node definition", async () => {
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.CustomNodeDefinition
          const definition: HierarchyNodesDefinition = {
            node: {
              key: "MyCustomNode",
              label: "My custom node",
              extendedData: { description: "This is a custom node" },
            },
          };
          // __PUBLISH_EXTRACT_END__
          const provider = createIModelHierarchyProvider({
            imodelAccess: createIModelAccess(emptyIModel),
            hierarchyDefinition: { defineHierarchyLevel: async ({ parentNode }) => (parentNode ? [] : [definition]) },
          });
          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForGenericNode({
                key: "MyCustomNode",
                label: "My custom node",
                extendedData: { description: "This is a custom node" },
              }),
            ],
          });
        });

        it("creates instance nodes of specific classes definition", async () => {
          const { imodelConnection } = await buildTestIModel(async (imodel) => {
            insertPhysicalModelWithPartition({ imodel, codeValue: "Non-private physical model" });
            insertPhysicalSubModel({
              imodel,
              modeledElementId: insertPhysicalPartition({
                imodel,
                codeValue: "Private physical model",
                parentId: IModel.rootSubjectId,
              }).id,
              isPrivate: true,
            });
            insertDrawingModelWithPartition({ imodel, codeValue: "Drawing model" });
          });
          const imodelAccess = createIModelAccess(imodelConnection);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.InstanceNodesOfSpecificClassesDefinition
          const hierarchyDefinition: HierarchyDefinition = {
            defineHierarchyLevel: async ({ parentNode, createSelectClause }) => {
              if (parentNode) {
                return [];
              }
              return [
                {
                  fullClassName: "BisCore.GeometricModel",
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: "this.ECClassId" },
                        ecInstanceId: { selector: "this.ECInstanceId" },
                        nodeLabel: { of: { className: "BisCore.GeometricModel", classAlias: "this" } },
                        hasChildren: true,
                        grouping: {
                          byClass: true,
                          byLabel: { action: "group", hideIfNoSiblings: true, hideIfOneGroupedNode: true },
                        },
                      })}
                      FROM BisCore.GeometricModel [this]
                      INNER JOIN BisCore.InformationPartitionElement [partition] ON [partition].[ECInstanceId] = [this].[ModeledElement].[Id]
                      WHERE NOT [this].[IsPrivate] AND [this].[ECClassId] IS NOT (BisCore.GeometricModel2d)
                    `,
                  },
                },
              ];
            },
          };
          // __PUBLISH_EXTRACT_END__
          const provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForClassGroupingNode({
                className: "BisCore.PhysicalModel",
                children: [NodeValidators.createForInstanceNode({ label: "Non-private physical model" })],
              }),
            ],
          });
        });

        it("creates related instance nodes definition", async () => {
          const { imodelConnection } = await buildTestIModel(async (imodel) => {
            const model = insertPhysicalModelWithPartition({ imodel, codeValue: "Physical model" });
            const category = insertSpatialCategory({ imodel, codeValue: "Spatial category" });
            const type = insertPhysicalType({ imodel, codeValue: "Physical type" });
            insertPhysicalElement({
              imodel,
              modelId: model.id,
              categoryId: category.id,
              typeDefinitionId: type.id,
              codeValue: "Physical element",
            });
          });
          const imodelAccess = createIModelAccess(imodelConnection);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.RelatedInstanceNodesDefinition
          const createChildDefinition = async ({
            parentNode,
            createSelectClause,
          }: Pick<DefineHierarchyLevelProps, "createSelectClause"> & {
            parentNode: HierarchyNode & { key: InstancesNodeKey };
          }): Promise<HierarchyNodesDefinition> => ({
            fullClassName: "BisCore.GeometricElement3d",
            query: {
              ecsql: `
                SELECT ${await createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { of: { className: "BisCore.GeometricElement3d", classAlias: "this" } },
                })}
                FROM BisCore.GeometricElement3d [this]
                INNER JOIN BisCore.SpatialCategory [category] ON [category].[ECInstanceId] = [this].[Category].[Id]
                WHERE
                  [this].[Model].[Id] IN (${parentNode.key.instanceKeys.map(() => "?").join(",")})
                  AND [this].[TypeDefinition] IS NOT NULL
                  AND NOT [category].[IsPrivate]
              `,
              bindings: parentNode.key.instanceKeys.map((key) => ({ type: "id", value: key.id })),
            },
          });
          // __PUBLISH_EXTRACT_END__
          const provider = createIModelHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode, createSelectClause }) => {
                if (parentNode && HierarchyNode.isInstancesNode(parentNode)) {
                  return [await createChildDefinition({ parentNode, createSelectClause })];
                }
                return [
                  {
                    fullClassName: "BisCore.PhysicalModel",
                    query: {
                      ecsql: `
                        SELECT ${await createSelectClause({
                          ecClassId: { selector: "this.ECClassId" },
                          ecInstanceId: { selector: "this.ECInstanceId" },
                          nodeLabel: { of: { className: "BisCore.PhysicalModel", classAlias: "this" } },
                        })}
                        FROM BisCore.PhysicalModel [this]
                      `,
                    },
                  },
                ];
              },
            },
          });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForInstanceNode({
                label: "Physical model",
                children: [NodeValidators.createForInstanceNode({ label: "Physical element" })],
              }),
            ],
          });
        });

        it("creates custom query instance nodes definition", async () => {
          const { imodelConnection, schema } = await buildTestIModel(async (imodel, testName) => {
            const importedSchema = await importSchema(
              testName,
              imodel,
              `
                <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
                <ECEntityClass typeName="MyParentElement">
                  <BaseClass>bis:PhysicalElement</BaseClass>
                  <ECProperty propertyName="ChildrenQuery" typeName="string" />
                </ECEntityClass>
                <ECEntityClass typeName="MyChildElement">
                  <BaseClass>bis:PhysicalElement</BaseClass>
                </ECEntityClass>
              `,
            );
            const model = insertPhysicalModelWithPartition({ imodel, codeValue: "Physical model" });
            const category = insertSpatialCategory({ imodel, codeValue: "Spatial category" });
            insertPhysicalElement({
              imodel,
              classFullName: importedSchema.items.MyParentElement.fullName,
              modelId: model.id,
              categoryId: category.id,
              codeValue: "Parent physical element",
              ["ChildrenQuery"]: `SELECT ECClassId, ECInstanceId FROM ${importedSchema.items.MyChildElement.fullName}`,
            });
            insertPhysicalElement({
              imodel,
              classFullName: importedSchema.items.MyChildElement.fullName,
              modelId: model.id,
              categoryId: category.id,
              codeValue: "Child physical element",
            });
            return { schema: importedSchema };
          });
          const imodelAccess = createIModelAccess(imodelConnection);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.CustomQueryInstanceNodesDefinition
          const createDefinition = async ({
            parentNode,
            createSelectClause,
          }: Pick<DefineHierarchyLevelProps, "createSelectClause"> & {
            parentNode: HierarchyNode & { key: InstancesNodeKey };
          }): Promise<HierarchyLevelDefinition> => {
            if (
              await imodelAccess.classDerivesFrom(
                parentNode.key.instanceKeys[0].className,
                `${schema.schemaName}.MyParentElement`,
              )
            ) {
              // load the query from the MyParentElement instance
              async function loadChildrenQuery() {
                for await (const row of imodelAccess.createQueryReader({
                  ecsql: `SELECT ChildrenQuery FROM ${schema.schemaName}.MyParentElement WHERE ECInstanceId = ?`,
                  bindings: [{ type: "id", value: parentNode.key.instanceKeys[0].id }],
                })) {
                  return row.ChildrenQuery as string;
                }
                return undefined;
              }
              const childrenQuery = await loadChildrenQuery();
              // if the parent instance has the query - return a definition for the children, otherwise - return an empty definitions list
              return childrenQuery
                ? [
                    {
                      fullClassName: `${schema.schemaName}.MyChildElement`,
                      query: {
                        ecsql: `
                          SELECT ${await createSelectClause({
                            ecClassId: { selector: "this.ECClassId" },
                            ecInstanceId: { selector: "this.ECInstanceId" },
                            nodeLabel: { of: { className: `${schema.schemaName}.MyChildElement`, classAlias: "this" } },
                          })}
                          FROM ${schema.schemaName}.MyChildElement this
                          WHERE this.ECInstanceId IN (
                            SELECT ECInstanceId FROM (${childrenQuery})
                          )
                        `,
                      },
                    },
                  ]
                : [];
            }
            return [];
          };
          // __PUBLISH_EXTRACT_END__
          const provider = createIModelHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode, createSelectClause }) => {
                if (parentNode && HierarchyNode.isInstancesNode(parentNode)) {
                  return createDefinition({ parentNode, createSelectClause });
                }
                return [
                  {
                    fullClassName: schema.items.MyParentElement.fullName,
                    query: {
                      ecsql: `
                        SELECT ${await createSelectClause({
                          ecClassId: { selector: "this.ECClassId" },
                          ecInstanceId: { selector: "this.ECInstanceId" },
                          nodeLabel: { of: { className: schema.items.MyParentElement.fullName, classAlias: "this" } },
                        })}
                        FROM ${schema.items.MyParentElement.fullName} [this]
                      `,
                    },
                  },
                ];
              },
            },
          });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForInstanceNode({
                label: "Parent physical element",
                children: [NodeValidators.createForInstanceNode({ label: "Child physical element" })],
              }),
            ],
          });
        });
      });

      describe("Migrating grouping specifications", () => {
        it("groups by base class", async () => {
          const { imodelConnection } = await buildTestIModel(async (imodel) => {
            const model = insertPhysicalModelWithPartition({ imodel, codeValue: "Physical model" });
            const category = insertSpatialCategory({ imodel, codeValue: "Spatial category" });
            insertPhysicalElement({
              imodel,
              modelId: model.id,
              categoryId: category.id,
              codeValue: "Physical element",
            });
          });
          const imodelAccess = createIModelAccess(imodelConnection);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.BaseClassGrouping
          const hierarchyDefinition: HierarchyDefinition = {
            defineHierarchyLevel: async ({ parentNode, createSelectClause }) => {
              if (parentNode) {
                return [];
              }
              return [
                {
                  fullClassName: "BisCore.GeometricElement",
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: "this.ECClassId" },
                        ecInstanceId: { selector: "this.ECInstanceId" },
                        nodeLabel: { of: { className: "BisCore.GeometricElement", classAlias: "this" } },
                        grouping: {
                          byBaseClasses: { fullClassNames: ["BisCore.GeometricElement3d", "BisCore.PhysicalElement"] },
                        },
                      })}
                      FROM BisCore.GeometricElement [this]
                    `,
                  },
                },
              ];
            },
          };
          // __PUBLISH_EXTRACT_END__
          const provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForClassGroupingNode({
                className: "BisCore.GeometricElement3d",
                children: [
                  NodeValidators.createForClassGroupingNode({
                    className: "BisCore.PhysicalElement",
                    children: [NodeValidators.createForInstanceNode({ label: "Physical element" })],
                  }),
                ],
              }),
            ],
          });
        });

        it("groups by class", async () => {
          const imodelAccess = createIModelAccess(emptyIModel);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.ClassGrouping
          const hierarchyDefinition: HierarchyDefinition = {
            defineHierarchyLevel: async ({ parentNode, createSelectClause }) => {
              if (parentNode) {
                return [];
              }
              return [
                {
                  fullClassName: "BisCore.Element",
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: "this.ECClassId" },
                        ecInstanceId: { selector: "this.ECInstanceId" },
                        nodeLabel: { of: { className: "BisCore.Element", classAlias: "this" } },
                        grouping: { byClass: true },
                      })}
                      FROM BisCore.Element [this]
                    `,
                  },
                },
              ];
            },
          };
          // __PUBLISH_EXTRACT_END__
          const provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForClassGroupingNode({
                className: "BisCore.DefinitionPartition",
                children: [NodeValidators.createForInstanceNode({ label: "BisCore.DictionaryModel" })],
              }),
              NodeValidators.createForClassGroupingNode({
                className: "BisCore.LinkPartition",
                children: [NodeValidators.createForInstanceNode({ label: "BisCore.RealityDataSources" })],
              }),
              NodeValidators.createForClassGroupingNode({
                className: "BisCore.Subject",
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
                  }),
                ],
              }),
            ],
          });
        });

        it("groups by properties", async () => {
          const { imodelConnection } = await buildTestIModel(async (imodel) => {
            const model = insertPhysicalModelWithPartition({ imodel, codeValue: "Physical model" });
            const category = insertSpatialCategory({ imodel, codeValue: "Spatial category" });
            insertPhysicalElement({
              imodel,
              modelId: model.id,
              categoryId: category.id,
              codeValue: "Physical element",
              placement: { origin: { x: 0, y: 0, z: 0 }, angles: { yaw: 180 } },
            });
          });
          const imodelAccess = createIModelAccess(imodelConnection);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.PropertyGrouping
          const hierarchyDefinition: HierarchyDefinition = {
            defineHierarchyLevel: async ({ parentNode, createSelectClause }) => {
              if (parentNode) {
                return [];
              }
              return [
                {
                  fullClassName: "BisCore.GeometricElement3d",
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: "this.ECClassId" },
                        ecInstanceId: { selector: "this.ECInstanceId" },
                        nodeLabel: { of: { className: "BisCore.GeometricElement3d", classAlias: "this" } },
                        grouping: {
                          byProperties: {
                            propertiesClassName: "BisCore.GeometricElement3d",
                            createGroupForOutOfRangeValues: true,
                            createGroupForUnspecifiedValues: true,
                            propertyGroups: [
                              {
                                propertyClassAlias: "this",
                                propertyName: "Yaw",
                                ranges: [
                                  { fromValue: 0, toValue: 0, rangeLabel: "Zero" },
                                  { fromValue: -360, toValue: 0, rangeLabel: "Negative" },
                                  { fromValue: 0, toValue: 360, rangeLabel: "Positive" },
                                ],
                              },
                            ],
                          },
                        },
                      })}
                      FROM BisCore.GeometricElement3d [this]
                    `,
                  },
                },
              ];
            },
          };
          // __PUBLISH_EXTRACT_END__
          const provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForPropertyValueRangeGroupingNode({
                label: "Positive",
                propertyName: "Yaw",
                fromValue: 0,
                toValue: 360,
                children: [NodeValidators.createForInstanceNode({ label: "Physical element" })],
              }),
            ],
          });
        });

        it("groups by label", async () => {
          const { imodelConnection } = await buildTestIModel(async (imodel) => {
            insertRepositoryLink({ imodel, repositoryLabel: "Test repository link" });
            insertRepositoryLink({ imodel, repositoryLabel: "Test repository link" });
          });
          const imodelAccess = createIModelAccess(imodelConnection);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.LabelGrouping
          const hierarchyDefinition: HierarchyDefinition = {
            defineHierarchyLevel: async ({ parentNode, createSelectClause }) => {
              if (parentNode) {
                return [];
              }
              return [
                {
                  fullClassName: "BisCore.Element",
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: "this.ECClassId" },
                        ecInstanceId: { selector: "this.ECInstanceId" },
                        nodeLabel: { of: { className: "BisCore.Element", classAlias: "this" } },
                        grouping: { byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true } },
                      })}
                      FROM BisCore.Element [this]
                    `,
                  },
                },
              ];
            },
          };
          // __PUBLISH_EXTRACT_END__
          const provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForInstanceNode({ label: "BisCore.DictionaryModel" }),
              NodeValidators.createForInstanceNode({ label: "BisCore.RealityDataSources" }),
              NodeValidators.createForInstanceNode({
                label: imodelConnection.name,
                instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
              }),
              NodeValidators.createForLabelGroupingNode({
                label: "Test repository link",
                children: [
                  NodeValidators.createForInstanceNode({ label: "Test repository link" }),
                  NodeValidators.createForInstanceNode({ label: "Test repository link" }),
                ],
              }),
            ],
          });
        });

        it("merges by label", async () => {
          const { imodelConnection, repoLinkKeys } = await buildTestIModel(async (imodel) => {
            return {
              repoLinkKeys: [
                insertRepositoryLink({ imodel, repositoryLabel: "Test repository link" }),
                insertRepositoryLink({ imodel, repositoryLabel: "Test repository link" }),
              ],
            };
          });
          const imodelAccess = createIModelAccess(imodelConnection);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.SameLabelGrouping
          const hierarchyDefinition: HierarchyDefinition = {
            defineHierarchyLevel: async ({ parentNode, createSelectClause }) => {
              if (parentNode) {
                return [];
              }
              return [
                {
                  fullClassName: "BisCore.Element",
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: "this.ECClassId" },
                        ecInstanceId: { selector: "this.ECInstanceId" },
                        nodeLabel: { of: { className: "BisCore.Element", classAlias: "this" } },
                        grouping: { byLabel: { action: "merge" } },
                      })}
                      FROM BisCore.Element [this]
                    `,
                  },
                },
              ];
            },
          };
          // __PUBLISH_EXTRACT_END__
          const provider = createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForInstanceNode({ label: "BisCore.DictionaryModel" }),
              NodeValidators.createForInstanceNode({ label: "BisCore.RealityDataSources" }),
              NodeValidators.createForInstanceNode({
                label: imodelConnection.name,
                instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
              }),
              NodeValidators.createForInstanceNode({ label: "Test repository link", instanceKeys: repoLinkKeys }),
            ],
          });
        });
      });
    });
  });
});
