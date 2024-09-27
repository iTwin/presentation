/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */

import { expect } from "chai";
import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Formatting.BasicFormatterExample.Imports
import { createBisInstanceLabelSelectClauseFactory, createDefaultValueFormatter, IPrimitiveValueFormatter } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Formatting.CoreInteropFormatterExample.Imports
import { createValueFormatter } from "@itwin/presentation-core-interop";
// __PUBLISH_EXTRACT_END__
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Formatting.NodeLabelFormattingExamples.Imports
import { createIModelHierarchyProvider, createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";
import { ECSql } from "@itwin/presentation-shared";
// __PUBLISH_EXTRACT_END__
import { buildIModel, importSchema } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { createIModelAccess, createSchemaContext } from "../Utils";
import { collectHierarchy } from "./Utils";

describe("Hierarchies", () => {
  describe("Learning snippets", () => {
    describe("Formatting", () => {
      before(async () => {
        await initialize();
      });

      after(async () => {
        await terminate();
      });

      it("formats values with custom formatter", async () => {
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Formatting.BasicFormatterExample
        const defaultFormatter = createDefaultValueFormatter();
        const myFormatter: IPrimitiveValueFormatter = async (value) => {
          if (value.type === "Boolean") {
            return value.value ? "yes!" : "no!";
          }
          return defaultFormatter(value);
        };
        expect(await myFormatter({ type: "Boolean", value: true })).to.eq("yes!");
        expect(await myFormatter({ type: "Boolean", value: false })).to.eq("no!");
        // __PUBLISH_EXTRACT_END__
      });

      it("formats values with units", async function () {
        const { imodel, schema } = await buildIModel(this, async (builder, mochaContext) => {
          return {
            schema: await importSchema(
              mochaContext,
              builder,
              `
                <ECSchemaReference name="Formats" version="01.00.00" alias="f"/>
                <ECSchemaReference name="Units"   version="01.00.03" alias="u"/>
                <KindOfQuantity typeName="FlowRate" displayLabel="Flow Rate" persistenceUnit="u:CUB_M_PER_SEC" relativeError="1e-05" presentationUnits="f:DefaultRealU(4)[u:LITRE_PER_MIN];f:DefaultRealU(4)[u:GALLON_PER_MIN]" />
              `,
            ),
          };
        });
        const schemaContext = createSchemaContext(imodel);
        const mySchemaName = schema.schemaName;

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Formatting.CoreInteropFormatterExample
        const metricFormatter = createValueFormatter({ schemaContext, unitSystem: "metric" });
        const imperialFormatter = createValueFormatter({ schemaContext, unitSystem: "imperial" });

        // Define the raw value to be formatted
        const value = 1.234;

        // Define the KindOfQuantity to use for formatting:
        // <KindOfQuantity
        //   typeName="FlowRate"
        //   displayLabel="Flow Rate"
        //   persistenceUnit="u:CUB_M_PER_SEC"
        //   relativeError="1e-05"
        //   presentationUnits="f:DefaultRealU(4)[u:LITRE_PER_MIN];f:DefaultRealU(4)[u:GALLON_PER_MIN]"
        // />
        const koqName = `${mySchemaName}.FlowRate`;

        // Not passing `koqName` formats the value without units using the default formatter:
        expect(await metricFormatter({ type: "Double", value })).to.eq("1.23");

        // Metric formatter formats the value in liters per minute:
        expect(await metricFormatter({ type: "Double", value, koqName })).to.eq("74040.0 L/min");

        // Imperial formatter formats the value in gallons per minute:
        expect(await imperialFormatter({ type: "Double", value, koqName })).to.eq("19559.2988 gal/min");
        // __PUBLISH_EXTRACT_END__
      });

      it("formats custom node's concatenated value label", async function () {
        const { imodel } = await buildIModel(this);
        const imodelAccess = createIModelAccess(imodel);

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Formatting.CustomHierarchyNodeDefinitionLabelFormattingExample
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

      it("formats instance node's concatenated value label", async function () {
        const { imodel } = await buildIModel(this, async (builder) => {
          const category = insertSpatialCategory({ builder, codeValue: "Example category" });
          return { category };
        });
        const imodelAccess = createIModelAccess(imodel);

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Formatting.InstanceNodesQueryDefinitionLabelFormattingExample
        const hierarchyProvider = createIModelHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: {
            defineHierarchyLevel: async ({ parentNode }) => {
              if (!parentNode) {
                return [
                  // The hierarchy definition returns `BisCore.SpatialCategory` nodes
                  {
                    fullClassName: "BisCore.SpatialCategory",
                    query: {
                      ecsql: `
                        SELECT ${await createNodesQueryClauseFactory({
                          imodelAccess,
                          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
                        }).createSelectClause({
                          ecClassId: { selector: "this.ECClassId" },
                          ecInstanceId: { selector: "this.ECInstanceId" },
                          // Generally, one of the `IInstanceLabelSelectClauseFactory` implementations, delivered with `@itwin/presentation-shared` package, should be used,
                          // but for demonstration purposes, a custom implementation is used here
                          nodeLabel: {
                            selector: ECSql.createConcatenatedValueJsonSelector([
                              // Create a selector for `CodeValue` property value
                              await ECSql.createPrimitivePropertyValueSelectorProps({
                                schemaProvider: imodelAccess,
                                propertyClassName: "BisCore.SpatialCategory",
                                propertyClassAlias: "this",
                                propertyName: "CodeValue",
                              }),
                              // Include a static string value
                              { type: "String", value: " [" },
                              // Create a selector for `ECInstanceId` property value in hex format
                              { selector: `printf('0x%x', this.ECInstanceId)` },
                              // Include a static string value
                              { type: "String", value: "]" },
                            ]),
                          },
                        })}
                        FROM BisCore.SpatialCategory this
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
        expect(await collectHierarchy(hierarchyProvider)).to.containSubset([{ label: "Example category [0x11]" }]);
        // __PUBLISH_EXTRACT_END__
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

        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Formatting.PropertyGroupsFormattingExample
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
