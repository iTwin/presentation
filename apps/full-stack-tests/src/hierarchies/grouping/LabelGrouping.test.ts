/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, it } from "vitest";
import { HierarchyNode } from "@itwin/presentation-hierarchies";
import { buildTestECDb } from "../../ECDbUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { importSchema } from "../../SchemaUtils.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { createProvider } from "../Utils.js";

import type { HierarchyDefinition } from "@itwin/presentation-hierarchies";

const SCHEMA_XML = `
  <ECEntityClass typeName="X">
    <ECProperty propertyName="UserLabel" typeName="string" />
    <ECProperty propertyName="Description" typeName="string" />
    <ECProperty propertyName="CodeValue" typeName="string" />
    <ECProperty propertyName="ParentId" typeName="long" />
  </ECEntityClass>
`;

describe("Hierarchies", () => {
  beforeAll(async () => {
    await initialize();
  });

  afterAll(async () => {
    await terminate();
  });

  describe("Label grouping", () => {
    it("creates different groups for different labels", async () => {
      const labelGroupName1 = "test1";
      const labelGroupName2 = "test2";
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(testName, builder, SCHEMA_XML);
        const x1 = builder.insertInstance(s.items.X.fullName, { userLabel: labelGroupName1 });
        const x2 = builder.insertInstance(s.items.X.fullName, { userLabel: labelGroupName2 });
        const x3 = builder.insertInstance(s.items.X.fullName, { userLabel: labelGroupName1 });
        const x4 = builder.insertInstance(s.items.X.fullName, { userLabel: labelGroupName2 });
        return { schema: s, x1, x2, x3, x4 };
      });
      const { ecdb, schema, ...keys } = setup;

      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ createSelectClause, ...props }) {
          if (!props.parentNode) {
            return [
              {
                fullClassName: schema.items.X.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.UserLabel` },
                      grouping: { byLabel: true },
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
          NodeValidators.createForLabelGroupingNode({
            label: labelGroupName1,
            children: [
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.x3], children: false }),
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false }),
            ],
          }),
          NodeValidators.createForLabelGroupingNode({
            label: labelGroupName2,
            children: [
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.x4], children: false }),
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false }),
            ],
          }),
        ],
      });
    });

    it("creates different groups for same labels and different groupIds", async () => {
      const descriptionGroupName1 = "test1";
      const descriptionGroupName2 = "test2";
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(testName, builder, SCHEMA_XML);
        const x1 = builder.insertInstance(s.items.X.fullName, {
          userLabel: "test",
          description: descriptionGroupName1,
        });
        const x2 = builder.insertInstance(s.items.X.fullName, {
          userLabel: "test",
          description: descriptionGroupName2,
        });
        const x3 = builder.insertInstance(s.items.X.fullName, {
          userLabel: "test",
          description: descriptionGroupName1,
        });
        const x4 = builder.insertInstance(s.items.X.fullName, {
          userLabel: "test",
          description: descriptionGroupName2,
        });
        return { schema: s, x1, x2, x3, x4 };
      });
      const { ecdb, schema, ...keys } = setup;

      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ createSelectClause, ...props }) {
          if (!props.parentNode) {
            return [
              {
                fullClassName: schema.items.X.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.UserLabel` },
                      grouping: { byLabel: { groupId: { selector: `this.Description` } } },
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
          NodeValidators.createForLabelGroupingNode({
            label: "test",
            groupId: descriptionGroupName2,
            children: [
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.x4], children: false }),
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false }),
            ],
          }),
          NodeValidators.createForLabelGroupingNode({
            label: "test",
            groupId: descriptionGroupName1,
            children: [
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.x3], children: false }),
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false }),
            ],
          }),
        ],
      });
    });
  });

  describe("Label merging", () => {
    it("doesn't merge when different groupIds or labels are provided", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(testName, builder, SCHEMA_XML);
        const x1 = builder.insertInstance(s.items.X.fullName, { userLabel: "label1", description: "description1" });
        const x2 = builder.insertInstance(s.items.X.fullName, { userLabel: "label1", description: "description2" });
        const x3 = builder.insertInstance(s.items.X.fullName, { userLabel: "label2", description: "description1" });
        return { schema: s, x1, x2, x3 };
      });
      const { ecdb, schema, ...keys } = setup;

      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ createSelectClause, ...props }) {
          if (!props.parentNode) {
            return [
              {
                fullClassName: schema.items.X.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.UserLabel` },
                      grouping: { byLabel: { action: "merge", groupId: { selector: `this.Description` } } },
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
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false }),
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false }),
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.x3], children: false }),
        ],
      });
    });

    it("merges instance nodes with same merge id", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(testName, builder, SCHEMA_XML);
        const x1 = builder.insertInstance(s.items.X.fullName);
        const x2 = builder.insertInstance(s.items.X.fullName);
        return { schema: s, x1, x2 };
      });
      const { ecdb, schema, ...keys } = setup;

      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ createSelectClause, ...props }) {
          if (!props.parentNode) {
            return [
              {
                fullClassName: schema.items.X.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: "merge this",
                      grouping: { byLabel: { action: "merge", groupId: "merge" } },
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
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.x1, keys.x2],
            label: "merge this",
            children: false,
          }),
        ],
      });
    });

    it("merges instance nodes from different hidden parent hierarchy levels ", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(testName, builder, SCHEMA_XML);
        const visibleX1 = builder.insertInstance(s.items.X.fullName, { codeValue: "merged" });
        const hiddenX = builder.insertInstance(s.items.X.fullName, { codeValue: "hide" });
        const visibleX2 = builder.insertInstance(s.items.X.fullName, {
          codeValue: "merged",
          parentId: parseInt(hiddenX.id, 16),
        });
        return { schema: s, visibleX1, hiddenX, visibleX2 };
      });
      const { ecdb, schema, ...keys } = setup;

      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ createSelectClause, ...props }) {
          if (!props.parentNode) {
            return [
              {
                fullClassName: schema.items.X.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.CodeValue` },
                      grouping: { byLabel: { action: "merge", groupId: "merge" } },
                      hideNodeInHierarchy: { selector: `IIF(this.CodeValue = 'hide', 1, 0)` },
                    })}
                    FROM ${schema.items.X.fullName} AS this
                    WHERE this.ParentId IS NULL
                  `,
                },
              },
            ];
          }
          if (HierarchyNode.isInstancesNode(props.parentNode) && props.parentNode.label === "hide") {
            return [
              {
                fullClassName: schema.items.X.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.CodeValue` },
                      grouping: { byLabel: { action: "merge", groupId: "merge" } },
                    })}
                    FROM ${schema.items.X.fullName} AS this
                    WHERE this.ParentId = ?
                  `,
                  bindings: props.parentNode.key.instanceKeys.map((k) => ({ type: "id", value: k.id })),
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
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.visibleX1, keys.visibleX2],
            label: "merged",
            children: false,
          }),
        ],
      });
    });
  });
});
