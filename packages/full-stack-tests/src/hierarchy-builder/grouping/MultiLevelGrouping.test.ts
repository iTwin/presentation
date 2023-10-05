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
  describe("Label and Class grouping", () => {
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

    it("groups by class and label", async function () {
      const labelGroupName1 = "test1";
      const labelGroupName2 = "test2";
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
        const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: rootSubject.id, userLabel: labelGroupName1 });
        const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: rootSubject.id, userLabel: labelGroupName1 });
        const childPartition3 = insertPhysicalPartition({ builder, codeValue: "B3", parentId: rootSubject.id, userLabel: labelGroupName1 });
        const childPartition4 = insertPhysicalPartition({ builder, codeValue: "B4", parentId: rootSubject.id, userLabel: labelGroupName2 });
        const childPartition5 = insertPhysicalPartition({ builder, codeValue: "B5", parentId: rootSubject.id, userLabel: labelGroupName2 });
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
                fullClassName: subjectClassName,
                query: {
                  ecsql: `
                      SELECT ${await selectClauseFactory.createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.UserLabel` },
                        groupByClass: true,
                        groupByLabel: true,
                      })}
                      FROM ${subjectClassName} AS this
                      WHERE this.Parent.Id = (${IModel.rootSubjectId})
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
                        groupByClass: true,
                        groupByLabel: true,
                      })}
                      FROM ${physicalPartitionClassName} AS this
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
              NodeValidators.createForClassGroupingNode({
                className: physicalPartitionClassName,
                children: [
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
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.childPartition3],
                    children: false,
                  }),
                ],
              }),
              NodeValidators.createForClassGroupingNode({
                className: subjectClassName,
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
      });
    });
  });
});
