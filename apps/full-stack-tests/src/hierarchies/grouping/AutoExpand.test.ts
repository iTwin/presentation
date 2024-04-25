/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { insertSubject } from "presentation-test-utilities";
import { Subject } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { ECSqlSelectClauseGroupingParams, IHierarchyLevelDefinitionsFactory, NodeSelectQueryFactory } from "@itwin/presentation-hierarchies";
import { buildIModel } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation";
import { createIModelAccess, createProvider } from "../Utils";

describe("Hierarchies", () => {
  describe("Grouping nodes' autoExpand setting", () => {
    let subjectClassName: string;
    let emptyIModel: IModelConnection;

    before(async function () {
      await initialize();
      emptyIModel = (await buildIModel(this)).imodel;
      subjectClassName = Subject.classFullName.replace(":", ".");
    });

    after(async () => {
      await terminate();
    });

    function createHierarchyWithSpecifiedGrouping(
      imodel: IModelConnection,
      specifiedGrouping: ECSqlSelectClauseGroupingParams,
      labelProperty?: string,
    ): IHierarchyLevelDefinitionsFactory {
      const selectQueryFactory = new NodeSelectQueryFactory({ imodelAccess: createIModelAccess(imodel) });
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
                  FROM ${subjectClassName} this
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
      const baseClassAutoExpandAlways: ECSqlSelectClauseGroupingParams = {
        byBaseClasses: {
          fullClassNames: ["BisCore.InformationReferenceElement"],
          autoExpand: "always",
        },
      };

      const baseClassAutoExpandSingleChild: ECSqlSelectClauseGroupingParams = {
        byBaseClasses: {
          fullClassNames: ["BisCore.InformationReferenceElement"],
          autoExpand: "single-child",
        },
      };

      it("grouping nodes' autoExpand option is true when some child has autoExpand set to 'always'", async function () {
        await validateHierarchy({
          provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(emptyIModel, baseClassAutoExpandAlways) }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              label: "Information Reference",
              className: "BisCore.InformationReferenceElement",
              autoExpand: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
                  children: false,
                }),
              ],
            }),
          ],
        });
      });

      it("grouping nodes' autoExpand option is true when it has one child with autoExpand set to 'single-child'", async function () {
        await validateHierarchy({
          provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(emptyIModel, baseClassAutoExpandSingleChild) }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              label: "Information Reference",
              className: "BisCore.InformationReferenceElement",
              autoExpand: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
                  children: false,
                }),
              ],
            }),
          ],
        });
      });

      it("grouping nodes' autoExpand option is undefined when none of the child nodes have autoExpand set to 'always'", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId });
          return { childSubject1, childSubject2 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, baseClassAutoExpandSingleChild, `ECInstanceId`) }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              label: "Information Reference",
              className: "BisCore.InformationReferenceElement",
              autoExpand: false,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
                  children: false,
                }),
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
      const classAutoExpandAlways: ECSqlSelectClauseGroupingParams = {
        byClass: {
          autoExpand: "always",
        },
      };

      const classAutoExpandSingleChild: ECSqlSelectClauseGroupingParams = {
        byClass: {
          autoExpand: "single-child",
        },
      };

      it("grouping nodes' autoExpand option is true when some child has autoExpand set to 'always'", async function () {
        await validateHierarchy({
          provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(emptyIModel, classAutoExpandAlways) }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              className: "BisCore.Subject",
              autoExpand: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
                  children: false,
                }),
              ],
            }),
          ],
        });
      });

      it("grouping nodes' autoExpand option is true when it has one child with autoExpand set to 'single-child'", async function () {
        await validateHierarchy({
          provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(emptyIModel, classAutoExpandSingleChild) }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              className: "BisCore.Subject",
              autoExpand: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
                  children: false,
                }),
              ],
            }),
          ],
        });
      });

      it("grouping nodes' autoExpand option is undefined when none of the child nodes have autoExpand set to 'always'", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId });
          return { childSubject1, childSubject2 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, classAutoExpandSingleChild, `ECInstanceId`) }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              className: "BisCore.Subject",
              autoExpand: false,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
                  children: false,
                }),
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
      const labelAutoExpandAlways: ECSqlSelectClauseGroupingParams = {
        byLabel: {
          autoExpand: "always",
        },
      };

      const labelAutoExpandSingleChild: ECSqlSelectClauseGroupingParams = {
        byLabel: {
          autoExpand: "single-child",
        },
      };

      it("grouping nodes' autoExpand option is true when some child has autoExpand set to 'always'", async function () {
        await validateHierarchy({
          provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(emptyIModel, labelAutoExpandAlways) }),
          expect: [
            NodeValidators.createForLabelGroupingNode({
              autoExpand: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
                  children: false,
                }),
              ],
            }),
          ],
        });
      });

      it("grouping nodes' autoExpand option is true when it has one child with autoExpand set to 'single-child'", async function () {
        await validateHierarchy({
          provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(emptyIModel, labelAutoExpandSingleChild) }),
          expect: [
            NodeValidators.createForLabelGroupingNode({
              autoExpand: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
                  children: false,
                }),
              ],
            }),
          ],
        });
      });

      it("grouping nodes' autoExpand option is undefined when none of the child nodes have autoExpand set to 'always'", async function () {
        const groupName = "test1";
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId, userLabel: groupName });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId, userLabel: groupName });
          return { childSubject1, childSubject2 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, labelAutoExpandSingleChild, "UserLabel") }),
          expect: [
            NodeValidators.createForLabelGroupingNode({
              autoExpand: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
                  children: false,
                }),
              ],
            }),
            NodeValidators.createForLabelGroupingNode({
              label: groupName,
              autoExpand: false,
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
      const propertiesAutoExpandAlways: ECSqlSelectClauseGroupingParams = {
        byProperties: {
          propertiesClassName: "BisCore.Element",
          createGroupForUnspecifiedValues: true,
          propertyGroups: [{ propertyName: "UserLabel", propertyClassAlias: "this" }],
          autoExpand: "always",
        },
      };

      const propertiesAutoExpandSingleChild: ECSqlSelectClauseGroupingParams = {
        byProperties: {
          propertiesClassName: "BisCore.Element",
          createGroupForUnspecifiedValues: true,
          propertyGroups: [{ propertyName: "UserLabel", propertyClassAlias: "this" }],
          autoExpand: "single-child",
        },
      };

      it("grouping nodes' autoExpand option is true when some child has autoExpand set to 'always'", async function () {
        await validateHierarchy({
          provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(emptyIModel, propertiesAutoExpandAlways) }),
          expect: [
            NodeValidators.createForPropertyValueGroupingNode({
              autoExpand: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
                  children: false,
                }),
              ],
            }),
          ],
        });
      });

      it("grouping nodes' autoExpand option is true when it has one child with autoExpand set to 'single-child'", async function () {
        await validateHierarchy({
          provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(emptyIModel, propertiesAutoExpandSingleChild) }),
          expect: [
            NodeValidators.createForPropertyValueGroupingNode({
              autoExpand: true,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
                  children: false,
                }),
              ],
            }),
          ],
        });
      });

      it("grouping nodes' autoExpand option is undefined when none of the child nodes have autoExpand set to 'always'", async function () {
        const { imodel, ...keys } = await buildIModel(this, async (builder) => {
          const childSubject1 = insertSubject({ builder, codeValue: "A1", parentId: IModel.rootSubjectId });
          const childSubject2 = insertSubject({ builder, codeValue: "A2", parentId: IModel.rootSubjectId });
          return { childSubject1, childSubject2 };
        });

        await validateHierarchy({
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(imodel, propertiesAutoExpandSingleChild, "ECInstanceId") }),
          expect: [
            NodeValidators.createForPropertyValueGroupingNode({
              autoExpand: false,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
                  children: false,
                }),
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
