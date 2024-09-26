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
import { IModel } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.HierarchyProviderImports
import { createHierarchyProvider } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.HierarchyNodeImport
import { HierarchyNode } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.ClassBasedHierarchyDefinitionImports
import { createClassBasedHierarchyDefinition } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.ManualHierarchyDefinitionImports
import { HierarchyDefinition } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.HierarchyNodesDefinitionImports
import { createNodesQueryClauseFactory, HierarchyLevelDefinition, HierarchyNodesDefinition, InstancesNodeKey } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__
import { buildIModel, importSchema } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchy, validateHierarchyLevel } from "../HierarchyValidation";
import { createIModelAccess } from "../Utils";

describe("Hierarchies", () => {
  describe("Learning snippets", () => {
    describe("Migration from Presentation Rules", () => {
      let emptyIModel: IModelConnection;

      before(async function () {
        await initialize();
        emptyIModel = (await buildIModel(this)).imodel;
      });

      after(async () => {
        await terminate();
      });

      describe("Basic concepts", () => {
        it("creates a hierarchy provider", async function () {
          const imodel = emptyIModel;
          const imodelAccess = createIModelAccess(imodel);
          const hierarchyDefinition = createClassBasedHierarchyDefinition({
            classHierarchyInspector: imodelAccess,
            hierarchy: {
              rootNodes: async () => [{ node: { key: "test", label: "Root node" } }],
              childNodes: [],
            },
          });
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.HierarchyProviderUsage
          const provider = createHierarchyProvider({ imodelAccess, hierarchyDefinition });
          for await (const node of provider.getNodes({ parentNode: undefined })) {
            // do something with the node
          }
          // __PUBLISH_EXTRACT_END__
          await validateHierarchy({
            provider,
            expect: [NodeValidators.createForCustomNode({ key: "test", label: "Root node" })],
          });
        });
      });

      describe("Migrating hierarchy rules", () => {
        it("creates class based hierarchy definition", async function () {
          const imodelAccess = createIModelAccess(emptyIModel);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.ClassBasedHierarchyDefinitionUsage
          const hierarchyDefinition = createClassBasedHierarchyDefinition({
            classHierarchyInspector: imodelAccess,
            hierarchy: {
              rootNodes: async () => [
                /* define root node specifications here */
              ],
              childNodes: [
                {
                  customParentNodeKey: "MyCustomParentNodeKey",
                  definitions: async () => [
                    /* definitions for "MyCustomParentNode" parent node's children go here */
                  ],
                },
                {
                  parentNodeClassName: "BisCore.Model",
                  definitions: async () => [
                    /* definitions for `BisCore.Model` parent node's children go here */
                  ],
                },
              ],
            },
          });
          // __PUBLISH_EXTRACT_END__
        });

        it("creates manual hierarchy definition", async function () {
          const imodelAccess = createIModelAccess(emptyIModel);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.ManuallyCreatingHierarchyDefinition
          const hierarchyDefinition: HierarchyDefinition = {
            defineHierarchyLevel: async ({ parentNode }) => {
              if (!parentNode) {
                return [
                  /* define root node specifications here */
                ];
              }
              if (parentNode.key === "MyCustomParentNodeKey") {
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
              extendedData: {
                description: "This is a custom node",
              },
            },
          };
          // __PUBLISH_EXTRACT_END__
          const provider = createHierarchyProvider({
            imodelAccess: createIModelAccess(emptyIModel),
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) => (parentNode ? [] : [definition]),
            },
          });
          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForCustomNode({
                key: "MyCustomNode",
                label: "My custom node",
                extendedData: {
                  description: "This is a custom node",
                },
              }),
            ],
          });
        });

        it("creates instance nodes of specific classes definition", async function () {
          const { imodel } = await buildIModel(this, async (builder) => {
            insertPhysicalModelWithPartition({ builder, codeValue: "Non-private physical model" });
            insertPhysicalSubModel({
              builder,
              modeledElementId: insertPhysicalPartition({ builder, codeValue: "Private physical model", parentId: IModel.rootSubjectId }).id,
              isPrivate: true,
            });
            insertDrawingModelWithPartition({ builder, codeValue: "Drawing model" });
          });
          const imodelAccess = createIModelAccess(imodel);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.InstanceNodesOfSpecificClassesDefinition
          const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
          const selectClauseFactory = createNodesQueryClauseFactory({
            imodelAccess,
            instanceLabelSelectClauseFactory: labelsFactory,
          });
          const definition: HierarchyNodesDefinition = {
            fullClassName: "BisCore.GeometricModel",
            query: {
              ecsql: `
                SELECT ${await selectClauseFactory.createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: await labelsFactory.createSelectClause({ className: "BisCore.GeometricModel", classAlias: "this" }) },
                  hasChildren: true,
                  grouping: {
                    byClass: true,
                    byLabel: {
                      action: "group",
                      hideIfNoSiblings: true,
                      hideIfOneGroupedNode: true,
                    },
                  },
                })}
                FROM BisCore.GeometricModel [this]
                INNER JOIN BisCore.InformationPartitionElement [partition] ON [partition].[ECInstanceId] = [this].[ModeledElement].[Id]
                WHERE NOT [this].[IsPrivate] AND [this].[ECClassId] IS NOT (BisCore.GeometricModel2d)
              `,
            },
          };
          // __PUBLISH_EXTRACT_END__
          const provider = createHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) => (parentNode ? [] : [definition]),
            },
          });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForClassGroupingNode({
                className: "BisCore.PhysicalModel",
                children: [
                  NodeValidators.createForInstanceNode({
                    label: "Non-private physical model",
                  }),
                ],
              }),
            ],
          });
        });

        it("creates related instance nodes definition", async function () {
          const { imodel } = await buildIModel(this, async (builder) => {
            const model = insertPhysicalModelWithPartition({ builder, codeValue: "Physical model" });
            const category = insertSpatialCategory({ builder, codeValue: "Spatial category" });
            const type = insertPhysicalType({ builder, codeValue: "Physical type" });
            insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, typeDefinitionId: type.id, codeValue: "Physical element" });
          });
          const imodelAccess = createIModelAccess(imodel);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.RelatedInstanceNodesDefinition
          const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
          const selectClauseFactory = createNodesQueryClauseFactory({
            imodelAccess,
            instanceLabelSelectClauseFactory: labelsFactory,
          });
          const createDefinition = async ({ parentNode }: { parentNode: HierarchyNode & { key: InstancesNodeKey } }): Promise<HierarchyNodesDefinition> => ({
            fullClassName: "BisCore.GeometricElement3d",
            query: {
              ecsql: `
                SELECT ${await selectClauseFactory.createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: await labelsFactory.createSelectClause({ className: "BisCore.GeometricElement3d", classAlias: "this" }) },
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
          const rootLevelDefinition: HierarchyNodesDefinition = {
            fullClassName: "BisCore.PhysicalModel",
            query: {
              ecsql: `
                SELECT ${await selectClauseFactory.createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: await labelsFactory.createSelectClause({ className: "BisCore.PhysicalModel", classAlias: "this" }) },
                })}
                FROM BisCore.PhysicalModel [this]
              `,
            },
          };
          const provider = createHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) =>
                parentNode && HierarchyNode.isInstancesNode(parentNode) ? [await createDefinition({ parentNode })] : [rootLevelDefinition],
            },
          });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForInstanceNode({
                label: "Physical model",
                children: [
                  NodeValidators.createForInstanceNode({
                    label: "Physical element",
                  }),
                ],
              }),
            ],
          });
        });

        it("creates custom query instance nodes definition", async function () {
          const { imodel, schema } = await buildIModel(this, async (builder) => {
            const importedSchema = await importSchema(
              this,
              builder,
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
            const model = insertPhysicalModelWithPartition({ builder, codeValue: "Physical model" });
            const category = insertSpatialCategory({ builder, codeValue: "Spatial category" });
            insertPhysicalElement({
              builder,
              classFullName: importedSchema.items.MyParentElement.fullName,
              modelId: model.id,
              categoryId: category.id,
              codeValue: "Parent physical element",
              ["ChildrenQuery"]: `SELECT ECClassId, ECInstanceId FROM ${importedSchema.items.MyChildElement.fullName}`,
            });
            insertPhysicalElement({
              builder,
              classFullName: importedSchema.items.MyChildElement.fullName,
              modelId: model.id,
              categoryId: category.id,
              codeValue: "Child physical element",
            });
            return { schema: importedSchema };
          });
          const imodelAccess = createIModelAccess(imodel);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.CustomQueryInstanceNodesDefinition
          const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
          const selectClauseFactory = createNodesQueryClauseFactory({
            imodelAccess,
            instanceLabelSelectClauseFactory: labelsFactory,
          });
          const createDefinition = async ({ parentNode }: { parentNode: HierarchyNode & { key: InstancesNodeKey } }): Promise<HierarchyLevelDefinition> => {
            if (await imodelAccess.classDerivesFrom(parentNode.key.instanceKeys[0].className, `${schema.schemaName}.MyParentElement`)) {
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
                          SELECT ${await selectClauseFactory.createSelectClause({
                            ecClassId: { selector: "this.ECClassId" },
                            ecInstanceId: { selector: "this.ECInstanceId" },
                            nodeLabel: {
                              selector: await labelsFactory.createSelectClause({ className: `${schema.schemaName}.MyChildElement`, classAlias: "this" }),
                            },
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
          const rootLevelDefinition: HierarchyLevelDefinition = [
            {
              fullClassName: schema.items.MyParentElement.fullName,
              query: {
                ecsql: `
                SELECT ${await selectClauseFactory.createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: await labelsFactory.createSelectClause({ className: schema.items.MyParentElement.fullName, classAlias: "this" }) },
                })}
                FROM ${schema.items.MyParentElement.fullName} [this]
              `,
              },
            },
          ];
          const provider = createHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) =>
                parentNode && HierarchyNode.isInstancesNode(parentNode) ? createDefinition({ parentNode }) : rootLevelDefinition,
            },
          });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForInstanceNode({
                label: "Parent physical element",
                children: [
                  NodeValidators.createForInstanceNode({
                    label: "Child physical element",
                  }),
                ],
              }),
            ],
          });
        });
      });

      describe("Migrating grouping specifications", () => {
        it("groups by base class", async function () {
          const { imodel } = await buildIModel(this, async (builder) => {
            const model = insertPhysicalModelWithPartition({ builder, codeValue: "Physical model" });
            const category = insertSpatialCategory({ builder, codeValue: "Spatial category" });
            insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, codeValue: "Physical element" });
          });
          const imodelAccess = createIModelAccess(imodel);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.BaseClassGrouping
          const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
          const selectClauseFactory = createNodesQueryClauseFactory({
            imodelAccess,
            instanceLabelSelectClauseFactory: labelsFactory,
          });
          const definition: HierarchyNodesDefinition = {
            fullClassName: "BisCore.GeometricElement",
            query: {
              ecsql: `
                SELECT ${await selectClauseFactory.createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: await labelsFactory.createSelectClause({ className: "BisCore.GeometricElement", classAlias: "this" }) },
                  grouping: {
                    byBaseClasses: {
                      fullClassNames: ["BisCore.GeometricElement3d", "BisCore.PhysicalElement"],
                    },
                  },
                })}
                FROM BisCore.GeometricElement [this]
              `,
            },
          };
          // __PUBLISH_EXTRACT_END__
          const provider = createHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) => (parentNode ? [] : [definition]),
            },
          });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForClassGroupingNode({
                className: "BisCore.GeometricElement3d",
                children: [
                  NodeValidators.createForClassGroupingNode({
                    className: "BisCore.PhysicalElement",
                    children: [
                      NodeValidators.createForInstanceNode({
                        label: "Physical element",
                      }),
                    ],
                  }),
                ],
              }),
            ],
          });
        });

        it("groups by class", async function () {
          const imodelAccess = createIModelAccess(emptyIModel);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.ClassGrouping
          const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
          const selectClauseFactory = createNodesQueryClauseFactory({
            imodelAccess,
            instanceLabelSelectClauseFactory: labelsFactory,
          });
          const definition: HierarchyNodesDefinition = {
            fullClassName: "BisCore.Element",
            query: {
              ecsql: `
                SELECT ${await selectClauseFactory.createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: await labelsFactory.createSelectClause({ className: "BisCore.Element", classAlias: "this" }) },
                  grouping: {
                    byClass: true,
                  },
                })}
                FROM BisCore.Element [this]
              `,
            },
          };
          // __PUBLISH_EXTRACT_END__
          const provider = createHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) => (parentNode ? [] : [definition]),
            },
          });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForClassGroupingNode({
                className: "BisCore.DefinitionPartition",
                children: [
                  NodeValidators.createForInstanceNode({
                    label: "BisCore.DictionaryModel",
                  }),
                ],
              }),
              NodeValidators.createForClassGroupingNode({
                className: "BisCore.LinkPartition",
                children: [
                  NodeValidators.createForInstanceNode({
                    label: "BisCore.RealityDataSources",
                  }),
                ],
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

        it("groups by properties", async function () {
          const { imodel } = await buildIModel(this, async (builder) => {
            const model = insertPhysicalModelWithPartition({ builder, codeValue: "Physical model" });
            const category = insertSpatialCategory({ builder, codeValue: "Spatial category" });
            insertPhysicalElement({
              builder,
              modelId: model.id,
              categoryId: category.id,
              codeValue: "Physical element",
              placement: {
                origin: { x: 0, y: 0, z: 0 },
                angles: { yaw: 180 },
              },
            });
          });
          const imodelAccess = createIModelAccess(imodel);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.PropertyGrouping
          const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
          const selectClauseFactory = createNodesQueryClauseFactory({
            imodelAccess,
            instanceLabelSelectClauseFactory: labelsFactory,
          });
          const definition: HierarchyNodesDefinition = {
            fullClassName: "BisCore.GeometricElement3d",
            query: {
              ecsql: `
                SELECT ${await selectClauseFactory.createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: await labelsFactory.createSelectClause({ className: "BisCore.GeometricElement3d", classAlias: "this" }) },
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
          };
          // __PUBLISH_EXTRACT_END__
          const provider = createHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) => (parentNode ? [] : [definition]),
            },
          });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForPropertyValueRangeGroupingNode({
                label: "Positive",
                propertyName: "Yaw",
                fromValue: 0,
                toValue: 360,
                children: [
                  NodeValidators.createForInstanceNode({
                    label: "Physical element",
                  }),
                ],
              }),
            ],
          });
        });

        it("groups by label", async function () {
          const { imodel } = await buildIModel(this, async (builder) => {
            insertRepositoryLink({ builder, repositoryLabel: "Test repository link" });
            insertRepositoryLink({ builder, repositoryLabel: "Test repository link" });
          });
          const imodelAccess = createIModelAccess(imodel);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.LabelGrouping
          const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
          const selectClauseFactory = createNodesQueryClauseFactory({
            imodelAccess,
            instanceLabelSelectClauseFactory: labelsFactory,
          });
          const definition: HierarchyNodesDefinition = {
            fullClassName: "BisCore.Element",
            query: {
              ecsql: `
                SELECT ${await selectClauseFactory.createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: await labelsFactory.createSelectClause({ className: "BisCore.Element", classAlias: "this" }) },
                  grouping: {
                    byLabel: { hideIfNoSiblings: true, hideIfOneGroupedNode: true },
                  },
                })}
                FROM BisCore.Element [this]
              `,
            },
          };
          // __PUBLISH_EXTRACT_END__
          const provider = createHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) => (parentNode ? [] : [definition]),
            },
          });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForInstanceNode({
                label: "BisCore.DictionaryModel",
              }),
              NodeValidators.createForInstanceNode({
                label: "BisCore.RealityDataSources",
              }),
              NodeValidators.createForInstanceNode({
                label: imodel.name,
                instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
              }),
              NodeValidators.createForLabelGroupingNode({
                label: "Test repository link",
                children: [
                  NodeValidators.createForInstanceNode({
                    label: "Test repository link",
                  }),
                  NodeValidators.createForInstanceNode({
                    label: "Test repository link",
                  }),
                ],
              }),
            ],
          });
        });

        it("merges by label", async function () {
          const { imodel, repoLinkKeys } = await buildIModel(this, async (builder) => {
            return {
              repoLinkKeys: [
                insertRepositoryLink({ builder, repositoryLabel: "Test repository link" }),
                insertRepositoryLink({ builder, repositoryLabel: "Test repository link" }),
              ],
            };
          });
          const imodelAccess = createIModelAccess(imodel);
          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Migration.SameLabelGrouping
          const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
          const selectClauseFactory = createNodesQueryClauseFactory({
            imodelAccess,
            instanceLabelSelectClauseFactory: labelsFactory,
          });
          const definition: HierarchyNodesDefinition = {
            fullClassName: "BisCore.Element",
            query: {
              ecsql: `
                SELECT ${await selectClauseFactory.createSelectClause({
                  ecClassId: { selector: "this.ECClassId" },
                  ecInstanceId: { selector: "this.ECInstanceId" },
                  nodeLabel: { selector: await labelsFactory.createSelectClause({ className: "BisCore.Element", classAlias: "this" }) },
                  grouping: {
                    byLabel: { action: "merge" },
                  },
                })}
                FROM BisCore.Element [this]
              `,
            },
          };
          // __PUBLISH_EXTRACT_END__
          const provider = createHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) => (parentNode ? [] : [definition]),
            },
          });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForInstanceNode({
                label: "BisCore.DictionaryModel",
              }),
              NodeValidators.createForInstanceNode({
                label: "BisCore.RealityDataSources",
              }),
              NodeValidators.createForInstanceNode({
                label: imodel.name,
                instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
              }),
              NodeValidators.createForInstanceNode({
                label: "Test repository link",
                instanceKeys: repoLinkKeys,
              }),
            ],
          });
        });
      });
    });
  });
});
