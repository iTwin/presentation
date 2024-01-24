/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { Subject } from "@itwin/core-backend";
import { Guid, Id64 } from "@itwin/core-bentley";
import { IModel, Rank } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { createValueFormatter } from "@itwin/presentation-core-interop";
import { ECSqlSnippets, IHierarchyLevelDefinitionsFactory, NodeSelectQueryFactory, TypedPrimitiveValue } from "@itwin/presentation-hierarchy-builder";
import { julianToDateTime } from "@itwin/presentation-hierarchy-builder/lib/cjs/hierarchy-builder/internal/Common";
import {
  buildIModel, importSchema, insertDrawingCategory, insertDrawingGraphic, insertDrawingModelWithPartition, insertPhysicalElement,
  insertPhysicalModelWithPartition, insertPhysicalPartition, insertPhysicalSubModel, insertSpatialCategory,
} from "../IModelUtils";
import { initialize, terminate } from "../IntegrationTests";
import { validateHierarchy } from "./HierarchyValidation";
import { createMetadataProvider, createProvider } from "./Utils";

describe("Stateless hierarchy builder", () => {
  let emptyIModel: IModelConnection;
  let subjectClassName: string;

  before(async function () {
    await initialize();
    emptyIModel = (await buildIModel(this)).imodel;
    subjectClassName = Subject.classFullName.replace(":", ".");
  });

  after(async () => {
    await terminate();
  });
  describe("Labels formatting", () => {
    it("formats labels with parts of different types", async function () {
      const date = new Date();
      const hierarchy: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                node: {
                  key: "custom",
                  label: [
                    { type: "DateTime", value: date },
                    { type: "String", value: "|" },
                    { type: "Double", value: 0.123 },
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
              const expectedLabel = `${date.toLocaleString()}|0.12`;
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
          const schema = importSchema(
            mochaContext,
            builder,
            `
              <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
              <ECSchemaReference name="Units" version="01.00.07" alias="u" />
              <ECSchemaReference name="Formats" version="01.00.00" alias="f" />
              <KindOfQuantity typeName="LENGTH" persistenceUnit="u:M" presentationUnits="f:DefaultRealU(1)[u:M];f:DefaultRealU(1)[u:FT];f:DefaultRealU(2)[u:US_SURVEY_FT];f:AmerFI" relativeError="0.0001" />
              <ECEntityClass typeName="ClassX">
                <BaseClass>bis:PhysicalElement</BaseClass>
                <ECProperty propertyName="PropX" typeName="double" kindOfQuantity="LENGTH" />
              </ECEntityClass>
            `,
          );
          const model = insertPhysicalModelWithPartition({ builder, codeValue: "model" });
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          const element = insertPhysicalElement({
            builder,
            classFullName: schema.items.ClassX.fullName,
            modelId: model.id,
            categoryId: category.id,
            ["PropX"]: 123.456,
          });
          return { schema, model, category, element };
        });

        const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: schema.items.ClassX.fullName,
                  query: {
                    ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: ECSqlSnippets.createConcatenatedValueJsonSelector([
                          { type: "String", value: "[" },
                          { propertyClassName: schema.items.ClassX.fullName, propertyClassAlias: "this", propertyName: "PropX" },
                          { type: "String", value: "]" },
                        ]),
                      },
                    })}
                    FROM ${schema.items.ClassX.fullName} AS this
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
        const id = Id64.fromLocalAndBriefcaseIds(1, 2);
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [
                {
                  node: {
                    key: "custom",
                    label: [
                      { type: "String", value: "[" },
                      { type: "Id", value: id },
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
                const expectedLabel = `[${id}]`;
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
        const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(emptyIModel));
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: subjectClassName,
                  query: {
                    ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: ECSqlSnippets.createConcatenatedValueJsonSelector([
                          { type: "String", value: "[" },
                          { propertyClassName: "BisCore.Subject", propertyClassAlias: "this", propertyName: "LastMod" },
                          { type: "String", value: "]" },
                        ]),
                      },
                      extendedData: {
                        lastMod: { selector: ECSqlSnippets.createRawPropertyValueSelector("this", "LastMod") },
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
          async defineHierarchyLevel({ parentNode }) {
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
          async defineHierarchyLevel({ parentNode }) {
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

        const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: modelClassName,
                  query: {
                    ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: ECSqlSnippets.createConcatenatedValueJsonSelector([
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
          async defineHierarchyLevel({ parentNode }) {
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

        const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: category.className,
                  query: {
                    ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: ECSqlSnippets.createConcatenatedValueJsonSelector([
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
          async defineHierarchyLevel({ parentNode }) {
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
        const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: element.className,
                  query: {
                    ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: ECSqlSnippets.createConcatenatedValueJsonSelector([
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
          async defineHierarchyLevel({ parentNode }) {
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
        const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: element.className,
                  query: {
                    ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: ECSqlSnippets.createConcatenatedValueJsonSelector([
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
          async defineHierarchyLevel({ parentNode }) {
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
        const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: element.className,
                  query: {
                    ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: ECSqlSnippets.createConcatenatedValueJsonSelector([
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
          async defineHierarchyLevel({ parentNode }) {
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
        const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: element.className,
                  query: {
                    ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: ECSqlSnippets.createConcatenatedValueJsonSelector([
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

  describe("Changing formatter", () => {
    after(() => {
      sinon.restore();
    });

    it("formats labels with provided formatter", async function () {
      const date = new Date();
      const hierarchy: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                node: {
                  key: "custom",
                  label: { type: "DateTime", value: date },
                  children: false,
                },
              },
            ];
          }
          return [];
        },
      };
      const provider = createProvider({ imodel: emptyIModel, hierarchy });
      await validateHierarchy({
        provider,
        expect: [
          {
            node: (node) => {
              const expectedLabel = date.toLocaleString();
              const actualLabel = node.label;
              expect(actualLabel).to.eq(expectedLabel);
            },
          },
        ],
      });
      provider.setFormatter(async (val: TypedPrimitiveValue) => `_formatted_${JSON.stringify(val.value)}`);
      await validateHierarchy({
        provider,
        expect: [
          {
            node: (node) => {
              const expectedLabel = `_formatted_"${date.toJSON()}"`;
              const actualLabel = node.label;
              expect(actualLabel).to.eq(expectedLabel);
            },
          },
        ],
      });
    });

    it("doesn't requery with different formatter", async function () {
      const { imodel, modelClassName } = await buildIModel(this, async (builder) => {
        const p1 = insertPhysicalPartition({ builder, codeValue: "p1", parentId: IModel.rootSubjectId });
        insertPhysicalSubModel({ builder, modeledElementId: p1.id, isPrivate: false });
        const p2 = insertPhysicalPartition({ builder, codeValue: "p2", parentId: IModel.rootSubjectId });
        const m2 = insertPhysicalSubModel({ builder, modeledElementId: p2.id, isPrivate: true });
        return { modelClassName: m2.className };
      });

      const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
      const hierarchy: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                fullClassName: modelClassName,
                query: {
                  ecsql: `
                  SELECT ${await selectQueryFactory.createSelectClause({
                    ecClassId: { selector: `this.ECClassId` },
                    ecInstanceId: { selector: `this.ECInstanceId` },
                    nodeLabel: {
                      selector: ECSqlSnippets.createConcatenatedValueJsonSelector([
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

      const provider = createProvider({ imodel, hierarchy });
      const queryReaderSpy = sinon.spy(provider.queryExecutor, "createQueryReader");
      await validateHierarchy({
        provider,
        expect: [
          {
            node: (node) => expect(node.label).to.eq(`[false]`),
          },
          {
            node: (node) => expect(node.label).to.eq(`[true]`),
          },
        ],
      });
      expect(queryReaderSpy).to.be.calledOnce;
      queryReaderSpy.resetHistory();
      const newFormatter = async (val: TypedPrimitiveValue) => `_${JSON.stringify(val.value)}_`;
      provider.setFormatter(newFormatter);
      await validateHierarchy({
        provider,
        expect: [
          {
            node: (node) => expect(node.label).to.eq('_"["__0__"]"_'),
          },
          {
            node: (node) => expect(node.label).to.eq('_"["__1__"]"_'),
          },
        ],
      });
      expect(queryReaderSpy).to.not.be.called;
    });
  });
});
