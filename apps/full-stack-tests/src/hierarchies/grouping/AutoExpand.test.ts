/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, describe, it, test } from "vitest";
import { buildTestECDb } from "../../ECDbUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { importSchema } from "../../SchemaUtils.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { createProvider } from "../Utils.js";

import type { DefineHierarchyLevelProps, HierarchyDefinition } from "@itwin/presentation-hierarchies";
import type { Props } from "@itwin/presentation-shared";

const SCHEMA_PROPS = { schemaName: "AutoExpandTest", schemaAlias: "aet" };
const SCHEMA_XML = `
  <ECEntityClass typeName="B">
    <ECProperty propertyName="CodeValue" typeName="string" />
    <ECProperty propertyName="UserLabel" typeName="string" />
  </ECEntityClass>
  <ECEntityClass typeName="X">
    <BaseClass>B</BaseClass>
  </ECEntityClass>
`;
const X_FULL_NAME = "AutoExpandTest.X";
const B_FULL_NAME = "AutoExpandTest.B";

describe("Hierarchies", () => {
  describe("Grouping nodes' autoExpand setting", () => {
    type ECSqlSelectClauseGroupingParams = NonNullable<
      Props<DefineHierarchyLevelProps["createSelectClause"]>["grouping"]
    >;
    let suiteSetup!: Awaited<ReturnType<typeof setupSuite>>;

    async function setupSuite(fullTestName: string) {
      return buildTestECDb(fullTestName, async (builder) => {
        await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
        const x0 = builder.insertInstance(X_FULL_NAME, { userLabel: "Test label" });
        return { x0 };
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
            ];
          }
          return [];
        },
      };
    }

    describe("Base class grouping", () => {
      const baseClassAutoExpandAlways: ECSqlSelectClauseGroupingParams = {
        byBaseClasses: { fullClassNames: [B_FULL_NAME], autoExpand: "always" },
      };
      const baseClassAutoExpandSingleChild: ECSqlSelectClauseGroupingParams = {
        byBaseClasses: { fullClassNames: [B_FULL_NAME], autoExpand: "single-child" },
      };

      it("grouping nodes' autoExpand option is true when some child has autoExpand set to 'always'", async () => {
        await validateHierarchy({
          provider: createProvider({
            ecdb: suiteSetup.ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(baseClassAutoExpandAlways),
          }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              className: B_FULL_NAME,
              autoExpand: true,
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [suiteSetup.x0], children: false })],
            }),
          ],
        });
      });

      it("grouping nodes' autoExpand option is true when it has one child with autoExpand set to 'single-child'", async () => {
        await validateHierarchy({
          provider: createProvider({
            ecdb: suiteSetup.ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(baseClassAutoExpandSingleChild),
          }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              className: B_FULL_NAME,
              autoExpand: true,
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [suiteSetup.x0], children: false })],
            }),
          ],
        });
      });

      it("grouping nodes' autoExpand option is undefined when none of the child nodes have autoExpand set to 'always'", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x0 = builder.insertInstance(X_FULL_NAME, { codeValue: "a" });
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "b" });
          const x2 = builder.insertInstance(X_FULL_NAME, { codeValue: "c" });
          return { x0, x1, x2 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(baseClassAutoExpandSingleChild),
          }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              className: B_FULL_NAME,
              autoExpand: false,
              children: [
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x0], children: false }),
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false }),
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false }),
              ],
            }),
          ],
        });
      });
    });

    describe("Class grouping", () => {
      const classAutoExpandAlways: ECSqlSelectClauseGroupingParams = { byClass: { autoExpand: "always" } };
      const classAutoExpandSingleChild: ECSqlSelectClauseGroupingParams = { byClass: { autoExpand: "single-child" } };

      it("grouping nodes' autoExpand option is true when some child has autoExpand set to 'always'", async () => {
        await validateHierarchy({
          provider: createProvider({
            ecdb: suiteSetup.ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(classAutoExpandAlways),
          }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              className: X_FULL_NAME,
              autoExpand: true,
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [suiteSetup.x0], children: false })],
            }),
          ],
        });
      });

      it("grouping nodes' autoExpand option is true when it has one child with autoExpand set to 'single-child'", async () => {
        await validateHierarchy({
          provider: createProvider({
            ecdb: suiteSetup.ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(classAutoExpandSingleChild),
          }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              className: X_FULL_NAME,
              autoExpand: true,
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [suiteSetup.x0], children: false })],
            }),
          ],
        });
      });

      it("grouping nodes' autoExpand option is undefined when none of the child nodes have autoExpand set to 'always'", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x0 = builder.insertInstance(X_FULL_NAME, { codeValue: "a" });
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "b" });
          const x2 = builder.insertInstance(X_FULL_NAME, { codeValue: "c" });
          return { x0, x1, x2 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(classAutoExpandSingleChild),
          }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              className: X_FULL_NAME,
              autoExpand: false,
              children: [
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x0], children: false }),
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false }),
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false }),
              ],
            }),
          ],
        });
      });
    });

    describe("Label grouping", () => {
      const labelAutoExpandAlways: ECSqlSelectClauseGroupingParams = { byLabel: { autoExpand: "always" } };
      const labelAutoExpandSingleChild: ECSqlSelectClauseGroupingParams = { byLabel: { autoExpand: "single-child" } };

      it("grouping nodes' autoExpand option is true when some child has autoExpand set to 'always'", async () => {
        await validateHierarchy({
          provider: createProvider({
            ecdb: suiteSetup.ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(labelAutoExpandAlways, "UserLabel"),
          }),
          expect: [
            NodeValidators.createForLabelGroupingNode({
              autoExpand: true,
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [suiteSetup.x0], children: false })],
            }),
          ],
        });
      });

      it("grouping nodes' autoExpand option is true when it has one child with autoExpand set to 'single-child'", async () => {
        await validateHierarchy({
          provider: createProvider({
            ecdb: suiteSetup.ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(labelAutoExpandSingleChild, "UserLabel"),
          }),
          expect: [
            NodeValidators.createForLabelGroupingNode({
              autoExpand: true,
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [suiteSetup.x0], children: false })],
            }),
          ],
        });
      });

      it("grouping nodes' autoExpand option is undefined when none of the child nodes have autoExpand set to 'always'", async () => {
        const groupName = "test1";
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x0 = builder.insertInstance(X_FULL_NAME, { userLabel: groupName });
          const x1 = builder.insertInstance(X_FULL_NAME, { userLabel: "test2" });
          const x2 = builder.insertInstance(X_FULL_NAME, { userLabel: groupName });
          return { x0, x1, x2 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(labelAutoExpandSingleChild, "UserLabel"),
          }),
          expect: [
            NodeValidators.createForLabelGroupingNode({
              label: groupName,
              autoExpand: false,
              childrenUnordered: [
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x0], children: false }),
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false }),
              ],
            }),
            NodeValidators.createForLabelGroupingNode({
              autoExpand: true,
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
            }),
          ],
        });
      });
    });

    describe("Properties grouping", () => {
      const propertiesAutoExpandAlways: ECSqlSelectClauseGroupingParams = {
        byProperties: {
          propertiesClassName: B_FULL_NAME,
          createGroupForUnspecifiedValues: true,
          propertyGroups: [{ propertyName: "UserLabel", propertyClassAlias: "this" }],
          autoExpand: "always",
        },
      };

      const propertiesAutoExpandSingleChild: ECSqlSelectClauseGroupingParams = {
        byProperties: {
          propertiesClassName: B_FULL_NAME,
          createGroupForUnspecifiedValues: true,
          propertyGroups: [{ propertyName: "UserLabel", propertyClassAlias: "this" }],
          autoExpand: "single-child",
        },
      };

      it("grouping nodes' autoExpand option is true when some child has autoExpand set to 'always'", async () => {
        await validateHierarchy({
          provider: createProvider({
            ecdb: suiteSetup.ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(propertiesAutoExpandAlways),
          }),
          expect: [
            NodeValidators.createForPropertyValueGroupingNode({
              autoExpand: true,
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [suiteSetup.x0], children: false })],
            }),
          ],
        });
      });

      it("grouping nodes' autoExpand option is true when it has one child with autoExpand set to 'single-child'", async () => {
        await validateHierarchy({
          provider: createProvider({
            ecdb: suiteSetup.ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(propertiesAutoExpandSingleChild),
          }),
          expect: [
            NodeValidators.createForPropertyValueGroupingNode({
              autoExpand: true,
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [suiteSetup.x0], children: false })],
            }),
          ],
        });
      });

      it("grouping nodes' autoExpand option is undefined when none of the child nodes have autoExpand set to 'always'", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x0 = builder.insertInstance(X_FULL_NAME);
          const x1 = builder.insertInstance(X_FULL_NAME);
          const x2 = builder.insertInstance(X_FULL_NAME);
          return { x0, x1, x2 };
        });
        const { ecdb, ...keys } = setup;

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(propertiesAutoExpandSingleChild, "ECInstanceId"),
          }),
          expect: [
            NodeValidators.createForPropertyValueGroupingNode({
              autoExpand: false,
              children: [
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x0], children: false }),
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
