/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { insertSubject } from "presentation-test-utilities";
import { afterAll, describe, it, test } from "vitest";
import { Subject } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { buildTestIModel } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation.js";
import { createProvider } from "../Utils.js";

import type { IModelConnection } from "@itwin/core-frontend";
import type { DefineHierarchyLevelProps, HierarchyDefinition } from "@itwin/presentation-hierarchies";
import type { Props } from "@itwin/presentation-shared";

describe("Hierarchies", () => {
  describe("Grouping nodes' autoExpand setting", () => {
    type ECSqlSelectClauseGroupingParams = NonNullable<
      Props<DefineHierarchyLevelProps["nodeSelectClauseFactory"]["createSelectClause"]>["grouping"]
    >;
    let subjectClassName: string;
    let emptyIModel: IModelConnection;

    test.beforeAll(async (_, suite) => {
      await initialize();
      emptyIModel = (await buildTestIModel(suite.fullTestName!)).imodelConnection;
      subjectClassName = Subject.classFullName.replace(":", ".");
    });

    afterAll(async () => {
      await terminate();
    });

    function createHierarchyWithSpecifiedGrouping(
      _imodel: IModelConnection,
      specifiedGrouping: ECSqlSelectClauseGroupingParams,
      labelProperty?: string,
    ): HierarchyDefinition {
      return {
        async defineHierarchyLevel({ parentNode, nodeSelectClauseFactory }) {
          if (!parentNode) {
            return [
              {
                fullClassName: `BisCore.InformationContentElement`,
                query: {
                  ecsql: `
                  SELECT ${await nodeSelectClauseFactory.createSelectClause({
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
        byBaseClasses: { fullClassNames: ["BisCore.InformationReferenceElement"], autoExpand: "always" },
      };

      const baseClassAutoExpandSingleChild: ECSqlSelectClauseGroupingParams = {
        byBaseClasses: { fullClassNames: ["BisCore.InformationReferenceElement"], autoExpand: "single-child" },
      };

      it("grouping nodes' autoExpand option is true when some child has autoExpand set to 'always'", async () => {
        await validateHierarchy({
          provider: createProvider({
            imodel: emptyIModel,
            hierarchy: createHierarchyWithSpecifiedGrouping(emptyIModel, baseClassAutoExpandAlways),
          }),
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

      it("grouping nodes' autoExpand option is true when it has one child with autoExpand set to 'single-child'", async () => {
        await validateHierarchy({
          provider: createProvider({
            imodel: emptyIModel,
            hierarchy: createHierarchyWithSpecifiedGrouping(emptyIModel, baseClassAutoExpandSingleChild),
          }),
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

      it("grouping nodes' autoExpand option is undefined when none of the child nodes have autoExpand set to 'always'", async () => {
        const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
          const childSubject1 = insertSubject({ imodel, codeValue: "A1", parentId: IModel.rootSubjectId });
          const childSubject2 = insertSubject({ imodel, codeValue: "A2", parentId: IModel.rootSubjectId });
          return { childSubject1, childSubject2 };
        });

        await validateHierarchy({
          provider: createProvider({
            imodel: imodelConnection,
            hierarchy: createHierarchyWithSpecifiedGrouping(
              imodelConnection,
              baseClassAutoExpandSingleChild,
              `ECInstanceId`,
            ),
          }),
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
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject1], children: false }),
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject2], children: false }),
              ],
            }),
          ],
        });
      });
    });

    describe("Class grouping", () => {
      const classAutoExpandAlways: ECSqlSelectClauseGroupingParams = { byClass: { autoExpand: "always" } };

      const classAutoExpandSingleChild: ECSqlSelectClauseGroupingParams = { byClass: { autoExpand: "single-child" } };

      it("grouping nodes' autoExpand option is true when some child has autoExpand set to 'always'", async () => {
        await validateHierarchy({
          provider: createProvider({
            imodel: emptyIModel,
            hierarchy: createHierarchyWithSpecifiedGrouping(emptyIModel, classAutoExpandAlways),
          }),
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

      it("grouping nodes' autoExpand option is true when it has one child with autoExpand set to 'single-child'", async () => {
        await validateHierarchy({
          provider: createProvider({
            imodel: emptyIModel,
            hierarchy: createHierarchyWithSpecifiedGrouping(emptyIModel, classAutoExpandSingleChild),
          }),
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

      it("grouping nodes' autoExpand option is undefined when none of the child nodes have autoExpand set to 'always'", async () => {
        const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
          const childSubject1 = insertSubject({ imodel, codeValue: "A1", parentId: IModel.rootSubjectId });
          const childSubject2 = insertSubject({ imodel, codeValue: "A2", parentId: IModel.rootSubjectId });
          return { childSubject1, childSubject2 };
        });

        await validateHierarchy({
          provider: createProvider({
            imodel: imodelConnection,
            hierarchy: createHierarchyWithSpecifiedGrouping(
              imodelConnection,
              classAutoExpandSingleChild,
              `ECInstanceId`,
            ),
          }),
          expect: [
            NodeValidators.createForClassGroupingNode({
              className: "BisCore.Subject",
              autoExpand: false,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
                  children: false,
                }),
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject1], children: false }),
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject2], children: false }),
              ],
            }),
          ],
        });
      });
    });

    describe("Label grouping", () => {
      const labelAutoExpandAlways: ECSqlSelectClauseGroupingParams = { byLabel: { autoExpand: "always" } };

      const labelAutoExpandSingleChild: ECSqlSelectClauseGroupingParams = { byLabel: { autoExpand: "single-child" } };

      it("grouping nodes' autoExpand option is true when some child has autoExpand set to 'always'", async () => {
        await validateHierarchy({
          provider: createProvider({
            imodel: emptyIModel,
            hierarchy: createHierarchyWithSpecifiedGrouping(emptyIModel, labelAutoExpandAlways),
          }),
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

      it("grouping nodes' autoExpand option is true when it has one child with autoExpand set to 'single-child'", async () => {
        await validateHierarchy({
          provider: createProvider({
            imodel: emptyIModel,
            hierarchy: createHierarchyWithSpecifiedGrouping(emptyIModel, labelAutoExpandSingleChild),
          }),
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

      it("grouping nodes' autoExpand option is undefined when none of the child nodes have autoExpand set to 'always'", async () => {
        const groupName = "test1";
        const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
          const childSubject1 = insertSubject({
            imodel,
            codeValue: "A1",
            parentId: IModel.rootSubjectId,
            userLabel: groupName,
          });
          const childSubject2 = insertSubject({
            imodel,
            codeValue: "A2",
            parentId: IModel.rootSubjectId,
            userLabel: groupName,
          });
          return { childSubject1, childSubject2 };
        });

        await validateHierarchy({
          provider: createProvider({
            imodel: imodelConnection,
            hierarchy: createHierarchyWithSpecifiedGrouping(imodelConnection, labelAutoExpandSingleChild, "UserLabel"),
          }),
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
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject2], children: false }),
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject1], children: false }),
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

      it("grouping nodes' autoExpand option is true when some child has autoExpand set to 'always'", async () => {
        await validateHierarchy({
          provider: createProvider({
            imodel: emptyIModel,
            hierarchy: createHierarchyWithSpecifiedGrouping(emptyIModel, propertiesAutoExpandAlways),
          }),
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

      it("grouping nodes' autoExpand option is true when it has one child with autoExpand set to 'single-child'", async () => {
        await validateHierarchy({
          provider: createProvider({
            imodel: emptyIModel,
            hierarchy: createHierarchyWithSpecifiedGrouping(emptyIModel, propertiesAutoExpandSingleChild),
          }),
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

      it("grouping nodes' autoExpand option is undefined when none of the child nodes have autoExpand set to 'always'", async () => {
        const { imodelConnection, ...keys } = await buildTestIModel(async (imodel) => {
          const childSubject1 = insertSubject({ imodel, codeValue: "A1", parentId: IModel.rootSubjectId });
          const childSubject2 = insertSubject({ imodel, codeValue: "A2", parentId: IModel.rootSubjectId });
          return { childSubject1, childSubject2 };
        });

        await validateHierarchy({
          provider: createProvider({
            imodel: imodelConnection,
            hierarchy: createHierarchyWithSpecifiedGrouping(
              imodelConnection,
              propertiesAutoExpandSingleChild,
              "ECInstanceId",
            ),
          }),
          expect: [
            NodeValidators.createForPropertyValueGroupingNode({
              autoExpand: false,
              children: [
                NodeValidators.createForInstanceNode({
                  instanceKeys: [{ className: "BisCore.Subject", id: IModel.rootSubjectId }],
                  children: false,
                }),
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject1], children: false }),
                NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject2], children: false }),
              ],
            }),
          ],
        });
      });
    });
  });
});
