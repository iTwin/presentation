/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { Subject } from "@itwin/core-backend";
import { Guid, Id64 } from "@itwin/core-bentley";
import { IModel, Rank } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { createECSqlQueryExecutor, createMetadataProvider, createValueFormatter } from "@itwin/presentation-core-interop";
import {
  createConcatenatedValueSelector,
  createPropertyValueSelector,
  HierarchyProvider,
  IHierarchyLevelDefinitionsFactory,
  IPrimitiveValueFormatter,
  NodeSelectClauseFactory,
} from "@itwin/presentation-hierarchy-builder";
import { julianToDateTime } from "@itwin/presentation-hierarchy-builder/lib/cjs/hierarchy-builder/internal/Common";
import {
  buildIModel,
  importSchema,
  insertDrawingCategory,
  insertDrawingGraphic,
  insertDrawingModelWithPartition,
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertPhysicalPartition,
  insertPhysicalSubModel,
  insertSpatialCategory,
} from "../IModelUtils";
import { initialize, terminate } from "../IntegrationTests";
import { validateHierarchy } from "./HierarchyValidation";

describe("Stateless hierarchy builder", () => {
  describe("Labels formatting", () => {
    let emptyIModel: IModelConnection;
    let subjectClassName: string;
    let selectClauseFactory: NodeSelectClauseFactory;

    before(async function () {
      await initialize();
      emptyIModel = (await buildIModel(this)).imodel;
      subjectClassName = Subject.classFullName.replace(":", ".");
      selectClauseFactory = new NodeSelectClauseFactory();
    });

    after(async () => {
      await terminate();
    });

    function createProvider(props: {
      imodel: IModelConnection;
      hierarchy: IHierarchyLevelDefinitionsFactory;
      formatterFactory?: (schemas: SchemaContext) => IPrimitiveValueFormatter;
    }) {
      const { imodel, hierarchy } = props;
      const schemas = new SchemaContext();
      schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
      const metadataProvider = createMetadataProvider(schemas);
      return new HierarchyProvider({
        metadataProvider,
        hierarchyDefinition: hierarchy,
        queryExecutor: createECSqlQueryExecutor(imodel),
        formatter: props.formatterFactory ? props.formatterFactory(schemas) : undefined,
      });
    }

    it("formats labels with parts of different types", async function () {
      const date = new Date();
      const hierarchy: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel(parentNode) {
          if (!parentNode) {
            return [
              {
                node: {
                  key: "custom",
                  label: [
                    { type: "DateTime", value: date },
                    { type: "String", value: "|" },
                    { type: "Id", value: Id64.fromLocalAndBriefcaseIds(1, 2) },
                  ],
                  children: false,
                },
              },
            ];
          }
          return [];
        },
      };
      await validateHierarchy({
        provider: createProvider({ imodel: emptyIModel, hierarchy }),
        expect: [
          {
            node: (node) => {
              const expectedLabel = `${date.toLocaleString()}|2-1`;
              const actualLabel = node.label;
              expect(actualLabel).to.eq(expectedLabel);
            },
          },
        ],
      });
    });

    describe("KindOfQuantity", () => {
      it("formats instance node labels", async function () {
        const { imodel, schema } = await buildIModel(this, async (builder, mochaContext) => {
          // eslint-disable-next-line @typescript-eslint/no-shadow
          const schema = await importSchema(
            mochaContext,
            builder,
            [
              `
              <KindOfQuantity typeName="LENGTH" persistenceUnit="u:M" presentationUnits="f:DefaultRealU(1)[u:M];f:DefaultRealU(1)[u:FT];f:DefaultRealU(2)[u:US_SURVEY_FT];f:AmerFI" relativeError="0.0001" />
              `,
              `
              <ECEntityClass typeName="ClassX">
                <BaseClass>bis:PhysicalElement</BaseClass>
                <ECProperty propertyName="PropX" typeName="double" kindOfQuantity="LENGTH" />
              </ECEntityClass>
              `,
            ],
            [
              `<ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />`,
              `<ECSchemaReference name="Units" version="01.00.07" alias="u" />`,
              `<ECSchemaReference name="Formats" version="01.00.00" alias="f" />`,
            ],
          );
          const model = insertPhysicalModelWithPartition({ builder, codeValue: "model" });
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          const element = insertPhysicalElement({
            builder,
            classFullName: schema.classes.ClassX.fullName,
            modelId: model.id,
            categoryId: category.id,
            ["PropX"]: 123.456,
          });
          return { schema, model, category, element };
        });
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  fullClassName: schema.classes.ClassX.fullName,
                  query: {
                    ecsql: `
                    SELECT ${await selectClauseFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: createConcatenatedValueSelector([
                          { type: "String", value: "[" },
                          { propertyClassName: schema.classes.ClassX.fullName, propertyClassAlias: "this", propertyName: "PropX" },
                          { type: "String", value: "]" },
                        ]),
                      },
                    })}
                    FROM ${schema.classes.ClassX.fullName} AS this
                  `,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy, formatterFactory: (schemas) => createValueFormatter(schemas, "metric") }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`[123.5 m]`),
            },
          ],
        });
        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy, formatterFactory: (schemas) => createValueFormatter(schemas, "imperial") }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`[405.0 ft]`),
            },
          ],
        });
        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy, formatterFactory: (schemas) => createValueFormatter(schemas, "usCustomary") }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`[405.0 ft]`),
            },
          ],
        });
        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy, formatterFactory: (schemas) => createValueFormatter(schemas, "usSurvey") }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`[405.04 ft (US Survey)]`),
            },
          ],
        });
      });
    });

    describe("Id", () => {
      it("formats custom node labels", async function () {
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  node: {
                    key: "custom",
                    label: [
                      { type: "String", value: "[" },
                      { type: "Id", value: Id64.fromLocalAndBriefcaseIds(1, 2) },
                      { type: "String", value: "]" },
                    ],
                    children: false,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ imodel: emptyIModel, hierarchy }),
          expect: [
            {
              node: (node) => {
                const expectedLabel = `[2-1]`;
                const actualLabel = node.label;
                expect(actualLabel).to.eq(expectedLabel);
              },
            },
          ],
        });
      });
    });

    describe("DateTime", () => {
      it("formats instance node labels", async function () {
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  fullClassName: subjectClassName,
                  query: {
                    ecsql: `
                    SELECT ${await selectClauseFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: createConcatenatedValueSelector([
                          { type: "String", value: "[" },
                          { propertyClassName: "BisCore.Subject", propertyClassAlias: "this", propertyName: "LastMod" },
                          { type: "String", value: "]" },
                        ]),
                      },
                      extendedData: {
                        lastMod: { selector: createPropertyValueSelector("this", "LastMod") },
                      },
                    })}
                    FROM ${subjectClassName} AS this
                  `,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ imodel: emptyIModel, hierarchy }),
          expect: [
            {
              node: (node) => {
                const unformattedLastMod = node.extendedData!.lastMod as number;
                const expectedLabel = `[${julianToDateTime(unformattedLastMod).toLocaleString()}]`;
                const actualLabel = node.label;
                expect(actualLabel).to.eq(expectedLabel);
              },
            },
          ],
        });
      });

      it("formats custom node labels", async function () {
        const date = new Date();
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  node: {
                    key: "custom",
                    label: [
                      { type: "String", value: "[" },
                      { type: "DateTime", value: date },
                      { type: "String", value: "]" },
                    ],
                    children: false,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ imodel: emptyIModel, hierarchy }),
          expect: [
            {
              node: (node) => {
                const expectedLabel = `[${date.toLocaleString()}]`;
                const actualLabel = node.label;
                expect(actualLabel).to.eq(expectedLabel);
              },
            },
          ],
        });
      });

      it("formats using short date format", async function () {
        const date = new Date();
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  node: {
                    key: "custom",
                    label: [
                      { type: "String", value: "[" },
                      { type: "DateTime", extendedType: "ShortDate", value: date },
                      { type: "String", value: "]" },
                    ],
                    children: false,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ imodel: emptyIModel, hierarchy }),
          expect: [
            {
              node: (node) => {
                const expectedLabel = `[${date.toLocaleDateString()}]`;
                const actualLabel = node.label;
                expect(actualLabel).to.eq(expectedLabel);
              },
            },
          ],
        });
      });
    });

    describe("Boolean", () => {
      it("formats instance node labels", async function () {
        const { imodel, modelClassName } = await buildIModel(this, async (builder) => {
          const p1 = insertPhysicalPartition({ builder, codeValue: "p1", parentId: IModel.rootSubjectId });
          insertPhysicalSubModel({ builder, modeledElementId: p1.id, isPrivate: false });
          const p2 = insertPhysicalPartition({ builder, codeValue: "p2", parentId: IModel.rootSubjectId });
          const m2 = insertPhysicalSubModel({ builder, modeledElementId: p2.id, isPrivate: true });
          return { modelClassName: m2.className };
        });
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  fullClassName: modelClassName,
                  query: {
                    ecsql: `
                    SELECT ${await selectClauseFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: createConcatenatedValueSelector([
                          { type: "String", value: "[" },
                          { propertyClassName: modelClassName, propertyClassAlias: "this", propertyName: "IsPrivate" },
                          { type: "String", value: "]" },
                        ]),
                      },
                    })}
                    FROM ${modelClassName} AS this
                  `,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`[false]`),
            },
            {
              node: (node) => expect(node.label).to.eq(`[true]`),
            },
          ],
        });
      });

      it("formats custom node labels", async function () {
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  node: {
                    key: "custom",
                    label: [
                      { type: "Boolean", value: true },
                      { type: "String", value: "-" },
                      { type: "Boolean", value: false },
                    ],
                    children: false,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ imodel: emptyIModel, hierarchy }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`true-false`),
            },
          ],
        });
      });
    });

    describe("Integer", () => {
      it("formats instance node labels", async function () {
        const { imodel, category } = await buildIModel(this, async (builder) => {
          return { category: insertSpatialCategory({ builder, codeValue: "category", rank: Rank.Application }) };
        });
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  fullClassName: category.className,
                  query: {
                    ecsql: `
                    SELECT ${await selectClauseFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: createConcatenatedValueSelector([
                          { type: "String", value: "[" },
                          { propertyClassName: category.className, propertyClassAlias: "this", propertyName: "Rank" },
                          { type: "String", value: "]" },
                        ]),
                      },
                    })}
                    FROM ${category.className} AS this
                  `,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`[2]`),
            },
          ],
        });
      });

      it("formats custom node labels", async function () {
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  node: {
                    key: "custom",
                    label: [
                      { type: "String", value: "[" },
                      { type: "Integer", value: 123.789 },
                      { type: "String", value: "]" },
                    ],
                    children: false,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ imodel: emptyIModel, hierarchy }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`[124]`),
            },
          ],
        });
      });
    });

    describe("Double", () => {
      it("formats instance node labels", async function () {
        const { imodel, element } = await buildIModel(this, async (builder) => {
          const model = insertPhysicalModelWithPartition({ builder, codeValue: "model" });
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          // eslint-disable-next-line @typescript-eslint/no-shadow
          const element = insertPhysicalElement({
            builder,
            modelId: model.id,
            categoryId: category.id,
            placement: {
              origin: { x: 1.23, y: 4.56, z: 7.89 },
              angles: {
                yaw: 90.789,
              },
            },
          });
          return { model, category, element };
        });
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  fullClassName: element.className,
                  query: {
                    ecsql: `
                    SELECT ${await selectClauseFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: createConcatenatedValueSelector([
                          { type: "String", value: "[" },
                          { propertyClassName: element.className, propertyClassAlias: "this", propertyName: "Yaw" },
                          { type: "String", value: "]" },
                        ]),
                      },
                    })}
                    FROM ${element.className} AS this
                  `,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`[90.79]`),
            },
          ],
        });
      });

      it("formats custom node labels", async function () {
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  node: {
                    key: "custom",
                    label: [
                      { type: "String", value: "[" },
                      { type: "Double", value: 123.789 },
                      { type: "String", value: "]" },
                    ],
                    children: false,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ imodel: emptyIModel, hierarchy }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`[123.79]`),
            },
          ],
        });
      });
    });

    describe("Point2d", () => {
      it("formats instance node labels", async function () {
        const { imodel, element } = await buildIModel(this, async (builder) => {
          const model = insertDrawingModelWithPartition({ builder, codeValue: "model" });
          const category = insertDrawingCategory({ builder, codeValue: "category" });
          // eslint-disable-next-line @typescript-eslint/no-shadow
          const element = insertDrawingGraphic({
            builder,
            modelId: model.id,
            categoryId: category.id,
            placement: {
              origin: { x: 1.477, y: 2.588 },
              angle: 0,
            },
          });
          return { model, category, element };
        });
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  fullClassName: element.className,
                  query: {
                    ecsql: `
                    SELECT ${await selectClauseFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: createConcatenatedValueSelector([
                          { type: "String", value: "[" },
                          { propertyClassName: element.className, propertyClassAlias: "this", propertyName: "Origin", specialType: "Point2d" },
                          { type: "String", value: "]" },
                        ]),
                      },
                    })}
                    FROM ${element.className} AS this
                  `,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`[(1.48, 2.59)]`),
            },
          ],
        });
      });

      it("formats custom node labels", async function () {
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  node: {
                    key: "custom",
                    label: [
                      { type: "String", value: "[" },
                      { type: "Point2d", value: { x: 1.477, y: 2.588 } },
                      { type: "String", value: "]" },
                    ],
                    children: false,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ imodel: emptyIModel, hierarchy }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`[(1.48, 2.59)]`),
            },
          ],
        });
      });
    });

    describe("Point3d", () => {
      it("formats instance node labels", async function () {
        const { imodel, element } = await buildIModel(this, async (builder) => {
          const model = insertPhysicalModelWithPartition({ builder, codeValue: "model" });
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          // eslint-disable-next-line @typescript-eslint/no-shadow
          const element = insertPhysicalElement({
            builder,
            modelId: model.id,
            categoryId: category.id,
            placement: {
              origin: { x: 1.234, y: 4.567, z: 7.89 },
              angles: {},
            },
          });
          return { model, category, element };
        });
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  fullClassName: element.className,
                  query: {
                    ecsql: `
                    SELECT ${await selectClauseFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: createConcatenatedValueSelector([
                          { type: "String", value: "[" },
                          { propertyClassName: element.className, propertyClassAlias: "this", propertyName: "Origin", specialType: "Point3d" },
                          { type: "String", value: "]" },
                        ]),
                      },
                    })}
                    FROM ${element.className} AS this
                  `,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`[(1.23, 4.57, 7.89)]`),
            },
          ],
        });
      });

      it("formats custom node labels", async function () {
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  node: {
                    key: "custom",
                    label: [
                      { type: "String", value: "[" },
                      { type: "Point3d", value: { x: 1.477, y: 2.588, z: 3.699 } },
                      { type: "String", value: "]" },
                    ],
                    children: false,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ imodel: emptyIModel, hierarchy }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`[(1.48, 2.59, 3.70)]`),
            },
          ],
        });
      });
    });

    describe("Guid", () => {
      it("formats instance node labels", async function () {
        const guid = Guid.createValue();
        const { imodel, element } = await buildIModel(this, async (builder) => {
          const model = insertPhysicalModelWithPartition({ builder, codeValue: "model" });
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          // eslint-disable-next-line @typescript-eslint/no-shadow
          const element = insertPhysicalElement({
            builder,
            modelId: model.id,
            categoryId: category.id,
            federationGuid: guid,
          });
          return { model, category, element };
        });
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  fullClassName: element.className,
                  query: {
                    ecsql: `
                    SELECT ${await selectClauseFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: createConcatenatedValueSelector([
                          { type: "String", value: "[" },
                          { propertyClassName: element.className, propertyClassAlias: "this", propertyName: "FederationGuid", specialType: "Guid" },
                          { type: "String", value: "]" },
                        ]),
                      },
                    })}
                    FROM ${element.className} AS this
                  `,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy }),
          expect: [
            {
              node: (node) => expect(node.label).to.eq(`[${guid}]`),
            },
          ],
        });
      });
    });
  });
});
