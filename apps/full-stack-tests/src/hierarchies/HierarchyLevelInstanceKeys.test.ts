/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect } from "presentation-test-utilities";
import { DictionaryModel, InformationPartitionElement, LinkModel, Model, Subject } from "@itwin/core-backend";
import { IModelConnection } from "@itwin/core-frontend";
import { createNodesQueryClauseFactory, HierarchyDefinition, HierarchyNode } from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory, InstanceKey } from "@itwin/presentation-shared";
import { buildTestIModel } from "@itwin/presentation-testing";
import { initialize, terminate } from "../IntegrationTests.js";
import { createClassECSqlSelector, createIModelAccess, createProvider } from "./Utils.js";

describe("Hierarchies", () => {
  describe("Hierarchy level instance keys", () => {
    let imodel: IModelConnection;

    before(async () => {
      await initialize();
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      imodel = await buildTestIModel("hierarchy-level-instance-keys", async () => {});
    });

    after(async () => {
      await imodel.close();
      await terminate();
    });

    it("gets instance keys for root hierarchy level", async function () {
      const imodelAccess = createIModelAccess(imodel);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
      });
      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel() {
          return [
            {
              fullClassName: Subject.classFullName,
              query: {
                ecsql: `
                  SELECT ${await selectQueryFactory.createSelectClause({
                    ecClassId: { selector: `this.ECClassId` },
                    ecInstanceId: { selector: `this.ECInstanceId` },
                    nodeLabel: { selector: `this.CodeValue` },
                  })}
                  FROM ${createClassECSqlSelector(Subject.classFullName)} AS this
                `,
              },
            },
          ];
        },
      };
      const provider = createProvider({ imodel, hierarchy });
      const keys = await collect(
        provider.getNodeInstanceKeys({
          parentNode: undefined,
        }),
      );
      expect(keys)
        .to.have.lengthOf(1)
        .and.to.containSubset([{ className: "BisCore.Subject", id: "0x1" }]);
    });

    it("gets instance keys for instance node's child hierarchy level", async function () {
      const rootSubjectKey: InstanceKey = { className: Subject.classFullName.replace(":", "."), id: "0x1" };
      const imodelAccess = createIModelAccess(imodel);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
      });
      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ parentNode }) {
          if (parentNode && HierarchyNode.isInstancesNode(parentNode) && parentNode.key.instanceKeys.some((ik) => InstanceKey.equals(ik, rootSubjectKey))) {
            return [
              {
                fullClassName: Subject.classFullName,
                query: {
                  ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `p.CodeValue` },
                    })}
                    FROM ${createClassECSqlSelector(Model.classFullName)} AS this
                    JOIN ${createClassECSqlSelector(InformationPartitionElement.classFullName)} AS p ON p.ECInstanceId = this.ModeledElement.Id
                    WHERE p.Parent.Id = ?
                  `,
                  bindings: [{ type: "id", value: rootSubjectKey.id }],
                },
              },
            ];
          }
          return [];
        },
      };
      const rootSubjectNode = {
        key: {
          type: "instances" as const,
          instanceKeys: [rootSubjectKey],
        },
        parentKeys: [],
        label: "root subject",
        children: true,
      };
      const provider = createProvider({ imodel, hierarchy });
      const keys = await collect(
        provider.getNodeInstanceKeys({
          parentNode: rootSubjectNode,
        }),
      );
      expect(keys)
        .to.have.lengthOf(2)
        .and.to.containSubset([
          { className: DictionaryModel.classFullName.replace(":", "."), id: "0x10" },
          { className: LinkModel.classFullName.replace(":", "."), id: "0xe" },
        ]);
    });

    it("gets instance keys for generic node's child hierarchy level", async function () {
      const imodelAccess = createIModelAccess(imodel);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
      });
      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ parentNode }) {
          if (parentNode && HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "test") {
            return [
              {
                fullClassName: Subject.classFullName,
                query: {
                  ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.CodeValue` },
                    })}
                    FROM ${createClassECSqlSelector(Subject.classFullName)} AS this
                  `,
                },
              },
            ];
          }
          return [];
        },
      };
      const testCustomNode: HierarchyNode = {
        key: { type: "generic", id: "test" },
        parentKeys: [],
        label: "custom parent node",
        children: true,
      };
      const provider = createProvider({ imodel, hierarchy });
      const keys = await collect(
        provider.getNodeInstanceKeys({
          parentNode: testCustomNode,
        }),
      );
      expect(keys)
        .to.have.lengthOf(1)
        .and.to.containSubset([{ className: "BisCore.Subject", id: "0x1" }]);
    });

    it("gets instance keys for hidden instance node's child hierarchy level", async function () {
      const rootSubjectKey: InstanceKey = { className: Subject.classFullName.replace(":", "."), id: "0x1" };
      const imodelAccess = createIModelAccess(imodel);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
      });
      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                fullClassName: Subject.classFullName,
                query: {
                  ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.CodeValue` },
                      hideNodeInHierarchy: true,
                    })}
                    FROM ${createClassECSqlSelector(Subject.classFullName)} AS this
                  `,
                },
              },
            ];
          }
          if (HierarchyNode.isInstancesNode(parentNode) && parentNode.key.instanceKeys.some((ik) => ik.id === rootSubjectKey.id)) {
            return [
              {
                fullClassName: Subject.classFullName,
                query: {
                  ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `p.CodeValue` },
                    })}
                    FROM ${createClassECSqlSelector(Model.classFullName)} AS this
                    JOIN ${createClassECSqlSelector(InformationPartitionElement.classFullName)} AS p ON p.ECInstanceId = this.ModeledElement.Id
                    WHERE p.Parent.Id = ?
                  `,
                  bindings: [{ type: "id", value: rootSubjectKey.id }],
                },
              },
            ];
          }
          return [];
        },
      };
      const provider = createProvider({ imodel, hierarchy });
      const keys = await collect(
        provider.getNodeInstanceKeys({
          parentNode: undefined,
        }),
      );
      expect(keys)
        .to.have.lengthOf(2)
        .and.to.containSubset([
          { className: DictionaryModel.classFullName.replace(":", "."), id: "0x10" },
          { className: LinkModel.classFullName.replace(":", "."), id: "0xe" },
        ]);
    });

    it("gets instance keys for hidden generic node's child hierarchy level", async function () {
      const imodelAccess = createIModelAccess(imodel);
      const selectQueryFactory = createNodesQueryClauseFactory({
        imodelAccess,
        instanceLabelSelectClauseFactory: createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess }),
      });
      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ parentNode }) {
          if (!parentNode) {
            return [
              {
                node: {
                  key: "test",
                  label: "hidden custom node",
                  processingParams: {
                    hideInHierarchy: true,
                  },
                },
              },
            ];
          }
          if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "test") {
            return [
              {
                fullClassName: Subject.classFullName,
                query: {
                  ecsql: `
                    SELECT ${await selectQueryFactory.createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.CodeValue` },
                    })}
                    FROM ${createClassECSqlSelector(Subject.classFullName)} AS this
                  `,
                },
              },
            ];
          }
          return [];
        },
      };
      const provider = createProvider({ imodel, hierarchy });
      const keys = await collect(
        provider.getNodeInstanceKeys({
          parentNode: undefined,
        }),
      );
      expect(keys)
        .to.have.lengthOf(1)
        .and.to.containSubset([{ className: "BisCore.Subject", id: "0x1" }]);
    });
  });
});
