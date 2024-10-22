/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import {
  insertDrawingCategory,
  insertPhysicalElement,
  insertPhysicalMaterial,
  insertPhysicalModelWithPartition,
  insertRepositoryLink,
  insertSpatialCategory,
} from "presentation-test-utilities";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Grouping.Imports
import { createIModelHierarchyProvider, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__
import { buildIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { createIModelAccess } from "../Utils.js";
import { collectHierarchy } from "./Utils.js";

describe("Hierarchies", () => {
  describe("Learning snippets", () => {
    describe("Grouping", () => {
      before(async () => {
        await initialize();
      });

      after(async () => {
        await terminate();
      });

      describe("By label", () => {
        it("groups by label", async function () {
          const { imodel } = await buildIModel(this, async (builder) => {
            const category = insertSpatialCategory({ builder, codeValue: "Category" });
            const model = insertPhysicalModelWithPartition({ builder, codeValue: "Model" });
            insertPhysicalElement({
              builder,
              modelId: model.id,
              categoryId: category.id,
              userLabel: "Example element",
            });
            insertPhysicalElement({
              builder,
              modelId: model.id,
              categoryId: category.id,
              userLabel: "Example element",
            });
          });
          const imodelAccess = createIModelAccess(imodel);

          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Grouping.LabelGroupingExample
          const hierarchyProvider = createIModelHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) => {
                if (!parentNode) {
                  // The hierarchy definition requests `BisCore.PhysicalElement` nodes to be return as
                  // root nodes and have them grouped by label
                  return [
                    {
                      fullClassName: "BisCore.PhysicalElement",
                      query: {
                        ecsql: `
                          SELECT ${await createNodesQueryClauseFactory({
                            imodelAccess,
                            instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
                          }).createSelectClause({
                            ecClassId: { selector: "this.ECClassId" },
                            ecInstanceId: { selector: "this.ECInstanceId" },
                            nodeLabel: { selector: "this.UserLabel" },
                            grouping: {
                              byLabel: true,
                              // alternatively, could use this:
                              // byLabel: {
                              //   action: "group",
                              //   // could specify extra options here
                              // },
                            },
                          })}
                          FROM BisCore.PhysicalElement this
                        `,
                      },
                    },
                  ];
                }
                return [];
              },
            },
          });

          // The iModel has two elements of `BisCore.PhysicalElement` class, both with the same "Example element" label.
          // As requested by hierarchy definition, the provider returns them grouped under a label grouping node:
          expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
            {
              // the label grouping node
              label: "Example element",
              children: [
                // the two grouped `BisCore.PhysicalElement` instance nodes
                { label: "Example element" },
                { label: "Example element" },
              ],
            },
          ]);
          // __PUBLISH_EXTRACT_END__
        });

        it("merges by label", async function () {
          const { imodel } = await buildIModel(this, async (builder) => {
            const category = insertSpatialCategory({ builder, codeValue: "Category" });
            const model = insertPhysicalModelWithPartition({ builder, codeValue: "Model" });
            const element1 = insertPhysicalElement({
              builder,
              modelId: model.id,
              categoryId: category.id,
              userLabel: "Example element",
            });
            const element2 = insertPhysicalElement({
              builder,
              modelId: model.id,
              categoryId: category.id,
              userLabel: "Example element",
            });
            return { element1, element2 };
          });
          const imodelAccess = createIModelAccess(imodel);

          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Grouping.LabelMergingExample
          const hierarchyProvider = createIModelHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) => {
                if (!parentNode) {
                  // The hierarchy definition requests `BisCore.PhysicalElement` nodes to be returned as root
                  // nodes and have them merged based on label
                  return [
                    {
                      fullClassName: "BisCore.PhysicalElement",
                      query: {
                        ecsql: `
                          SELECT ${await createNodesQueryClauseFactory({
                            imodelAccess,
                            instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
                          }).createSelectClause({
                            ecClassId: { selector: "this.ECClassId" },
                            ecInstanceId: { selector: "this.ECInstanceId" },
                            nodeLabel: { selector: "this.UserLabel" },
                            grouping: {
                              byLabel: {
                                action: "merge",
                              },
                            },
                          })}
                          FROM BisCore.PhysicalElement this
                        `,
                      },
                    },
                  ];
                }
                return [];
              },
            },
          });

          // The iModel has two elements of `BisCore.PhysicalElement` class, both with the same "Example element" label.
          // As requested by hierarchy definition, the provider returns them merged into a single node:
          expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
            {
              // the merged node has "Example element" label and instance keys of both elements in `key.instanceKeys` list
              label: "Example element",
            },
          ]);
          // __PUBLISH_EXTRACT_END__
        });
      });

      describe("By class", () => {
        it("groups by node's class", async function () {
          const { imodel } = await buildIModel(this, async (builder) => {
            const drawingCategory = insertDrawingCategory({ builder, codeValue: "Example drawing category" });
            const spatialCategory = insertSpatialCategory({ builder, codeValue: "Example spatial category" });
            return { spatialCategory, drawingCategory };
          });
          const imodelAccess = createIModelAccess(imodel);

          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Grouping.ClassGroupingExample
          const hierarchyProvider = createIModelHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) => {
                if (!parentNode) {
                  // The hierarchy definition requests `BisCore.Category` nodes to be returned as root nodes and have
                  // them grouped by class.
                  return [
                    {
                      fullClassName: "BisCore.Category",
                      query: {
                        ecsql: `
                          SELECT ${await createNodesQueryClauseFactory({
                            imodelAccess,
                            instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
                          }).createSelectClause({
                            ecClassId: { selector: "this.ECClassId" },
                            ecInstanceId: { selector: "this.ECInstanceId" },
                            nodeLabel: { selector: "this.CodeValue" },
                            grouping: {
                              byClass: true,
                              // alternatively, could use this:
                              // byClass: {
                              //   // could specify extra options here
                              // },
                            },
                          })}
                          FROM BisCore.Category this
                        `,
                      },
                    },
                  ];
                }
                return [];
              },
            },
          });

          // The iModel has two elements of `BisCore.Category` class - one `SpatialCategory` and one `DrawingCategory`.
          // As requested by hierarchy definition, the provider returns them grouped under class grouping nodes:
          expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
            {
              // the `BisCore.DrawingCategory` class grouping node
              label: "Drawing Category",
              children: [
                // the `BisCore.DrawingCategory` instance node
                { label: "Example drawing category" },
              ],
            },
            {
              // the `BisCore.SpatialCategory` class grouping node
              label: "Spatial Category",
              children: [
                // the `BisCore.SpatialCategory` instance node
                { label: "Example spatial category" },
              ],
            },
          ]);
          // __PUBLISH_EXTRACT_END__
        });

        it("groups by base classes", async function () {
          const { imodel } = await buildIModel(this, async (builder) => {
            const drawingCategory = insertDrawingCategory({ builder, codeValue: "Example drawing category" });
            const spatialCategory = insertSpatialCategory({ builder, codeValue: "Example spatial category" });
            return { spatialCategory, drawingCategory };
          });
          const imodelAccess = createIModelAccess(imodel);

          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Grouping.BaseClassGroupingExample
          const hierarchyProvider = createIModelHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) => {
                if (!parentNode) {
                  // The hierarchy definition requests `BisCore.Category` nodes to be grouped by the following classes:
                  // - `BisCore.Element`
                  // - `BisCore.DefinitionElement`
                  return [
                    {
                      fullClassName: "BisCore.Category",
                      query: {
                        ecsql: `
                          SELECT ${await createNodesQueryClauseFactory({
                            imodelAccess,
                            instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
                          }).createSelectClause({
                            ecClassId: { selector: "this.ECClassId" },
                            ecInstanceId: { selector: "this.ECInstanceId" },
                            nodeLabel: { selector: "this.CodeValue" },
                            grouping: {
                              byBaseClasses: {
                                // The order of base classes is not important - the provider orders them from the most
                                // base one to the most derived one
                                fullClassNames: ["BisCore.Element", "BisCore.DefinitionElement"],
                                // could specify extra options here
                              },
                            },
                          })}
                          FROM BisCore.Category this
                        `,
                      },
                    },
                  ];
                }
                return [];
              },
            },
          });

          // The iModel has two elements of `BisCore.Category` class - one `SpatialCategory` and one `DrawingCategory`.
          // As requested by hierarchy definition, the provider returns them grouped under 2 class grouping nodes:
          expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
            {
              // the `BisCore.Element` class grouping node
              label: "Element",
              children: [
                {
                  // the `BisCore.DefinitionElement` class grouping node
                  label: "Definition Element",
                  children: [
                    // the `BisCore.Category` instance nodes
                    { label: "Example drawing category" },
                    { label: "Example spatial category" },
                  ],
                },
              ],
            },
          ]);
          // __PUBLISH_EXTRACT_END__
        });
      });

      describe("By properties", () => {
        it("groups by property value", async function () {
          const { imodel } = await buildIModel(this, async (builder) => {
            insertRepositoryLink({ builder, repositoryLabel: "Example iModel link 1", format: "iModel" });
            insertRepositoryLink({ builder, repositoryLabel: "Example iModel link 2", format: "iModel" });
            insertRepositoryLink({ builder, repositoryLabel: "Example DGN link", format: "DGN" });
            insertRepositoryLink({ builder, repositoryLabel: "Example link with no format" });
          });
          const imodelAccess = createIModelAccess(imodel);

          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Grouping.PropertyValueGroupingExample
          const hierarchyProvider = createIModelHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) => {
                if (!parentNode) {
                  // The hierarchy definition requests `BisCore.RepositoryLink` nodes to be returned as root nodes and have
                  // them grouped by the `Format` property.
                  return [
                    {
                      fullClassName: "BisCore.RepositoryLink",
                      query: {
                        ecsql: `
                          SELECT ${await createNodesQueryClauseFactory({
                            imodelAccess,
                            instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
                          }).createSelectClause({
                            ecClassId: { selector: "this.ECClassId" },
                            ecInstanceId: { selector: "this.ECInstanceId" },
                            nodeLabel: { selector: "this.UserLabel" },
                            grouping: {
                              byProperties: {
                                propertiesClassName: "BisCore.RepositoryLink",
                                propertyGroups: [
                                  {
                                    propertyClassAlias: "this",
                                    propertyName: "Format",
                                  },
                                ],
                                // create a grouping node for instances whose `Format` property value is not specified
                                createGroupForUnspecifiedValues: true,
                              },
                            },
                          })}
                          FROM BisCore.RepositoryLink this
                        `,
                      },
                    },
                  ];
                }
                return [];
              },
            },
          });

          // The iModel has four elements of `BisCore.RepositoryLink` class:
          //
          // | Element's label             | `Format` property value |
          // | --------------------------- | ----------------------- |
          // | Example iModel link 1       | iModel                  |
          // | Example iModel link 2       | iModel                  |
          // | Example DGN link            | DGN                     |
          // | Example link with no format |                         |
          //
          // As requested by hierarchy definition, the provider returns them grouped by `Format` property value:
          expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
            {
              // the `Format="DGN"` property grouping node
              label: "DGN",
              children: [
                // the grouped repository link with Format="DGN"
                { label: "Example DGN link" },
              ],
            },
            {
              // the `Format="iModel"` property grouping node
              label: "iModel",
              children: [
                // the grouped repository links with Format="iModel"
                { label: "Example iModel link 1" },
                { label: "Example iModel link 2" },
              ],
            },
            {
              // the property grouping node for instances that don't have `Format` property value specified
              label: "Not specified",
              children: [{ label: "Example link with no format" }],
            },
          ]);
          // __PUBLISH_EXTRACT_END__
        });

        it("groups by property value ranges", async function () {
          const { imodel } = await buildIModel(this, async (builder) => {
            insertPhysicalMaterial({ builder, userLabel: "Material 1", density: 4 });
            insertPhysicalMaterial({ builder, userLabel: "Material 2", density: 7 });
            insertPhysicalMaterial({ builder, userLabel: "Material 3", density: 11 });
            insertPhysicalMaterial({ builder, userLabel: "Material 4", density: 200 });
          });
          const imodelAccess = createIModelAccess(imodel);

          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Grouping.PropertyValueRangesGroupingExample
          const hierarchyProvider = createIModelHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) => {
                if (!parentNode) {
                  // The hierarchy definition requests `BisCore.PhysicalMaterial` nodes to be returned as root nodes and have
                  // them grouped by the `Density` property value in given ranges.
                  return [
                    {
                      fullClassName: "BisCore.PhysicalMaterial",
                      query: {
                        ecsql: `
                          SELECT ${await createNodesQueryClauseFactory({
                            imodelAccess,
                            instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
                          }).createSelectClause({
                            ecClassId: { selector: "this.ECClassId" },
                            ecInstanceId: { selector: "this.ECInstanceId" },
                            nodeLabel: { selector: "this.UserLabel" },
                            grouping: {
                              byProperties: {
                                propertiesClassName: "BisCore.PhysicalMaterial",
                                propertyGroups: [
                                  {
                                    propertyClassAlias: "this",
                                    propertyName: "Density",
                                    ranges: [
                                      { fromValue: 0, toValue: 10, rangeLabel: "Low density" },
                                      // when `rangeLabel` is not specified, it's created in the format of `fromValue - toValue`
                                      { fromValue: 10, toValue: 100 },
                                    ],
                                  },
                                ],
                                // create a grouping node for instances whose `Density` doesn't fall into any of the given ranges
                                createGroupForOutOfRangeValues: true,
                              },
                            },
                          })}
                          FROM BisCore.PhysicalMaterial this
                        `,
                      },
                    },
                  ];
                }
                return [];
              },
            },
          });

          // The iModel has five elements of `BisCore.PhysicalMaterial` class:
          //
          // | Element's label | Density value |
          // |-----------------|---------------|
          // | Material 1      | 4             |
          // | Material 2      | 7             |
          // | Material 3      | 11            |
          // | Material 4      | 200           |
          //
          // As requested by hierarchy definition, the provider returns them grouped by the `Density` property value:
          expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
            {
              // the `10 - 100` range property grouping node
              label: "10 - 100",
              children: [{ label: "Material 3" }],
            },
            {
              // the `Low density` range property grouping node
              label: "Low density",
              children: [{ label: "Material 1" }, { label: "Material 2" }],
            },
            {
              // the property grouping node for instances that don't fall into any of the given ranges
              label: "Other",
              children: [{ label: "Material 4" }],
            },
          ]);
          // __PUBLISH_EXTRACT_END__
        });
      });

      it("creates multi-level grouping hierarchy", async function () {
        const { imodel } = await buildIModel(this, async (builder) => {
          insertRepositoryLink({ builder, repositoryLabel: "Example iModel link", format: "iModel" });
          insertRepositoryLink({ builder, repositoryLabel: "Example iModel link", format: "iModel" });
          insertRepositoryLink({ builder, repositoryLabel: "Example DGN link 1", format: "DGN" });
          insertRepositoryLink({ builder, repositoryLabel: "Example DGN link 2", format: "DGN" });
        });
        const imodelAccess = createIModelAccess(imodel);

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Grouping.MultiLevelGroupingExample
        const hierarchyProvider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: {
            defineHierarchyLevel: async ({ parentNode }) => {
              if (!parentNode) {
                // The hierarchy definition requests `BisCore.RepositoryLink` nodes to be returned as root nodes and have
                // them grouped by the `Format` property.
                return [
                  {
                    fullClassName: "BisCore.RepositoryLink",
                    query: {
                      ecsql: `
                        SELECT ${await createNodesQueryClauseFactory({
                          imodelAccess,
                          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
                        }).createSelectClause({
                          ecClassId: { selector: "this.ECClassId" },
                          ecInstanceId: { selector: "this.ECInstanceId" },
                          nodeLabel: { selector: "this.UserLabel" },
                          grouping: {
                            // create two levels of class grouping
                            byBaseClasses: {
                              fullClassNames: ["BisCore.Element", "BisCore.UrlLink"],
                            },
                            // create a level for specific element's class
                            byClass: true,
                            // create a level of Format property value grouping
                            byProperties: {
                              propertiesClassName: "BisCore.RepositoryLink",
                              propertyGroups: [
                                {
                                  propertyClassAlias: "this",
                                  propertyName: "Format",
                                },
                              ],
                            },
                            // create a level of label grouping
                            byLabel: true,
                          },
                        })}
                        FROM BisCore.RepositoryLink this
                      `,
                    },
                  },
                ];
              }
              return [];
            },
          },
        });

        // The iModel has four elements of `BisCore.RepositoryLink` class:
        //
        // | Element's label       | `Format` property value |
        // | --------------------- | ----------------------- |
        // | Example iModel link   | iModel                  |
        // | Example iModel link   | iModel                  |
        // | Example DGN link 1    | DGN                     |
        // | Example DGN link 2    | DGN                     |
        //
        // As requested by hierarchy definition, the provider returns them grouped under a hierarchy of grouping nodes:
        expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
          // a class grouping node for `BisCore.Element` base class
          {
            label: "Element",
            children: [
              // a class grouping node for `BisCore.UrlLink` base class
              {
                label: "URL Link",
                children: [
                  // a class grouping node for `BisCore.RepositoryLink` class
                  {
                    label: "Repository Link",
                    children: [
                      // the `Format="DGN"` property grouping node
                      {
                        label: "DGN",
                        children: [
                          // label grouping node for the first DGN link
                          {
                            label: "Example DGN link 1",
                            children: [
                              // the grouped repository link
                              { label: "Example DGN link 1" },
                            ],
                          },
                          // label grouping node for the second DGN link
                          {
                            label: "Example DGN link 2",
                            children: [
                              // the grouped repository link
                              { label: "Example DGN link 2" },
                            ],
                          },
                        ],
                      },
                      // the `Format="iModel"` property grouping node
                      {
                        label: "iModel",
                        children: [
                          // the label grouping node
                          {
                            label: "Example iModel link",
                            children: [
                              // the two grouped repository links
                              { label: "Example iModel link" },
                              { label: "Example iModel link" },
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
        // __PUBLISH_EXTRACT_END__
      });

      describe("Customization options", () => {
        it("doesn't return grouping node if there's only one grouped instance and `hideIfOneGroupedNode = true`", async function () {
          const { imodel } = await buildIModel(this, async (builder) => {
            insertRepositoryLink({ builder, repositoryLabel: "Example link 1" });
            insertRepositoryLink({ builder, repositoryLabel: "Example link 2" });
            insertRepositoryLink({ builder, repositoryLabel: "Example link 2" });
          });
          const imodelAccess = createIModelAccess(imodel);

          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Grouping.HideIfOneGroupedNodeExample
          const hierarchyProvider = createIModelHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) => {
                if (!parentNode) {
                  // The hierarchy definition requests `BisCore.RepositoryLink` nodes to be returned as root nodes and have
                  // them grouped by label only if there's more than one instance with the same label.
                  return [
                    {
                      fullClassName: "BisCore.RepositoryLink",
                      query: {
                        ecsql: `
                          SELECT ${await createNodesQueryClauseFactory({
                            imodelAccess,
                            instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
                          }).createSelectClause({
                            ecClassId: { selector: "this.ECClassId" },
                            ecInstanceId: { selector: "this.ECInstanceId" },
                            nodeLabel: { selector: "this.UserLabel" },
                            grouping: {
                              byLabel: {
                                action: "group",
                                hideIfOneGroupedNode: true,
                              },
                            },
                          })}
                          FROM BisCore.RepositoryLink this
                        `,
                      },
                    },
                  ];
                }
                return [];
              },
            },
          });

          // The iModel has three elements of `BisCore.RepositoryLink` class:
          //
          // | Element's label |
          // | --------------- |
          // | Example link 1  |
          // | Example link 2  |
          // | Example link 2  |
          //
          // As requested by hierarchy definition, the provider didn't place "Example link 1" under a grouping node:
          expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
            { label: "Example link 1" },
            {
              label: "Example link 2",
              children: [{ label: "Example link 2" }, { label: "Example link 2" }],
            },
          ]);
          // __PUBLISH_EXTRACT_END__
        });

        it("doesn't return grouping node if it has no siblings and `hideIfNoSiblings = true`", async function () {
          const { imodel } = await buildIModel(this, async (builder) => {
            insertRepositoryLink({ builder, repositoryLabel: "Example link 1" });
            insertRepositoryLink({ builder, repositoryLabel: "Example link 2" });
          });
          const imodelAccess = createIModelAccess(imodel);

          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Grouping.HideIfNoSiblingsExample
          const hierarchyProvider = createIModelHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) => {
                if (!parentNode) {
                  // The hierarchy definition requests `BisCore.RepositoryLink` nodes to be returned as root nodes and have
                  // them grouped by class only if the grouping node has siblings.
                  return [
                    {
                      fullClassName: "BisCore.RepositoryLink",
                      query: {
                        ecsql: `
                          SELECT ${await createNodesQueryClauseFactory({
                            imodelAccess,
                            instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
                          }).createSelectClause({
                            ecClassId: { selector: "this.ECClassId" },
                            ecInstanceId: { selector: "this.ECInstanceId" },
                            nodeLabel: { selector: "this.UserLabel" },
                            grouping: {
                              byClass: {
                                hideIfNoSiblings: true,
                              },
                            },
                          })}
                          FROM BisCore.RepositoryLink this
                        `,
                      },
                    },
                  ];
                }
                return [];
              },
            },
          });

          // The iModel has two elements of `BisCore.RepositoryLink` class:
          //
          // | Element's label |
          // | --------------- |
          // | Example link 1  |
          // | Example link 2  |
          //
          // As requested by hierarchy definition, the provider didn't place them under a grouping node, because
          // there're no sibling nodes:
          expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
            // note: no class grouping node
            { label: "Example link 1" },
            { label: "Example link 2" },
          ]);
          // __PUBLISH_EXTRACT_END__
        });

        it("sets auto-expand flag on grouping nodes when `autoExpand = true`", async function () {
          const { imodel } = await buildIModel(this, async (builder) => {
            insertRepositoryLink({ builder, repositoryLabel: "Example link 1" });
            insertRepositoryLink({ builder, repositoryLabel: "Example link 2" });
          });
          const imodelAccess = createIModelAccess(imodel);

          const hierarchyProvider = createIModelHierarchyProvider({
            imodelAccess,
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) => {
                if (!parentNode) {
                  return [
                    {
                      fullClassName: "BisCore.RepositoryLink",
                      query: {
                        ecsql:
                          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Grouping.AutoExpandExample
                          `
                            SELECT ${await createNodesQueryClauseFactory({
                              imodelAccess,
                              instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
                            }).createSelectClause({
                              ecClassId: { selector: "this.ECClassId" },
                              ecInstanceId: { selector: "this.ECInstanceId" },
                              nodeLabel: { selector: "this.UserLabel" },
                              grouping: {
                                byClass: {
                                  // could also set to "single-child" to only auto-expand if there's only one grouped node
                                  autoExpand: "always",
                                },
                              },
                            })}
                            FROM BisCore.RepositoryLink this
                          `,
                        // __PUBLISH_EXTRACT_END__
                      },
                    },
                  ];
                }
                return [];
              },
            },
          });

          await validateHierarchy({
            provider: hierarchyProvider,
            expect: [
              NodeValidators.createForClassGroupingNode({
                label: "Repository Link",
                autoExpand: true,
                children: [
                  NodeValidators.createForInstanceNode({ label: "Example link 1" }),
                  NodeValidators.createForInstanceNode({ label: "Example link 2" }),
                ],
              }),
            ],
          });
        });
      });
    });
  });
});
