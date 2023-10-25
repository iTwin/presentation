/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PhysicalPartition, Subject } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { ECSqlSelectClauseGroupingParams, IHierarchyLevelDefinitionsFactory, NodeSelectClauseFactory } from "@itwin/presentation-hierarchy-builder";
import { buildIModel, insertPhysicalPartition, insertSubject } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation";
import { createProvider } from "../Utils";

describe("Stateless hierarchy builder", () => {
  describe("Grouping nodes' hiding", () => {
    let selectClauseFactory: NodeSelectClauseFactory;
    let subjectClassName: string;
    let physicalPartitionClassName: string;
    const groupName = "test1";

    before(async function () {
      await initialize();
      subjectClassName = Subject.classFullName.replace(":", ".");
      physicalPartitionClassName = PhysicalPartition.classFullName.replace(":", ".");
      selectClauseFactory = new NodeSelectClauseFactory();
    });

    after(async () => {
      await terminate();
    });

    function createHierarchyWithSpecifiedGrouping(specifiedGrouping: ECSqlSelectClauseGroupingParams): IHierarchyLevelDefinitionsFactory {
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
                    grouping: specifiedGrouping,
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
    }

    describe("Base class grouping", () => {
      const baseClassHideIfNoSiblingsGrouping: ECSqlSelectClauseGroupingParams = {
        byBaseClasses: {
          fullClassNames: ["BisCore.InformationReferenceElement"],
          hideIfNoSiblings: true,
        },
      };

      const baseClassHideIfOneGroupedNodeGrouping: ECSqlSelectClauseGroupingParams = {
        byBaseClasses: {
          fullClassNames: ["BisCore.InformationReferenceElement"],
          hideIfOneGroupedNode: true,
        },
      };

      it("hides base class groups when there're no siblings", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId });
          return { childSubject1, childSubject2 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(baseClassHideIfNoSiblingsGrouping) }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.childSubject1],
              children: false,
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.childSubject2],
              children: false,
            }),
          ],
        });
      });

      it("hides base class groups when there's only 1 grouped node", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId });
          return { childSubject1 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(baseClassHideIfOneGroupedNodeGrouping) }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.childSubject1],
              children: false,
            }),
          ],
        });
      });

      it("doesn't hide base class groups when there are siblings", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, userLabel: groupName });
          const childPartition2 = insertPhysicalPartition({ builder, codeValue: "B1", parentId: IModel.rootSubjectId });
          return { childSubject1, childPartition2 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(baseClassHideIfNoSiblingsGrouping) }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.childPartition2],
              children: false,
            }),
            NodeValidators.createForClassGroupingNode({
              label: "Information Reference",
              className: "BisCore.InformationReferenceElement",
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

      it("doesn't hide base class groups when there's more than 1 grouped node", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId });
          return { childSubject1, childSubject2 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(baseClassHideIfOneGroupedNodeGrouping) }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              label: "Information Reference",
              className: "BisCore.InformationReferenceElement",
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
        });
      });
    });

    describe("Class grouping", () => {
      const classHideIfNoSiblingsGrouping: ECSqlSelectClauseGroupingParams = {
        byClass: {
          hideIfNoSiblings: true,
        },
      };

      const classHideIfOneGroupedNodeGrouping: ECSqlSelectClauseGroupingParams = {
        byClass: {
          hideIfOneGroupedNode: true,
        },
      };

      it("hides class groups when there're no siblings", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId });
          return { childSubject1, childSubject2 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(classHideIfNoSiblingsGrouping) }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.childSubject1],
              children: false,
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.childSubject2],
              children: false,
            }),
          ],
        });
      });

      it("hides class groups when there's only 1 grouped node", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId });
          return { childSubject1 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(classHideIfOneGroupedNodeGrouping) }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.childSubject1],
              children: false,
            }),
          ],
        });
      });

      it("doesn't hide class groups when there are siblings", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId });
          const childPartition2 = insertPhysicalPartition({ builder, codeValue: "B1", parentId: IModel.rootSubjectId });
          return { childSubject1, childPartition2 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(classHideIfNoSiblingsGrouping) }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              className: "BisCore.PhysicalPartition",
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.childPartition2],
                  children: false,
                }),
              ],
            }),
            NodeValidators.createForClassGroupingNode({
              className: "BisCore.Subject",
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

      it("doesn't hide class groups when there's more than 1 grouped node", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId });
          return { childSubject1, childSubject2 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(classHideIfOneGroupedNodeGrouping) }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              className: "BisCore.Subject",
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
        });
      });
    });

    describe("Label grouping", () => {
      const labelHideIfOneGroupedNodeGrouping: ECSqlSelectClauseGroupingParams = {
        byLabel: {
          hideIfOneGroupedNode: true,
        },
      };

      const labelHideIfNoSiblingsGrouping: ECSqlSelectClauseGroupingParams = {
        byLabel: {
          hideIfNoSiblings: true,
        },
      };

      it("hides label groups when there're no siblings", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, userLabel: groupName });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId, userLabel: groupName });
          return { childSubject1, childSubject2 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(labelHideIfNoSiblingsGrouping) }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.childSubject1],
              children: false,
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.childSubject2],
              children: false,
            }),
          ],
        });
      });

      it("hides label groups when there's only 1 grouped node", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, userLabel: groupName });
          return { childSubject1 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(labelHideIfOneGroupedNodeGrouping) }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.childSubject1],
              children: false,
            }),
          ],
        });
      });

      it("doesn't hide label groups when there are siblings", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, userLabel: groupName });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId, userLabel: "test2" });
          return { childSubject1, childSubject2 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(labelHideIfNoSiblingsGrouping) }),
          expect: [
            NodeValidators.createForLabelGroupingNode({
              label: groupName,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.childSubject1],
                  children: false,
                }),
              ],
            }),
            NodeValidators.createForLabelGroupingNode({
              label: "test2",
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

      it("doesn't hide label groups when there's more than 1 grouped node", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, userLabel: groupName });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId, userLabel: groupName });
          return { childSubject1, childSubject2 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(labelHideIfOneGroupedNodeGrouping) }),
          expect: [
            NodeValidators.createForLabelGroupingNode({
              label: groupName,
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
        });
      });
    });
  });
});
