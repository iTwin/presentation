/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Subject } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { IHierarchyLevelDefinitionsFactory, NodeSelectClauseFactory, PropertiesGroupingParams } from "@itwin/presentation-hierarchy-builder";
import { buildIModel, insertSubject } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation";
import { createProvider } from "../Utils";

describe("Stateless hierarchy builder", () => {
  describe("Properties grouping", () => {
    let selectClauseFactory: NodeSelectClauseFactory;
    let subjectClassName: string;
    let emptyIModel: IModelConnection;

    before(async function () {
      await initialize();
      emptyIModel = (await buildIModel(this)).imodel;
      subjectClassName = Subject.classFullName.replace(":", ".");
      selectClauseFactory = new NodeSelectClauseFactory();
    });

    after(async () => {
      await terminate();
    });

    function createHierarchyWithSpecifiedGrouping(specifiedGrouping: PropertiesGroupingParams): IHierarchyLevelDefinitionsFactory {
      return {
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
                      byProperties: specifiedGrouping,
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
    }

    it("doesn't create grouping nodes if provided properties class isn't base of nodes class", async function () {
      const groupingParams: PropertiesGroupingParams = {
        fullClassName: "BisCore.PhysicalPartition",
        propertyGroups: [{ propertyName: "description", propertyValue: "description" }],
      };

      await validateHierarchy({
        provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(groupingParams) }),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
            children: false,
          }),
        ],
      });
    });

    it("creates formatted property grouping nodes if provided properties grouping without range", async function () {
      const groupingParams: PropertiesGroupingParams = {
        fullClassName: "BisCore.Subject",
        propertyGroups: [{ propertyName: "description", propertyValue: "TestDescription" }],
      };

      await validateHierarchy({
        provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(groupingParams) }),
        expect: [
          NodeValidators.createForFormattedPropertyGroupingNode({
            label: "TestDescription",
            fullClassName: "BisCore.Subject",
            propertyName: "description",
            formattedPropertyValue: "TestDescription",
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

    it("creates ranged property grouping nodes if provided properties grouping with range", async function () {
      const groupingParams: PropertiesGroupingParams = {
        fullClassName: "BisCore.Subject",
        propertyGroups: [{ propertyName: "description", propertyValue: 1.5, ranges: [{ fromValue: 1, toValue: 2 }] }],
      };

      await validateHierarchy({
        provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(groupingParams) }),
        expect: [
          NodeValidators.createForRangedPropertyGroupingNode({
            label: "1 - 2",
            fullClassName: "BisCore.Subject",
            propertyName: "description",
            fromValue: 1,
            toValue: 2,
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

    it("creates ranged property grouping nodes and applies range label if provided properties grouping with range and range label", async function () {
      const groupingParams: PropertiesGroupingParams = {
        fullClassName: "BisCore.Subject",
        propertyGroups: [{ propertyName: "description", propertyValue: 1.5, ranges: [{ fromValue: 1, toValue: 2, rangeLabel: "TestLabel" }] }],
      };

      await validateHierarchy({
        provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(groupingParams) }),
        expect: [
          NodeValidators.createForRangedPropertyGroupingNode({
            label: "TestLabel",
            fullClassName: "BisCore.Subject",
            propertyName: "description",
            fromValue: 1,
            toValue: 2,
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

    it("creates other property grouping nodes if provided properties don't fit in the range", async function () {
      const groupingParams: PropertiesGroupingParams = {
        fullClassName: "BisCore.Subject",
        propertyGroups: [{ propertyName: "description", propertyValue: 2.5, ranges: [{ fromValue: 1, toValue: 2, rangeLabel: "TestLabel" }] }],
      };

      await validateHierarchy({
        provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(groupingParams) }),
        expect: [
          NodeValidators.createForOtherPropertyGroupingNode({
            fullClassName: "BisCore.Subject",
            propertyName: "description",
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

    it("creates multiple grouping nodes if node has multiple property groupings", async function () {
      const groupingParams: PropertiesGroupingParams = {
        fullClassName: "BisCore.Subject",
        propertyGroups: [
          { propertyName: "UserLabel", propertyValue: "TestLabel" },
          { propertyName: "Description", propertyValue: "TestDescription" },
        ],
      };

      await validateHierarchy({
        provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(groupingParams) }),
        expect: [
          NodeValidators.createForFormattedPropertyGroupingNode({
            label: "TestLabel",
            fullClassName: "BisCore.Subject",
            propertyName: "UserLabel",
            formattedPropertyValue: "TestLabel",
            children: [
              NodeValidators.createForFormattedPropertyGroupingNode({
                label: "TestDescription",
                fullClassName: "BisCore.Subject",
                propertyName: "Description",
                formattedPropertyValue: "TestDescription",
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
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
                          byProperties: {
                            fullClassName: "BisCore.Subject",
                            propertyGroups: [{ propertyName: "UserLabel", propertyValue: { selector: "this.UserLabel" } }],
                          },
                        },
                      })}
                      FROM (
                        SELECT ECClassId, ECInstanceId, UserLabel, Parent
                        FROM ${subjectClassName}
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
          NodeValidators.createForFormattedPropertyGroupingNode({
            label: "Test1",
            fullClassName: "BisCore.Subject",
            propertyName: "UserLabel",
            formattedPropertyValue: "Test1",
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.childSubject1],
                children: false,
              }),
            ],
          }),
          NodeValidators.createForFormattedPropertyGroupingNode({
            label: "Test2",
            fullClassName: "BisCore.Subject",
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
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId });
        return { childSubject1 };
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
                          byProperties: {
                            fullClassName: "BisCore.Subject",
                            propertyGroups: [
                              {
                                propertyName: "UserLabel",
                                propertyValue: 1,
                                ranges: [
                                  { fromValue: 0, toValue: 2 },
                                  { fromValue: 3, toValue: 5 },
                                ],
                              },
                            ],
                          },
                        },
                      })}
                      FROM (
                        SELECT ECClassId, ECInstanceId, UserLabel, Parent
                        FROM ${subjectClassName}
                      ) AS this
                      WHERE this.ECInstanceId = (${IModel.rootSubjectId})
                    `,
                },
              },
              {
                fullClassName: `BisCore.InformationContentElement`,
                query: {
                  ecsql: `
                      SELECT ${await selectClauseFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.UserLabel` },
                        grouping: {
                          byProperties: {
                            fullClassName: "BisCore.Subject",
                            propertyGroups: [
                              {
                                propertyName: "UserLabel",
                                propertyValue: 3,
                                ranges: [
                                  { fromValue: 0, toValue: 2 },
                                  { fromValue: 3, toValue: 5 },
                                ],
                              },
                            ],
                          },
                        },
                      })}
                      FROM (
                        SELECT ECClassId, ECInstanceId, UserLabel, Parent
                        FROM ${subjectClassName}
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
          NodeValidators.createForRangedPropertyGroupingNode({
            label: "0 - 2",
            fullClassName: "BisCore.Subject",
            propertyName: "UserLabel",
            fromValue: 0,
            toValue: 2,
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
                children: false,
              }),
            ],
          }),
          NodeValidators.createForRangedPropertyGroupingNode({
            label: "3 - 5",
            fullClassName: "BisCore.Subject",
            propertyName: "UserLabel",
            fromValue: 3,
            toValue: 5,
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
  });
});
