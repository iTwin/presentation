/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Subject } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { ECSqlSelectClauseGroupingParams, IHierarchyLevelDefinitionsFactory, NodeSelectClauseFactory } from "@itwin/presentation-hierarchy-builder";
import { buildIModel, insertSubject } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation";
import { createProvider } from "../Utils";

describe("Stateless hierarchy builder", () => {
  describe("Grouping nodes' autoExpand setting", () => {
    let selectClauseFactory: NodeSelectClauseFactory;
    let subjectClassName: string;
    let emptyIModel: IModelConnection;

    before(async function () {
      await initialize();
      emptyIModel = (await buildIModel(this)).imodel;
      subjectClassName = Subject.classFullName.replace(":", ".");
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
          provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(baseClassAutoExpandAlways) }),
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
          provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(baseClassAutoExpandSingleChild) }),
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
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(baseClassAutoExpandSingleChild) }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              label: "Information Reference",
              className: "BisCore.InformationReferenceElement",
              autoExpand: undefined,
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
          provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(classAutoExpandAlways) }),
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
          provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(classAutoExpandSingleChild) }),
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
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(classAutoExpandSingleChild) }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              className: "BisCore.Subject",
              autoExpand: undefined,
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
          provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(labelAutoExpandAlways) }),
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
          provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(labelAutoExpandSingleChild) }),
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
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(labelAutoExpandSingleChild) }),
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
              autoExpand: undefined,
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

    describe("Properties grouping", () => {
      const propertiesAutoExpandAlways: ECSqlSelectClauseGroupingParams = {
        byProperties: {
          fullClassName: "BisCore.Element",
          propertyGroups: [{ propertyName: "UserLabel", propertyValue: "test1" }],
          autoExpand: "always",
        },
      };

      const propertiesAutoExpandSingleChild: ECSqlSelectClauseGroupingParams = {
        byProperties: {
          fullClassName: "BisCore.Element",
          propertyGroups: [{ propertyName: "UserLabel", propertyValue: "test1" }],
          autoExpand: "always",
        },
      };

      it("grouping nodes' autoExpand option is true when some child has autoExpand set to 'always'", async function () {
        await validateHierarchy({
          provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(propertiesAutoExpandAlways) }),
          expect: [
            NodeValidators.createForFormattedPropertyGroupingNode({
              label: "test1",
              fullClassName: "BisCore.Element",
              formattedPropertyValue: "test1",
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
          provider: createProvider({ imodel: emptyIModel, hierarchy: createHierarchyWithSpecifiedGrouping(propertiesAutoExpandSingleChild) }),
          expect: [
            NodeValidators.createForFormattedPropertyGroupingNode({
              label: "test1",
              fullClassName: "BisCore.Element",
              formattedPropertyValue: "test1",
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
          provider: createProvider({ imodel, hierarchy: createHierarchyWithSpecifiedGrouping(propertiesAutoExpandSingleChild) }),
          expect: [
            NodeValidators.createForFormattedPropertyGroupingNode({
              label: "test1",
              fullClassName: "BisCore.Element",
              formattedPropertyValue: "test1",
              autoExpand: undefined,
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
