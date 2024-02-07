/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Subject } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { ECSqlSelectClausePropertiesGroupingParams, IHierarchyLevelDefinitionsFactory, NodeSelectQueryFactory } from "@itwin/presentation-hierarchy-builder";
import { buildIModel, importSchema, insertSubject, withECDb } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation";
import { createMetadataProvider, createProvider } from "../Utils";

describe("Stateless hierarchy builder", () => {
  describe("Properties grouping", () => {
    let subjectClassName: string;

    before(async function () {
      await initialize();
      subjectClassName = Subject.classFullName.replace(":", ".");
    });

    after(async () => {
      await terminate();
    });

    function createHierarchyWithSpecifiedGrouping(
      imodel: IModelConnection,
      specifiedGrouping: ECSqlSelectClausePropertiesGroupingParams,
    ): IHierarchyLevelDefinitionsFactory {
      const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
      return {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                fullClassName: `BisCore.InformationContentElement`,
                query: {
                  ecsql: `
                  SELECT ${await selectQueryFactory.createSelectClause({
                    ecClassId: { selector: `this.ECClassId` },
                    ecInstanceId: { selector: `this.ECInstanceId` },
                    nodeLabel: { selector: `this.UserLabel` },
                    grouping: {
                      byProperties: specifiedGrouping,
                    },
                  })}
                  FROM ${subjectClassName} AS this
                  WHERE this.Parent.Id = (${IModel.rootSubjectId})
                `,
                },
              },
            ];
          }
          return [];
        },
      };
    }

    it("doesn't create grouping nodes if provided properties class isn't base of nodes class", async function () {
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, description: "TestDescription" });
        return { childSubject1 };
      });

      const groupingParams: ECSqlSelectClausePropertiesGroupingParams = {
        propertiesClassName: "BisCore.PhysicalPartition",
        propertyGroups: [{ propertyName: "Description", propertyClassAlias: "this" }],
        createGroupForUnspecifiedValues: true,
      };

      await validateHierarchy({
        provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, groupingParams) }),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.childSubject1],
            children: false,
          }),
        ],
      });
    });

    it("creates property value grouping nodes if provided properties grouping without range", async function () {
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, description: "TestDescription" });
        return { childSubject1 };
      });

      const groupingParams: ECSqlSelectClausePropertiesGroupingParams = {
        propertiesClassName: "BisCore.Subject",
        propertyGroups: [{ propertyName: "Description", propertyClassAlias: "this" }],
      };

      await validateHierarchy({
        provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, groupingParams) }),
        expect: [
          NodeValidators.createForPropertyValueGroupingNode({
            label: "TestDescription",
            propertyClassName: "BisCore.Subject",
            propertyName: "Description",
            formattedPropertyValue: "TestDescription",
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.childSubject1],
                children: false,
              }),
            ],
          }),
        ],
      });
    });

    it("creates property value range grouping nodes if provided properties grouping with range", async function () {
      await withECDb(
        this,
        async (db) => {
          const schema = importSchema(
            this,
            db,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Label" typeName="string" />
                <ECProperty propertyName="Prop" typeName="int" />
              </ECEntityClass>
            `,
          );
          const x1 = db.insertInstance(schema.items.X.fullName, { label: "one", prop: 1.5 });
          const x2 = db.insertInstance(schema.items.X.fullName, { label: "two", prop: 3 });
          return { schema, x1, x2 };
        },
        async (imodel, { schema, x1, x2 }) => {
          const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
          const hierarchy: IHierarchyLevelDefinitionsFactory = {
            async defineHierarchyLevel({ parentNode }) {
              if (!parentNode) {
                return [
                  {
                    fullClassName: schema.items.X.fullName,
                    query: {
                      ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.Label` },
                        grouping: {
                          byProperties: {
                            propertiesClassName: schema.items.X.fullName,
                            propertyGroups: [{ propertyName: "Prop", propertyClassAlias: "this", ranges: [{ fromValue: 1, toValue: 5 }] }],
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
          const provider = createProvider({ imodel, hierarchy });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForPropertyValueRangeGroupingNode({
                label: "1 - 5",
                propertyClassName: schema.items.X.fullName,
                propertyName: "Prop",
                fromValue: 1,
                toValue: 5,
                children: [NodeValidators.createForInstanceNode({ instanceKeys: [x1] }), NodeValidators.createForInstanceNode({ instanceKeys: [x2] })],
              }),
            ],
          });
        },
      );
    });

    it("creates property value range grouping nodes and applies range label if provided properties grouping with range and range label", async function () {
      await withECDb(
        this,
        async (db) => {
          const schema = importSchema(
            this,
            db,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Label" typeName="string" />
                <ECProperty propertyName="Prop" typeName="int" />
              </ECEntityClass>
            `,
          );
          const x1 = db.insertInstance(schema.items.X.fullName, { label: "one", prop: 1.5 });
          return { schema, x1 };
        },
        async (imodel, { schema, x1 }) => {
          const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
          const hierarchy: IHierarchyLevelDefinitionsFactory = {
            async defineHierarchyLevel({ parentNode }) {
              if (!parentNode) {
                return [
                  {
                    fullClassName: schema.items.X.fullName,
                    query: {
                      ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.Label` },
                        grouping: {
                          byProperties: {
                            propertiesClassName: schema.items.X.fullName,
                            propertyGroups: [
                              { propertyName: "Prop", propertyClassAlias: "this", ranges: [{ fromValue: 1, toValue: 2, rangeLabel: "TestLabel" }] },
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
          const provider = createProvider({ imodel, hierarchy });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForPropertyValueRangeGroupingNode({
                label: "TestLabel",
                propertyClassName: schema.items.X.fullName,
                propertyName: "Prop",
                fromValue: 1,
                toValue: 2,
                children: [NodeValidators.createForInstanceNode({ instanceKeys: [x1] })],
              }),
            ],
          });
        },
      );
    });

    it("doesn't create grouping nodes if provided property values are not defined and createGroupForUnspecifiedValues isn't set", async function () {
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId });
        return { childSubject1 };
      });

      const groupingParams: ECSqlSelectClausePropertiesGroupingParams = {
        propertiesClassName: "BisCore.Subject",
        propertyGroups: [{ propertyName: "Description", propertyClassAlias: "this" }],
      };

      await validateHierarchy({
        provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, groupingParams) }),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.childSubject1],
            children: false,
          }),
        ],
      });
    });

    it("creates property value grouping nodes if provided property values are not defined and createGroupForOutOfRangeValues is true", async function () {
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId });
        return { childSubject1 };
      });

      const groupingParams: ECSqlSelectClausePropertiesGroupingParams = {
        propertiesClassName: "BisCore.Subject",
        createGroupForUnspecifiedValues: true,
        propertyGroups: [{ propertyName: "Description", propertyClassAlias: "this" }],
      };

      await validateHierarchy({
        provider: createProvider({
          imodel,
          hierarchy: createHierarchyWithSpecifiedGrouping(imodel, groupingParams),
          localizedStrings: { other: "", unspecified: "NOT SPECIFIED" },
        }),
        expect: [
          NodeValidators.createForPropertyValueGroupingNode({
            propertyClassName: "BisCore.Subject",
            propertyName: "Description",
            formattedPropertyValue: "",
            label: "NOT SPECIFIED",
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.childSubject1],
                children: false,
              }),
            ],
          }),
        ],
      });
    });

    it("doesn't create grouping nodes if provided properties don't fit in the range and createGroupForOutOfRangeValues isn't set", async function () {
      await withECDb(
        this,
        async (db) => {
          const schema = importSchema(
            this,
            db,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Label" typeName="string" />
                <ECProperty propertyName="Prop" typeName="int" />
              </ECEntityClass>
            `,
          );
          const x1 = db.insertInstance(schema.items.X.fullName, { label: "one", prop: 3 });
          return { schema, x1 };
        },
        async (imodel, { schema, x1 }) => {
          const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
          const hierarchy: IHierarchyLevelDefinitionsFactory = {
            async defineHierarchyLevel({ parentNode }) {
              if (!parentNode) {
                return [
                  {
                    fullClassName: schema.items.X.fullName,
                    query: {
                      ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.Label` },
                        grouping: {
                          byProperties: {
                            propertiesClassName: schema.items.X.fullName,
                            propertyGroups: [
                              { propertyName: "Prop", propertyClassAlias: "this", ranges: [{ fromValue: 1, toValue: 2, rangeLabel: "TestLabel" }] },
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
          const provider = createProvider({ imodel, hierarchy });
          await validateHierarchy({
            provider,
            expect: [NodeValidators.createForInstanceNode({ instanceKeys: [x1] })],
          });
        },
      );
    });

    it("creates property other values grouping nodes if provided properties don't fit in the range and createGroupForOutOfRangeValues is true", async function () {
      await withECDb(
        this,
        async (db) => {
          const schema = importSchema(
            this,
            db,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Label" typeName="string" />
                <ECProperty propertyName="Prop" typeName="int" />
              </ECEntityClass>
            `,
          );
          const x1 = db.insertInstance(schema.items.X.fullName, { label: "one", prop: 3 });
          const x2 = db.insertInstance(schema.items.X.fullName, { label: "two", prop: 10 });
          return { schema, x1, x2 };
        },
        async (imodel, { schema, x1, x2 }) => {
          const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
          const hierarchy: IHierarchyLevelDefinitionsFactory = {
            async defineHierarchyLevel({ parentNode }) {
              if (!parentNode) {
                return [
                  {
                    fullClassName: schema.items.X.fullName,
                    query: {
                      ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.Label` },
                        grouping: {
                          byProperties: {
                            propertiesClassName: schema.items.X.fullName,
                            createGroupForOutOfRangeValues: true,
                            propertyGroups: [
                              { propertyName: "Prop", propertyClassAlias: "this", ranges: [{ fromValue: 1, toValue: 2, rangeLabel: "TestLabel" }] },
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
          const provider = createProvider({ imodel, hierarchy, localizedStrings: { other: "OTHER", unspecified: "" } });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForPropertyOtherValuesGroupingNode({
                label: "OTHER",
                children: [NodeValidators.createForInstanceNode({ instanceKeys: [x1] }), NodeValidators.createForInstanceNode({ instanceKeys: [x2] })],
              }),
            ],
          });
        },
      );
    });

    it("creates multiple grouping nodes if node has multiple property groupings", async function () {
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const childSubject1 = insertSubject({
          builder,
          codeValue: "A1",
          parentId: IModel.rootSubjectId,
          userLabel: "TestLabel",
          description: "TestDescription",
        });
        return { childSubject1 };
      });
      const groupingParams: ECSqlSelectClausePropertiesGroupingParams = {
        propertiesClassName: "BisCore.Subject",
        propertyGroups: [
          { propertyName: "UserLabel", propertyClassAlias: "this" },
          { propertyName: "Description", propertyClassAlias: "this" },
        ],
      };

      await validateHierarchy({
        provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, groupingParams) }),
        expect: [
          NodeValidators.createForPropertyValueGroupingNode({
            label: "TestLabel",
            propertyClassName: "BisCore.Subject",
            propertyName: "UserLabel",
            formattedPropertyValue: "TestLabel",
            children: [
              NodeValidators.createForPropertyValueGroupingNode({
                label: "TestDescription",
                propertyClassName: "BisCore.Subject",
                propertyName: "Description",
                formattedPropertyValue: "TestDescription",
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.childSubject1],
                    children: false,
                  }),
                ],
              }),
            ],
          }),
        ],
      });
    });

    it("creates multiple grouping nodes if nodes have different property values", async function () {
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, userLabel: "Test1" });
        const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId, userLabel: "Test2" });
        return { childSubject1, childSubject2 };
      });

      const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
      const customHierarchy: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                fullClassName: `BisCore.InformationContentElement`,
                query: {
                  ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.UserLabel` },
                        grouping: {
                          byProperties: {
                            propertiesClassName: "BisCore.Subject",
                            propertyGroups: [{ propertyName: "UserLabel", propertyClassAlias: "this" }],
                          },
                        },
                      })}
                      FROM ${subjectClassName} AS this
                      WHERE this.Parent.Id = (${IModel.rootSubjectId})
                    `,
                },
              },
            ];
          }
          return [];
        },
      };

      await validateHierarchy({
        provider: createProvider({ imodel, hierarchy: customHierarchy }),
        expect: [
          NodeValidators.createForPropertyValueGroupingNode({
            label: "Test1",
            propertyClassName: "BisCore.Subject",
            propertyName: "UserLabel",
            formattedPropertyValue: "Test1",
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.childSubject1],
                children: false,
              }),
            ],
          }),
          NodeValidators.createForPropertyValueGroupingNode({
            label: "Test2",
            propertyClassName: "BisCore.Subject",
            propertyName: "UserLabel",
            formattedPropertyValue: "Test2",
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.childSubject2],
                children: false,
              }),
            ],
          }),
        ],
      });
    });

    it("creates multiple grouping nodes when nodes' property values fit in different ranges", async function () {
      await withECDb(
        this,
        async (db) => {
          const schema = importSchema(
            this,
            db,
            `
              <ECEntityClass typeName="X">
                <ECProperty propertyName="Label" typeName="string" />
                <ECProperty propertyName="Prop" typeName="int" />
              </ECEntityClass>
            `,
          );
          const x1 = db.insertInstance(schema.items.X.fullName, { label: "one", prop: 1 });
          const x2 = db.insertInstance(schema.items.X.fullName, { label: "two", prop: 4 });
          return { schema, x1, x2 };
        },
        async (imodel, { schema, x1, x2 }) => {
          const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
          const hierarchy: IHierarchyLevelDefinitionsFactory = {
            async defineHierarchyLevel({ parentNode }) {
              if (!parentNode) {
                return [
                  {
                    fullClassName: schema.items.X.fullName,
                    query: {
                      ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
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
          const provider = createProvider({ imodel, hierarchy });
          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForPropertyValueRangeGroupingNode({
                label: "0 - 2",
                propertyClassName: schema.items.X.fullName,
                propertyName: "Prop",
                fromValue: 0,
                toValue: 2,
                children: [NodeValidators.createForInstanceNode({ instanceKeys: [x1] })],
              }),
              NodeValidators.createForPropertyValueRangeGroupingNode({
                label: "3 - 5",
                propertyClassName: schema.items.X.fullName,
                propertyName: "Prop",
                fromValue: 3,
                toValue: 5,
                children: [NodeValidators.createForInstanceNode({ instanceKeys: [x2] })],
              }),
            ],
          });
        },
      );
    });
  });
});
