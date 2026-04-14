/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { insertPhysicalPartition, insertSubject } from "presentation-test-utilities";
import { afterAll, describe, it, test } from "vitest";
import { PhysicalPartition, Subject } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory, normalizeFullClassName } from "@itwin/presentation-shared";
import { buildTestIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { createIModelAccess, createProvider } from "../Utils.js";

import type { IModelConnection } from "@itwin/core-frontend";
import type { HierarchyDefinition } from "@itwin/presentation-hierarchies";
import type { EC } from "@itwin/presentation-shared";

describe("Hierarchies", () => {
  describe("Base class grouping", () => {
    let subjectClassName: EC.FullClassName;
    let physicalPartitionClassName: EC.FullClassName;
    let emptyIModel: IModelConnection;

    test.beforeAll(async (_, suite) => {
      await initialize();
      emptyIModel = (await buildTestIModel(suite.fullTestName!)).imodelConnection;
      subjectClassName = normalizeFullClassName(Subject.classFullName);
      physicalPartitionClassName = normalizeFullClassName(PhysicalPartition.classFullName);
    });

    afterAll(async () => {
      await terminate();
    });
    it("doesn't create grouping nodes if provided classes aren't base for node class", async () => {
      const imodelAccess = createIModelAccess(emptyIModel);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
          classHierarchyInspector: imodelAccess,
        }),
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
                        byBaseClasses: { fullClassNames: ["BisCore.GraphicalPartition3d", "BisCore.LinkElement"] },
                      },
                    })}
                    FROM (
                      SELECT ECClassId, ECInstanceId, UserLabel, Parent
                      FROM ${subjectClassName}
                    ) AS this
                  `,
                },
              },
            ];
          }
          return [];
        },
      };

      await validateHierarchy({
        provider: createProvider({ imodel: emptyIModel, hierarchy: customHierarchy }),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
            children: false,
          }),
        ],
      });
    });

    it("doesn't create grouping nodes if provided classes aren't of entity or relationship type", async () => {
      const imodelAccess = createIModelAccess(emptyIModel);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
          classHierarchyInspector: imodelAccess,
        }),
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
                        byBaseClasses: { fullClassNames: ["BisCore.IParentElement", "BisCore.ISubModeledElement"] },
                      },
                    })}
                    FROM (
                      SELECT ECClassId, ECInstanceId, UserLabel, Parent
                      FROM ${subjectClassName}
                    ) AS this
                  `,
                },
              },
            ];
          }
          return [];
        },
      };

      await validateHierarchy({
        provider: createProvider({ imodel: emptyIModel, hierarchy: customHierarchy }),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
            children: false,
          }),
        ],
      });
    });

    it("creates grouping nodes if provided class is base for node class", async () => {
      const baseClassName = "BisCore.InformationContentElement";
      const imodelAccess = createIModelAccess(emptyIModel);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
          classHierarchyInspector: imodelAccess,
        }),
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
                        grouping: { byBaseClasses: { fullClassNames: [baseClassName] } },
                      })}
                      FROM (
                        SELECT ECClassId, ECInstanceId, UserLabel, Parent
                        FROM ${subjectClassName}
                      ) AS this
                    `,
                },
              },
            ];
          }
          return [];
        },
      };

      await validateHierarchy({
        provider: createProvider({ imodel: emptyIModel, hierarchy: customHierarchy }),
        expect: [
          NodeValidators.createForClassGroupingNode({
            label: "Information Content Element",
            className: baseClassName,
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
                children: false,
              }),
            ],
          }),
        ],
      });
    });

    it("creates multiple grouping nodes if provided base classes are base for node and for provided other base class", async () => {
      const baseClassName1 = "Element";
      const baseClassName2 = "InformationContentElement";
      const baseClassName3 = "InformationPartitionElement";
      const baseSchemaName = "BisCore";
      const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
        const childPartition1 = insertPhysicalPartition({ imodel, codeValue: "B1", parentId: IModel.rootSubjectId });
        return { childPartition1 };
      });

      const imodelAccess = createIModelAccess(imodelConnection);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
          classHierarchyInspector: imodelAccess,
        }),
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
        provider: createProvider({ imodel: imodelConnection, hierarchy: customHierarchy }),
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
                      NodeValidators.createForInstanceNode({ instanceKeys: [keys.childPartition1], children: false }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });
    });

    it("creates different grouping nodes if nodes of the same class have different base classes provided", async () => {
      const baseClassName1 = "Element";
      const baseClassName2 = "InformationContentElement";
      const baseClassName3 = "InformationPartitionElement";
      const baseSchemaName = "BisCore";
      const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
        const childPartition1 = insertPhysicalPartition({ imodel, codeValue: "B1", parentId: IModel.rootSubjectId });
        const childPartition2 = insertPhysicalPartition({ imodel, codeValue: "B2", parentId: IModel.rootSubjectId });
        return { childPartition1, childPartition2 };
      });

      const imodelAccess = createIModelAccess(imodelConnection);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
          classHierarchyInspector: imodelAccess,
        }),
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
                        FROM ${physicalPartitionClassName}
                      ) AS this
                      WHERE this.Parent.Id = (${IModel.rootSubjectId})
                        AND NOT this.CodeValue = 'B2'
                    `,
                },
              },
              {
                fullClassName: physicalPartitionClassName,
                query: {
                  ecsql: `
                      SELECT ${await selectQueryFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.UserLabel` },
                        grouping: {
                          byBaseClasses: {
                            fullClassNames: [
                              `${baseSchemaName}.${baseClassName2}`,
                              `${baseSchemaName}.${baseClassName3}`,
                            ],
                          },
                        },
                      })}
                      FROM ${physicalPartitionClassName} AS this
                      WHERE this.Parent.Id = (${IModel.rootSubjectId})
                        AND this.CodeValue = 'B2'
                    `,
                },
              },
            ];
          }
          return [];
        },
      };

      await validateHierarchy({
        provider: createProvider({ imodel: imodelConnection, hierarchy: customHierarchy }),
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
                      NodeValidators.createForInstanceNode({ instanceKeys: [keys.childPartition1], children: false }),
                    ],
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
                  NodeValidators.createForInstanceNode({ instanceKeys: [keys.childPartition2], children: false }),
                ],
              }),
            ],
          }),
        ],
      });
    });

    it("groups nodes of different classes if they share the same base class", async () => {
      const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
        const childSubject1 = insertSubject({ imodel, codeValue: "A1", parentId: IModel.rootSubjectId });
        const childPartition2 = insertPhysicalPartition({ imodel, codeValue: "B2", parentId: IModel.rootSubjectId });
        return { childSubject1, childPartition2 };
      });

      const imodelAccess = createIModelAccess(imodelConnection);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({
          classHierarchyInspector: imodelAccess,
        }),
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
                        nodeLabel: { selector: `this.CodeValue` },
                        grouping: { byBaseClasses: { fullClassNames: ["BisCore.Element"] } },
                      })}
                      FROM (
                        SELECT ECClassId, ECInstanceId, Parent, CodeValue
                        FROM ${subjectClassName}
                        UNION ALL
                        SELECT ECClassId, ECInstanceId, Parent, CodeValue
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
        provider: createProvider({ imodel: imodelConnection, hierarchy: customHierarchy }),
        expect: [
          NodeValidators.createForClassGroupingNode({
            label: "Element",
            className: "BisCore.Element",
            children: [
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject1], children: false }),
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.childPartition2], children: false }),
            ],
          }),
        ],
      });
    });
  });
});
