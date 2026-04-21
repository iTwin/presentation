/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { insertPhysicalPartition, insertSubject } from "presentation-test-utilities";
import { afterAll, beforeAll, describe, it } from "vitest";
import { PhysicalPartition, Subject } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";
import { createIModelInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";
import { buildTestIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { createIModelAccess, createProvider } from "../Utils.js";

import type { HierarchyDefinition } from "@itwin/presentation-hierarchies";

describe("Hierarchies", () => {
  describe("Class grouping", () => {
    let subjectClassName: string;
    let physicalPartitionClassName: string;

    beforeAll(async () => {
      await initialize();
      subjectClassName = Subject.classFullName.replace(":", ".");
      physicalPartitionClassName = PhysicalPartition.classFullName.replace(":", ".");
    });

    afterAll(async () => {
      await terminate();
    });

    it("creates different groups for different classes", async () => {
      const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
        const childSubject1 = insertSubject({ imodel, codeValue: "1", parentId: IModel.rootSubjectId });
        const childPartition2 = insertPhysicalPartition({ imodel, codeValue: "2", parentId: IModel.rootSubjectId });
        const childSubject3 = insertSubject({ imodel, codeValue: "3", parentId: IModel.rootSubjectId });
        const childPartition4 = insertPhysicalPartition({ imodel, codeValue: "4", parentId: IModel.rootSubjectId });
        return { childSubject1, childPartition2, childSubject3, childPartition4 };
      });

      const imodelAccess = createIModelAccess(imodelConnection);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createIModelInstanceLabelSelectClauseFactory({ imodelAccess }),
      });
      const hierarchy: HierarchyDefinition = {
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
                      grouping: { byClass: true },
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
        provider: createProvider({ imodel: imodelConnection, hierarchy }),
        expect: [
          NodeValidators.createForClassGroupingNode({
            children: [
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.childPartition2], children: false }),
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.childPartition4], children: false }),
            ],
          }),
          NodeValidators.createForClassGroupingNode({
            children: [
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject1], children: false }),
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject3], children: false }),
            ],
          }),
        ],
      });
    });
  });
});
