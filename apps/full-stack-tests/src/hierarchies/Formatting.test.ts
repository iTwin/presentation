/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, describe, expect, it, test, vi } from "vitest";
import { Guid, Id64 } from "@itwin/core-bentley";
import { createValueFormatter } from "@itwin/presentation-core-interop";
import { ECSql } from "@itwin/presentation-shared";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import { validateHierarchy } from "./HierarchyValidation.js";
import { createIModelAccess, createProvider } from "./Utils.js";

import type { HierarchyDefinition } from "@itwin/presentation-hierarchies";

describe("Hierarchies", () => {
  let suiteSetup!: Awaited<ReturnType<typeof setupSuite>>;

  async function setupSuite(fullTestName: string) {
    return buildTestECDb(fullTestName, async (builder, testName) => {
      const s = await importSchema(
        testName,
        builder,
        `
          <ECEntityClass typeName="X">
            <ECProperty propertyName="UserLabel" typeName="string" />
          </ECEntityClass>
        `,
      );
      builder.insertInstance(s.items.X.fullName, { userLabel: "" });
      return { schema: s };
    });
  }

  test.beforeAll(async (_, suite) => {
    await initialize();
    suiteSetup = await setupSuite(suite.fullTestName!);
  });

  afterAll(async () => {
    suiteSetup[Symbol.dispose]();
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
        provider: createProvider({ ecdb: suiteSetup.ecdb, hierarchy }),
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
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECSchemaReference name="Units" version="01.00.07" alias="u" />
              <ECSchemaReference name="Formats" version="01.00.00" alias="f" />
              <KindOfQuantity typeName="LENGTH" persistenceUnit="u:M" presentationUnits="f:DefaultRealU(1)[u:M];f:DefaultRealU(1)[u:FT];f:DefaultRealU(2)[u:US_SURVEY_FT];f:AmerFI" relativeError="0.0001" />
              <ECEntityClass typeName="ClassX">
                <ECProperty propertyName="PropX" typeName="double" kindOfQuantity="LENGTH" />
              </ECEntityClass>
            `,
          );
          const element = builder.insertInstance(s.items.ClassX.fullName, { propX: 123.456 });
          return { schema: s, element };
        });
        const { ecdb, schema } = setup;
        const ecdbAccess = createIModelAccess(ecdb);
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: schema.items.ClassX.fullName,
                  query: {
                    ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: ECSql.createConcatenatedValueJsonSelector([
                          { type: "String", value: "[" },
                          await ECSql.createPrimitivePropertyValueSelectorProps({
                            schemaProvider: ecdbAccess,
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
            ecdb,
            hierarchy,
            formatterFactory: (schemas) => createValueFormatter({ schemaContext: schemas, unitSystem: "metric" }),
          }),
          expect: [{ node: (node) => expect(node.label).toBe(`[123.5 m]`) }],
        });
        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy,
            formatterFactory: (schemas) => createValueFormatter({ schemaContext: schemas, unitSystem: "imperial" }),
          }),
          expect: [{ node: (node) => expect(node.label).toBe(`[405.0 ft]`) }],
        });
        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy,
            formatterFactory: (schemas) => createValueFormatter({ schemaContext: schemas, unitSystem: "usCustomary" }),
          }),
          expect: [{ node: (node) => expect(node.label).toBe(`[405.0 ft]`) }],
        });
        await validateHierarchy({
          provider: createProvider({
            ecdb,
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
          provider: createProvider({ ecdb: suiteSetup.ecdb, hierarchy }),
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
        const rawDateTimeValue = new Date();
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="LastMod" typeName="dateTime" />
              </ECEntityClass>
            `,
          );
          const x1 = builder.insertInstance(s.items.X.fullName, { lastMod: rawDateTimeValue });
          return { schema: s, x1 };
        });
        const { ecdb, schema } = setup;
        const ecdbAccess = createIModelAccess(ecdb);
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: ECSql.createConcatenatedValueJsonSelector([
                          { type: "String", value: "[" },
                          await ECSql.createPrimitivePropertyValueSelectorProps({
                            schemaProvider: ecdbAccess,
                            propertyClassName: schema.items.X.fullName,
                            propertyClassAlias: "this",
                            propertyName: "LastMod",
                          }),
                          { type: "String", value: "]" },
                        ]),
                      },
                    })}
                    FROM ${schema.items.X.fullName} AS this
                  `,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ ecdb, hierarchy }),
          expect: [
            {
              node: (node) => {
                const expectedLabel = `[${rawDateTimeValue.toLocaleString()}]`;
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
          provider: createProvider({ ecdb: suiteSetup.ecdb, hierarchy }),
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
          provider: createProvider({ ecdb: suiteSetup.ecdb, hierarchy }),
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
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="IsPrivate" typeName="boolean" />
              </ECEntityClass>
            `,
          );
          const x1 = builder.insertInstance(s.items.X.fullName, { isPrivate: false });
          const x2 = builder.insertInstance(s.items.X.fullName, { isPrivate: true });
          return { schema: s, x1, x2 };
        });
        const { ecdb, schema } = setup;
        const ecdbAccess = createIModelAccess(ecdb);
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: ECSql.createConcatenatedValueJsonSelector([
                          { type: "String", value: "[" },
                          await ECSql.createPrimitivePropertyValueSelectorProps({
                            schemaProvider: ecdbAccess,
                            propertyClassName: schema.items.X.fullName,
                            propertyClassAlias: "this",
                            propertyName: "IsPrivate",
                          }),
                          { type: "String", value: "]" },
                        ]),
                      },
                    })}
                    FROM ${schema.items.X.fullName} AS this
                  `,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ ecdb, hierarchy }),
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
          provider: createProvider({ ecdb: suiteSetup.ecdb, hierarchy }),
          expect: [{ node: (node) => expect(node.label).toBe(`true-false`) }],
        });
      });
    });

    describe("Integer", () => {
      it("formats instance node labels", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="EntryPriority" typeName="int" />
              </ECEntityClass>
            `,
          );
          const x1 = builder.insertInstance(s.items.X.fullName, { entryPriority: 2 });
          return { schema: s, x1 };
        });
        const { ecdb, schema } = setup;
        const ecdbAccess = createIModelAccess(ecdb);
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: ECSql.createConcatenatedValueJsonSelector([
                          { type: "String", value: "[" },
                          await ECSql.createPrimitivePropertyValueSelectorProps({
                            schemaProvider: ecdbAccess,
                            propertyClassName: schema.items.X.fullName,
                            propertyClassAlias: "this",
                            propertyName: "EntryPriority",
                          }),
                          { type: "String", value: "]" },
                        ]),
                      },
                    })}
                    FROM ${schema.items.X.fullName} AS this
                  `,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ ecdb, hierarchy }),
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
          provider: createProvider({ ecdb: suiteSetup.ecdb, hierarchy }),
          expect: [{ node: (node) => expect(node.label).toBe(`[124]`) }],
        });
      });
    });

    describe("Double", () => {
      it("formats instance node labels", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Yaw" typeName="double" />
              </ECEntityClass>
            `,
          );
          const x1 = builder.insertInstance(s.items.X.fullName, { yaw: 90.789 });
          return { schema: s, x1 };
        });
        const { ecdb, schema } = setup;
        const ecdbAccess = createIModelAccess(ecdb);
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: ECSql.createConcatenatedValueJsonSelector([
                          { type: "String", value: "[" },
                          await ECSql.createPrimitivePropertyValueSelectorProps({
                            schemaProvider: ecdbAccess,
                            propertyClassName: schema.items.X.fullName,
                            propertyClassAlias: "this",
                            propertyName: "Yaw",
                          }),
                          { type: "String", value: "]" },
                        ]),
                      },
                    })}
                    FROM ${schema.items.X.fullName} AS this
                  `,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ ecdb, hierarchy }),
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
          provider: createProvider({ ecdb: suiteSetup.ecdb, hierarchy }),
          expect: [{ node: (node) => expect(node.label).toBe(`[123.79]`) }],
        });
      });
    });

    describe("Point2d", () => {
      it("formats instance node labels", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Origin" typeName="point2d" />
              </ECEntityClass>
            `,
          );
          const x1 = builder.insertInstance(s.items.X.fullName, { origin: { x: 1.477, y: 2.588 } });
          return { schema: s, x1 };
        });
        const { ecdb, schema } = setup;
        const ecdbAccess = createIModelAccess(ecdb);
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: ECSql.createConcatenatedValueJsonSelector([
                          { type: "String", value: "[" },
                          await ECSql.createPrimitivePropertyValueSelectorProps({
                            schemaProvider: ecdbAccess,
                            propertyClassName: schema.items.X.fullName,
                            propertyClassAlias: "this",
                            propertyName: "Origin",
                          }),
                          { type: "String", value: "]" },
                        ]),
                      },
                    })}
                    FROM ${schema.items.X.fullName} AS this
                  `,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ ecdb, hierarchy }),
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
          provider: createProvider({ ecdb: suiteSetup.ecdb, hierarchy }),
          expect: [{ node: (node) => expect(node.label).toBe(`[(1.48, 2.59)]`) }],
        });
      });
    });

    describe("Point3d", () => {
      it("formats instance node labels", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Origin" typeName="point3d" />
              </ECEntityClass>
            `,
          );
          const x1 = builder.insertInstance(s.items.X.fullName, { origin: { x: 1.234, y: 4.567, z: 7.89 } });
          return { schema: s, x1 };
        });
        const { ecdb, schema } = setup;
        const ecdbAccess = createIModelAccess(ecdb);
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: ECSql.createConcatenatedValueJsonSelector([
                          { type: "String", value: "[" },
                          await ECSql.createPrimitivePropertyValueSelectorProps({
                            schemaProvider: ecdbAccess,
                            propertyClassName: schema.items.X.fullName,
                            propertyClassAlias: "this",
                            propertyName: "Origin",
                          }),
                          { type: "String", value: "]" },
                        ]),
                      },
                    })}
                    FROM ${schema.items.X.fullName} AS this
                  `,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ ecdb, hierarchy }),
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
          provider: createProvider({ ecdb: suiteSetup.ecdb, hierarchy }),
          expect: [{ node: (node) => expect(node.label).toBe(`[(1.48, 2.59, 3.70)]`) }],
        });
      });
    });

    describe("Guid", () => {
      it("formats instance node labels", async () => {
        const guid = Guid.createValue();
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="FederationGuid" typeName="string" />
              </ECEntityClass>
            `,
          );
          const x1 = builder.insertInstance(s.items.X.fullName, { federationGuid: guid });
          return { schema: s, x1 };
        });
        const { ecdb, schema } = setup;
        const ecdbAccess = createIModelAccess(ecdb);
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: {
                        selector: ECSql.createConcatenatedValueJsonSelector([
                          { type: "String", value: "[" },
                          await ECSql.createPrimitivePropertyValueSelectorProps({
                            schemaProvider: ecdbAccess,
                            propertyClassName: schema.items.X.fullName,
                            propertyClassAlias: "this",
                            propertyName: "FederationGuid",
                          }),
                          { type: "String", value: "]" },
                        ]),
                      },
                    })}
                    FROM ${schema.items.X.fullName} AS this
                  `,
                  },
                },
              ];
            }
            return [];
          },
        };
        await validateHierarchy({
          provider: createProvider({ ecdb, hierarchy }),
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
      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ parentNode, createSelectClause }) {
          if (!parentNode) {
            return [
              {
                fullClassName: suiteSetup.schema.items.X.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.UserLabel` },
                    })}
                    FROM ${suiteSetup.schema.items.X.fullName} AS this
                  `,
                },
              },
            ];
          }
          return [];
        },
      };

      const provider = createProvider({ ecdb: suiteSetup.ecdb, hierarchy, queryCacheSize: 10 });
      const queryReaderSpy = vi.spyOn(suiteSetup.ecdb, "createQueryReader");
      await validateHierarchy({ provider, expect: [{ node: (node) => expect(node.label).toBe("") }] });
      expect(queryReaderSpy).toHaveBeenCalledOnce();
      queryReaderSpy.mockClear();
      provider.setFormatter(async () => "formatted");
      await validateHierarchy({ provider, expect: [{ node: (node) => expect(node.label).toBe("formatted") }] });
      expect(queryReaderSpy).not.toHaveBeenCalled();
    });
  });
});
