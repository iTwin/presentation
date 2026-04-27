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
  describe("Hierarchy level filtering", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("filters root hierarchy level", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="X">
              <ECProperty propertyName="Prop" typeName="string" />
            </ECEntityClass>
          `,
        );
        const x1 = builder.insertInstance(s.items.X.fullName, { prop: "one" });
        const x2 = builder.insertInstance(s.items.X.fullName, { prop: "two" });
        return { schema: s, x1, x2 };
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
      const provider = createProvider({ ecdb, hierarchy });
      validateHierarchyLevel({
        nodes: await collect(provider.getNodes({ parentNode: undefined })),
        expect: [
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1] }),
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2] }),
        ],
      });
      validateHierarchyLevel({
        nodes: await collect(
          provider.getNodes({
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
        ),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1] })],
      });
    });

    it("filters child hierarchy level", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="X" />
            <ECEntityClass typeName="Y">
              <ECProperty propertyName="Prop" typeName="string" />
            </ECEntityClass>
          `,
        );
        const x = builder.insertInstance(s.items.X.fullName);
        const y1 = builder.insertInstance(s.items.Y.fullName, { prop: "one" });
        const y2 = builder.insertInstance(s.items.Y.fullName, { prop: "two" });
        return { schema: s, x, y1, y2 };
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
      const provider = createProvider({ ecdb, hierarchy });
      validateHierarchyLevel({
        nodes: await collect(
          provider.getNodes({
            parentNode: { key: { type: "instances", instanceKeys: [keys.x] }, parentKeys: [], label: "" },
          }),
        ),
        expect: [
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.y1] }),
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.y2] }),
        ],
      });
      validateHierarchyLevel({
        nodes: await collect(
          provider.getNodes({
            parentNode: { key: { type: "instances", instanceKeys: [keys.x] }, parentKeys: [], label: "" },
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
        ),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.y2] })],
      });
    });

    it("filters grouped hierarchy level", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="X" />
            <ECEntityClass typeName="Y">
              <ECProperty propertyName="Prop" typeName="string" />
            </ECEntityClass>
          `,
        );
        const x = builder.insertInstance(s.items.X.fullName);
        const y1 = builder.insertInstance(s.items.Y.fullName, { prop: "one" });
        const y2 = builder.insertInstance(s.items.Y.fullName, { prop: "two" });
        return { schema: s, x, y1, y2 };
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
                    nodeLabel: { selector: `CAST(this.ECInstanceId AS TEXT)` },
                    grouping: { byClass: true },
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
      const groupingNode = {
        key: { type: "class-grouping" as const, className: schema.items.Y.fullName },
        parentKeys: [{ type: "instances" as const, instanceKeys: [keys.x] }],
        nonGroupingAncestor: {
          key: { type: "instances" as const, instanceKeys: [keys.x] },
          parentKeys: [],
          label: "X",
        },
        label: "Y",
        groupedInstanceKeys: [keys.y1, keys.y2],
      };
      validateHierarchyLevel({
        nodes: await collect(provider.getNodes({ parentNode: groupingNode })),
        expect: [
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.y1] }),
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.y2] }),
        ],
      });
      validateHierarchyLevel({
        nodes: await collect(
          provider.getNodes({
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
        ),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.y2] })],
      });
    });

    it("filters by property class", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="X" />
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
          const subjectFilterClauses = await createFilterClauses({
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
      const provider = createProvider({ ecdb, hierarchy });
      validateHierarchyLevel({
        nodes: await collect(provider.getNodes({ parentNode: undefined })),
        expect: [
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.x] }),
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.y] }),
        ],
      });
      validateHierarchyLevel({
        nodes: await collect(
          provider.getNodes({
            parentNode: undefined,
            instanceFilter: {
              propertyClassNames: [schema.items.Y.fullName],
              relatedInstances: [],
              rules: { operator: "and", rules: [] },
            },
          }),
        ),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.y] })],
      });
    });

    it("filters by filter class", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="X" />
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
          const subjectFilterClauses = await createFilterClauses({
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
      const provider = createProvider({ ecdb, hierarchy });
      validateHierarchyLevel({
        nodes: await collect(provider.getNodes({ parentNode: undefined })),
        expect: [
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.x] }),
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.y] }),
        ],
      });
      validateHierarchyLevel({
        nodes: await collect(
          provider.getNodes({
            parentNode: undefined,
            instanceFilter: {
              propertyClassNames: [schema.items.X.fullName],
              filteredClassNames: [schema.items.Y.fullName],
              relatedInstances: [],
              rules: { operator: "and", rules: [] },
            },
          }),
        ),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.y] })],
      });
    });

    it("filters by direct property", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="X">
              <ECProperty propertyName="Prop" typeName="Int" />
            </ECEntityClass>
          `,
        );
        const x1 = builder.insertInstance(s.items.X.fullName, { prop: 123 });
        const x2 = builder.insertInstance(s.items.X.fullName, { prop: 456 });
        return { schema: s, x1, x2 };
      });
      const { ecdb, schema, ...keys } = setup;
      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ instanceFilter, createSelectClause, createFilterClauses }) {
          const subjectFilterClauses = await createFilterClauses({
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
      const provider = createProvider({ ecdb, hierarchy });
      validateHierarchyLevel({
        nodes: await collect(provider.getNodes({ parentNode: undefined })),
        expect: [
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1] }),
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2] }),
        ],
      });
      validateHierarchyLevel({
        nodes: await collect(
          provider.getNodes({
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
        ),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1] })],
      });
    });

    it("filters by related property", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
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
        const x1 = builder.insertInstance(s.items.X.fullName);
        const x2 = builder.insertInstance(s.items.X.fullName);
        const y1 = builder.insertInstance(s.items.Y.fullName, { prop: 123 });
        const y2 = builder.insertInstance(s.items.Y.fullName, { prop: 456 });
        builder.insertRelationship(s.items.XY.fullName, x1.id, y1.id);
        builder.insertRelationship(s.items.XY.fullName, x2.id, y2.id);
        return { schema: s, x1, x2 };
      });
      const { ecdb, schema, ...keys } = setup;
      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ instanceFilter, createSelectClause, createFilterClauses }) {
          const subjectFilterClauses = await createFilterClauses({
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
      const provider = createProvider({ ecdb, hierarchy });
      validateHierarchyLevel({
        nodes: await collect(provider.getNodes({ parentNode: undefined })),
        expect: [
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1] }),
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2] }),
        ],
      });
      validateHierarchyLevel({
        nodes: await collect(
          provider.getNodes({
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
        ),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1] })],
      });
    });
  });
});
