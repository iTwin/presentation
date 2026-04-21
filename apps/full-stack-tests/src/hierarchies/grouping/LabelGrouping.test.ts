/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { insertSubject } from "presentation-test-utilities";
import { afterAll, beforeAll, describe, it } from "vitest";
import { Subject } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { createNodesQueryClauseFactory, HierarchyNode } from "@itwin/presentation-hierarchies";
import { createIModelInstanceLabelSelectClauseFactory, normalizeFullClassName } from "@itwin/presentation-shared";
import { buildTestIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { createIModelAccess, createProvider } from "../Utils.js";

import type { HierarchyDefinition } from "@itwin/presentation-hierarchies";
import type { EC } from "@itwin/presentation-shared";

describe("Hierarchies", () => {
  let subjectClassName: EC.FullClassName;

  beforeAll(async () => {
    await initialize();
    subjectClassName = normalizeFullClassName(Subject.classFullName);
  });

  afterAll(async () => {
    await terminate();
  });

  describe("Label grouping", () => {
    it("creates different groups for different labels", async () => {
      const labelGroupName1 = "test1";
      const labelGroupName2 = "test2";
      const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
        const childSubject1 = insertSubject({
          imodel,
          codeValue: "1",
          parentId: IModel.rootSubjectId,
          userLabel: labelGroupName1,
        });
        const childSubject2 = insertSubject({
          imodel,
          codeValue: "2",
          parentId: IModel.rootSubjectId,
          userLabel: labelGroupName2,
        });
        const childSubject3 = insertSubject({
          imodel,
          codeValue: "3",
          parentId: IModel.rootSubjectId,
          userLabel: labelGroupName1,
        });
        const childSubject4 = insertSubject({
          imodel,
          codeValue: "4",
          parentId: IModel.rootSubjectId,
          userLabel: labelGroupName2,
        });
        return { childSubject1, childSubject2, childSubject3, childSubject4 };
      });

      const imodelAccess = createIModelAccess(imodelConnection);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createIModelInstanceLabelSelectClauseFactory({ imodelAccess }),
      });
      const hierarchy: HierarchyDefinition = {
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
                    grouping: { byLabel: true },
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
        provider: createProvider({ imodel: imodelConnection, hierarchy }),
        expect: [
          NodeValidators.createForLabelGroupingNode({
            label: labelGroupName1,
            children: [
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject3], children: false }),
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject1], children: false }),
            ],
          }),
          NodeValidators.createForLabelGroupingNode({
            label: labelGroupName2,
            children: [
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject4], children: false }),
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject2], children: false }),
            ],
          }),
        ],
      });
    });

    it("creates different groups for same labels and different groupIds", async () => {
      const descriptionGroupName1 = "test1";
      const descriptionGroupName2 = "test2";
      const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
        const childSubject1 = insertSubject({
          imodel,
          codeValue: "1",
          parentId: IModel.rootSubjectId,
          userLabel: "test",
          description: descriptionGroupName1,
        });
        const childSubject2 = insertSubject({
          imodel,
          codeValue: "2",
          parentId: IModel.rootSubjectId,
          userLabel: "test",
          description: descriptionGroupName2,
        });
        const childSubject3 = insertSubject({
          imodel,
          codeValue: "3",
          parentId: IModel.rootSubjectId,
          userLabel: "test",
          description: descriptionGroupName1,
        });
        const childSubject4 = insertSubject({
          imodel,
          codeValue: "4",
          parentId: IModel.rootSubjectId,
          userLabel: "test",
          description: descriptionGroupName2,
        });
        return { childSubject1, childSubject2, childSubject3, childSubject4 };
      });

      const imodelAccess = createIModelAccess(imodelConnection);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createIModelInstanceLabelSelectClauseFactory({ imodelAccess }),
      });
      const hierarchy: HierarchyDefinition = {
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
                    grouping: { byLabel: { groupId: { selector: `this.Description` } } },
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
        provider: createProvider({ imodel: imodelConnection, hierarchy }),
        expect: [
          NodeValidators.createForLabelGroupingNode({
            label: "test",
            groupId: descriptionGroupName2,
            children: [
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject4], children: false }),
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject2], children: false }),
            ],
          }),
          NodeValidators.createForLabelGroupingNode({
            label: "test",
            groupId: descriptionGroupName1,
            children: [
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject3], children: false }),
              NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject1], children: false }),
            ],
          }),
        ],
      });
    });
  });

  describe("Label merging", () => {
    it("doesn't merge when different groupIds or labels are provided", async () => {
      const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
        const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
        const childSubject1 = insertSubject({
          imodel,
          codeValue: "1",
          parentId: rootSubject.id,
          userLabel: "label1",
          description: "description1",
        });
        const childSubject2 = insertSubject({
          imodel,
          codeValue: "2",
          parentId: rootSubject.id,
          userLabel: "label1",
          description: "description2",
        });
        const childSubject3 = insertSubject({
          imodel,
          codeValue: "3",
          parentId: rootSubject.id,
          userLabel: "label2",
          description: "description1",
        });
        return { rootSubject, childSubject1, childSubject2, childSubject3 };
      });

      const imodelAccess = createIModelAccess(imodelConnection);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createIModelInstanceLabelSelectClauseFactory({ imodelAccess }),
      });
      const hierarchy: HierarchyDefinition = {
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
                      grouping: { byLabel: { action: "merge", groupId: { selector: `this.Description` } } },
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
        provider: createProvider({ imodel: imodelConnection, hierarchy }),
        expect: [
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject2], children: false }),
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject1], children: false }),
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject3], children: false }),
        ],
      });
    });

    it("merges instance nodes with same merge id", async () => {
      const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
        const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
        const childSubject1 = insertSubject({ imodel, codeValue: "1", parentId: rootSubject.id });
        const childSubject2 = insertSubject({ imodel, codeValue: "2", parentId: rootSubject.id });
        return { rootSubject, childSubject1, childSubject2 };
      });

      const imodelAccess = createIModelAccess(imodelConnection);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createIModelInstanceLabelSelectClauseFactory({ imodelAccess }),
      });
      const hierarchy: HierarchyDefinition = {
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
                      grouping: { byLabel: { action: "merge", groupId: "merge" } },
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
        provider: createProvider({ imodel: imodelConnection, hierarchy }),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.childSubject1, keys.childSubject2],
            label: "merge this",
            children: false,
          }),
        ],
      });
    });

    it("merges instance nodes from different hidden parent hierarchy levels ", async () => {
      const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
        const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
        const visibleSubject1 = insertSubject({ imodel, codeValue: "merged", parentId: rootSubject.id });
        const hiddenSubject = insertSubject({ imodel, codeValue: "hide", parentId: rootSubject.id });
        const visibleSubject2 = insertSubject({ imodel, codeValue: "merged", parentId: hiddenSubject.id });
        return { rootSubject, visibleSubject1, visibleSubject2 };
      });

      const imodelAccess = createIModelAccess(imodelConnection);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createIModelInstanceLabelSelectClauseFactory({ imodelAccess }),
      });
      const hierarchy: HierarchyDefinition = {
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
                      grouping: { byLabel: { action: "merge", groupId: "merge" } },
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
                      grouping: { byLabel: { action: "merge", groupId: "merge" } },
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
        provider: createProvider({ imodel: imodelConnection, hierarchy }),
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
