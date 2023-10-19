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
  describe("ClassGrouping", () => {
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

    const basicHierarchy: IHierarchyLevelDefinitionsFactory = {
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
                      byClass: true,
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

    it("creates different groups for different classes", async function () {
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
        const childSubject1 = insertSubject({ builder, codeValue: "1", parentId: rootSubject.id });
        const childPartition2 = insertPhysicalPartition({ builder, codeValue: "2", parentId: rootSubject.id });
        const childSubject3 = insertSubject({ builder, codeValue: "3", parentId: rootSubject.id });
        const childPartition4 = insertPhysicalPartition({ builder, codeValue: "4", parentId: rootSubject.id });
        return { rootSubject, childSubject1, childPartition2, childSubject3, childPartition4 };
      });

      await validateHierarchy({
        provider: createProvider({ imodel, hierarchy: basicHierarchy }),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.rootSubject],
            children: [
              NodeValidators.createForClassGroupingNode({
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.childPartition2],
                    children: false,
                  }),
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.childPartition4],
                    children: false,
                  }),
                ],
              }),
              NodeValidators.createForClassGroupingNode({
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.childSubject1],
                    children: false,
                  }),
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.childSubject3],
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
