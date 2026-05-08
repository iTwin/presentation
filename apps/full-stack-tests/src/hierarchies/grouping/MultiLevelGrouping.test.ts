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
  describe("Multi level grouping", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("groups by base class, class, property and label", async () => {
      const labelGroupName1 = "test1";
      const labelGroupName2 = "test2";
      const description1 = "test description1";
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="UserLabel" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <BaseClass>A</BaseClass>
            </ECEntityClass>
            <ECEntityClass typeName="X">
              <BaseClass>A</BaseClass>
              <ECProperty propertyName="Description" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="Y">
              <BaseClass>B</BaseClass>
            </ECEntityClass>
          `,
        );
        const x1 = builder.insertInstance(s.items.X.fullName, {
          userLabel: labelGroupName1,
          description: description1,
        });
        const x2 = builder.insertInstance(s.items.X.fullName, {
          userLabel: labelGroupName1,
          description: description1,
        });
        const y3 = builder.insertInstance(s.items.Y.fullName, { userLabel: labelGroupName1 });
        const y4 = builder.insertInstance(s.items.Y.fullName, { userLabel: labelGroupName2 });
        const y5 = builder.insertInstance(s.items.Y.fullName, { userLabel: labelGroupName2 });
        return { schema: s, x1, x2, y3, y4, y5 };
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
                      nodeLabel: { selector: `this.UserLabel` },
                      grouping: {
                        byClass: true,
                        byLabel: true,
                        byBaseClasses: { fullClassNames: [schema.items.A.fullName, schema.items.B.fullName] },
                        byProperties: {
                          propertiesClassName: schema.items.X.fullName,
                          propertyGroups: [
                            { propertyName: "Description", propertyClassAlias: "this" },
                            { propertyName: "UserLabel", propertyClassAlias: "this" },
                          ],
                        },
                      },
                    })}
                    FROM ${schema.items.X.fullName} AS this
                  `,
                },
              },
              {
                fullClassName: schema.items.Y.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.UserLabel` },
                      grouping: {
                        byClass: true,
                        byLabel: true,
                        byBaseClasses: { fullClassNames: [schema.items.A.fullName, schema.items.B.fullName] },
                      },
                    })}
                    FROM ${schema.items.Y.fullName} AS this
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
                    className: schema.items.Y.fullName,
                    children: [
                      NodeValidators.createForLabelGroupingNode({
                        label: labelGroupName1,
                        children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.y3], children: false })],
                      }),
                      NodeValidators.createForLabelGroupingNode({
                        label: labelGroupName2,
                        children: [
                          NodeValidators.createForInstanceNode({ instanceKeys: [keys.y5], children: false }),
                          NodeValidators.createForInstanceNode({ instanceKeys: [keys.y4], children: false }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              NodeValidators.createForClassGroupingNode({
                className: schema.items.X.fullName,
                children: [
                  NodeValidators.createForPropertyValueGroupingNode({
                    label: description1,
                    propertyClassName: schema.items.X.fullName,
                    formattedPropertyValue: description1,
                    propertyName: "Description",
                    children: [
                      NodeValidators.createForPropertyValueGroupingNode({
                        label: labelGroupName1,
                        propertyClassName: schema.items.X.fullName,
                        formattedPropertyValue: labelGroupName1,
                        propertyName: "UserLabel",
                        children: [
                          NodeValidators.createForLabelGroupingNode({
                            label: labelGroupName1,
                            children: [
                              NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false }),
                              NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });
    });
  });
});
