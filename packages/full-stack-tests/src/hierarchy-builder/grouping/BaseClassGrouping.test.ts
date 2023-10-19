/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PhysicalPartition, Subject } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { createECSqlQueryExecutor, createMetadataProvider } from "@itwin/presentation-core-interop";
import { HierarchyNode, HierarchyProvider, IHierarchyLevelDefinitionsFactory, NodeSelectClauseFactory } from "@itwin/presentation-hierarchy-builder";
import { buildIModel, insertPhysicalPartition, insertSubject } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation";

describe("Stateless hierarchy builder", () => {
  describe("BaseClassGrouping", () => {
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

    function createProvider(props: { imodel: IModelConnection; hierarchy: IHierarchyLevelDefinitionsFactory }) {
      const { imodel, hierarchy } = props;
      const schemas = new SchemaContext();
      schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
      const metadataProvider = createMetadataProvider(schemas);
      return new HierarchyProvider({
        metadataProvider,
        hierarchyDefinition: hierarchy,
        queryExecutor: createECSqlQueryExecutor(imodel),
      });
    }
    describe("does not group", () => {
      let sharedIModel: IModelConnection;
      let sharedKeys: any;
      beforeEach(async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: rootSubject.id });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: rootSubject.id });
          const childPartition3 = insertPhysicalPartition({ builder, codeValue: "B3", parentId: rootSubject.id });
          const childPartition4 = insertPhysicalPartition({ builder, codeValue: "B4", parentId: rootSubject.id });
          const childPartition5 = insertPhysicalPartition({ builder, codeValue: "B5", parentId: rootSubject.id });
          return { rootSubject, childSubject1, childSubject2, childPartition3, childPartition4, childPartition5 };
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
                  fullClassName: subjectClassName,
                  query: {
                    ecsql: `
                    SELECT ${await selectClauseFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: "root subject",
                    })}
                    FROM ${subjectClassName} AS this
                    WHERE this.ECInstanceId = (${IModel.rootSubjectId})
                  `,
                  },
                },
              ];
            } else if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "root subject") {
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
                          baseClassInfo: [
                            { className: "GraphicalPartition3d", schemaName: "BisCore" },
                            { className: "LinkElement", schemaName: "BisCore" },
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
          provider: createProvider({ imodel: sharedIModel, hierarchy: customHierarchy }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [sharedKeys.rootSubject],
              children: [
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
            }),
          ],
        });
      });
    });

    describe("groups", () => {
      it("when base class is parent", async function () {
        const baseClassName = "InformationPartitionElement";
        const baseSchemaName = "BisCore";
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: rootSubject.id });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: rootSubject.id });
          const childPartition3 = insertPhysicalPartition({ builder, codeValue: "B3", parentId: rootSubject.id });
          const childPartition4 = insertPhysicalPartition({ builder, codeValue: "B4", parentId: rootSubject.id });
          const childPartition5 = insertPhysicalPartition({ builder, codeValue: "B5", parentId: rootSubject.id });
          return { rootSubject, childSubject1, childSubject2, childPartition3, childPartition4, childPartition5 };
        });

        const customHierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  fullClassName: subjectClassName,
                  query: {
                    ecsql: `
                      SELECT ${await selectClauseFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: "root subject",
                      })}
                      FROM ${subjectClassName} AS this
                      WHERE this.ECInstanceId = (${IModel.rootSubjectId})
                    `,
                  },
                },
              ];
            } else if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "root subject") {
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
                            baseClassInfo: [{ className: baseClassName, schemaName: baseSchemaName }],
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
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootSubject],
              children: [
                NodeValidators.createForBaseClassGroupingNode({
                  label: `${baseSchemaName}.${baseClassName}`,
                  baseClassName: `${baseSchemaName}.${baseClassName}`,
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
        });
      });

      it("when multiple base classes are parents", async function () {
        const baseClassName1 = "Element";
        const baseClassName2 = "InformationContentElement";
        const baseClassName3 = "InformationPartitionElement";
        const baseSchemaName = "BisCore";
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: rootSubject.id });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: rootSubject.id });
          const childPartition3 = insertPhysicalPartition({ builder, codeValue: "B3", parentId: rootSubject.id });
          const childPartition4 = insertPhysicalPartition({ builder, codeValue: "B4", parentId: rootSubject.id });
          const childPartition5 = insertPhysicalPartition({ builder, codeValue: "B5", parentId: rootSubject.id });
          return { rootSubject, childSubject1, childSubject2, childPartition3, childPartition4, childPartition5 };
        });

        const customHierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  fullClassName: subjectClassName,
                  query: {
                    ecsql: `
                      SELECT ${await selectClauseFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: "root subject",
                      })}
                      FROM ${subjectClassName} AS this
                      WHERE this.ECInstanceId = (${IModel.rootSubjectId})
                    `,
                  },
                },
              ];
            } else if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "root subject") {
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
                            baseClassInfo: [
                              { className: baseClassName1, schemaName: baseSchemaName },
                              { className: baseClassName2, schemaName: baseSchemaName },
                              { className: baseClassName3, schemaName: baseSchemaName },
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
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootSubject],
              children: [
                NodeValidators.createForBaseClassGroupingNode({
                  label: `${baseSchemaName}.${baseClassName1}`,
                  baseClassName: `${baseSchemaName}.${baseClassName1}`,
                  children: [
                    NodeValidators.createForBaseClassGroupingNode({
                      label: `${baseSchemaName}.${baseClassName2}`,
                      baseClassName: `${baseSchemaName}.${baseClassName2}`,
                      children: [
                        NodeValidators.createForBaseClassGroupingNode({
                          label: `${baseSchemaName}.${baseClassName3}`,
                          baseClassName: `${baseSchemaName}.${baseClassName3}`,
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
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: rootSubject.id });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: rootSubject.id });
          const childPartition3 = insertPhysicalPartition({ builder, codeValue: "B3", parentId: rootSubject.id });
          const childPartition4 = insertPhysicalPartition({ builder, codeValue: "B4", parentId: rootSubject.id });
          const childPartition5 = insertPhysicalPartition({ builder, codeValue: "B5", parentId: rootSubject.id });
          const childPartition6 = insertPhysicalPartition({ builder, codeValue: "B6", parentId: rootSubject.id });
          return { rootSubject, childSubject1, childSubject2, childPartition3, childPartition4, childPartition5, childPartition6 };
        });

        const customHierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  fullClassName: subjectClassName,
                  query: {
                    ecsql: `
                      SELECT ${await selectClauseFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: "root subject",
                      })}
                      FROM ${subjectClassName} AS this
                      WHERE this.ECInstanceId = (${IModel.rootSubjectId})
                    `,
                  },
                },
              ];
            } else if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "root subject") {
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
                            baseClassInfo: [
                              { className: baseClassName1, schemaName: baseSchemaName },
                              { className: baseClassName2, schemaName: baseSchemaName },
                              { className: baseClassName3, schemaName: baseSchemaName },
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
                            baseClassInfo: [
                              { className: baseClassName2, schemaName: baseSchemaName },
                              { className: baseClassName3, schemaName: baseSchemaName },
                            ],
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
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootSubject],
              children: [
                NodeValidators.createForBaseClassGroupingNode({
                  label: `${baseSchemaName}.${baseClassName1}`,
                  baseClassName: `${baseSchemaName}.${baseClassName1}`,
                  children: [
                    NodeValidators.createForBaseClassGroupingNode({
                      label: `${baseSchemaName}.${baseClassName2}`,
                      baseClassName: `${baseSchemaName}.${baseClassName2}`,
                      children: [
                        NodeValidators.createForBaseClassGroupingNode({
                          label: `${baseSchemaName}.${baseClassName3}`,
                          baseClassName: `${baseSchemaName}.${baseClassName3}`,
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
                NodeValidators.createForBaseClassGroupingNode({
                  label: `${baseSchemaName}.${baseClassName2}`,
                  baseClassName: `${baseSchemaName}.${baseClassName2}`,
                  children: [
                    NodeValidators.createForBaseClassGroupingNode({
                      label: `${baseSchemaName}.${baseClassName3}`,
                      baseClassName: `${baseSchemaName}.${baseClassName3}`,
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
          const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: rootSubject.id });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: rootSubject.id });
          const childPartition3 = insertPhysicalPartition({ builder, codeValue: "B3", parentId: rootSubject.id });
          const childPartition4 = insertPhysicalPartition({ builder, codeValue: "B4", parentId: rootSubject.id });
          const childPartition5 = insertPhysicalPartition({ builder, codeValue: "B5", parentId: rootSubject.id });
          const childPartition6 = insertPhysicalPartition({ builder, codeValue: "B6", parentId: rootSubject.id });
          return { rootSubject, childSubject1, childSubject2, childPartition3, childPartition4, childPartition5, childPartition6 };
        });

        const customHierarchy: IHierarchyLevelDefinitionsFactory = {
          async defineHierarchyLevel(parentNode) {
            if (!parentNode) {
              return [
                {
                  fullClassName: subjectClassName,
                  query: {
                    ecsql: `
                      SELECT ${await selectClauseFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: "root subject",
                      })}
                      FROM ${subjectClassName} AS this
                      WHERE this.ECInstanceId = (${IModel.rootSubjectId})
                    `,
                  },
                },
              ];
            } else if (HierarchyNode.isInstancesNode(parentNode) && parentNode.label === "root subject") {
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
                            baseClassInfo: [
                              { className: baseClassName1, schemaName: baseSchemaName },
                              { className: baseClassName2, schemaName: baseSchemaName },
                              { className: baseClassName3, schemaName: baseSchemaName },
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
                            baseClassInfo: [{ className: baseClassName1, schemaName: baseSchemaName }],
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
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.rootSubject],
              children: [
                NodeValidators.createForBaseClassGroupingNode({
                  label: `${baseSchemaName}.${baseClassName1}`,
                  baseClassName: `${baseSchemaName}.${baseClassName1}`,
                  children: [
                    NodeValidators.createForBaseClassGroupingNode({
                      label: `${baseSchemaName}.${baseClassName2}`,
                      baseClassName: `${baseSchemaName}.${baseClassName2}`,
                      children: [
                        NodeValidators.createForBaseClassGroupingNode({
                          label: `${baseSchemaName}.${baseClassName3}`,
                          baseClassName: `${baseSchemaName}.${baseClassName3}`,
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
            }),
          ],
        });
      });
    });
  });
});
