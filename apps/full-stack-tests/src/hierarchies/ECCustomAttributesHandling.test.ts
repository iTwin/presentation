/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { createNodesQueryClauseFactory, HierarchyDefinition } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";
import { importSchema, withECDb } from "../IModelUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { NodeValidators, validateHierarchyLevel } from "./HierarchyValidation.js";
import { createIModelAccess, createProvider } from "./Utils.js";

describe("Hierarchies", () => {
  describe("EC custom attributes handling", () => {
    before(async () => {
      await initialize();
    });

    after(async () => {
      await terminate();
    });

    describe("HiddenClass", () => {
      it("loads nodes for instances of hidden class", async function () {
        await withECDb(
          this,
          async (db) => {
            const schema = await importSchema(
              this,
              db,
              `
                <ECEntityClass typeName="X">
                  <ECCustomAttributes>
                    <HiddenClass xmlns="CoreCustomAttributes.01.00.01" />
                  </ECCustomAttributes>
                </ECEntityClass>
              `,
            );
            const x = db.insertInstance(schema.items.X.fullName);
            return { schema, x };
          },
          async (imodel, { schema, x }) => {
            const imodelAccess = createIModelAccess(imodel);
            const selectQueryFactory = createNodesQueryClauseFactory({
              imodelAccess,
              instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
            });
            const hierarchy: HierarchyDefinition = {
              async defineHierarchyLevel({ instanceFilter }) {
                const filterClauses = await selectQueryFactory.createFilterClauses({
                  filter: instanceFilter,
                  contentClass: { fullName: schema.items.X.fullName, alias: "this" },
                });
                return [
                  {
                    fullClassName: schema.items.X.fullName,
                    query: {
                      ecsql: `
                        SELECT ${await selectQueryFactory.createSelectClause({
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
            const provider = createProvider({ imodel, hierarchy });
            validateHierarchyLevel({
              nodes: await collect(
                provider.getNodes({
                  parentNode: undefined,
                }),
              ),
              expect: [NodeValidators.createForInstanceNode({ instanceKeys: [x] })],
            });
          },
        );
      });

      it("loads nodes for instances of class with hidden base", async function () {
        await withECDb(
          this,
          async (db) => {
            const schema = await importSchema(
              this,
              db,
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
            const x = db.insertInstance(schema.items.X.fullName);
            const y = db.insertInstance(schema.items.Y.fullName);
            return { schema, x, y };
          },
          async (imodel, { schema, y }) => {
            const imodelAccess = createIModelAccess(imodel);
            const selectQueryFactory = createNodesQueryClauseFactory({
              imodelAccess,
              instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
            });
            const hierarchy: HierarchyDefinition = {
              async defineHierarchyLevel({ instanceFilter }) {
                const filterClauses = await selectQueryFactory.createFilterClauses({
                  filter: instanceFilter,
                  contentClass: { fullName: schema.items.Y.fullName, alias: "this" },
                });
                return [
                  {
                    fullClassName: schema.items.Y.fullName,
                    query: {
                      ecsql: `
                        SELECT ${await selectQueryFactory.createSelectClause({
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
            const provider = createProvider({ imodel, hierarchy });
            validateHierarchyLevel({
              nodes: await collect(
                provider.getNodes({
                  parentNode: undefined,
                }),
              ),
              expect: [NodeValidators.createForInstanceNode({ instanceKeys: [y] })],
            });
          },
        );
      });

      it("hides instances of hidden classes", async function () {
        await withECDb(
          this,
          async (db) => {
            const schema = await importSchema(
              this,
              db,
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
            const x = db.insertInstance(schema.items.X.fullName);
            const y = db.insertInstance(schema.items.Y.fullName);
            const z = db.insertInstance(schema.items.Z.fullName);
            const w = db.insertInstance(schema.items.W.fullName);
            return { schema, x, y, z, w };
          },
          async (imodel, { schema, x, z }) => {
            const imodelAccess = createIModelAccess(imodel);
            const selectQueryFactory = createNodesQueryClauseFactory({
              imodelAccess,
              instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
            });
            const hierarchy: HierarchyDefinition = {
              async defineHierarchyLevel({ instanceFilter }) {
                const filterClauses = await selectQueryFactory.createFilterClauses({
                  filter: instanceFilter,
                  contentClass: { fullName: schema.items.X.fullName, alias: "this" },
                });
                return [
                  {
                    fullClassName: schema.items.X.fullName,
                    query: {
                      ecsql: `
                        SELECT ${await selectQueryFactory.createSelectClause({
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
            const provider = createProvider({ imodel, hierarchy });
            validateHierarchyLevel({
              nodes: await collect(
                provider.getNodes({
                  parentNode: undefined,
                }),
              ),
              expect: [NodeValidators.createForInstanceNode({ instanceKeys: [x] }), NodeValidators.createForInstanceNode({ instanceKeys: [z] })],
            });
          },
        );
      });
    });

    describe("HiddenSchema", () => {
      it("loads nodes for instances of hidden schema classes", async function () {
        await withECDb(
          this,
          async (db) => {
            const schema = await importSchema(
              this,
              db,
              `
                <ECCustomAttributes>
                  <HiddenSchema xmlns="CoreCustomAttributes.01.00.01" />
                </ECCustomAttributes>
                <ECEntityClass typeName="X" />
              `,
            );
            const x = db.insertInstance(schema.items.X.fullName);
            return { schema, x };
          },
          async (imodel, { schema, x }) => {
            const imodelAccess = createIModelAccess(imodel);
            const selectQueryFactory = createNodesQueryClauseFactory({
              imodelAccess,
              instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
            });
            const hierarchy: HierarchyDefinition = {
              async defineHierarchyLevel({ instanceFilter }) {
                const filterClauses = await selectQueryFactory.createFilterClauses({
                  filter: instanceFilter,
                  contentClass: { fullName: schema.items.X.fullName, alias: "this" },
                });
                return [
                  {
                    fullClassName: schema.items.X.fullName,
                    query: {
                      ecsql: `
                        SELECT ${await selectQueryFactory.createSelectClause({
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
            const provider = createProvider({ imodel, hierarchy });
            validateHierarchyLevel({
              nodes: await collect(
                provider.getNodes({
                  parentNode: undefined,
                }),
              ),
              expect: [NodeValidators.createForInstanceNode({ instanceKeys: [x] })],
            });
          },
        );
      });

      it("loads nodes for instances of class whose base is in hidden schema", async function () {
        await withECDb(
          this,
          async (db) => {
            const hiddenSchema = await importSchema(
              `${this.test!.fullTitle()}_HiddenSchema`,
              db,
              `
                <ECCustomAttributes>
                  <HiddenSchema xmlns="CoreCustomAttributes.01.00.01" />
                </ECCustomAttributes>
                <ECEntityClass typeName="X" />
              `,
            );
            const schema = await importSchema(
              this,
              db,
              `
                <ECSchemaReference name="${hiddenSchema.schemaName}" version="01.00.00" alias="hs" />
                <ECEntityClass typeName="Y">
                  <BaseClass>hs:X</BaseClass>
                </ECEntityClass>
              `,
            );
            const x = db.insertInstance(hiddenSchema.items.X.fullName);
            const y = db.insertInstance(schema.items.Y.fullName);
            return { hiddenSchema, schema, x, y };
          },
          async (imodel, { schema, y }) => {
            const imodelAccess = createIModelAccess(imodel);
            const selectQueryFactory = createNodesQueryClauseFactory({
              imodelAccess,
              instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
            });
            const hierarchy: HierarchyDefinition = {
              async defineHierarchyLevel({ instanceFilter }) {
                const filterClauses = await selectQueryFactory.createFilterClauses({
                  filter: instanceFilter,
                  contentClass: { fullName: schema.items.Y.fullName, alias: "this" },
                });
                return [
                  {
                    fullClassName: schema.items.Y.fullName,
                    query: {
                      ecsql: `
                        SELECT ${await selectQueryFactory.createSelectClause({
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
            const provider = createProvider({ imodel, hierarchy });
            validateHierarchyLevel({
              nodes: await collect(
                provider.getNodes({
                  parentNode: undefined,
                }),
              ),
              expect: [NodeValidators.createForInstanceNode({ instanceKeys: [y] })],
            });
          },
        );
      });

      // https://github.com/iTwin/itwinjs-core/issues/8047
      it.skip("hides instances of hidden schema classes", async function () {
        await withECDb(
          this,
          async (db) => {
            const xSchema = await importSchema(
              `${this.test!.fullTitle()}_x`,
              db,
              `
                <ECEntityClass typeName="X" />
              `,
            );
            const ySchema = await importSchema(
              `${this.test!.fullTitle()}_y`,
              db,
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
              `${this.test!.fullTitle()}_z`,
              db,
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
              `${this.test!.fullTitle()}_w`,
              db,
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
            const x = db.insertInstance(xSchema.items.X.fullName);
            const y = db.insertInstance(ySchema.items.Y.fullName);
            const z = db.insertInstance(zSchema.items.Z.fullName);
            const w = db.insertInstance(wSchema.items.W.fullName);
            return { xSchema, ySchema, zSchema, wSchema, x, y, z, w };
          },
          async (imodel, { xSchema: schema, x, z }) => {
            const imodelAccess = createIModelAccess(imodel);
            const selectQueryFactory = createNodesQueryClauseFactory({
              imodelAccess,
              instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
            });
            const hierarchy: HierarchyDefinition = {
              async defineHierarchyLevel({ instanceFilter }) {
                const filterClauses = await selectQueryFactory.createFilterClauses({
                  filter: instanceFilter,
                  contentClass: { fullName: schema.items.X.fullName, alias: "this" },
                });
                return [
                  {
                    fullClassName: schema.items.X.fullName,
                    query: {
                      ecsql: `
                        SELECT ${await selectQueryFactory.createSelectClause({
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
            const provider = createProvider({ imodel, hierarchy });
            validateHierarchyLevel({
              nodes: await collect(
                provider.getNodes({
                  parentNode: undefined,
                }),
              ),
              expect: [NodeValidators.createForInstanceNode({ instanceKeys: [x] }), NodeValidators.createForInstanceNode({ instanceKeys: [z] })],
            });
          },
        );
      });
    });
  });
});
