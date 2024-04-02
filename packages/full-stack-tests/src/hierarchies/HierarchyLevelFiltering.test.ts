/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { GroupingHierarchyNode, IHierarchyLevelDefinitionsFactory, NodeSelectQueryFactory, ParentHierarchyNode } from "@itwin/presentation-hierarchies";
import { importSchema, withECDb } from "../IModelUtils";
import { initialize, terminate } from "../IntegrationTests";
import { NodeValidators, validateHierarchyLevel } from "./HierarchyValidation";
import { createMetadataProvider, createProvider } from "./Utils";

describe("Stateless hierarchy builder", () => {
  describe("Hierarchy level filtering", () => {
    before(async () => {
      await initialize();
    });

    after(async () => {
      await terminate();
    });

    it("filters root hierarchy level", async function () {
      await withECDb(
        this,
        async (db) => {
          const schema = importSchema(
            this,
            db,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Prop" typeName="string" />
              </ECEntityClass>
            `,
          );
          const x1 = db.insertInstance(schema.items.X.fullName, { prop: "one" });
          const x2 = db.insertInstance(schema.items.X.fullName, { prop: "two" });
          return { schema, x1, x2 };
        },
        async (imodel, { schema, x1, x2 }) => {
          const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
          const hierarchy: IHierarchyLevelDefinitionsFactory = {
            async defineHierarchyLevel({ instanceFilter }) {
              const filterClauses = await selectQueryFactory.createFilterClauses(instanceFilter, { fullName: schema.items.X.fullName, alias: "this" });
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.Prop` },
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
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [x1] }), NodeValidators.createForInstanceNode({ instanceKeys: [x2] })],
          });
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
              instanceFilter: {
                propertyClassNames: [schema.items.X.fullName],
                relatedInstances: [],
                rules: {
                  sourceAlias: "this",
                  propertyName: `Prop`,
                  operator: "is-equal",
                  propertyTypeName: "string",
                  value: { rawValue: `one`, displayValue: "one" },
                },
              },
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [x1] })],
          });
        },
      );
    });

    it("filters child hierarchy level", async function () {
      await withECDb(
        this,
        async (db) => {
          const schema = importSchema(
            this,
            db,
            `
              <ECEntityClass typeName="X" />
              <ECEntityClass typeName="Y">
                <ECProperty propertyName="Prop" typeName="string" />
              </ECEntityClass>
            `,
          );
          const x = db.insertInstance(schema.items.X.fullName);
          const y1 = db.insertInstance(schema.items.Y.fullName, { prop: "one" });
          const y2 = db.insertInstance(schema.items.Y.fullName, { prop: "two" });
          return { schema, x, y1, y2 };
        },
        async (imodel, { schema, x, y1, y2 }) => {
          const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
          const hierarchy: IHierarchyLevelDefinitionsFactory = {
            async defineHierarchyLevel({ instanceFilter }) {
              const filterClauses = await selectQueryFactory.createFilterClauses(instanceFilter, { fullName: schema.items.Y.fullName, alias: "this" });
              return [
                {
                  fullClassName: schema.items.Y.fullName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `CAST(this.ECInstanceId AS TEXT)` },
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
            nodes: await provider.getNodes({
              parentNode: {
                key: { type: "instances", instanceKeys: [x] },
                parentKeys: [],
                label: "",
              },
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [y1] }), NodeValidators.createForInstanceNode({ instanceKeys: [y2] })],
          });
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: {
                key: { type: "instances", instanceKeys: [x] },
                parentKeys: [],
                label: "",
              },
              instanceFilter: {
                propertyClassNames: [schema.items.Y.fullName],
                relatedInstances: [],
                rules: {
                  sourceAlias: "this",
                  propertyName: `Prop`,
                  operator: "is-equal",
                  propertyTypeName: "string",
                  value: { rawValue: `two`, displayValue: "two" },
                },
              },
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [y2] })],
          });
        },
      );
    });

    it("filters grouped hierarchy level", async function () {
      await withECDb(
        this,
        async (db) => {
          const schema = importSchema(
            this,
            db,
            `
              <ECEntityClass typeName="X" />
              <ECEntityClass typeName="Y">
                <ECProperty propertyName="Prop" typeName="string" />
              </ECEntityClass>
            `,
          );
          const x = db.insertInstance(schema.items.X.fullName);
          const y1 = db.insertInstance(schema.items.Y.fullName, { prop: "one" });
          const y2 = db.insertInstance(schema.items.Y.fullName, { prop: "two" });
          return { schema, x, y1, y2 };
        },
        async (imodel, { schema, x, y1, y2 }) => {
          const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
          const hierarchy: IHierarchyLevelDefinitionsFactory = {
            async defineHierarchyLevel({ instanceFilter }) {
              const filterClauses = await selectQueryFactory.createFilterClauses(instanceFilter, { fullName: schema.items.Y.fullName, alias: "this" });
              return [
                {
                  fullClassName: schema.items.Y.fullName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `CAST(this.ECInstanceId AS TEXT)` },
                        grouping: {
                          byClass: true,
                        },
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
          const groupingNode: ParentHierarchyNode<GroupingHierarchyNode> = {
            key: { type: "class-grouping", className: schema.items.Y.fullName },
            parentKeys: [{ type: "instances", instanceKeys: [x] }],
            nonGroupingAncestor: {
              key: { type: "instances", instanceKeys: [x] },
              parentKeys: [],
              label: "X",
            },
            label: "Y",
            groupedInstanceKeys: [y1, y2],
          };
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: groupingNode,
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [y1] }), NodeValidators.createForInstanceNode({ instanceKeys: [y2] })],
          });
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: groupingNode,
              instanceFilter: {
                propertyClassNames: [schema.items.Y.fullName],
                relatedInstances: [],
                rules: {
                  sourceAlias: "this",
                  propertyName: `Prop`,
                  operator: "is-equal",
                  propertyTypeName: "string",
                  value: { rawValue: `two`, displayValue: "two" },
                },
              },
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [y2] })],
          });
        },
      );
    });

    it("filters by property class", async function () {
      await withECDb(
        this,
        async (db) => {
          const schema = importSchema(
            this,
            db,
            `
              <ECEntityClass typeName="X" />
              <ECEntityClass typeName="Y">
                <BaseClass>X</BaseClass>
              </ECEntityClass>
            `,
          );
          const x = db.insertInstance(schema.items.X.fullName);
          const y = db.insertInstance(schema.items.Y.fullName);
          return { schema, x, y };
        },
        async (imodel, { schema, x, y }) => {
          const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
          const hierarchy: IHierarchyLevelDefinitionsFactory = {
            async defineHierarchyLevel({ instanceFilter }) {
              const subjectFilterClauses = await selectQueryFactory.createFilterClauses(instanceFilter, { fullName: schema.items.X.fullName, alias: "this" });
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `CAST(this.ECInstanceId AS TEXT)` },
                      })}
                      FROM ${subjectFilterClauses.from} AS this
                      ${subjectFilterClauses.joins}
                      ${subjectFilterClauses.where ? `WHERE ${subjectFilterClauses.where}` : ""}
                    `,
                  },
                },
              ];
            },
          };
          const provider = createProvider({ imodel, hierarchy });
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [x] }), NodeValidators.createForInstanceNode({ instanceKeys: [y] })],
          });
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
              instanceFilter: {
                propertyClassNames: [schema.items.Y.fullName],
                relatedInstances: [],
                rules: {
                  operator: "and",
                  rules: [],
                },
              },
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [y] })],
          });
        },
      );
    });

    it("filters by filter class", async function () {
      await withECDb(
        this,
        async (db) => {
          const schema = importSchema(
            this,
            db,
            `
              <ECEntityClass typeName="X" />
              <ECEntityClass typeName="Y">
                <BaseClass>X</BaseClass>
              </ECEntityClass>
            `,
          );
          const x = db.insertInstance(schema.items.X.fullName);
          const y = db.insertInstance(schema.items.Y.fullName);
          return { schema, x, y };
        },
        async (imodel, { schema, x, y }) => {
          const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
          const hierarchy: IHierarchyLevelDefinitionsFactory = {
            async defineHierarchyLevel({ instanceFilter }) {
              const subjectFilterClauses = await selectQueryFactory.createFilterClauses(instanceFilter, { fullName: schema.items.X.fullName, alias: "this" });
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `CAST(this.ECInstanceId AS TEXT)` },
                      })}
                      FROM ${subjectFilterClauses.from} AS this
                      ${subjectFilterClauses.joins}
                      ${subjectFilterClauses.where ? `WHERE ${subjectFilterClauses.where}` : ""}
                    `,
                  },
                },
              ];
            },
          };
          const provider = createProvider({ imodel, hierarchy });
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [x] }), NodeValidators.createForInstanceNode({ instanceKeys: [y] })],
          });
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
              instanceFilter: {
                propertyClassNames: [schema.items.X.fullName],
                filteredClassNames: [schema.items.Y.fullName],
                relatedInstances: [],
                rules: {
                  operator: "and",
                  rules: [],
                },
              },
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [y] })],
          });
        },
      );
    });

    it("filters by direct property", async function () {
      await withECDb(
        this,
        async (db) => {
          const schema = importSchema(
            this,
            db,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Prop" typeName="Int" />
              </ECEntityClass>
            `,
          );
          const x1 = db.insertInstance(schema.items.X.fullName, { prop: 123 });
          const x2 = db.insertInstance(schema.items.X.fullName, { prop: 456 });
          return { schema, x1, x2 };
        },
        async (imodel, { schema, x1, x2 }) => {
          const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
          const hierarchy: IHierarchyLevelDefinitionsFactory = {
            async defineHierarchyLevel({ instanceFilter }) {
              const subjectFilterClauses = await selectQueryFactory.createFilterClauses(instanceFilter, { fullName: schema.items.X.fullName, alias: "this" });
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `CAST(this.ECInstanceId AS TEXT)` },
                      })}
                      FROM ${subjectFilterClauses.from} AS this
                      ${subjectFilterClauses.joins}
                      ${subjectFilterClauses.where ? `WHERE ${subjectFilterClauses.where}` : ""}
                    `,
                  },
                },
              ];
            },
          };
          const provider = createProvider({ imodel, hierarchy });
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [x1] }), NodeValidators.createForInstanceNode({ instanceKeys: [x2] })],
          });
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
              instanceFilter: {
                propertyClassNames: [schema.items.X.fullName],
                relatedInstances: [],
                rules: {
                  sourceAlias: "this",
                  propertyName: "Prop",
                  operator: "less",
                  propertyTypeName: "int",
                  value: { rawValue: 200, displayValue: "200" },
                },
              },
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [x1] })],
          });
        },
      );
    });

    it("filters by related property", async function () {
      await withECDb(
        this,
        async (db) => {
          const schema = importSchema(
            this,
            db,
            `
              <ECEntityClass typeName="X" />
              <ECEntityClass typeName="Y">
                <ECProperty propertyName="Prop" typeName="Int" />
              </ECEntityClass>
              <ECRelationshipClass typeName="XY"  strength="referencing" strengthDirection="forward" modifier="None">
                  <Source multiplicity="(0..1)" roleLabel="xy" polymorphic="False">
                      <Class class="X" />
                  </Source>
                  <Target multiplicity="(0..1)" roleLabel="yx" polymorphic="True">
                      <Class class="Y" />
                  </Target>
              </ECRelationshipClass>
            `,
          );
          const x1 = db.insertInstance(schema.items.X.fullName);
          const x2 = db.insertInstance(schema.items.X.fullName);
          const y1 = db.insertInstance(schema.items.Y.fullName, { prop: 123 });
          const y2 = db.insertInstance(schema.items.Y.fullName, { prop: 456 });
          db.insertRelationship(schema.items.XY.fullName, x1.id, y1.id);
          db.insertRelationship(schema.items.XY.fullName, x2.id, y2.id);
          return { schema, x1, x2 };
        },
        async (imodel, { schema, x1, x2 }) => {
          const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
          const hierarchy: IHierarchyLevelDefinitionsFactory = {
            async defineHierarchyLevel({ instanceFilter }) {
              const subjectFilterClauses = await selectQueryFactory.createFilterClauses(instanceFilter, { fullName: schema.items.X.fullName, alias: "this" });
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `CAST(this.ECInstanceId AS TEXT)` },
                      })}
                      FROM ${subjectFilterClauses.from} AS this
                      ${subjectFilterClauses.joins}
                      ${subjectFilterClauses.where ? `WHERE ${subjectFilterClauses.where}` : ""}
                    `,
                  },
                },
              ];
            },
          };
          const provider = createProvider({ imodel, hierarchy });
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [x1] }), NodeValidators.createForInstanceNode({ instanceKeys: [x2] })],
          });
          validateHierarchyLevel({
            nodes: await provider.getNodes({
              parentNode: undefined,
              instanceFilter: {
                propertyClassNames: [schema.items.X.fullName],
                relatedInstances: [
                  {
                    path: [
                      {
                        sourceClassName: schema.items.X.fullName,
                        relationshipClassName: schema.items.XY.fullName,
                        targetClassName: schema.items.Y.fullName,
                        isForwardRelationship: true,
                      },
                    ],
                    alias: "related-y",
                  },
                ],
                rules: {
                  sourceAlias: "related-y",
                  propertyName: "Prop",
                  operator: "is-equal",
                  propertyTypeName: "int",
                  value: { rawValue: 123, displayValue: "123" },
                },
              },
            }),
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [x1] })],
          });
        },
      );
    });
  });
});
