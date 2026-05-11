/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, describe, it, test } from "vitest";
import { createIModelHierarchyProvider } from "@itwin/presentation-hierarchies";
import { createDefaultInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";
import { buildTestECDb } from "../../ECDbUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { importSchema } from "../../SchemaUtils.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { createIModelAccess, createProvider } from "../Utils.js";

import type { DefineHierarchyLevelProps, HierarchyDefinition } from "@itwin/presentation-hierarchies";
import type { Props } from "@itwin/presentation-shared";

const SCHEMA_PROPS = { schemaName: "PropGroupingTest", schemaAlias: "pgt" };
const SCHEMA_XML = `
  <ECEntityClass typeName="X">
    <ECProperty propertyName="UserLabel" typeName="string" />
    <ECProperty propertyName="Description" typeName="string" />
    <ECProperty propertyName="CodeValue" typeName="string" />
  </ECEntityClass>
  <ECEntityClass typeName="Y">
    <ECProperty propertyName="Description" typeName="string" />
  </ECEntityClass>
`;
const X_FULL_NAME = "PropGroupingTest.X";
const Y_FULL_NAME = "PropGroupingTest.Y";

describe("Hierarchies", () => {
  describe("Properties grouping", () => {
    type ECSqlSelectClausePropertiesGroupingParams = NonNullable<
      NonNullable<Props<DefineHierarchyLevelProps["createSelectClause"]>["grouping"]>["byProperties"]
    >;

    test.beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    function createHierarchyWithSpecifiedGrouping(
      specifiedGrouping: ECSqlSelectClausePropertiesGroupingParams,
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
                    nodeLabel: { selector: `this.UserLabel` },
                    grouping: { byProperties: specifiedGrouping },
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

    it("doesn't group if provided properties class isn't base of nodes class", async () => {
      using setup = await buildTestECDb(async (builder) => {
        await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
        const x1 = builder.insertInstance(X_FULL_NAME, { description: "Test description" });
        return { x1 };
      });
      const { ecdb, ...keys } = setup;

      const groupingParams: ECSqlSelectClausePropertiesGroupingParams = {
        propertiesClassName: Y_FULL_NAME,
        propertyGroups: [{ propertyName: "Description", propertyClassAlias: "this" }],
        createGroupForUnspecifiedValues: true,
      };
      await validateHierarchy({
        provider: createProvider({ ecdb, hierarchy: createHierarchyWithSpecifiedGrouping(groupingParams) }),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
      });
    });

    describe("unspecified values grouping", () => {
      it("doesn't create grouping nodes if provided property values are not defined and `createGroupForUnspecifiedValues` isn't set", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "A1" });
          return { x1 };
        });
        const { ecdb, ...keys } = setup;

        const groupingParams: ECSqlSelectClausePropertiesGroupingParams = {
          propertiesClassName: X_FULL_NAME,
          propertyGroups: [{ propertyName: "Description", propertyClassAlias: "this" }],
        };

        await validateHierarchy({
          provider: createProvider({ ecdb, hierarchy: createHierarchyWithSpecifiedGrouping(groupingParams) }),
          expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
        });
      });

      it("creates property value grouping node if provided property values are not defined and `createGroupForOutOfRangeValues` is `true`", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { codeValue: "A1" });
          return { x1 };
        });
        const { ecdb, ...keys } = setup;

        const groupingParams: ECSqlSelectClausePropertiesGroupingParams = {
          propertiesClassName: X_FULL_NAME,
          createGroupForUnspecifiedValues: true,
          propertyGroups: [{ propertyName: "Description", propertyClassAlias: "this" }],
        };

        await validateHierarchy({
          provider: createProvider({
            ecdb,
            hierarchy: createHierarchyWithSpecifiedGrouping(groupingParams),
            localizedStrings: { other: "", unspecified: "NOT SPECIFIED" },
          }),
          expect: [
            NodeValidators.createForPropertyValueGroupingNode({
              propertyClassName: X_FULL_NAME,
              propertyName: "Description",
              formattedPropertyValue: "",
              label: "NOT SPECIFIED",
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
            }),
          ],
        });
      });

      it("groups by navigation property", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="CodeValue" typeName="string" />
                <ECNavigationProperty propertyName="Parent" relationshipName="XX" direction="backward" />
              </ECEntityClass>
              <ECRelationshipClass typeName="XX" strength="referencing" strengthDirection="forward" modifier="None">
                <Source multiplicity="(0..1)" roleLabel="owns" polymorphic="false">
                  <Class class="X" />
                </Source>
                <Target multiplicity="(0..*)" roleLabel="owned by" polymorphic="false">
                  <Class class="X" />
                </Target>
              </ECRelationshipClass>
            `,
          );
          const x1 = builder.insertInstance(s.items.X.fullName);
          return { schema: s, x1 };
        });
        const { ecdb, schema, ...keys } = setup;

        const hierarchy: HierarchyDefinition = {
          async defineHierarchyLevel({ parentNode, createSelectClause }) {
            if (!parentNode) {
              return [
                {
                  fullClassName: schema.items.X.fullName,
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: "this.ECClassId" },
                        ecInstanceId: { selector: "this.ECInstanceId" },
                        nodeLabel: { selector: "this.CodeValue" },
                        grouping: {
                          byProperties: {
                            createGroupForUnspecifiedValues: true,
                            propertiesClassName: schema.items.X.fullName,
                            propertyGroups: [{ propertyClassAlias: "this", propertyName: "Parent" }],
                          },
                        },
                      })}
                      FROM ${schema.items.X.fullName} [this]
                    `,
                  },
                },
              ];
            }
            return [];
          },
        };

        await validateHierarchy({
          provider: createIModelHierarchyProvider({
            imodelAccess: createIModelAccess(ecdb),
            hierarchyDefinition: hierarchy,
            instanceLabelSelectClauseFactory: createDefaultInstanceLabelSelectClauseFactory(),
            localizedStrings: { other: "", unspecified: "NOT SPECIFIED" },
          }),
          expect: [
            NodeValidators.createForPropertyValueGroupingNode({
              label: "NOT SPECIFIED",
              propertyName: "Parent",
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
            }),
          ],
        });
      });
    });

    describe("value grouping", () => {
      it("creates property value grouping nodes", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { description: "Test description" });
          return { x1 };
        });
        const { ecdb, ...keys } = setup;

        const groupingParams: ECSqlSelectClausePropertiesGroupingParams = {
          propertiesClassName: X_FULL_NAME,
          propertyGroups: [{ propertyName: "Description", propertyClassAlias: "this" }],
        };

        await validateHierarchy({
          provider: createProvider({ ecdb, hierarchy: createHierarchyWithSpecifiedGrouping(groupingParams) }),
          expect: [
            NodeValidators.createForPropertyValueGroupingNode({
              label: "Test description",
              propertyClassName: X_FULL_NAME,
              propertyName: "Description",
              formattedPropertyValue: "Test description",
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
            }),
          ],
        });
      });

      it("creates multiple grouping nodes if nodes have different property values", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { userLabel: "Test1" });
          const x2 = builder.insertInstance(X_FULL_NAME, { userLabel: "Test2" });
          return { x1, x2 };
        });
        const { ecdb, ...keys } = setup;

        const customHierarchy: HierarchyDefinition = {
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
                        nodeLabel: { selector: `this.UserLabel` },
                        grouping: {
                          byProperties: {
                            propertiesClassName: X_FULL_NAME,
                            propertyGroups: [{ propertyName: "UserLabel", propertyClassAlias: "this" }],
                          },
                        },
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

        await validateHierarchy({
          provider: createProvider({ ecdb, hierarchy: customHierarchy }),
          expect: [
            NodeValidators.createForPropertyValueGroupingNode({
              label: "Test1",
              propertyClassName: X_FULL_NAME,
              propertyName: "UserLabel",
              formattedPropertyValue: "Test1",
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
            }),
            NodeValidators.createForPropertyValueGroupingNode({
              label: "Test2",
              propertyClassName: X_FULL_NAME,
              propertyName: "UserLabel",
              formattedPropertyValue: "Test2",
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false })],
            }),
          ],
        });
      });

      it("creates multiple levels of grouping if node has multiple property groupings", async () => {
        using setup = await buildTestECDb(async (builder) => {
          await importSchema(SCHEMA_PROPS, builder, SCHEMA_XML);
          const x1 = builder.insertInstance(X_FULL_NAME, { userLabel: "Test label", description: "Test description" });
          return { x1 };
        });
        const { ecdb, ...keys } = setup;
        const groupingParams: ECSqlSelectClausePropertiesGroupingParams = {
          propertiesClassName: X_FULL_NAME,
          propertyGroups: [
            { propertyName: "UserLabel", propertyClassAlias: "this" },
            { propertyName: "Description", propertyClassAlias: "this" },
          ],
        };

        await validateHierarchy({
          provider: createProvider({ ecdb, hierarchy: createHierarchyWithSpecifiedGrouping(groupingParams) }),
          expect: [
            NodeValidators.createForPropertyValueGroupingNode({
              label: "Test label",
              propertyClassName: X_FULL_NAME,
              propertyName: "UserLabel",
              formattedPropertyValue: "Test label",
              children: [
                NodeValidators.createForPropertyValueGroupingNode({
                  label: "Test description",
                  propertyClassName: X_FULL_NAME,
                  propertyName: "Description",
                  formattedPropertyValue: "Test description",
                  children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
                }),
              ],
            }),
          ],
        });
      });

      describe("navigation property", () => {
        const labelSelectClauseFactory = {
          createSelectClause: async ({ classAlias }: { classAlias: string }) => `${classAlias}.UserLabel`,
        };

        it("groups by navigation property with forward direction", async () => {
          using setup = await buildTestECDb(async (builder, testName) => {
            const s = await importSchema(
              testName,
              builder,
              `
                <ECEntityClass typeName="C">
                  <ECProperty propertyName="UserLabel" typeName="string" />
                </ECEntityClass>
                <ECEntityClass typeName="X">
                  <ECProperty propertyName="CodeValue" typeName="string" />
                  <ECNavigationProperty propertyName="Category" relationshipName="XC" direction="forward" />
                </ECEntityClass>
                <ECRelationshipClass typeName="XC" strength="referencing" strengthDirection="forward" modifier="None">
                  <Source multiplicity="(0..*)" roleLabel="belongs to" polymorphic="false">
                    <Class class="X" />
                  </Source>
                  <Target multiplicity="(0..1)" roleLabel="is category for" polymorphic="false">
                    <Class class="C" />
                  </Target>
                </ECRelationshipClass>
              `,
            );
            const c1 = builder.insertInstance(s.items.C.fullName, { userLabel: "c 1" });
            const x1 = builder.insertInstance(s.items.X.fullName, { codeValue: "x 1", "Category.Id": c1.id });
            return { schema: s, x1 };
          });
          const { ecdb, schema, ...keys } = setup;

          const provider = createIModelHierarchyProvider({
            imodelAccess: createIModelAccess(ecdb),
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode, createSelectClause }) =>
                parentNode
                  ? []
                  : [
                      {
                        fullClassName: schema.items.X.fullName,
                        query: {
                          ecsql: `
                            SELECT ${await createSelectClause({
                              ecClassId: { selector: "this.ECClassId" },
                              ecInstanceId: { selector: "this.ECInstanceId" },
                              nodeLabel: { selector: "this.CodeValue" },
                              grouping: {
                                byProperties: {
                                  propertiesClassName: schema.items.X.fullName,
                                  propertyGroups: [{ propertyName: "Category", propertyClassAlias: "this" }],
                                },
                              },
                            })}
                            FROM ${schema.items.X.fullName} [this]
                          `,
                        },
                      },
                    ],
            },
            instanceLabelSelectClauseFactory: labelSelectClauseFactory,
          });

          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForPropertyValueGroupingNode({
                propertyClassName: schema.items.X.fullName,
                propertyName: "Category",
                label: "c 1",
                children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1], children: false })],
              }),
            ],
          });
        });

        it("groups by navigation property with backward direction", async () => {
          using setup = await buildTestECDb(async (builder, testName) => {
            const s = await importSchema(
              testName,
              builder,
              `
                <ECEntityClass typeName="X">
                  <ECProperty propertyName="UserLabel" typeName="string" />
                  <ECProperty propertyName="CodeValue" typeName="string" />
                  <ECNavigationProperty propertyName="Parent" relationshipName="XX" direction="backward" />
                </ECEntityClass>
                <ECRelationshipClass typeName="XX" strength="referencing" strengthDirection="forward" modifier="None">
                  <Source multiplicity="(0..1)" roleLabel="owns" polymorphic="false">
                    <Class class="X" />
                  </Source>
                  <Target multiplicity="(0..*)" roleLabel="owned by" polymorphic="false">
                    <Class class="X" />
                  </Target>
                </ECRelationshipClass>
              `,
            );
            const x1 = builder.insertInstance(s.items.X.fullName, { codeValue: "A1", userLabel: "x 1" });
            const x2 = builder.insertInstance(s.items.X.fullName, { codeValue: "A2", "Parent.Id": x1.id });
            return { schema: s, x1, x2 };
          });
          const { ecdb, schema, ...keys } = setup;

          const provider = createIModelHierarchyProvider({
            imodelAccess: createIModelAccess(ecdb),
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode, createSelectClause }) =>
                parentNode
                  ? []
                  : [
                      {
                        fullClassName: schema.items.X.fullName,
                        query: {
                          ecsql: `
                            SELECT ${await createSelectClause({
                              ecClassId: { selector: "this.ECClassId" },
                              ecInstanceId: { selector: "this.ECInstanceId" },
                              nodeLabel: { selector: "this.CodeValue" },
                              grouping: {
                                byProperties: {
                                  propertiesClassName: schema.items.X.fullName,
                                  propertyGroups: [{ propertyName: "Parent", propertyClassAlias: "this" }],
                                },
                              },
                            })}
                            FROM ${schema.items.X.fullName} [this]
                            WHERE [this].[Parent].[Id] = ${keys.x1.id}
                          `,
                        },
                      },
                    ],
            },
            instanceLabelSelectClauseFactory: labelSelectClauseFactory,
          });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForPropertyValueGroupingNode({
                propertyClassName: schema.items.X.fullName,
                propertyName: "Parent",
                label: "x 1",
                children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false })],
              }),
            ],
          });
        });

        it("creates one grouping node when navigation properties point to different nodes with same labels", async () => {
          using setup = await buildTestECDb(async (builder, testName) => {
            const s = await importSchema(
              testName,
              builder,
              `
                <ECEntityClass typeName="X">
                  <ECProperty propertyName="UserLabel" typeName="string" />
                  <ECProperty propertyName="CodeValue" typeName="string" />
                  <ECNavigationProperty propertyName="Parent" relationshipName="XX" direction="backward" />
                </ECEntityClass>
                <ECRelationshipClass typeName="XX" strength="referencing" strengthDirection="forward" modifier="None">
                  <Source multiplicity="(0..1)" roleLabel="owns" polymorphic="false">
                    <Class class="X" />
                  </Source>
                  <Target multiplicity="(0..*)" roleLabel="owned by" polymorphic="false">
                    <Class class="X" />
                  </Target>
                </ECRelationshipClass>
              `,
            );
            const x1 = builder.insertInstance(s.items.X.fullName, { codeValue: "A1", userLabel: "sameLabel" });
            const x2 = builder.insertInstance(s.items.X.fullName, { codeValue: "A2", "Parent.Id": x1.id });
            const x3 = builder.insertInstance(s.items.X.fullName, { codeValue: "A3", userLabel: "sameLabel" });
            const x4 = builder.insertInstance(s.items.X.fullName, { codeValue: "A4", "Parent.Id": x3.id });
            return { schema: s, x1, x2, x3, x4 };
          });
          const { ecdb, schema, ...keys } = setup;

          const provider = createIModelHierarchyProvider({
            imodelAccess: createIModelAccess(ecdb),
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode, createSelectClause }) =>
                parentNode
                  ? []
                  : [
                      {
                        fullClassName: schema.items.X.fullName,
                        query: {
                          ecsql: `
                            SELECT ${await createSelectClause({
                              ecClassId: { selector: "this.ECClassId" },
                              ecInstanceId: { selector: "this.ECInstanceId" },
                              nodeLabel: { selector: "this.CodeValue" },
                              grouping: {
                                byProperties: {
                                  propertiesClassName: schema.items.X.fullName,
                                  propertyGroups: [{ propertyName: "Parent", propertyClassAlias: "this" }],
                                },
                              },
                            })}
                            FROM ${schema.items.X.fullName} [this]
                            WHERE [this].[Parent].[Id] IS NOT NULL
                          `,
                        },
                      },
                    ],
            },
            instanceLabelSelectClauseFactory: labelSelectClauseFactory,
          });

          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForPropertyValueGroupingNode({
                propertyClassName: schema.items.X.fullName,
                propertyName: "Parent",
                label: "sameLabel",
                children: [
                  NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false }),
                  NodeValidators.createForInstanceNode({ instanceKeys: [keys.x4], children: false }),
                ],
              }),
            ],
          });
        });

        it("creates different grouping nodes when navigation properties point to different nodes with different labels", async () => {
          using setup = await buildTestECDb(async (builder, testName) => {
            const s = await importSchema(
              testName,
              builder,
              `
                <ECEntityClass typeName="X">
                  <ECProperty propertyName="UserLabel" typeName="string" />
                  <ECProperty propertyName="CodeValue" typeName="string" />
                  <ECNavigationProperty propertyName="Parent" relationshipName="XX" direction="backward" />
                </ECEntityClass>
                <ECRelationshipClass typeName="XX" strength="referencing" strengthDirection="forward" modifier="None">
                  <Source multiplicity="(0..1)" roleLabel="owns" polymorphic="false">
                    <Class class="X" />
                  </Source>
                  <Target multiplicity="(0..*)" roleLabel="owned by" polymorphic="false">
                    <Class class="X" />
                  </Target>
                </ECRelationshipClass>
              `,
            );
            const x1 = builder.insertInstance(s.items.X.fullName, { codeValue: "A1", userLabel: "differentLabel1" });
            const x2 = builder.insertInstance(s.items.X.fullName, { codeValue: "A2", "Parent.Id": x1.id });
            const x3 = builder.insertInstance(s.items.X.fullName, { codeValue: "A3", userLabel: "differentLabel2" });
            const x4 = builder.insertInstance(s.items.X.fullName, { codeValue: "A4", "Parent.Id": x3.id });
            return { schema: s, x1, x2, x3, x4 };
          });
          const { ecdb, schema, ...keys } = setup;

          const provider = createIModelHierarchyProvider({
            imodelAccess: createIModelAccess(ecdb),
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode, createSelectClause }) =>
                parentNode
                  ? []
                  : [
                      {
                        fullClassName: schema.items.X.fullName,
                        query: {
                          ecsql: `
                            SELECT ${await createSelectClause({
                              ecClassId: { selector: "this.ECClassId" },
                              ecInstanceId: { selector: "this.ECInstanceId" },
                              nodeLabel: { selector: "this.CodeValue" },
                              grouping: {
                                byProperties: {
                                  propertiesClassName: schema.items.X.fullName,
                                  propertyGroups: [{ propertyName: "Parent", propertyClassAlias: "this" }],
                                },
                              },
                            })}
                            FROM ${schema.items.X.fullName} [this]
                            WHERE [this].[Parent].[Id] IS NOT NULL
                          `,
                        },
                      },
                    ],
            },
            instanceLabelSelectClauseFactory: labelSelectClauseFactory,
          });

          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForPropertyValueGroupingNode({
                propertyClassName: schema.items.X.fullName,
                propertyName: "Parent",
                label: "differentLabel1",
                children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2], children: false })],
              }),
              NodeValidators.createForPropertyValueGroupingNode({
                propertyClassName: schema.items.X.fullName,
                propertyName: "Parent",
                label: "differentLabel2",
                children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x4], children: false })],
              }),
            ],
          });
        });
      });
    });

    describe("range grouping", () => {
      it("creates property value range grouping nodes", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
                <ECEntityClass typeName="X">
                  <ECProperty propertyName="Label" typeName="string" />
                  <ECProperty propertyName="Prop" typeName="int" />
                </ECEntityClass>
              `,
          );
          const x1 = builder.insertInstance(s.items.X.fullName, { label: "one", prop: 1.5 });
          const x2 = builder.insertInstance(s.items.X.fullName, { label: "two", prop: 3 });
          return { schema: s, x1, x2 };
        });
        const { ecdb, schema, ...keys } = setup;
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
                        nodeLabel: { selector: `this.Label` },
                        grouping: {
                          byProperties: {
                            propertiesClassName: schema.items.X.fullName,
                            propertyGroups: [
                              {
                                propertyName: "Prop",
                                propertyClassAlias: "this",
                                ranges: [{ fromValue: 1, toValue: 5 }],
                              },
                            ],
                          },
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
        const provider = createProvider({ ecdb, hierarchy });
        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForPropertyValueRangeGroupingNode({
              label: "1 - 5",
              propertyClassName: schema.items.X.fullName,
              propertyName: "Prop",
              fromValue: 1,
              toValue: 5,
              children: [
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1] }),
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2] }),
              ],
            }),
          ],
        });
      });

      it("creates property value range grouping nodes with custom range label", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Label" typeName="string" />
                <ECProperty propertyName="Prop" typeName="int" />
              </ECEntityClass>
            `,
          );
          const x1 = builder.insertInstance(s.items.X.fullName, { label: "one", prop: 1.5 });
          return { schema: s, x1 };
        });
        const { ecdb, schema, ...keys } = setup;
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
                        nodeLabel: { selector: `this.Label` },
                        grouping: {
                          byProperties: {
                            propertiesClassName: schema.items.X.fullName,
                            propertyGroups: [
                              {
                                propertyName: "Prop",
                                propertyClassAlias: "this",
                                ranges: [{ fromValue: 1, toValue: 2, rangeLabel: "TestLabel" }],
                              },
                            ],
                          },
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
        const provider = createProvider({ ecdb, hierarchy });
        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForPropertyValueRangeGroupingNode({
              label: "TestLabel",
              propertyClassName: schema.items.X.fullName,
              propertyName: "Prop",
              fromValue: 1,
              toValue: 2,
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1] })],
            }),
          ],
        });
      });

      it("creates multiple grouping nodes when nodes' property values fit in different ranges", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Label" typeName="string" />
                <ECProperty propertyName="Prop" typeName="int" />
              </ECEntityClass>
            `,
          );
          const x1 = builder.insertInstance(s.items.X.fullName, { label: "one", prop: 1 });
          const x2 = builder.insertInstance(s.items.X.fullName, { label: "two", prop: 4 });
          return { schema: s, x1, x2 };
        });
        const { ecdb, schema, ...keys } = setup;
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
                        nodeLabel: { selector: `this.Label` },
                        grouping: {
                          byProperties: {
                            propertiesClassName: schema.items.X.fullName,
                            createGroupForOutOfRangeValues: true,
                            propertyGroups: [
                              {
                                propertyName: "Prop",
                                propertyClassAlias: "this",
                                ranges: [
                                  { fromValue: 0, toValue: 2 },
                                  { fromValue: 3, toValue: 5 },
                                ],
                              },
                            ],
                          },
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
        const provider = createProvider({ ecdb, hierarchy });
        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForPropertyValueRangeGroupingNode({
              label: "0 - 2",
              propertyClassName: schema.items.X.fullName,
              propertyName: "Prop",
              fromValue: 0,
              toValue: 2,
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1] })],
            }),
            NodeValidators.createForPropertyValueRangeGroupingNode({
              label: "3 - 5",
              propertyClassName: schema.items.X.fullName,
              propertyName: "Prop",
              fromValue: 3,
              toValue: 5,
              children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2] })],
            }),
          ],
        });
      });

      it("doesn't create grouping nodes if provided properties don't fit in the range and `createGroupForOutOfRangeValues` isn't set", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Label" typeName="string" />
                <ECProperty propertyName="Prop" typeName="int" />
              </ECEntityClass>
            `,
          );
          const x1 = builder.insertInstance(s.items.X.fullName, { label: "one", prop: 3 });
          return { schema: s, x1 };
        });
        const { ecdb, schema, ...keys } = setup;
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
                        nodeLabel: { selector: `this.Label` },
                        grouping: {
                          byProperties: {
                            propertiesClassName: schema.items.X.fullName,
                            propertyGroups: [
                              {
                                propertyName: "Prop",
                                propertyClassAlias: "this",
                                ranges: [{ fromValue: 1, toValue: 2, rangeLabel: "TestLabel" }],
                              },
                            ],
                          },
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
        const provider = createProvider({ ecdb, hierarchy });
        await validateHierarchy({
          provider,
          expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1] })],
        });
      });

      it("creates 'other' property value grouping node if provided properties don't fit in the range and `createGroupForOutOfRangeValues` is `true`", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Label" typeName="string" />
                <ECProperty propertyName="Prop" typeName="int" />
              </ECEntityClass>
            `,
          );
          const x1 = builder.insertInstance(s.items.X.fullName, { label: "one", prop: 3 });
          const x2 = builder.insertInstance(s.items.X.fullName, { label: "two", prop: 10 });
          return { schema: s, x1, x2 };
        });
        const { ecdb, schema, ...keys } = setup;
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
                        nodeLabel: { selector: `this.Label` },
                        grouping: {
                          byProperties: {
                            propertiesClassName: schema.items.X.fullName,
                            createGroupForOutOfRangeValues: true,
                            propertyGroups: [
                              {
                                propertyName: "Prop",
                                propertyClassAlias: "this",
                                ranges: [{ fromValue: 1, toValue: 2, rangeLabel: "TestLabel" }],
                              },
                            ],
                          },
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
        const provider = createProvider({ ecdb, hierarchy, localizedStrings: { other: "OTHER", unspecified: "" } });
        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForPropertyOtherValuesGroupingNode({
              label: "OTHER",
              children: [
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x1] }),
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x2] }),
              ],
            }),
          ],
        });
      });

      it("creates a single 'other' property value grouping node for different properties", async () => {
        using setup = await buildTestECDb(async (builder, testName) => {
          const s = await importSchema(
            testName,
            builder,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Label" typeName="string" />
                <ECProperty propertyName="PropX" typeName="int" />
              </ECEntityClass>
              <ECEntityClass typeName="Y">
                <ECProperty propertyName="Label" typeName="string" />
                <ECProperty propertyName="PropY" typeName="int" />
              </ECEntityClass>
            `,
          );
          const x = builder.insertInstance(s.items.X.fullName, { label: "one", propX: 123 });
          const y = builder.insertInstance(s.items.Y.fullName, { label: "two", propY: 456 });
          return { schema: s, x, y };
        });
        const { ecdb, schema, ...keys } = setup;
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
                        nodeLabel: { selector: `this.Label` },
                        grouping: {
                          byProperties: {
                            propertiesClassName: schema.items.X.fullName,
                            createGroupForOutOfRangeValues: true,
                            propertyGroups: [
                              {
                                propertyName: "PropX",
                                propertyClassAlias: "this",
                                ranges: [{ fromValue: 1, toValue: 2 }],
                              },
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
                        nodeLabel: { selector: `this.Label` },
                        grouping: {
                          byProperties: {
                            propertiesClassName: schema.items.Y.fullName,
                            createGroupForOutOfRangeValues: true,
                            propertyGroups: [
                              {
                                propertyName: "PropY",
                                propertyClassAlias: "this",
                                ranges: [{ fromValue: 1, toValue: 2 }],
                              },
                            ],
                          },
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
        const provider = createProvider({ ecdb, hierarchy, localizedStrings: { other: "OTHER", unspecified: "" } });
        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForPropertyOtherValuesGroupingNode({
              label: "OTHER",
              children: [
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.x] }),
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.y] }),
              ],
            }),
          ],
        });
      });
    });
  });
});
