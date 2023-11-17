/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Element, InformationPartitionElement, Subject } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { IHierarchyLevelDefinitionsFactory, NodeSelectQueryFactory } from "@itwin/presentation-hierarchy-builder";
import { buildIModel, insertExternalSourceAspect, insertPhysicalPartition, insertSubject } from "../IModelUtils";
import { initialize, terminate } from "../IntegrationTests";
import { NodeValidators, validateHierarchyLevel } from "./HierarchyValidation";
import { createMetadataProvider, createProvider } from "./Utils";

describe("Stateless hierarchy builder", () => {
  describe("Hierarchy filtering", () => {
    let elementClassName: string;
    let subjectClassName: string;
    let partitionClassName: string;

    before(async () => {
      await initialize();
      elementClassName = Element.classFullName.replace(":", ".");
      subjectClassName = Subject.classFullName.replace(":", ".");
      partitionClassName = InformationPartitionElement.classFullName.replace(":", ".");
    });

    after(async () => {
      await terminate();
    });

    it("filters root hierarchy level", async function () {
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
        const childSubject1 = insertSubject({ builder, codeValue: "test subject 1", parentId: rootSubject.id });
        const childSubject2 = insertSubject({ builder, codeValue: "test subject 2", parentId: rootSubject.id });
        return { rootSubject, childSubject1, childSubject2 };
      });

      const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
      const hierarchy: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ instanceFilter }) {
          const filterClauses = instanceFilter
            ? await selectQueryFactory.createFilterClauses(instanceFilter, { fullName: subjectClassName, alias: "this" })
            : undefined;
          return [
            {
              fullClassName: subjectClassName,
              query: {
                ecsql: `
                  SELECT ${await selectQueryFactory.createSelectClause({
                    ecClassId: { selector: `this.ECClassId` },
                    ecInstanceId: { selector: `this.ECInstanceId` },
                    nodeLabel: { selector: `this.CodeValue` },
                  })}
                  FROM ${filterClauses?.from ?? subjectClassName} AS this
                  ${filterClauses?.joins ?? ""}
                  ${filterClauses?.where ? `WHERE ${filterClauses?.where}` : ""}
                `,
              },
            },
          ];
        },
      };

      const provider = createProvider({ imodel, hierarchy });
      const nodes = await provider.getNodes({
        parentNode: undefined,
        instanceFilter: {
          propertyClassName: subjectClassName,
          relatedInstances: [],
          rules: {
            propertyName: `CodeValue`,
            operator: "Like",
            value: `test%`,
          },
        },
      });
      validateHierarchyLevel({
        nodes,
        expect: [
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject1] }),
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject2] }),
        ],
      });
    });

    it("filters child hierarchy level", async function () {
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
        const childSubject1 = insertSubject({ builder, codeValue: "test subject 1", parentId: rootSubject.id });
        const childSubject2 = insertSubject({ builder, codeValue: "test subject 2", parentId: rootSubject.id });
        return { rootSubject, childSubject1, childSubject2 };
      });

      const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
      const hierarchy: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ instanceFilter }) {
          const filterClauses = instanceFilter
            ? await selectQueryFactory.createFilterClauses(instanceFilter, { fullName: subjectClassName, alias: "this" })
            : undefined;
          return [
            {
              fullClassName: subjectClassName,
              query: {
                ecsql: `
                  SELECT ${await selectQueryFactory.createSelectClause({
                    ecClassId: { selector: `this.ECClassId` },
                    ecInstanceId: { selector: `this.ECInstanceId` },
                    nodeLabel: { selector: `this.CodeValue` },
                  })}
                  FROM ${filterClauses?.from ?? subjectClassName} AS this
                  ${filterClauses?.joins ?? ""}
                  WHERE
                    this.Parent.Id = 0x1
                    ${filterClauses?.where ? `AND ${filterClauses?.where}` : ""}
                `,
              },
            },
          ];
        },
      };

      const provider = createProvider({ imodel, hierarchy });
      const nodes = await provider.getNodes({
        parentNode: {
          key: { type: "instances", instanceKeys: [{ className: subjectClassName, id: "0x1" }] },
          parentKeys: [],
          label: "",
        },
        instanceFilter: {
          propertyClassName: subjectClassName,
          relatedInstances: [],
          rules: {
            propertyName: `CodeValue`,
            operator: "Like",
            value: `%1`,
          },
        },
      });
      validateHierarchyLevel({
        nodes,
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject1] })],
      });
    });

    it("filters by property class", async function () {
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
        const childSubject = insertSubject({ builder, codeValue: "test subject", parentId: rootSubject.id });
        const childPartition = insertPhysicalPartition({ builder, codeValue: "test partition", parentId: rootSubject.id });
        return { rootSubject, childSubject, childPartition };
      });

      const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
      const hierarchy: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ instanceFilter }) {
          const subjectFilterClauses = instanceFilter
            ? await selectQueryFactory.createFilterClauses(instanceFilter, { fullName: elementClassName, alias: "this" })
            : undefined;
          return [
            {
              fullClassName: elementClassName,
              query: {
                ecsql: `
                  SELECT ${await selectQueryFactory.createSelectClause({
                    ecClassId: { selector: `this.ECClassId` },
                    ecInstanceId: { selector: `this.ECInstanceId` },
                    nodeLabel: { selector: `this.CodeValue` },
                  })}
                  FROM ${subjectFilterClauses?.from ?? elementClassName} AS this
                  ${subjectFilterClauses?.joins ?? ""}
                  ${subjectFilterClauses?.where ? `WHERE ${subjectFilterClauses?.where}` : ""}
                `,
              },
            },
          ];
        },
      };

      const provider = createProvider({ imodel, hierarchy });
      const nodes = await provider.getNodes({
        parentNode: undefined,
        instanceFilter: {
          propertyClassName: "BisCore.PhysicalPartition",
          relatedInstances: [],
          rules: {
            operator: "And",
            rules: [],
          },
        },
      });
      validateHierarchyLevel({
        nodes,
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.childPartition] })],
      });
    });

    it("filters by filter class", async function () {
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
        const childSubject = insertSubject({ builder, codeValue: "test subject", parentId: rootSubject.id });
        const childPartition = insertPhysicalPartition({ builder, codeValue: "test partition", parentId: rootSubject.id });
        return { rootSubject, childSubject, childPartition };
      });

      const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
      const hierarchy: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ instanceFilter }) {
          const subjectFilterClauses = instanceFilter
            ? await selectQueryFactory.createFilterClauses(instanceFilter, { fullName: elementClassName, alias: "this" })
            : undefined;
          return [
            {
              fullClassName: elementClassName,
              query: {
                ecsql: `
                  SELECT ${await selectQueryFactory.createSelectClause({
                    ecClassId: { selector: `this.ECClassId` },
                    ecInstanceId: { selector: `this.ECInstanceId` },
                    nodeLabel: { selector: `this.CodeValue` },
                  })}
                  FROM ${subjectFilterClauses?.from ?? elementClassName} AS this
                  ${subjectFilterClauses?.joins ?? ""}
                  ${subjectFilterClauses?.where ? `WHERE ${subjectFilterClauses?.where}` : ""}
                `,
              },
            },
          ];
        },
      };

      const provider = createProvider({ imodel, hierarchy });
      const nodes = await provider.getNodes({
        parentNode: undefined,
        instanceFilter: {
          propertyClassName: elementClassName,
          filterClassNames: ["BisCore.PhysicalPartition"],
          relatedInstances: [],
          rules: {
            operator: "And",
            rules: [],
          },
        },
      });
      validateHierarchyLevel({
        nodes,
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.childPartition] })],
      });
    });

    it("filters by direct property", async function () {
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
        const childPartition1 = insertPhysicalPartition({ builder, codeValue: "test partition 1", parentId: rootSubject.id });
        const childPartition2 = insertPhysicalPartition({ builder, codeValue: "test partition 2", parentId: rootSubject.id });
        return { rootSubject, childPartition1, childPartition2 };
      });

      const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
      const hierarchy: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ instanceFilter }) {
          const subjectFilterClauses = instanceFilter
            ? await selectQueryFactory.createFilterClauses(instanceFilter, { fullName: partitionClassName, alias: "this" })
            : undefined;
          return [
            {
              fullClassName: partitionClassName,
              query: {
                ecsql: `
                  SELECT ${await selectQueryFactory.createSelectClause({
                    ecClassId: { selector: `this.ECClassId` },
                    ecInstanceId: { selector: `this.ECInstanceId` },
                    nodeLabel: { selector: `this.CodeValue` },
                  })}
                  FROM ${subjectFilterClauses?.from ?? partitionClassName} AS this
                  ${subjectFilterClauses?.joins ?? ""}
                  ${subjectFilterClauses?.where ? `WHERE ${subjectFilterClauses?.where}` : ""}
                `,
              },
            },
          ];
        },
      };

      const provider = createProvider({ imodel, hierarchy });
      const nodes = await provider.getNodes({
        parentNode: undefined,
        instanceFilter: {
          propertyClassName: partitionClassName,
          relatedInstances: [],
          rules: {
            propertyName: "CodeValue",
            operator: "Like",
            value: "test % 1",
          },
        },
      });
      validateHierarchyLevel({
        nodes,
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.childPartition1] })],
      });
    });

    it("filters by related property", async function () {
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: subjectClassName, id: IModel.rootSubjectId };
        const childPartition1 = insertPhysicalPartition({ builder, codeValue: "test partition 1", parentId: rootSubject.id });
        insertExternalSourceAspect({ builder, elementId: childPartition1.id, identifier: "first" });
        const childPartition2 = insertPhysicalPartition({ builder, codeValue: "test partition 2", parentId: rootSubject.id });
        insertExternalSourceAspect({ builder, elementId: childPartition2.id, identifier: "second" });
        return { rootSubject, childPartition1, childPartition2 };
      });

      const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
      const hierarchy: IHierarchyLevelDefinitionsFactory = {
        async defineHierarchyLevel({ instanceFilter }) {
          const subjectFilterClauses = instanceFilter
            ? await selectQueryFactory.createFilterClauses(instanceFilter, { fullName: partitionClassName, alias: "this" })
            : undefined;
          return [
            {
              fullClassName: partitionClassName,
              query: {
                ecsql: `
                  SELECT ${await selectQueryFactory.createSelectClause({
                    ecClassId: { selector: `this.ECClassId` },
                    ecInstanceId: { selector: `this.ECInstanceId` },
                    nodeLabel: { selector: `this.CodeValue` },
                  })}
                  FROM ${subjectFilterClauses?.from ?? partitionClassName} AS this
                  ${subjectFilterClauses?.joins ?? ""}
                  ${subjectFilterClauses?.where ? `WHERE ${subjectFilterClauses?.where}` : ""}
                `,
              },
            },
          ];
        },
      };

      const provider = createProvider({ imodel, hierarchy });
      const nodes = await provider.getNodes({
        parentNode: undefined,
        instanceFilter: {
          propertyClassName: partitionClassName,
          relatedInstances: [
            {
              path: [
                {
                  sourceClassName: partitionClassName,
                  relationshipName: "BisCore.ElementOwnsMultiAspects",
                  targetClassName: "BisCore.ExternalSourceAspect",
                },
              ],
              alias: "external-source-aspect",
            },
          ],
          rules: {
            sourceAlias: "external-source-aspect",
            propertyName: "Identifier",
            operator: "Equal",
            value: "second",
          },
        },
      });
      validateHierarchyLevel({
        nodes,
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.childPartition2] })],
      });
    });
  });
});
