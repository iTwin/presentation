/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { insertSubject } from "presentation-test-utilities";
import { Subject } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { createHierarchyProvider, createNodesQueryClauseFactory, HierarchyDefinition, NodesQueryClauseFactory } from "@itwin/presentation-hierarchies";
import { buildIModel, importSchema, withECDb } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation";
import { createIModelAccess, createProvider } from "../Utils";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

describe("Hierarchies", () => {
  describe("Properties grouping", () => {
    type ECSqlSelectClausePropertiesGroupingParams = NonNullable<
      NonNullable<Parameters<NodesQueryClauseFactory["createSelectClause"]>[0]["grouping"]>["byProperties"]
    >;
    let subjectClassName: string;
    let emptyIModel: IModelConnection;

    before(async function () {
      await initialize();
      subjectClassName = Subject.classFullName.replace(":", ".");
      emptyIModel = (await buildIModel(this)).imodel;
    });

    after(async () => {
      await terminate();
    });

    function createHierarchyWithSpecifiedGrouping(imodel: IModelConnection, specifiedGrouping: ECSqlSelectClausePropertiesGroupingParams): HierarchyDefinition {
      const imodelAccess = createIModelAccess(imodel);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
      });
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

    it("doesn't group if provided properties class isn't base of nodes class", async function () {
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

    describe("unspecified values grouping", () => {
      it("doesn't create grouping nodes if provided property values are not defined and `createGroupForUnspecifiedValues` isn't set", async function () {
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

      it("creates property value grouping node if provided property values are not defined and `createGroupForOutOfRangeValues` is `true`", async function () {
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

      it("groups by navigation property", async function () {
        const imodelAccess = createIModelAccess(emptyIModel);
        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
        });
        const provider = createHierarchyProvider({
          imodelAccess,
          hierarchyDefinition: {
            defineHierarchyLevel: async ({ parentNode }) =>
              parentNode
                ? []
                : [
                    {
                      fullClassName: "BisCore.Subject",
                      query: {
                        ecsql: `
                          SELECT ${await selectQueryFactory.createSelectClause({
                            ecClassId: { selector: "this.ECClassId" },
                            ecInstanceId: { selector: "this.ECInstanceId" },
                            nodeLabel: { selector: "this.CodeValue" },
                            grouping: {
                              byProperties: {
                                createGroupForUnspecifiedValues: true,
                                propertiesClassName: "BisCore.Subject",
                                propertyGroups: [
                                  {
                                    propertyClassAlias: "this",
                                    propertyName: "Parent",
                                  },
                                ],
                              },
                            },
                          })}
                          FROM BisCore.Subject [this]
                        `,
                      },
                    },
                  ],
          },
          localizedStrings: { other: "", unspecified: "NOT SPECIFIED" },
        });

        await validateHierarchy({
          provider,
          expect: [
            NodeValidators.createForPropertyValueGroupingNode({
              label: "NOT SPECIFIED",
              propertyName: "Parent",
              children: [
                NodeValidators.createForInstanceNode({
                  children: false,
                }),
              ],
            }),
          ],
        });
      });
    });

    describe("value grouping", () => {
      it("creates property value grouping nodes", async function () {
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

      it("creates multiple grouping nodes if nodes have different property values", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, userLabel: "Test1" });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId, userLabel: "Test2" });
          return { childSubject1, childSubject2 };
        });

        const imodelAccess = createIModelAccess(imodel);
        const selectQueryFactory = createNodesQueryClauseFactory({
          imodelAccess,
          instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
        });
        const customHierarchy: HierarchyDefinition = {
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

      it("creates multiple levels of grouping if node has multiple property groupings", async function () {
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

      describe("navigation property", () => {
        it("groups by navigation property", async function () {
          const { imodel, ...keys } = await buildIModel(this, async (builder) => {
            const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, description: "TestDescription" });
            return { childSubject1 };
          });

          const groupingParams: ECSqlSelectClausePropertiesGroupingParams = {
            propertiesClassName: "BisCore.Subject",
            propertyGroups: [{ propertyName: "Parent", propertyClassAlias: "this" }],
          };

          await validateHierarchy({
            provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, groupingParams) }),
            expect: [
              NodeValidators.createForPropertyValueGroupingNode({
                propertyClassName: "BisCore.Subject",
                propertyName: "Parent",
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

        it("creates one grouping node when navigation properties point to different nodes with same labels", async function () {
          const { imodel, ...keys } = await buildIModel(this, async (builder) => {
            const childSubject1 = insertSubject({
              builder,
              codeValue: "A1",
              parentId: IModel.rootSubjectId,
              description: "TestDescription",
              userLabel: "sameLabel",
            });
            const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: childSubject1.id, description: "TestDescription" });
            const childSubject3 = insertSubject({
              builder,
              codeValue: "A3",
              parentId: IModel.rootSubjectId,
              description: "TestDescription",
              userLabel: "sameLabel",
            });
            const childSubject4 = insertSubject({ builder, codeValue: "A4", parentId: childSubject3.id, description: "TestDescription" });
            return { childSubject1, childSubject2, childSubject3, childSubject4 };
          });

          const groupingParams: ECSqlSelectClausePropertiesGroupingParams = {
            propertiesClassName: "BisCore.Subject",
            propertyGroups: [{ propertyName: "Parent", propertyClassAlias: "this" }],
          };
          const imodelAccess = createIModelAccess(imodel);
          const selectQueryFactory = createNodesQueryClauseFactory({
            imodelAccess,
            instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
          });
          const provider = createHierarchyProvider({
            imodelAccess: createIModelAccess(imodel),
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) =>
                parentNode
                  ? []
                  : [
                      {
                        fullClassName: "BisCore.Subject",
                        query: {
                          ecsql: `
                            SELECT ${await selectQueryFactory.createSelectClause({
                              ecClassId: { selector: "this.ECClassId" },
                              ecInstanceId: { selector: "this.ECInstanceId" },
                              nodeLabel: { selector: "this.CodeValue" },
                              grouping: {
                                byProperties: groupingParams,
                              },
                            })}
                            FROM BisCore.Subject [this]
                            WHERE [this].[Parent].[Id] = ${keys.childSubject1.id} or [this].[Parent].[Id] = ${keys.childSubject3.id}
                          `,
                        },
                      },
                    ],
            },
          });

          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForPropertyValueGroupingNode({
                propertyClassName: "BisCore.Subject",
                propertyName: "Parent",
                label: "sameLabel",
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.childSubject2],
                    children: false,
                  }),
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.childSubject4],
                    children: false,
                  }),
                ],
              }),
            ],
          });
        });

        it("creates different grouping nodes when navigation properties point to different nodes with different labels", async function () {
          const { imodel, ...keys } = await buildIModel(this, async (builder) => {
            const childSubject1 = insertSubject({
              builder,
              codeValue: "A1",
              parentId: IModel.rootSubjectId,
              description: "TestDescription",
              userLabel: "differentLabel1",
            });
            const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: childSubject1.id, description: "TestDescription" });
            const childSubject3 = insertSubject({
              builder,
              codeValue: "A3",
              parentId: IModel.rootSubjectId,
              description: "TestDescription",
              userLabel: "differentLabel2",
            });
            const childSubject4 = insertSubject({ builder, codeValue: "A4", parentId: childSubject3.id, description: "TestDescription" });
            return { childSubject1, childSubject2, childSubject3, childSubject4 };
          });

          const groupingParams: ECSqlSelectClausePropertiesGroupingParams = {
            propertiesClassName: "BisCore.Subject",
            propertyGroups: [{ propertyName: "Parent", propertyClassAlias: "this" }],
          };
          const imodelAccess = createIModelAccess(imodel);
          const selectQueryFactory = createNodesQueryClauseFactory({
            imodelAccess,
            instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
          });
          const provider = createHierarchyProvider({
            imodelAccess: createIModelAccess(imodel),
            hierarchyDefinition: {
              defineHierarchyLevel: async ({ parentNode }) =>
                parentNode
                  ? []
                  : [
                      {
                        fullClassName: "BisCore.Subject",
                        query: {
                          ecsql: `
                            SELECT ${await selectQueryFactory.createSelectClause({
                              ecClassId: { selector: "this.ECClassId" },
                              ecInstanceId: { selector: "this.ECInstanceId" },
                              nodeLabel: { selector: "this.CodeValue" },
                              grouping: {
                                byProperties: groupingParams,
                              },
                            })}
                            FROM BisCore.Subject [this]
                            WHERE [this].[Parent].[Id] = ${keys.childSubject1.id} or [this].[Parent].[Id] = ${keys.childSubject3.id}
                          `,
                        },
                      },
                    ],
            },
          });

          await validateHierarchy({
            provider,
            expect: [
              NodeValidators.createForPropertyValueGroupingNode({
                propertyClassName: "BisCore.Subject",
                propertyName: "Parent",
                label: "differentLabel1",
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.childSubject2],
                    children: false,
                  }),
                ],
              }),
              NodeValidators.createForPropertyValueGroupingNode({
                propertyClassName: "BisCore.Subject",
                propertyName: "Parent",
                label: "differentLabel2",
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.childSubject4],
                    children: false,
                  }),
                ],
              }),
            ],
          });
        });
      });
    });

    describe("range grouping", () => {
      it("creates property value range grouping nodes", async function () {
        await withECDb(
          this,
          async (db) => {
            const schema = await importSchema(
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
            const imodelAccess = createIModelAccess(imodel);
            const selectQueryFactory = createNodesQueryClauseFactory({
              imodelAccess,
              instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
            });
            const hierarchy: HierarchyDefinition = {
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

      it("creates property value range grouping nodes with custom range label", async function () {
        await withECDb(
          this,
          async (db) => {
            const schema = await importSchema(
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
            const imodelAccess = createIModelAccess(imodel);
            const selectQueryFactory = createNodesQueryClauseFactory({
              imodelAccess,
              instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
            });
            const hierarchy: HierarchyDefinition = {
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

      it("creates multiple grouping nodes when nodes' property values fit in different ranges", async function () {
        await withECDb(
          this,
          async (db) => {
            const schema = await importSchema(
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
            const imodelAccess = createIModelAccess(imodel);
            const selectQueryFactory = createNodesQueryClauseFactory({
              imodelAccess,
              instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
            });
            const hierarchy: HierarchyDefinition = {
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

      it("doesn't create grouping nodes if provided properties don't fit in the range and `createGroupForOutOfRangeValues` isn't set", async function () {
        await withECDb(
          this,
          async (db) => {
            const schema = await importSchema(
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
            const imodelAccess = createIModelAccess(imodel);
            const selectQueryFactory = createNodesQueryClauseFactory({
              imodelAccess,
              instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
            });
            const hierarchy: HierarchyDefinition = {
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

      it("creates 'other' property value grouping node if provided properties don't fit in the range and `createGroupForOutOfRangeValues` is `true`", async function () {
        await withECDb(
          this,
          async (db) => {
            const schema = await importSchema(
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
            const imodelAccess = createIModelAccess(imodel);
            const selectQueryFactory = createNodesQueryClauseFactory({
              imodelAccess,
              instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
            });
            const hierarchy: HierarchyDefinition = {
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

      it("creates a single 'other' property value grouping node for different properties", async function () {
        await withECDb(
          this,
          async (db) => {
            const schema = await importSchema(
              this,
              db,
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
            const x = db.insertInstance(schema.items.X.fullName, { label: "one", propX: 123 });
            const y = db.insertInstance(schema.items.Y.fullName, { label: "two", propY: 456 });
            return { schema, x, y };
          },
          async (imodel, { schema, x, y }) => {
            const imodelAccess = createIModelAccess(imodel);
            const selectQueryFactory = createNodesQueryClauseFactory({
              imodelAccess,
              instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
            });
            const hierarchy: HierarchyDefinition = {
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
                                propertyGroups: [{ propertyName: "PropX", propertyClassAlias: "this", ranges: [{ fromValue: 1, toValue: 2 }] }],
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
                          SELECT ${await selectQueryFactory.createSelectClause({
                            ecClassId: { selector: `this.ECClassId` },
                            ecInstanceId: { selector: `this.ECInstanceId` },
                            nodeLabel: { selector: `this.Label` },
                            grouping: {
                              byProperties: {
                                propertiesClassName: schema.items.Y.fullName,
                                createGroupForOutOfRangeValues: true,
                                propertyGroups: [{ propertyName: "PropY", propertyClassAlias: "this", ranges: [{ fromValue: 1, toValue: 2 }] }],
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
            const provider = createProvider({ imodel, hierarchy, localizedStrings: { other: "OTHER", unspecified: "" } });
            await validateHierarchy({
              provider,
              expect: [
                NodeValidators.createForPropertyOtherValuesGroupingNode({
                  label: "OTHER",
                  children: [NodeValidators.createForInstanceNode({ instanceKeys: [x] }), NodeValidators.createForInstanceNode({ instanceKeys: [y] })],
                }),
              ],
            });
          },
        );
      });
    });
  });
});
