/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  insertDrawingCategory,
  insertDrawingGraphic,
  insertDrawingModelWithPartition,
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertPhysicalPartition,
  insertPhysicalSubModel,
  insertSheetIndexFolder,
  insertSpatialCategory,
} from "presentation-test-utilities";
import { afterAll, describe, expect, it, test, vi } from "vitest";
import { Subject } from "@itwin/core-backend";
import { Guid, Id64 } from "@itwin/core-bentley";
import { IModel } from "@itwin/core-common";
import { createValueFormatter } from "@itwin/presentation-core-interop";
import { createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";
import {
  createBisInstanceLabelSelectClauseFactory,
  ECSql,
  julianToDateTime,
  normalizeFullClassName,
} from "@itwin/presentation-shared";
import { buildTestIModel } from "../IModelUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import { validateHierarchy } from "./HierarchyValidation.js";
import { createIModelAccess, createProvider } from "./Utils.js";

import type { IModelConnection } from "@itwin/core-frontend";
import type { HierarchyDefinition } from "@itwin/presentation-hierarchies";
import type { EC } from "@itwin/presentation-shared";

describe("Hierarchies", () => {
  let emptyIModel: IModelConnection;
  let subjectClassName: EC.FullClassName;

  test.beforeAll(async (_, suite) => {
    await initialize();
    emptyIModel = (await buildTestIModel(suite.fullTestName!)).imodelConnection;
    subjectClassName = normalizeFullClassName(Subject.classFullName);
  });

  afterAll(async () => {
    await terminate();
  });

  describe("Labels formatting", () => {
    it("formats labels with parts of different types", async () => {
      const date = new Date();
      const hierarchy: HierarchyDefinition = {
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
                    [
                      { type: "String", value: "-" },
                      { type: "Integer", value: 1.8 },
                    ],
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
              const expectedLabel = `${date.toLocaleString()}|0.12-2`;
              const actualLabel = node.label;
              expect(actualLabel).toBe(expectedLabel);
            },
          },
        ],
      });
    });

    describe("KindOfQuantity", () => {
      it("formats instance node labels", async () => {
        const { imodelConnection, schema } = await buildTestIModel(async (imodel, testName) => {
          // eslint-disable-next-line @typescript-eslint/no-shadow
          const schema = await importSchema(
            testName,
            imodel,
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
          const model = insertPhysicalModelWithPartition({ imodel, codeValue: "model" });
          const category = insertSpatialCategory({ imodel, codeValue: "category" });
          const element = insertPhysicalElement({
            imodel,
            classFullName: schema.items.ClassX.fullName,
            modelId: model.id,
            categoryId: category.id,
            ["PropX"]: 123.456,
          });
          return { schema, model, category, element };
        });
        const imodelAccess = createIModelAccess(imodelConnection);

        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
            classHierarchyInspector: imodelAccess,
          }),
        });
        const hierarchy: HierarchyDefinition = {
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
                        selector: ECSql.createConcatenatedValueJsonSelector([
                          { type: "String", value: "[" },
                          await ECSql.createPrimitivePropertyValueSelectorProps({
                            schemaProvider: imodelAccess,
                            propertyClassName: schema.items.ClassX.fullName,
                            propertyClassAlias: "this",
                            propertyName: "PropX",
                          }),
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
          provider: createProvider({
            imodel: imodelConnection,
            hierarchy,
            formatterFactory: (schemas) => createValueFormatter({ schemaContext: schemas, unitSystem: "metric" }),
          }),
          expect: [{ node: (node) => expect(node.label).toBe(`[123.5 m]`) }],
        });
        await validateHierarchy({
          provider: createProvider({
            imodel: imodelConnection,
            hierarchy,
            formatterFactory: (schemas) => createValueFormatter({ schemaContext: schemas, unitSystem: "imperial" }),
          }),
          expect: [{ node: (node) => expect(node.label).toBe(`[405.0 ft]`) }],
        });
        await validateHierarchy({
          provider: createProvider({
            imodel: imodelConnection,
            hierarchy,
            formatterFactory: (schemas) => createValueFormatter({ schemaContext: schemas, unitSystem: "usCustomary" }),
          }),
          expect: [{ node: (node) => expect(node.label).toBe(`[405.0 ft]`) }],
        });
        await validateHierarchy({
          provider: createProvider({
            imodel: imodelConnection,
            hierarchy,
            formatterFactory: (schemas) => createValueFormatter({ schemaContext: schemas, unitSystem: "usSurvey" }),
          }),
          expect: [{ node: (node) => expect(node.label).toBe(`[405.04 ft (US Survey)]`) }],
        });
      });
    });

    describe("Id", () => {
      it("formats generic node labels", async () => {
        const id = Id64.fromLocalAndBriefcaseIds(1, 2);
        const hierarchy: HierarchyDefinition = {
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
                expect(actualLabel).toBe(expectedLabel);
              },
            },
          ],
        });
      });
    });

    describe("DateTime", () => {
      it("formats instance node labels", async () => {
        const imodelAccess = createIModelAccess(emptyIModel);
        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
            classHierarchyInspector: imodelAccess,
          }),
        });
        const hierarchy: HierarchyDefinition = {
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
                        selector: ECSql.createConcatenatedValueJsonSelector([
                          { type: "String", value: "[" },
                          await ECSql.createPrimitivePropertyValueSelectorProps({
                            schemaProvider: imodelAccess,
                            propertyClassName: "BisCore.Subject",
                            propertyClassAlias: "this",
                            propertyName: "LastMod",
                          }),
                          { type: "String", value: "]" },
                        ]),
                      },
                      extendedData: { lastMod: { selector: ECSql.createRawPropertyValueSelector("this", "LastMod") } },
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
                expect(actualLabel).toBe(expectedLabel);
              },
            },
          ],
        });
      });

      it("formats generic node labels", async () => {
        const date = new Date();
        const hierarchy: HierarchyDefinition = {
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
                expect(actualLabel).toBe(expectedLabel);
              },
            },
          ],
        });
      });

      it("formats using short date format", async () => {
        const date = new Date();
        const hierarchy: HierarchyDefinition = {
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
                expect(actualLabel).toBe(expectedLabel);
              },
            },
          ],
        });
      });
    });

    describe("Boolean", () => {
      it("formats instance node labels", async () => {
        const { imodelConnection, modelClassName } = await buildTestIModel(async (imodel) => {
          const p1 = insertPhysicalPartition({ imodel, codeValue: "p1", parentId: IModel.rootSubjectId });
          insertPhysicalSubModel({ imodel, modeledElementId: p1.id, isPrivate: false });
          const p2 = insertPhysicalPartition({ imodel, codeValue: "p2", parentId: IModel.rootSubjectId });
          const m2 = insertPhysicalSubModel({ imodel, modeledElementId: p2.id, isPrivate: true });
          return { modelClassName: m2.className };
        });
        const imodelAccess = createIModelAccess(imodelConnection);

        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
            classHierarchyInspector: imodelAccess,
          }),
        });
        const hierarchy: HierarchyDefinition = {
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
                        selector: ECSql.createConcatenatedValueJsonSelector([
                          { type: "String", value: "[" },
                          await ECSql.createPrimitivePropertyValueSelectorProps({
                            schemaProvider: imodelAccess,
                            propertyClassName: modelClassName,
                            propertyClassAlias: "this",
                            propertyName: "IsPrivate",
                          }),
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
          provider: createProvider({ imodel: imodelConnection, hierarchy }),
          expect: [
            { node: (node) => expect(node.label).toBe(`[false]`) },
            { node: (node) => expect(node.label).toBe(`[true]`) },
          ],
        });
      });

      it("formats generic node labels", async () => {
        const hierarchy: HierarchyDefinition = {
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
          expect: [{ node: (node) => expect(node.label).toBe(`true-false`) }],
        });
      });
    });

    describe("Integer", () => {
      it("formats instance node labels", async () => {
        const { imodelConnection, sheetIndexFolder } = await buildTestIModel(async (imodel) => {
          return { sheetIndexFolder: insertSheetIndexFolder({ imodel, entryPriority: 2 }) };
        });
        const imodelAccess = createIModelAccess(imodelConnection);

        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
            classHierarchyInspector: imodelAccess,
          }),
        });
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: sheetIndexFolder.className,
                  query: {
                    ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: ECSql.createConcatenatedValueJsonSelector([
                          { type: "String", value: "[" },
                          await ECSql.createPrimitivePropertyValueSelectorProps({
                            schemaProvider: imodelAccess,
                            propertyClassName: sheetIndexFolder.className,
                            propertyClassAlias: "this",
                            propertyName: "EntryPriority",
                          }),
                          { type: "String", value: "]" },
                        ]),
                      },
                    })}
                    FROM ${sheetIndexFolder.className} AS this
                  `,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ imodel: imodelConnection, hierarchy }),
          expect: [{ node: (node) => expect(node.label).toBe(`[2]`) }],
        });
      });
      it("formats generic node labels", async () => {
        const hierarchy: HierarchyDefinition = {
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
          expect: [{ node: (node) => expect(node.label).toBe(`[124]`) }],
        });
      });
    });

    describe("Double", () => {
      it("formats instance node labels", async () => {
        const { imodelConnection, element } = await buildTestIModel(async (imodel) => {
          const model = insertPhysicalModelWithPartition({ imodel, codeValue: "model" });
          const category = insertSpatialCategory({ imodel, codeValue: "category" });
          // eslint-disable-next-line @typescript-eslint/no-shadow
          const element = insertPhysicalElement({
            imodel,
            modelId: model.id,
            categoryId: category.id,
            placement: { origin: { x: 1.23, y: 4.56, z: 7.89 }, angles: { yaw: 90.789 } },
          });
          return { model, category, element };
        });
        const imodelAccess = createIModelAccess(imodelConnection);

        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
            classHierarchyInspector: imodelAccess,
          }),
        });
        const hierarchy: HierarchyDefinition = {
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
                        selector: ECSql.createConcatenatedValueJsonSelector([
                          { type: "String", value: "[" },
                          await ECSql.createPrimitivePropertyValueSelectorProps({
                            schemaProvider: imodelAccess,
                            propertyClassName: element.className,
                            propertyClassAlias: "this",
                            propertyName: "Yaw",
                          }),
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
          provider: createProvider({ imodel: imodelConnection, hierarchy }),
          expect: [{ node: (node) => expect(node.label).toBe(`[90.79]`) }],
        });
      });

      it("formats generic node labels", async () => {
        const hierarchy: HierarchyDefinition = {
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
          expect: [{ node: (node) => expect(node.label).toBe(`[123.79]`) }],
        });
      });
    });

    describe("Point2d", () => {
      it("formats instance node labels", async () => {
        const { imodelConnection, element } = await buildTestIModel(async (imodel) => {
          const model = insertDrawingModelWithPartition({ imodel, codeValue: "model" });
          const category = insertDrawingCategory({ imodel, codeValue: "category" });
          // eslint-disable-next-line @typescript-eslint/no-shadow
          const element = insertDrawingGraphic({
            imodel,
            modelId: model.id,
            categoryId: category.id,
            placement: { origin: { x: 1.477, y: 2.588 }, angle: 0 },
          });
          return { model, category, element };
        });
        const imodelAccess = createIModelAccess(imodelConnection);

        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
            classHierarchyInspector: imodelAccess,
          }),
        });
        const hierarchy: HierarchyDefinition = {
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
                        selector: ECSql.createConcatenatedValueJsonSelector([
                          { type: "String", value: "[" },
                          await ECSql.createPrimitivePropertyValueSelectorProps({
                            schemaProvider: imodelAccess,
                            propertyClassName: element.className,
                            propertyClassAlias: "this",
                            propertyName: "Origin",
                          }),
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
          provider: createProvider({ imodel: imodelConnection, hierarchy }),
          expect: [{ node: (node) => expect(node.label).toBe(`[(1.48, 2.59)]`) }],
        });
      });

      it("formats generic node labels", async () => {
        const hierarchy: HierarchyDefinition = {
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
          expect: [{ node: (node) => expect(node.label).toBe(`[(1.48, 2.59)]`) }],
        });
      });
    });

    describe("Point3d", () => {
      it("formats instance node labels", async () => {
        const { imodelConnection, element } = await buildTestIModel(async (imodel) => {
          const model = insertPhysicalModelWithPartition({ imodel, codeValue: "model" });
          const category = insertSpatialCategory({ imodel, codeValue: "category" });
          // eslint-disable-next-line @typescript-eslint/no-shadow
          const element = insertPhysicalElement({
            imodel,
            modelId: model.id,
            categoryId: category.id,
            placement: { origin: { x: 1.234, y: 4.567, z: 7.89 }, angles: {} },
          });
          return { model, category, element };
        });
        const imodelAccess = createIModelAccess(imodelConnection);

        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
            classHierarchyInspector: imodelAccess,
          }),
        });
        const hierarchy: HierarchyDefinition = {
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
                        selector: ECSql.createConcatenatedValueJsonSelector([
                          { type: "String", value: "[" },
                          await ECSql.createPrimitivePropertyValueSelectorProps({
                            schemaProvider: imodelAccess,
                            propertyClassName: element.className,
                            propertyClassAlias: "this",
                            propertyName: "Origin",
                          }),
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
          provider: createProvider({ imodel: imodelConnection, hierarchy }),
          expect: [{ node: (node) => expect(node.label).toBe(`[(1.23, 4.57, 7.89)]`) }],
        });
      });

      it("formats generic node labels", async () => {
        const hierarchy: HierarchyDefinition = {
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
          expect: [{ node: (node) => expect(node.label).toBe(`[(1.48, 2.59, 3.70)]`) }],
        });
      });
    });

    describe("Guid", () => {
      it("formats instance node labels", async () => {
        const guid = Guid.createValue();
        const { imodelConnection, element } = await buildTestIModel(async (imodel) => {
          const model = insertPhysicalModelWithPartition({ imodel, codeValue: "model" });
          const category = insertSpatialCategory({ imodel, codeValue: "category" });
          // eslint-disable-next-line @typescript-eslint/no-shadow
          const element = insertPhysicalElement({
            imodel,
            modelId: model.id,
            categoryId: category.id,
            federationGuid: guid,
          });
          return { model, category, element };
        });
        const imodelAccess = createIModelAccess(imodelConnection);

        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
            classHierarchyInspector: imodelAccess,
          }),
        });
        const hierarchy: HierarchyDefinition = {
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
                        selector: ECSql.createConcatenatedValueJsonSelector([
                          { type: "String", value: "[" },
                          await ECSql.createPrimitivePropertyValueSelectorProps({
                            schemaProvider: imodelAccess,
                            propertyClassName: element.className,
                            propertyClassAlias: "this",
                            propertyName: "FederationGuid",
                          }),
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
          provider: createProvider({ imodel: imodelConnection, hierarchy }),
          expect: [{ node: (node) => expect(node.label).toBe(`[${guid}]`) }],
        });
      });
    });
  });

  describe("Changing formatter", () => {
    afterAll(() => {
      vi.restoreAllMocks();
    });

    it("reacts to changed formatter without running queries", async () => {
      const imodelAccess = createIModelAccess(emptyIModel);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
          classHierarchyInspector: imodelAccess,
        }),
      });
      const hierarchy: HierarchyDefinition = {
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
                      nodeLabel: { selector: `this.UserLabel` },
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

      const provider = createProvider({ imodel: emptyIModel, hierarchy, queryCacheSize: 10 });
      const queryReaderSpy = vi.spyOn(emptyIModel, "createQueryReader");
      await validateHierarchy({ provider, expect: [{ node: (node) => expect(node.label).toBe("") }] });
      expect(queryReaderSpy).toHaveBeenCalledOnce();
      queryReaderSpy.mockClear();
      provider.setFormatter(async () => "formatted");
      await validateHierarchy({ provider, expect: [{ node: (node) => expect(node.label).toBe("formatted") }] });
      expect(queryReaderSpy).not.toHaveBeenCalled();
    });
  });
});
