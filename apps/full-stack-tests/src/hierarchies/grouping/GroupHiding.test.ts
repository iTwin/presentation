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

import type { DefineHierarchyLevelProps, HierarchyDefinition } from "@itwin/presentation-hierarchies";
import type { Props } from "@itwin/presentation-shared";

const SCHEMA_PROPS = { schemaName: "GroupHidingTest", schemaAlias: "ght" };
const SCHEMA_XML = `
  <ECEntityClass typeName="B">
    <ECProperty propertyName="CodeValue" typeName="string" />
    <ECProperty propertyName="UserLabel" typeName="string" />
  </ECEntityClass>
  <ECEntityClass typeName="X">
    <BaseClass>B</BaseClass>
  </ECEntityClass>
  <ECEntityClass typeName="Y">
    <ECProperty propertyName="CodeValue" typeName="string" />
    <ECProperty propertyName="UserLabel" typeName="string" />
  </ECEntityClass>
`;
const X_FULL_NAME = "GroupHidingTest.X";
const Y_FULL_NAME = "GroupHidingTest.Y";
const B_FULL_NAME = "GroupHidingTest.B";

describe("Hierarchies", () => {
  describe("Grouping nodes' hiding", () => {
    type ECSqlSelectClauseGroupingParams = NonNullable<
      Props<DefineHierarchyLevelProps["createSelectClause"]>["grouping"]
    >;

    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    function createHierarchyWithSpecifiedGrouping(
      specifiedGrouping: ECSqlSelectClauseGroupingParams,
      labelProperty?: string,
    ): HierarchyDefinition {
      return {
        async defineHierarchyLevel({ parentNode, createSelectClause }) {
          if (!parentNode) {
            return [
              {
                fullClassName: X_FULL_NAME,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.${labelProperty ?? "CodeValue"}` },
                      grouping: specifiedGrouping,
                    })}
                    FROM ${X_FULL_NAME} AS this
                  `,
                },
              },
              {
                fullClassName: Y_FULL_NAME,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.${labelProperty ?? "CodeValue"}` },
                      grouping: specifiedGrouping,
                    })}
                    FROM ${Y_FULL_NAME} AS this
                  `,
                },
              },
            ];
          }
          return [];
        },
      };
    }

    describe("Base class grouping", () => {
      const baseClassHideIfNoSiblingsGrouping: ECSqlSelectClauseGroupingParams = {
        byBaseClasses: { fullClassNames: [B_FULL_NAME], hideIfNoSiblings: true },
      };
      const baseClassHideIfOneGroupedNodeGrouping: ECSqlSelectClauseGroupingParams = {
        byBaseClasses: { fullClassNames: [B_FULL_NAME], hideIfOneGroupedNode: true },
      };

      it("hides base class groups when there're no siblings", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "A1" });
          const x2 = builder.insertInstance(X_FULL_NAME, { codeValue: "A2" });
          return { x1, x2 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(baseClassHideIfNoSiblingsGrouping),
          }),
          expect: [
            NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false }),
            NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false }),
          ],
        });
      });

      it("hides base class groups when there's only 1 grouped node", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "A1" });
          return { x1 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(baseClassHideIfOneGroupedNodeGrouping),
          }),
          expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
        });
      });

      it("doesn't hide base class groups when there are siblings", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "A1" });
          const y1 = builder.insertInstance(Y_FULL_NAME, { codeValue: "B1" });
          return { x1, y1 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(baseClassHideIfNoSiblingsGrouping),
          }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              className: B_FULL_NAME,
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
            }),
            NodeValidators.createForInstanceNode({ instanceKeys: [keys.y1], children: false }),
          ],
        });
      });

      it("doesn't hide base class groups when there's more than 1 grouped node", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "A1" });
          const x2 = builder.insertInstance(X_FULL_NAME, { codeValue: "A2" });
          return { x1, x2 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(baseClassHideIfOneGroupedNodeGrouping),
          }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              className: B_FULL_NAME,
              children: [
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false }),
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false }),
              ],
            }),
          ],
        });
      });
    });

    describe("Class grouping", () => {
      const classHideIfNoSiblingsGrouping: ECSqlSelectClauseGroupingParams = { byClass: { hideIfNoSiblings: true } };
      const classHideIfOneGroupedNodeGrouping: ECSqlSelectClauseGroupingParams = {
        byClass: { hideIfOneGroupedNode: true },
      };

      it("hides class groups when there're no siblings", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "A1" });
          const x2 = builder.insertInstance(X_FULL_NAME, { codeValue: "A2" });
          return { x1, x2 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(classHideIfNoSiblingsGrouping),
          }),
          expect: [
            NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false }),
            NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false }),
          ],
        });
      });

      it("hides class groups when there's only 1 grouped node", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "A1" });
          return { x1 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(classHideIfOneGroupedNodeGrouping),
          }),
          expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
        });
      });

      it("doesn't hide class groups when there are siblings", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "A1" });
          const y1 = builder.insertInstance(Y_FULL_NAME, { codeValue: "B1" });
          return { x1, y1 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(classHideIfNoSiblingsGrouping),
          }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              className: X_FULL_NAME,
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
            }),
            NodeValidators.createForClassGroupingNode({
              className: Y_FULL_NAME,
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.y1], children: false })],
            }),
          ],
        });
      });

      it("doesn't hide class groups when there's more than 1 grouped node", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "A1" });
          const x2 = builder.insertInstance(X_FULL_NAME, { codeValue: "A2" });
          return { x1, x2 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(classHideIfOneGroupedNodeGrouping),
          }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              className: X_FULL_NAME,
              children: [
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false }),
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false }),
              ],
            }),
          ],
        });
      });
    });

    describe("Label grouping", () => {
      const groupName = "test1";

      const labelHideIfOneGroupedNodeGrouping: ECSqlSelectClauseGroupingParams = {
        byLabel: { hideIfOneGroupedNode: true },
      };
      const labelHideIfNoSiblingsGrouping: ECSqlSelectClauseGroupingParams = { byLabel: { hideIfNoSiblings: true } };

      it("hides label groups when there're no siblings", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "A1", userLabel: groupName });
          const x2 = builder.insertInstance(X_FULL_NAME, { codeValue: "A2", userLabel: groupName });
          return { x1, x2 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(labelHideIfNoSiblingsGrouping, "UserLabel"),
          }),
          expect: [
            NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false }),
            NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false }),
          ],
        });
      });

      it("hides label groups when there's only 1 grouped node", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "A1", userLabel: groupName });
          return { x1 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(labelHideIfOneGroupedNodeGrouping, "UserLabel"),
          }),
          expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
        });
      });

      it("doesn't hide label groups when there are siblings", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "A1", userLabel: groupName });
          const x2 = builder.insertInstance(X_FULL_NAME, { codeValue: "A2", userLabel: "test2" });
          return { x1, x2 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(labelHideIfNoSiblingsGrouping, "UserLabel"),
          }),
          expect: [
            NodeValidators.createForLabelGroupingNode({
              label: groupName,
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
            }),
            NodeValidators.createForLabelGroupingNode({
              label: "test2",
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false })],
            }),
          ],
        });
      });

      it("doesn't hide label groups when there's more than 1 grouped node", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "A1", userLabel: groupName });
          const x2 = builder.insertInstance(X_FULL_NAME, { codeValue: "A2", userLabel: groupName });
          return { x1, x2 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(labelHideIfOneGroupedNodeGrouping, "userLabel"),
          }),
          expect: [
            NodeValidators.createForLabelGroupingNode({
              label: groupName,
              children: [
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false }),
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false }),
              ],
            }),
          ],
        });
      });
    });

    describe("Properties grouping", () => {
      const groupName = "test1";
      const propertiesHideIfNoSiblingsGrouping: ECSqlSelectClauseGroupingParams = {
        byProperties: {
          propertiesClassName: B_FULL_NAME,
          propertyGroups: [{ propertyName: "UserLabel", propertyClassAlias: "this" }],
          hideIfNoSiblings: true,
        },
      };
      const propertiesHideIfOneGroupedNodeGrouping: ECSqlSelectClauseGroupingParams = {
        byProperties: {
          propertiesClassName: B_FULL_NAME,
          propertyGroups: [{ propertyName: "UserLabel", propertyClassAlias: "this" }],
          hideIfOneGroupedNode: true,
        },
      };

      it("hides property groups when there're no siblings", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "A1", userLabel: groupName });
          const x2 = builder.insertInstance(X_FULL_NAME, { codeValue: "A2", userLabel: groupName });
          return { x1, x2 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(propertiesHideIfNoSiblingsGrouping),
          }),
          expect: [
            NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false }),
            NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false }),
          ],
        });
      });

      it("hides property groups when there's only 1 grouped node", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "A1", userLabel: groupName });
          return { x1 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(propertiesHideIfOneGroupedNodeGrouping),
          }),
          expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
        });
      });

      it("doesn't hide property groups when there are siblings", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "A1", userLabel: groupName });
          const x2 = builder.insertInstance(X_FULL_NAME, { codeValue: "A2", userLabel: `${groupName}2` });
          return { x1, x2 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(propertiesHideIfNoSiblingsGrouping),
          }),
          expect: [
            NodeValidators.createForPropertyValueGroupingNode({
              label: groupName,
              propertyClassName: B_FULL_NAME,
              formattedPropertyValue: groupName,
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
            }),
            NodeValidators.createForPropertyValueGroupingNode({
              label: `${groupName}2`,
              propertyClassName: B_FULL_NAME,
              formattedPropertyValue: `${groupName}2`,
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false })],
            }),
          ],
        });
      });

      it("doesn't hide base class groups when there's more than 1 grouped node", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "A1", userLabel: groupName });
          const x2 = builder.insertInstance(X_FULL_NAME, { codeValue: "A2", userLabel: groupName });
          return { x1, x2 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(propertiesHideIfOneGroupedNodeGrouping),
          }),
          expect: [
            NodeValidators.createForPropertyValueGroupingNode({
              label: groupName,
              propertyClassName: B_FULL_NAME,
              formattedPropertyValue: groupName,
              children: [
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false }),
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false }),
              ],
            }),
          ],
        });
      });
    });
  });
});
