/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Subject } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { HierarchyNode, IHierarchyLevelDefinitionsFactory, NodeSelectQueryFactory } from "@itwin/presentation-hierarchy-builder";
import { buildIModel, insertSubject } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation";
import { createMetadataProvider, createProvider } from "../Utils";

describe("Stateless hierarchy builder", () => {
  let subjectClassName: string;

  before(async function () {
    await initialize();
    subjectClassName = Subject.classFullName.replace(":", ".");
  });

  after(async () => {
    await terminate();
  });

  describe("Label grouping", () => {
    it("creates different groups for different labels", async function () {
      const labelGroupName1 = "test1";
      const labelGroupName2 = "test2";
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const childSubject1 = insertSubject({ builder, codeValue: "1", parentId: IModel.rootSubjectId, userLabel: labelGroupName1 });
        const childSubject2 = insertSubject({ builder, codeValue: "2", parentId: IModel.rootSubjectId, userLabel: labelGroupName2 });
        const childSubject3 = insertSubject({ builder, codeValue: "3", parentId: IModel.rootSubjectId, userLabel: labelGroupName1 });
        const childSubject4 = insertSubject({ builder, codeValue: "4", parentId: IModel.rootSubjectId, userLabel: labelGroupName2 });
        return { childSubject1, childSubject2, childSubject3, childSubject4 };
      });

      const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
      const hierarchy: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel(props) {
          if (!props.parentNode) {
            return [
              {
                fullClassName: subjectClassName,
                query: {
                  ecsql: `
                  SELECT ${await selectQueryFactory.createSelectClause({
                    ecClassId: { selector: `this.ECClassId` },
                    ecInstanceId: { selector: `this.ECInstanceId` },
                    nodeLabel: { selector: `this.UserLabel` },
                    grouping: {
                      byLabel: true,
                    },
                  })}
                  FROM ${subjectClassName} AS this
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
          NodeValidators.createForLabelGroupingNode({
            label: labelGroupName1,
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
          NodeValidators.createForLabelGroupingNode({
            label: labelGroupName2,
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.childSubject2],
                children: false,
              }),
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.childSubject4],
                children: false,
              }),
            ],
          }),
        ],
      });
    });
  });

  describe("Label merging", () => {
    it("merges instance nodes with same merge id", async function () {
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
        const childSubject1 = insertSubject({ builder, codeValue: "1", parentId: rootSubject.id });
        const childSubject2 = insertSubject({ builder, codeValue: "2", parentId: rootSubject.id });
        return { rootSubject, childSubject1, childSubject2 };
      });

      const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
      const hierarchy: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel(props) {
          if (!props.parentNode) {
            return [
              {
                fullClassName: subjectClassName,
                query: {
                  ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: "merge this",
                      mergeByLabelId: "merge",
                    })}
                    FROM ${subjectClassName} AS this
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
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.childSubject1, keys.childSubject2],
            label: "merge this",
            children: false,
          }),
        ],
      });
    });

    it("merges instance nodes from different hidden parent hierarchy levels ", async function () {
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
        const visibleSubject1 = insertSubject({ builder, codeValue: "merged", parentId: rootSubject.id });
        const hiddenSubject = insertSubject({ builder, codeValue: "hide", parentId: rootSubject.id });
        const visibleSubject2 = insertSubject({ builder, codeValue: "merged", parentId: hiddenSubject.id });
        return { rootSubject, visibleSubject1, visibleSubject2 };
      });

      const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
      const hierarchy: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel(props) {
          if (!props.parentNode) {
            return [
              {
                fullClassName: subjectClassName,
                query: {
                  ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.CodeValue` },
                      mergeByLabelId: "merge",
                      hideNodeInHierarchy: { selector: `IIF(this.CodeValue = 'hide', 1, 0)` },
                    })}
                    FROM ${subjectClassName} AS this
                    WHERE this.Parent.Id = (${IModel.rootSubjectId})
                  `,
                },
              },
            ];
          }
          if (HierarchyNode.isInstancesNode(props.parentNode) && props.parentNode.label === "hide") {
            return [
              {
                fullClassName: subjectClassName,
                query: {
                  ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.CodeValue` },
                      mergeByLabelId: "merge",
                    })}
                    FROM ${subjectClassName} AS this
                    WHERE this.Parent.Id = ?
                  `,
                  bindings: props.parentNode.key.instanceKeys.map((k) => ({ type: "id", value: k.id })),
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
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.visibleSubject1, keys.visibleSubject2],
            label: "merged",
            children: false,
          }),
        ],
      });
    });
  });
});
