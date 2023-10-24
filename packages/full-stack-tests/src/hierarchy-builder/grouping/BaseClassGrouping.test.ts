/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PhysicalPartition, Subject } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { IHierarchyLevelDefinitionsFactory, NodeSelectClauseFactory } from "@itwin/presentation-hierarchy-builder";
import { buildIModel, createProvider, insertPhysicalPartition, insertSubject } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation";

describe("Stateless hierarchy builder", () => {
  describe("Base class grouping", () => {
    let selectClauseFactory: NodeSelectClauseFactory;
    let subjectClassName: string;
    let physicalPartitionClassName: string;

    before(async function () {
      await initialize();
      subjectClassName = Subject.classFullName.replace(":", ".");
      physicalPartitionClassName = PhysicalPartition.classFullName.replace(":", ".");
      selectClauseFactory = new NodeSelectClauseFactory();
    });

    after(async () => {
      await terminate();
    });

    describe("does not group", () => {
      let sharedIModel: IModelConnection;
      let sharedKeys: any;
      beforeEach(async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId });
          const childPartition3 = insertPhysicalPartition({ builder, codeValue: "B3", parentId: IModel.rootSubjectId });
          const childPartition4 = insertPhysicalPartition({ builder, codeValue: "B4", parentId: IModel.rootSubjectId });
          const childPartition5 = insertPhysicalPartition({ builder, codeValue: "B5", parentId: IModel.rootSubjectId });
          return { childSubject1, childSubject2, childPartition3, childPartition4, childPartition5 };
        });
        sharedKeys = keys;
        sharedIModel = imodel;
      });

      it("if provided base classes are not parents", async function () {
        const customHierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  fullClassName: `BisCore.InformationContentElement`,
                  query: {
                    ecsql: `
                    SELECT ${await selectClauseFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.UserLabel` },
                      grouping: {
                        byBaseClasses: {
                          fullClassNames: ["BisCore.GraphicalPartition3d", "BisCore.LinkElement"],
                        },
                      },
                    })}
                    FROM (
                      SELECT ECClassId, ECInstanceId, UserLabel, Parent
                      FROM ${subjectClassName}
                      UNION ALL
                      SELECT ECClassId, ECInstanceId, UserLabel, Parent
                      FROM ${physicalPartitionClassName}
                    ) AS this
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
          provider: createProvider({ imodel: sharedIModel, hierarchy: customHierarchy }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [sharedKeys.childSubject1],
              children: false,
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [sharedKeys.childSubject2],
              children: false,
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [sharedKeys.childPartition3],
              children: false,
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [sharedKeys.childPartition4],
              children: false,
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [sharedKeys.childPartition5],
              children: false,
            }),
          ],
        });
      });

      it("if provided base classes are not of entity or relationship type", async function () {
        const customHierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  fullClassName: `BisCore.InformationContentElement`,
                  query: {
                    ecsql: `
                    SELECT ${await selectClauseFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.UserLabel` },
                      grouping: {
                        byBaseClasses: {
                          fullClassNames: ["BisCore.IParentElement", "BisCore.ISubModeledElement"],
                        },
                      },
                    })}
                    FROM (
                      SELECT ECClassId, ECInstanceId, UserLabel, Parent
                      FROM ${subjectClassName}
                      UNION ALL
                      SELECT ECClassId, ECInstanceId, UserLabel, Parent
                      FROM ${physicalPartitionClassName}
                    ) AS this
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
          provider: createProvider({ imodel: sharedIModel, hierarchy: customHierarchy }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [sharedKeys.childSubject1],
              children: false,
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [sharedKeys.childSubject2],
              children: false,
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [sharedKeys.childPartition3],
              children: false,
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [sharedKeys.childPartition4],
              children: false,
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [sharedKeys.childPartition5],
              children: false,
            }),
          ],
        });
      });
    });

    describe("groups", () => {
      it("when base class is parent", async function () {
        const baseClassName = "BisCore.InformationPartitionElement";
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, userLabel: "test" });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId, userLabel: "test" });
          const childPartition3 = insertPhysicalPartition({ builder, codeValue: "B3", parentId: IModel.rootSubjectId, userLabel: "test" });
          const childPartition4 = insertPhysicalPartition({ builder, codeValue: "B4", parentId: IModel.rootSubjectId, userLabel: "test" });
          const childPartition5 = insertPhysicalPartition({ builder, codeValue: "B5", parentId: IModel.rootSubjectId, userLabel: "test" });
          return { childSubject1, childSubject2, childPartition3, childPartition4, childPartition5 };
        });

        const customHierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  fullClassName: `BisCore.InformationContentElement`,
                  query: {
                    ecsql: `
                      SELECT ${await selectClauseFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.UserLabel` },
                        grouping: {
                          byBaseClasses: {
                            fullClassNames: [baseClassName],
                          },
                        },
                      })}
                      FROM (
                        SELECT ECClassId, ECInstanceId, UserLabel, Parent
                        FROM ${subjectClassName}
                        UNION ALL
                        SELECT ECClassId, ECInstanceId, UserLabel, Parent
                        FROM ${physicalPartitionClassName}
                      ) AS this
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
            NodeValidators.createForClassGroupingNode({
              label: "Information Partition",
              className: baseClassName,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.childPartition3],
                  children: false,
                }),
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.childPartition4],
                  children: false,
                }),
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.childPartition5],
                  children: false,
                }),
              ],
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.childSubject1],
              children: false,
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.childSubject2],
              children: false,
            }),
          ],
        });
      });

      it("when multiple base classes are parents", async function () {
        const baseClassName1 = "Element";
        const baseClassName2 = "InformationContentElement";
        const baseClassName3 = "InformationPartitionElement";
        const baseSchemaName = "BisCore";
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, userLabel: "test" });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId, userLabel: "test" });
          const childPartition3 = insertPhysicalPartition({ builder, codeValue: "B3", parentId: IModel.rootSubjectId, userLabel: "test" });
          const childPartition4 = insertPhysicalPartition({ builder, codeValue: "B4", parentId: IModel.rootSubjectId, userLabel: "test" });
          const childPartition5 = insertPhysicalPartition({ builder, codeValue: "B5", parentId: IModel.rootSubjectId, userLabel: "test" });
          return { childSubject1, childSubject2, childPartition3, childPartition4, childPartition5 };
        });

        const customHierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  fullClassName: `BisCore.InformationContentElement`,
                  query: {
                    ecsql: `
                      SELECT ${await selectClauseFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.UserLabel` },
                        grouping: {
                          byBaseClasses: {
                            fullClassNames: [
                              `${baseSchemaName}.${baseClassName1}`,
                              `${baseSchemaName}.${baseClassName2}`,
                              `${baseSchemaName}.${baseClassName3}`,
                            ],
                          },
                        },
                      })}
                      FROM (
                        SELECT ECClassId, ECInstanceId, UserLabel, Parent
                        FROM ${subjectClassName}
                        UNION ALL
                        SELECT ECClassId, ECInstanceId, UserLabel, Parent
                        FROM ${physicalPartitionClassName}
                      ) AS this
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
            NodeValidators.createForClassGroupingNode({
              label: "Element",
              className: `${baseSchemaName}.${baseClassName1}`,
              children: [
                NodeValidators.createForClassGroupingNode({
                  label: "Information Content Element",
                  className: `${baseSchemaName}.${baseClassName2}`,
                  children: [
                    NodeValidators.createForClassGroupingNode({
                      label: "Information Partition",
                      className: `${baseSchemaName}.${baseClassName3}`,
                      children: [
                        NodeValidators.createForInstanceNode({
                          instanceKeys: [keys.childPartition3],
                          children: false,
                        }),
                        NodeValidators.createForInstanceNode({
                          instanceKeys: [keys.childPartition4],
                          children: false,
                        }),
                        NodeValidators.createForInstanceNode({
                          instanceKeys: [keys.childPartition5],
                          children: false,
                        }),
                      ],
                    }),
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.childSubject1],
                      children: false,
                    }),
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.childSubject2],
                      children: false,
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });

      it("into different groups when root base classes are different", async function () {
        const baseClassName1 = "Element";
        const baseClassName2 = "InformationContentElement";
        const baseClassName3 = "InformationPartitionElement";
        const baseSchemaName = "BisCore";
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, userLabel: "test" });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId, userLabel: "test" });
          const childPartition3 = insertPhysicalPartition({ builder, codeValue: "B3", parentId: IModel.rootSubjectId, userLabel: "test" });
          const childPartition4 = insertPhysicalPartition({ builder, codeValue: "B4", parentId: IModel.rootSubjectId, userLabel: "test" });
          const childPartition5 = insertPhysicalPartition({ builder, codeValue: "B5", parentId: IModel.rootSubjectId, userLabel: "test" });
          const childPartition6 = insertPhysicalPartition({ builder, codeValue: "B6", parentId: IModel.rootSubjectId, userLabel: "test" });
          return { childSubject1, childSubject2, childPartition3, childPartition4, childPartition5, childPartition6 };
        });

        const customHierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  fullClassName: `BisCore.InformationContentElement`,
                  query: {
                    ecsql: `
                      SELECT ${await selectClauseFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.UserLabel` },
                        grouping: {
                          byBaseClasses: {
                            fullClassNames: [
                              `${baseSchemaName}.${baseClassName1}`,
                              `${baseSchemaName}.${baseClassName2}`,
                              `${baseSchemaName}.${baseClassName3}`,
                            ],
                          },
                        },
                      })}
                      FROM (
                        SELECT ECClassId, ECInstanceId, UserLabel, Parent, CodeValue
                        FROM ${subjectClassName}
                        UNION ALL
                        SELECT ECClassId, ECInstanceId, UserLabel, Parent, CodeValue
                        FROM ${physicalPartitionClassName}
                      ) AS this
                      WHERE this.Parent.Id = (${IModel.rootSubjectId})
                        AND NOT this.CodeValue = 'B6'
                    `,
                  },
                },
                {
                  fullClassName: physicalPartitionClassName,
                  query: {
                    ecsql: `
                      SELECT ${await selectClauseFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.UserLabel` },
                        grouping: {
                          byBaseClasses: {
                            fullClassNames: [`${baseSchemaName}.${baseClassName2}`, `${baseSchemaName}.${baseClassName3}`],
                          },
                        },
                      })}
                      FROM ${physicalPartitionClassName} AS this
                      WHERE this.Parent.Id = (${IModel.rootSubjectId})
                        AND this.CodeValue = 'B6'
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
            NodeValidators.createForClassGroupingNode({
              label: "Element",
              className: `${baseSchemaName}.${baseClassName1}`,
              children: [
                NodeValidators.createForClassGroupingNode({
                  label: "Information Content Element",
                  className: `${baseSchemaName}.${baseClassName2}`,
                  children: [
                    NodeValidators.createForClassGroupingNode({
                      label: "Information Partition",
                      className: `${baseSchemaName}.${baseClassName3}`,
                      children: [
                        NodeValidators.createForInstanceNode({
                          instanceKeys: [keys.childPartition3],
                          children: false,
                        }),
                        NodeValidators.createForInstanceNode({
                          instanceKeys: [keys.childPartition4],
                          children: false,
                        }),
                        NodeValidators.createForInstanceNode({
                          instanceKeys: [keys.childPartition5],
                          children: false,
                        }),
                      ],
                    }),
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.childSubject1],
                      children: false,
                    }),
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.childSubject2],
                      children: false,
                    }),
                  ],
                }),
              ],
            }),
            NodeValidators.createForClassGroupingNode({
              label: "Information Content Element",
              className: `${baseSchemaName}.${baseClassName2}`,
              children: [
                NodeValidators.createForClassGroupingNode({
                  label: "Information Partition",
                  className: `${baseSchemaName}.${baseClassName3}`,
                  children: [
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.childPartition6],
                      children: false,
                    }),
                  ],
                }),
              ],
            }),
          ],
        });
      });

      it("into one root base class when all nodes share the root base class", async function () {
        const baseClassName1 = "Element";
        const baseClassName2 = "InformationContentElement";
        const baseClassName3 = "InformationPartitionElement";
        const baseSchemaName = "BisCore";
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, userLabel: "test" });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId, userLabel: "test" });
          const childPartition3 = insertPhysicalPartition({ builder, codeValue: "B3", parentId: IModel.rootSubjectId, userLabel: "test" });
          const childPartition4 = insertPhysicalPartition({ builder, codeValue: "B4", parentId: IModel.rootSubjectId, userLabel: "test" });
          const childPartition5 = insertPhysicalPartition({ builder, codeValue: "B5", parentId: IModel.rootSubjectId, userLabel: "test" });
          const childPartition6 = insertPhysicalPartition({ builder, codeValue: "B6", parentId: IModel.rootSubjectId, userLabel: "test" });
          return { childSubject1, childSubject2, childPartition3, childPartition4, childPartition5, childPartition6 };
        });

        const customHierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  fullClassName: `BisCore.InformationContentElement`,
                  query: {
                    ecsql: `
                      SELECT ${await selectClauseFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.UserLabel` },
                        grouping: {
                          byBaseClasses: {
                            fullClassNames: [
                              `${baseSchemaName}.${baseClassName1}`,
                              `${baseSchemaName}.${baseClassName2}`,
                              `${baseSchemaName}.${baseClassName3}`,
                            ],
                          },
                        },
                      })}
                      FROM (
                        SELECT ECClassId, ECInstanceId, UserLabel, Parent, CodeValue
                        FROM ${subjectClassName}
                        UNION ALL
                        SELECT ECClassId, ECInstanceId, UserLabel, Parent, CodeValue
                        FROM ${physicalPartitionClassName}
                      ) AS this
                      WHERE this.Parent.Id = (${IModel.rootSubjectId})
                        AND NOT this.CodeValue = 'B6'
                    `,
                  },
                },
                {
                  fullClassName: physicalPartitionClassName,
                  query: {
                    ecsql: `
                      SELECT ${await selectClauseFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.UserLabel` },
                        grouping: {
                          byBaseClasses: {
                            fullClassNames: [`${baseSchemaName}.${baseClassName1}`],
                          },
                        },
                      })}
                      FROM ${physicalPartitionClassName} AS this
                      WHERE this.Parent.Id = (${IModel.rootSubjectId})
                        AND this.CodeValue = 'B6'
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
            NodeValidators.createForClassGroupingNode({
              label: "Element",
              className: `${baseSchemaName}.${baseClassName1}`,
              children: [
                NodeValidators.createForClassGroupingNode({
                  label: "Information Content Element",
                  className: `${baseSchemaName}.${baseClassName2}`,
                  children: [
                    NodeValidators.createForClassGroupingNode({
                      label: "Information Partition",
                      className: `${baseSchemaName}.${baseClassName3}`,
                      children: [
                        NodeValidators.createForInstanceNode({
                          instanceKeys: [keys.childPartition3],
                          children: false,
                        }),
                        NodeValidators.createForInstanceNode({
                          instanceKeys: [keys.childPartition4],
                          children: false,
                        }),
                        NodeValidators.createForInstanceNode({
                          instanceKeys: [keys.childPartition5],
                          children: false,
                        }),
                      ],
                    }),
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.childSubject1],
                      children: false,
                    }),
                    NodeValidators.createForInstanceNode({
                      instanceKeys: [keys.childSubject2],
                      children: false,
                    }),
                  ],
                }),
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.childPartition6],
                  children: false,
                }),
              ],
            }),
          ],
        });
      });
    });
  });
});
