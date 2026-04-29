/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { afterAll, beforeAll, describe, it } from "vitest";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import { NodeValidators, validateHierarchyLevel } from "./HierarchyValidation.js";
import { createProvider } from "./Utils.js";

import type { HierarchyDefinition } from "@itwin/presentation-hierarchies";

describe("Hierarchies", () => {
  describe("EC custom attributes handling", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    describe("HiddenClass", () => {
      it("loads nodes for instances of hidden class", async function () {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECCustomAttributes>
                  <HiddenClass xmlns="CoreCustomAttributes.01.00.01" />
                </ECCustomAttributes>
              </ECEntityClass>
            `,
          );
          const x = builder.insertInstance(s.items.X.fullName);
          return { schema: s, x };
        });
        const { ecdb, schema, ...keys } = setup;
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ instanceFilter, createSelectClause, createFilterClauses }) {
            const filterClauses = await createFilterClauses({
              filter: instanceFilter,
              contentClass: { fullName: schema.items.X.fullName, alias: "this" },
            });
            return [
              {
                fullClassName: schema.items.X.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: "x",
                    })}
                    FROM ${filterClauses.from} AS this
                    ${filterClauses.joins}
                    ${filterClauses.where ? `WHERE ${filterClauses.where}` : ""}
                  `,
                },
              },
            ];
          },
        };
        const provider = createProvider({ ecdb, hierarchy });
        validateHierarchyLevel({
          nodes: await collect(provider.getNodes({ parentNode: undefined })),
          expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x] })],
        });
      });

      it("loads nodes for instances of class with hidden base", async function () {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECCustomAttributes>
                  <HiddenClass xmlns="CoreCustomAttributes.01.00.01" />
                </ECCustomAttributes>
              </ECEntityClass>
              <ECEntityClass typeName="Y">
                <BaseClass>X</BaseClass>
              </ECEntityClass>
            `,
          );
          const x = builder.insertInstance(s.items.X.fullName);
          const y = builder.insertInstance(s.items.Y.fullName);
          return { schema: s, x, y };
        });
        const { ecdb, schema, ...keys } = setup;
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ instanceFilter, createSelectClause, createFilterClauses }) {
            const filterClauses = await createFilterClauses({
              filter: instanceFilter,
              contentClass: { fullName: schema.items.Y.fullName, alias: "this" },
            });
            return [
              {
                fullClassName: schema.items.Y.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: "y",
                    })}
                    FROM ${filterClauses.from} AS this
                    ${filterClauses.joins}
                    ${filterClauses.where ? `WHERE ${filterClauses.where}` : ""}
                  `,
                },
              },
            ];
          },
        };
        const provider = createProvider({ ecdb, hierarchy });
        validateHierarchyLevel({
          nodes: await collect(provider.getNodes({ parentNode: undefined })),
          expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.y] })],
        });
      });

      it("hides instances of hidden classes", async function () {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
              </ECEntityClass>
              <ECEntityClass typeName="Y">
                <BaseClass>X</BaseClass>
                <ECCustomAttributes>
                  <HiddenClass xmlns="CoreCustomAttributes.01.00.01" />
                </ECCustomAttributes>
              </ECEntityClass>
              <ECEntityClass typeName="Z">
                <BaseClass>Y</BaseClass>
                <ECCustomAttributes>
                  <HiddenClass xmlns="CoreCustomAttributes.01.00.01">
                    <Show>true</Show>
                  </HiddenClass>
                </ECCustomAttributes>
              </ECEntityClass>
              <ECEntityClass typeName="W">
                <BaseClass>Z</BaseClass>
                <ECCustomAttributes>
                  <HiddenClass xmlns="CoreCustomAttributes.01.00.01">
                    <Show>false</Show>
                  </HiddenClass>
                </ECCustomAttributes>
              </ECEntityClass>
            `,
          );
          const x = builder.insertInstance(s.items.X.fullName);
          const y = builder.insertInstance(s.items.Y.fullName);
          const z = builder.insertInstance(s.items.Z.fullName);
          const w = builder.insertInstance(s.items.W.fullName);
          return { schema: s, x, y, z, w };
        });
        const { ecdb, schema, ...keys } = setup;
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ instanceFilter, createSelectClause, createFilterClauses }) {
            const filterClauses = await createFilterClauses({
              filter: instanceFilter,
              contentClass: { fullName: schema.items.X.fullName, alias: "this" },
            });
            return [
              {
                fullClassName: schema.items.X.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `ec_classname(this.ECClassId, 'c')` },
                    })}
                    FROM ${filterClauses.from} AS this
                    ${filterClauses.joins}
                    ${filterClauses.where ? `WHERE ${filterClauses.where}` : ""}
                  `,
                },
              },
            ];
          },
        };
        const provider = createProvider({ ecdb, hierarchy });
        validateHierarchyLevel({
          nodes: await collect(provider.getNodes({ parentNode: undefined })),
          expect: [
            NodeValidators.createForInstanceNode({ instanceKeys: [keys.x] }),
            NodeValidators.createForInstanceNode({ instanceKeys: [keys.z] }),
          ],
        });
      });
    });

    describe("HiddenSchema", () => {
      it("loads nodes for instances of hidden schema classes", async function () {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECCustomAttributes>
                <HiddenSchema xmlns="CoreCustomAttributes.01.00.01" />
              </ECCustomAttributes>
              <ECEntityClass typeName="X" />
            `,
          );
          const x = builder.insertInstance(s.items.X.fullName);
          return { schema: s, x };
        });
        const { ecdb, schema, ...keys } = setup;
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ instanceFilter, createSelectClause, createFilterClauses }) {
            const filterClauses = await createFilterClauses({
              filter: instanceFilter,
              contentClass: { fullName: schema.items.X.fullName, alias: "this" },
            });
            return [
              {
                fullClassName: schema.items.X.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: "x",
                    })}
                    FROM ${filterClauses.from} AS this
                    ${filterClauses.joins}
                    ${filterClauses.where ? `WHERE ${filterClauses.where}` : ""}
                  `,
                },
              },
            ];
          },
        };
        const provider = createProvider({ ecdb, hierarchy });
        validateHierarchyLevel({
          nodes: await collect(provider.getNodes({ parentNode: undefined })),
          expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x] })],
        });
      });

      it("loads nodes for instances of class whose base is in hidden schema", async function () {
        using setup = await buildTestECDb(async (builder, testName) => {
          const hiddenSchema = await importSchema(
            `${testName}_HiddenSchema`,
            builder,
            `
              <ECCustomAttributes>
                <HiddenSchema xmlns="CoreCustomAttributes.01.00.01" />
              </ECCustomAttributes>
              <ECEntityClass typeName="X" />
            `,
          );
          const nonHiddenSchema = await importSchema(
            testName,
            builder,
            `
              <ECSchemaReference name="${hiddenSchema.schemaName}" version="01.00.00" alias="hs" />
              <ECEntityClass typeName="Y">
                <BaseClass>hs:X</BaseClass>
              </ECEntityClass>
            `,
          );
          const x = builder.insertInstance(hiddenSchema.items.X.fullName);
          const y = builder.insertInstance(nonHiddenSchema.items.Y.fullName);
          return { hiddenSchema, nonHiddenSchema, x, y };
        });
        const { ecdb, nonHiddenSchema: schema, ...keys } = setup;
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ instanceFilter, createSelectClause, createFilterClauses }) {
            const filterClauses = await createFilterClauses({
              filter: instanceFilter,
              contentClass: { fullName: schema.items.Y.fullName, alias: "this" },
            });
            return [
              {
                fullClassName: schema.items.Y.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: "y",
                    })}
                    FROM ${filterClauses.from} AS this
                    ${filterClauses.joins}
                    ${filterClauses.where ? `WHERE ${filterClauses.where}` : ""}
                  `,
                },
              },
            ];
          },
        };
        const provider = createProvider({ ecdb, hierarchy });
        validateHierarchyLevel({
          nodes: await collect(provider.getNodes({ parentNode: undefined })),
          expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.y] })],
        });
      });

      // https://github.com/iTwin/itwinjs-core/issues/8047
      it.skip("hides instances of hidden schema classes", async function () {
        using setup = await buildTestECDb(async (builder, testName) => {
          const xSchema = await importSchema(
            `${testName}_x`,
            builder,
            `
              <ECEntityClass typeName="X" />
            `,
          );
          const ySchema = await importSchema(
            `${testName}_y`,
            builder,
            `
              <ECSchemaReference name="${xSchema.schemaName}" version="01.00.00" alias="xSchema" />
              <ECCustomAttributes>
                <HiddenSchema xmlns="CoreCustomAttributes.01.00.01" />
              </ECCustomAttributes>
              <ECEntityClass typeName="Y">
                <BaseClass>xSchema:X</BaseClass>
              </ECEntityClass>
            `,
          );
          const zSchema = await importSchema(
            `${testName}_z`,
            builder,
            `
              <ECSchemaReference name="${ySchema.schemaName}" version="01.00.00" alias="ySchema" />
              <ECCustomAttributes>
                <HiddenSchema xmlns="CoreCustomAttributes.01.00.01">
                  <ShowClasses>true</ShowClasses>
                </HiddenSchema>
              </ECCustomAttributes>
              <ECEntityClass typeName="Z">
                <BaseClass>ySchema:Y</BaseClass>
              </ECEntityClass>
            `,
          );
          const wSchema = await importSchema(
            `${testName}_w`,
            builder,
            `
              <ECSchemaReference name="${zSchema.schemaName}" version="01.00.00" alias="zSchema" />
              <ECCustomAttributes>
                <HiddenSchema xmlns="CoreCustomAttributes.01.00.01">
                  <ShowClasses>false</ShowClasses>
                </HiddenSchema>
              </ECCustomAttributes>
              <ECEntityClass typeName="W">
                <BaseClass>zSchema:Z</BaseClass>
              </ECEntityClass>
            `,
          );
          const x = builder.insertInstance(xSchema.items.X.fullName);
          const y = builder.insertInstance(ySchema.items.Y.fullName);
          const z = builder.insertInstance(zSchema.items.Z.fullName);
          const w = builder.insertInstance(wSchema.items.W.fullName);
          return { xSchema, ySchema, zSchema, wSchema, x, y, z, w };
        });
        const { ecdb, xSchema: schema, ...keys } = setup;
        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ instanceFilter, createSelectClause, createFilterClauses }) {
            const filterClauses = await createFilterClauses({
              filter: instanceFilter,
              contentClass: { fullName: schema.items.X.fullName, alias: "this" },
            });
            return [
              {
                fullClassName: schema.items.X.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `ec_classname(this.ECClassId, 'c')` },
                    })}
                    FROM ${filterClauses.from} AS this
                    ${filterClauses.joins}
                    ${filterClauses.where ? `WHERE ${filterClauses.where}` : ""}
                  `,
                },
              },
            ];
          },
        };
        const provider = createProvider({ ecdb, hierarchy });
        validateHierarchyLevel({
          nodes: await collect(provider.getNodes({ parentNode: undefined })),
          expect: [
            NodeValidators.createForInstanceNode({ instanceKeys: [keys.x] }),
            NodeValidators.createForInstanceNode({ instanceKeys: [keys.z] }),
          ],
        });
      });
    });
  });
});
