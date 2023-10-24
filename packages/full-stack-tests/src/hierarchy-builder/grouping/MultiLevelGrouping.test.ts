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
import { HierarchyProvider, IHierarchyLevelDefinitionsFactory, NodeSelectClauseFactory } from "@itwin/presentation-hierarchy-builder";
import { buildIModel, insertPhysicalPartition, insertSubject } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation";

describe("Stateless hierarchy builder", () => {
  describe("Multi level grouping", () => {
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

    it("groups by base class, class and label", async function () {
      const labelGroupName1 = "test1";
      const labelGroupName2 = "test2";
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, userLabel: labelGroupName1 });
        const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId, userLabel: labelGroupName1 });
        const childPartition3 = insertPhysicalPartition({ builder, codeValue: "B3", parentId: IModel.rootSubjectId, userLabel: labelGroupName1 });
        const childPartition4 = insertPhysicalPartition({ builder, codeValue: "B4", parentId: IModel.rootSubjectId, userLabel: labelGroupName2 });
        const childPartition5 = insertPhysicalPartition({ builder, codeValue: "B5", parentId: IModel.rootSubjectId, userLabel: labelGroupName2 });
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
                        byClass: true,
                        byLabel: true,
                        byBaseClasses: {
                          fullClassNames: ["BisCore.InformationContentElement", "BisCore.InformationPartitionElement"],
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
            label: "BisCore.InformationContentElement",
            className: "BisCore.InformationContentElement",
            children: [
              NodeValidators.createForClassGroupingNode({
                label: "BisCore.InformationPartitionElement",
                className: "BisCore.InformationPartitionElement",
                children: [
                  NodeValidators.createForClassGroupingNode({
                    className: physicalPartitionClassName,
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
              NodeValidators.createForClassGroupingNode({
                className: subjectClassName,
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
      });
    });
  });
});
