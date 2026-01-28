/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { insertPhysicalPartition, insertSubject } from "presentation-test-utilities";
import { PhysicalPartition, Subject } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { createNodesQueryClauseFactory } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";
import { buildIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { createIModelAccess, createProvider } from "../Utils.js";

import type { IModelConnection } from "@itwin/core-frontend";
import type { HierarchyDefinition, NodesQueryClauseFactory } from "@itwin/presentation-hierarchies";
import type { Props } from "@itwin/presentation-shared";

describe("Hierarchies", () => {
  describe("Grouping nodes' hiding", () => {
    type ECSqlSelectClauseGroupingParams = NonNullable<Props<NodesQueryClauseFactory["createSelectClause"]>["grouping"]>;
    let subjectClassName: string;
    let physicalPartitionClassName: string;
    const groupName = "test1";

    before(async function () {
      await initialize();
      subjectClassName = Subject.classFullName.replace(":", ".");
      physicalPartitionClassName = PhysicalPartition.classFullName.replace(":", ".");
    });

    after(async () => {
      await terminate();
    });

    function createHierarchyWithSpecifiedGrouping(
      imodel: IModelConnection,
      specifiedGrouping: ECSqlSelectClauseGroupingParams,
      labelProperty?: string,
    ): HierarchyDefinition {
      const imodelAccess = createIModelAccess(imodel);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
      });
      return {
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
                      nodeLabel: { selector: `this.${labelProperty ?? "CodeValue"}` },
                      grouping: specifiedGrouping,
                    })}
                    FROM (
                      SELECT ECClassId, ECInstanceId, CodeValue, Parent, UserLabel
                      FROM ${subjectClassName}
                      UNION ALL
                      SELECT ECClassId, ECInstanceId, CodeValue, Parent, UserLabel
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
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, baseClassHideIfNoSiblingsGrouping) }),
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
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, baseClassHideIfOneGroupedNodeGrouping) }),
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
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, baseClassHideIfNoSiblingsGrouping) }),
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
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, baseClassHideIfOneGroupedNodeGrouping) }),
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
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, classHideIfNoSiblingsGrouping) }),
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
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, classHideIfOneGroupedNodeGrouping) }),
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
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, classHideIfNoSiblingsGrouping) }),
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
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, classHideIfOneGroupedNodeGrouping) }),
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
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, labelHideIfNoSiblingsGrouping, "UserLabel") }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.childSubject2],
              children: false,
            }),
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.childSubject1],
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
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, labelHideIfOneGroupedNodeGrouping, "UserLabel") }),
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
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, labelHideIfNoSiblingsGrouping, "UserLabel") }),
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
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, labelHideIfOneGroupedNodeGrouping, "UserLabel") }),
          expect: [
            NodeValidators.createForLabelGroupingNode({
              label: groupName,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.childSubject2],
                  children: false,
                }),
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

    describe("Properties grouping", () => {
      const propertiesHideIfNoSiblingsGrouping: ECSqlSelectClauseGroupingParams = {
        byProperties: {
          propertiesClassName: "BisCore.Element",
          propertyGroups: [{ propertyName: "UserLabel", propertyClassAlias: "this" }],
          hideIfNoSiblings: true,
        },
      };

      const propertiesHideIfOneGroupedNodeGrouping: ECSqlSelectClauseGroupingParams = {
        byProperties: {
          propertiesClassName: "BisCore.Element",
          propertyGroups: [{ propertyName: "UserLabel", propertyClassAlias: "this" }],
          hideIfOneGroupedNode: true,
        },
      };

      it("hides property groups when there're no siblings", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, userLabel: groupName });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId, userLabel: groupName });
          return { childSubject1, childSubject2 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, propertiesHideIfNoSiblingsGrouping) }),
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

      it("hides property groups when there's only 1 grouped node", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, userLabel: groupName });
          return { childSubject1 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, propertiesHideIfOneGroupedNodeGrouping) }),
          expect: [
            NodeValidators.createForInstanceNode({
              instanceKeys: [keys.childSubject1],
              children: false,
            }),
          ],
        });
      });

      it("doesn't hide property groups when there are siblings", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, userLabel: groupName });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId, userLabel: `${groupName}2` });
          return { childSubject1, childSubject2 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, propertiesHideIfNoSiblingsGrouping) }),
          expect: [
            NodeValidators.createForPropertyValueGroupingNode({
              label: groupName,
              propertyClassName: "BisCore.Element",
              formattedPropertyValue: groupName,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [keys.childSubject1],
                  children: false,
                }),
              ],
            }),
            NodeValidators.createForPropertyValueGroupingNode({
              label: `${groupName}2`,
              propertyClassName: "BisCore.Element",
              formattedPropertyValue: `${groupName}2`,
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

      it("doesn't hide base class groups when there's more than 1 grouped node", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, userLabel: groupName });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId, userLabel: groupName });
          return { childSubject1, childSubject2 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, propertiesHideIfOneGroupedNodeGrouping) }),
          expect: [
            NodeValidators.createForPropertyValueGroupingNode({
              label: groupName,
              propertyClassName: "BisCore.Element",
              formattedPropertyValue: groupName,
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
