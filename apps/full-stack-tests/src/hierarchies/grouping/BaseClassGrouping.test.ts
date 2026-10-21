/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, it } from "vitest";
import { buildTestECDb } from "../../ECDbUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { importSchema } from "../../SchemaUtils.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { createProvider } from "../Utils.js";

import type { HierarchyDefinition } from "@itwin/presentation-hierarchies";

describe("Hierarchies", () => {
  describe("Base class grouping", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("doesn't create grouping nodes if provided classes aren't base for node class", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
          <ECEntityClass typeName="X">
            <ECProperty propertyName="Label" typeName="string" />
          </ECEntityClass>
          <ECEntityClass typeName="C" />
        `,
        );
        const x1 = builder.insertInstance(s.items.X.fullName, { label: "x1" });
        return { schema: s, x1 };
      });
      const { ecdb, schema, ...keys } = setup;

      const customHierarchy: HierarchyDefinition = {
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
                      nodeLabel: { selector: `this.Label` },
                      grouping: { byBaseClasses: { fullClassNames: [schema.items.C.fullName] } },
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
        provider: createProvider({ ecdb, hierarchy: customHierarchy }),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
      });
    });

    it("doesn't create grouping nodes if provided classes aren't of entity or relationship type", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
          <ECEntityClass typeName="M">
            <ECCustomAttributes>
              <IsMixin xmlns="CoreCustomAttributes.01.00.03">
                <AppliesToEntityClass>X</AppliesToEntityClass>
              </IsMixin>
            </ECCustomAttributes>
          </ECEntityClass>
          <ECEntityClass typeName="X">
            <BaseClass>M</BaseClass>
            <ECProperty propertyName="Label" typeName="string" />
          </ECEntityClass>
        `,
        );
        const x1 = builder.insertInstance(s.items.X.fullName, { label: "x1" });
        return { schema: s, x1 };
      });
      const { ecdb, schema, ...keys } = setup;

      const customHierarchy: HierarchyDefinition = {
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
                      nodeLabel: { selector: `this.Label` },
                      grouping: { byBaseClasses: { fullClassNames: [schema.items.M.fullName] } },
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
        provider: createProvider({ ecdb, hierarchy: customHierarchy }),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
      });
    });

    it("creates grouping nodes if provided class is base for node class", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
          <ECEntityClass typeName="B">
            <ECProperty propertyName="Label" typeName="string" />
          </ECEntityClass>
          <ECEntityClass typeName="X">
            <BaseClass>B</BaseClass>
          </ECEntityClass>
        `,
        );
        const x1 = builder.insertInstance(s.items.X.fullName, { label: "x1" });
        return { schema: s, x1 };
      });
      const { ecdb, schema, ...keys } = setup;

      const customHierarchy: HierarchyDefinition = {
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
                      nodeLabel: { selector: `this.Label` },
                      grouping: { byBaseClasses: { fullClassNames: [schema.items.B.fullName] } },
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
        provider: createProvider({ ecdb, hierarchy: customHierarchy }),
        expect: [
          NodeValidators.createForClassGroupingNode({
            className: schema.items.B.fullName,
            children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
          }),
        ],
      });
    });

    it("creates multiple grouping nodes if provided base classes are base for node and for provided other base class", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
          <ECEntityClass typeName="A" />
          <ECEntityClass typeName="B">
            <BaseClass>A</BaseClass>
          </ECEntityClass>
          <ECEntityClass typeName="C">
            <BaseClass>B</BaseClass>
          </ECEntityClass>
          <ECEntityClass typeName="Z">
            <BaseClass>C</BaseClass>
            <ECProperty propertyName="Label" typeName="string" />
          </ECEntityClass>
        `,
        );
        const z1 = builder.insertInstance(s.items.Z.fullName, { label: "z1" });
        return { schema: s, z1 };
      });
      const { ecdb, schema, ...keys } = setup;

      const customHierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ parentNode, createSelectClause }) {
          if (!parentNode) {
            return [
              {
                fullClassName: schema.items.Z.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.Label` },
                      grouping: {
                        byBaseClasses: {
                          fullClassNames: [schema.items.A.fullName, schema.items.B.fullName, schema.items.C.fullName],
                        },
                      },
                    })}
                    FROM ${schema.items.Z.fullName} AS this
                  `,
                },
              },
            ];
          }
          return [];
        },
      };

      await validateHierarchy({
        provider: createProvider({ ecdb, hierarchy: customHierarchy }),
        expect: [
          NodeValidators.createForClassGroupingNode({
            className: schema.items.A.fullName,
            children: [
              NodeValidators.createForClassGroupingNode({
                className: schema.items.B.fullName,
                children: [
                  NodeValidators.createForClassGroupingNode({
                    className: schema.items.C.fullName,
                    children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.z1], children: false })],
                  }),
                ],
              }),
            ],
          }),
        ],
      });
    });

    it("creates different grouping nodes if nodes of the same class have different base classes provided", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
          <ECEntityClass typeName="A" />
          <ECEntityClass typeName="B">
            <BaseClass>A</BaseClass>
          </ECEntityClass>
          <ECEntityClass typeName="C">
            <BaseClass>B</BaseClass>
          </ECEntityClass>
          <ECEntityClass typeName="Z">
            <BaseClass>C</BaseClass>
            <ECProperty propertyName="CodeValue" typeName="string" />
          </ECEntityClass>
        `,
        );
        const z1 = builder.insertInstance(s.items.Z.fullName, { codeValue: "z1" });
        const z2 = builder.insertInstance(s.items.Z.fullName, { codeValue: "z2" });
        return { schema: s, z1, z2 };
      });
      const { ecdb, schema, ...keys } = setup;

      const customHierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ parentNode, createSelectClause }) {
          if (!parentNode) {
            return [
              {
                fullClassName: schema.items.Z.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.CodeValue` },
                      grouping: {
                        byBaseClasses: {
                          fullClassNames: [schema.items.A.fullName, schema.items.B.fullName, schema.items.C.fullName],
                        },
                      },
                    })}
                    FROM ${schema.items.Z.fullName} AS this
                    WHERE this.CodeValue <> 'z2'
                  `,
                },
              },
              {
                fullClassName: schema.items.Z.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.CodeValue` },
                      grouping: {
                        byBaseClasses: { fullClassNames: [schema.items.B.fullName, schema.items.C.fullName] },
                      },
                    })}
                    FROM ${schema.items.Z.fullName} AS this
                    WHERE this.CodeValue = 'z2'
                  `,
                },
              },
            ];
          }
          return [];
        },
      };

      await validateHierarchy({
        provider: createProvider({ ecdb, hierarchy: customHierarchy }),
        expect: [
          NodeValidators.createForClassGroupingNode({
            className: schema.items.A.fullName,
            children: [
              NodeValidators.createForClassGroupingNode({
                className: schema.items.B.fullName,
                children: [
                  NodeValidators.createForClassGroupingNode({
                    className: schema.items.C.fullName,
                    children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.z1], children: false })],
                  }),
                ],
              }),
            ],
          }),
          NodeValidators.createForClassGroupingNode({
            className: schema.items.B.fullName,
            children: [
              NodeValidators.createForClassGroupingNode({
                className: schema.items.C.fullName,
                children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.z2], children: false })],
              }),
            ],
          }),
        ],
      });
    });

    it("groups nodes of different classes if they share the same base class", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
          <ECEntityClass typeName="E">
            <ECProperty propertyName="Label" typeName="string" />
          </ECEntityClass>
          <ECEntityClass typeName="S">
            <BaseClass>E</BaseClass>
          </ECEntityClass>
          <ECEntityClass typeName="P">
            <BaseClass>E</BaseClass>
          </ECEntityClass>
        `,
        );
        const s1 = builder.insertInstance(s.items.S.fullName, { label: "a s1" });
        const p1 = builder.insertInstance(s.items.P.fullName, { label: "b p1" });
        return { schema: s, s1, p1 };
      });
      const { ecdb, schema, ...keys } = setup;

      const customHierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ parentNode, createSelectClause }) {
          if (!parentNode) {
            return [
              {
                fullClassName: schema.items.S.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.Label` },
                      grouping: { byBaseClasses: { fullClassNames: [schema.items.E.fullName] } },
                    })}
                    FROM ${schema.items.S.fullName} AS this
                  `,
                },
              },
              {
                fullClassName: schema.items.P.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.Label` },
                      grouping: { byBaseClasses: { fullClassNames: [schema.items.E.fullName] } },
                    })}
                    FROM ${schema.items.P.fullName} AS this
                  `,
                },
              },
            ];
          }
          return [];
        },
      };

      await validateHierarchy({
        provider: createProvider({ ecdb, hierarchy: customHierarchy }),
        expect: [
          NodeValidators.createForClassGroupingNode({
            className: schema.items.E.fullName,
            children: [
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.s1], children: false }),
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.p1], children: false }),
            ],
          }),
        ],
      });
    });
  });
});
