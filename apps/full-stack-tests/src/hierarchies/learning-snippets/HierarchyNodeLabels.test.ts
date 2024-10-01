/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */

import { expect } from "chai";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.NodeLabels.Imports
import { createIModelHierarchyProvider, createNodesQueryClauseFactory, HierarchyDefinition } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory, ECSql } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__
import { buildIModel, importSchema } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { createIModelAccess } from "../Utils";
import { collectHierarchy } from "./Utils";

describe("Hierarchies", () => {
  describe("Learning snippets", () => {
    describe("Node labels", () => {
      before(async function () {
        await initialize();
      });

      after(async () => {
        await terminate();
      });

      it("formats generic node's concatenated value label", async function () {
        const { imodel } = await buildIModel(this);
        const imodelAccess = createIModelAccess(imodel);

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.NodeLabels.GenericHierarchyNodeDefinitionLabelFormattingExample
        const hierarchyProvider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: {
            defineHierarchyLevel: async ({ parentNode }) => {
              if (!parentNode) {
                return [
                  // The hierarchy definition returns a single node with a ConcatenatedValue-based label
                  {
                    node: {
                      key: "root",
                      label: [
                        "Example | ",
                        {
                          type: "Integer",
                          value: 123,
                        },
                        {
                          type: "String",
                          value: " | ",
                        },
                        {
                          type: "Point2d",
                          value: { x: 1, y: 2 },
                        },
                      ],
                    },
                  },
                ];
              }
              return [];
            },
          },
        });

        // Returns the node with formatted and concatenated label:
        expect(await collectHierarchy(hierarchyProvider)).to.containSubset([{ label: "Example | 123 | (1.00, 2.00)" }]);
        // __PUBLISH_EXTRACT_END__
      });

      it("creates a hierarchy using labels from `createBisInstanceLabelSelectClauseFactory`", async function () {
        const { imodel } = await buildIModel(this, async (builder) => {
          const model = insertPhysicalModelWithPartition({ builder, codeValue: "model" });
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          const a = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, codeValue: "A" });
          const b = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, userLabel: "B" });
          const c = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id });
          return { a, b, c };
        });
        const imodelAccess = createIModelAccess(imodel);

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.NodeLabels.BisInstanceLabelSelectClauseFactory
        const hierarchyDefinition: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            // For root nodes, return a query that selects all physical elements
            if (!parentNode) {
              const labelSelectorsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
              const queryClauseFactory = createNodesQueryClauseFactory({
                imodelAccess,
                instanceLabelSelectClauseFactory: labelSelectorsFactory,
              });
              return [
                {
                  fullClassName: "BisCore.PhysicalElement",
                  query: {
                    ecsql: `
                      SELECT ${await queryClauseFactory.createSelectClause({
                        ecClassId: { selector: "x.ECClassId" },
                        ecInstanceId: { selector: "x.ECInstanceId" },
                        nodeLabel: {
                          // Use BIS instance label select clause factory to create the label selector
                          selector: await labelSelectorsFactory.createSelectClause({
                            classAlias: "x",
                            className: "BisCore.PhysicalElement", // This is optional, but helps create a more optimal selector
                          }),
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
        };
        // The iModel contains 3 `Generic.PhysicalObject` elements with the following attributes:
        //
        // | Element Id | User Label | Code Value |
        // |------------|------------|------------|
        // | 0x14       | <NULL>     | A          |
        // | 0x15       | B          | <NULL>     |
        // | 0x16       | <NULL>     | <NULL>     |
        //
        expect(await collectHierarchy(createIModelHierarchyProvider({ imodelAccess, hierarchyDefinition }))).to.containSubset([
          {
            label: "A",
          },
          {
            label: "B [0-L]",
          },
          {
            label: "Physical Object [0-M]",
          },
        ]);
        // __PUBLISH_EXTRACT_END__
      });

      it("creates a hierarchy using labels from custom selector", async function () {
        const { imodel } = await buildIModel(this, async (builder) => {
          const model = insertPhysicalModelWithPartition({ builder, codeValue: "model" });
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          const a = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, codeValue: "A" });
          const b = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, codeValue: "B" });
          const c = insertPhysicalElement({ builder, modelId: model.id, categoryId: category.id, codeValue: "C" });
          return { a, b, c };
        });
        const imodelAccess = createIModelAccess(imodel);

        const hierarchyProvider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: {
            defineHierarchyLevel: async ({ parentNode }) => {
              if (!parentNode) {
                return [
                  {
                    fullClassName: "BisCore.PhysicalElement",
                    query: {
                      ecsql: `
                        SELECT ${await createNodesQueryClauseFactory({
                          imodelAccess,
                          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
                        }).createSelectClause({
                          ecClassId: { selector: "x.ECClassId" },
                          ecInstanceId: { selector: "x.ECInstanceId" },
                          // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.NodeLabels.CustomLabelSelector
                          nodeLabel: {
                            selector: ECSql.createConcatenatedValueJsonSelector([
                              // Create a selector for `CodeValue` property value
                              await ECSql.createPrimitivePropertyValueSelectorProps({
                                schemaProvider: imodelAccess,
                                propertyClassName: "BisCore.PhysicalElement",
                                propertyClassAlias: "x",
                                propertyName: "CodeValue",
                              }),
                              // Include a static string value
                              { type: "String", value: " [" },
                              // Create a selector for `ECInstanceId` property value in hex format
                              { selector: `printf('0x%x', x.ECInstanceId)` },
                              // Include a static string value
                              { type: "String", value: "]" },
                            ]),
                          },
                          // __PUBLISH_EXTRACT_END__
                        })}
                        FROM BisCore.PhysicalElement x
                      `,
                    },
                  },
                ];
              }
              return [];
            },
          },
        });

        // All returned nodes have their labels set in format "{CodeValue} [{ECInstanceId}]":
        expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
          {
            label: "A [0x14]",
          },
          {
            label: "B [0x15]",
          },
          {
            label: "C [0x16]",
          },
        ]);
      });

      it("formats property grouping node's label", async function () {
        const { imodel, myPhysicalObjectClassName } = await buildIModel(this, async (builder, mochaContext) => {
          const schema = await importSchema(
            mochaContext,
            builder,
            `
              <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
              <ECEntityClass typeName="MyPhysicalObject">
                <BaseClass>bis:PhysicalElement</BaseClass>
                <ECProperty propertyName="DoubleProperty" typeName="double" />
              </ECEntityClass>
            `,
          );
          const category = insertSpatialCategory({ builder, codeValue: "Category" });
          const model = insertPhysicalModelWithPartition({ builder, codeValue: "Model" });
          insertPhysicalElement({
            builder,
            modelId: model.id,
            categoryId: category.id,
            classFullName: schema.items.MyPhysicalObject.fullName,
            userLabel: "Example element 1",
            doubleProperty: 123.45,
          });
          insertPhysicalElement({
            builder,
            modelId: model.id,
            categoryId: category.id,
            classFullName: schema.items.MyPhysicalObject.fullName,
            userLabel: "Example element 2",
            doubleProperty: 123.454,
          });
          return { myPhysicalObjectClassName: schema.items.MyPhysicalObject.fullName };
        });
        const imodelAccess = createIModelAccess(imodel);

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.NodeLabels.PropertyGroupsFormattingExample
        const hierarchyProvider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: {
            defineHierarchyLevel: async ({ parentNode }) => {
              if (!parentNode) {
                return [
                  // The hierarchy definition returns nodes for `myPhysicalObjectClassName` element type, grouped by `DoubleProperty` property value
                  {
                    fullClassName: myPhysicalObjectClassName,
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
                              propertiesClassName: myPhysicalObjectClassName,
                              propertyGroups: [{ propertyClassAlias: "this", propertyName: "DoubleProperty" }],
                            },
                          },
                        })}
                        FROM ${myPhysicalObjectClassName} this
                      `,
                    },
                  },
                ];
              }
              return [];
            },
          },
        });

        // The iModel has two elements of `myPhysicalObjectClassName` type, whose `DoubleProperty` values
        // are `123.450` and `123.454`. After passing through formatter, they both become equal to `123.45`,
        // so we get one property grouping node for the two nodes:
        expect(await collectHierarchy(hierarchyProvider)).to.containSubset([
          {
            label: "123.45",
            children: [{ label: "Example element 1" }, { label: "Example element 2" }],
          },
        ]);
        // __PUBLISH_EXTRACT_END__
      });
    });
  });
});
