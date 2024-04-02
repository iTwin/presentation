/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { insertPhysicalPartition, insertSubject } from "presentation-test-utilities";
import { PhysicalPartition, Subject } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { IHierarchyLevelDefinitionsFactory, NodeSelectQueryFactory } from "@itwin/presentation-hierarchies";
import { buildIModel } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation";
import { createMetadataProvider, createProvider } from "../Utils";

describe("Stateless hierarchy builder", () => {
  describe("Class grouping", () => {
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

    it("creates different groups for different classes", async function () {
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const childSubject1 = insertSubject({ builder, codeValue: "1", parentId: IModel.rootSubjectId });
        const childPartition2 = insertPhysicalPartition({ builder, codeValue: "2", parentId: IModel.rootSubjectId });
        const childSubject3 = insertSubject({ builder, codeValue: "3", parentId: IModel.rootSubjectId });
        const childPartition4 = insertPhysicalPartition({ builder, codeValue: "4", parentId: IModel.rootSubjectId });
        return { childSubject1, childPartition2, childSubject3, childPartition4 };
      });

      const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
      const hierarchy: IHierarchyLevelDefinitionsFactory = {
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
                      grouping: {
                        byClass: true,
                      },
                    })}
                    FROM (
                      SELECT ECClassId, ECInstanceId, CodeValue, Parent
                      FROM ${subjectClassName}
                      UNION ALL
                      SELECT ECClassId, ECInstanceId, CodeValue, Parent
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
        provider: createProvider({ imodel, hierarchy }),
        expect: [
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
      });
    });
  });
});
