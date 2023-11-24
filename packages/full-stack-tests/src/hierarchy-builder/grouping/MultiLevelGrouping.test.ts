/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PhysicalPartition, Subject } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { IHierarchyLevelDefinitionsFactory, NodeSelectQueryFactory } from "@itwin/presentation-hierarchy-builder";
import { buildIModel, insertPhysicalPartition, insertSubject } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation";
import { createMetadataProvider, createProvider } from "../Utils";

describe("Stateless hierarchy builder", () => {
  describe("Multi level grouping", () => {
    let subjectClassName: string;
    let physicalPartitionClassName: string;

    before(async function () {
      await initialize();
      subjectClassName = Subject.classFullName.replace(":", ".");
      physicalPartitionClassName = PhysicalPartition.classFullName.replace(":", ".");
    });

    after(async () => {
      await terminate();
    });

    it("groups by base class, class, property and label", async function () {
      const labelGroupName1 = "test1";
      const labelGroupName2 = "test2";
      const description1 = "test description1";
      const description2 = "test description2";
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const childSubject1 = insertSubject({
          builder,
          codeValue: "A1",
          parentId: IModel.rootSubjectId,
          userLabel: labelGroupName1,
          description: description1,
        });
        const childSubject2 = insertSubject({
          builder,
          codeValue: "A2",
          parentId: IModel.rootSubjectId,
          userLabel: labelGroupName1,
          description: description1,
        });
        const childPartition3 = insertPhysicalPartition({
          builder,
          codeValue: "B3",
          parentId: IModel.rootSubjectId,
          userLabel: labelGroupName1,
          description: description1,
        });
        const childPartition4 = insertPhysicalPartition({
          builder,
          codeValue: "B4",
          parentId: IModel.rootSubjectId,
          userLabel: labelGroupName2,
          description: description1,
        });
        const childPartition5 = insertPhysicalPartition({
          builder,
          codeValue: "B5",
          parentId: IModel.rootSubjectId,
          userLabel: labelGroupName2,
          description: description2,
        });
        return { childSubject1, childSubject2, childPartition3, childPartition4, childPartition5 };
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
                        byClass: true,
                        byLabel: true,
                        byBaseClasses: {
                          fullClassNames: ["BisCore.InformationContentElement", "BisCore.InformationPartitionElement"],
                        },
                        byProperties: {
                          propertiesClassName: "BisCore.Subject",
                          propertyGroups: [
                            {
                              propertyName: "Description",
                              propertyValue: { selector: `this.Description` },
                            },
                          ],
                        },
                      },
                    })}
                    FROM (
                      SELECT ECClassId, ECInstanceId, UserLabel, Parent, Description
                      FROM ${subjectClassName}
                    ) AS this
                    WHERE this.Parent.Id = (${IModel.rootSubjectId})
                  `,
                },
              },
              {
                fullClassName: `BisCore.InformationContentElement`,
                query: {
                  ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.UserLabel` },
                      grouping: {
                        byClass: true,
                        byLabel: true,
                        byBaseClasses: {
                          fullClassNames: ["BisCore.InformationContentElement", "BisCore.InformationPartitionElement"],
                        },
                        byProperties: {
                          propertiesClassName: "BisCore.PhysicalPartition",
                          propertyGroups: [
                            {
                              propertyName: "Description",
                              propertyValue: { selector: `this.Description` },
                            },
                          ],
                        },
                      },
                    })}
                    FROM (
                      SELECT ECClassId, ECInstanceId, UserLabel, Parent, Description
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
            label: "Information Content Element",
            className: "BisCore.InformationContentElement",
            children: [
              NodeValidators.createForClassGroupingNode({
                label: "Information Partition",
                className: "BisCore.InformationPartitionElement",
                children: [
                  NodeValidators.createForClassGroupingNode({
                    className: physicalPartitionClassName,
                    children: [
                      NodeValidators.createForPropertyValueGroupingNode({
                        label: description1,
                        propertiesClassName: "BisCore.PhysicalPartition",
                        propertyName: "Description",
                        formattedPropertyValue: description1,
                        children: [
                          NodeValidators.createForLabelGroupingNode({
                            label: labelGroupName1,
                            children: [
                              NodeValidators.createForInstanceNode({
                                instanceKeys: [keys.childPartition3],
                                children: false,
                              }),
                            ],
                          }),
                          NodeValidators.createForLabelGroupingNode({
                            label: labelGroupName2,
                            children: [
                              NodeValidators.createForInstanceNode({
                                instanceKeys: [keys.childPartition4],
                                children: false,
                              }),
                            ],
                          }),
                        ],
                      }),
                      NodeValidators.createForPropertyValueGroupingNode({
                        label: description2,
                        propertiesClassName: "BisCore.PhysicalPartition",
                        formattedPropertyValue: description2,
                        propertyName: "Description",
                        children: [
                          NodeValidators.createForLabelGroupingNode({
                            label: labelGroupName2,
                            children: [
                              NodeValidators.createForInstanceNode({
                                instanceKeys: [keys.childPartition5],
                                children: false,
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              NodeValidators.createForClassGroupingNode({
                className: subjectClassName,
                children: [
                  NodeValidators.createForPropertyValueGroupingNode({
                    label: description1,
                    propertiesClassName: "BisCore.Subject",
                    formattedPropertyValue: description1,
                    propertyName: "Description",
                    children: [
                      NodeValidators.createForLabelGroupingNode({
                        label: labelGroupName1,
                        children: [
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
          }),
        ],
      });
    });
  });
});
