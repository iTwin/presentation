/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { DictionaryModel, IModelDb, InformationPartitionElement, LinkModel, Model, SnapshotDb, Subject } from "@itwin/core-backend";
import { IModelConnection } from "@itwin/core-frontend";
import { Presentation as PresentationBackend } from "@itwin/presentation-backend";
import { Descriptor, PropertyValueFormat } from "@itwin/presentation-common";
import { createHierarchyLevelDescriptor } from "@itwin/presentation-core-interop";
import { Presentation as PresentationFrontend } from "@itwin/presentation-frontend";
import { HierarchyNode, IHierarchyLevelDefinitionsFactory, InstanceKey, NodeSelectQueryFactory } from "@itwin/presentation-hierarchy-builder";
import { buildTestIModel } from "@itwin/presentation-testing";
import { setupOutputFileLocation } from "@itwin/presentation-testing/lib/cjs/presentation-testing/InternalUtils";
import { initialize, terminate } from "../IntegrationTests";
import { NodeValidators, validateHierarchyLevel } from "./HierarchyValidation";
import { createClassECSqlSelector, createMetadataProvider, createProvider } from "./Utils";

describe("Stateless hierarchy builder", () => {
  describe("Hierarchy level descriptors", () => {
    before(async () => {
      await initialize();
    });

    after(async () => {
      await terminate();
    });

    describe("using backend APIs", () => {
      let imodel: IModelDb;

      before(() => {
        const imodelName = "hierarchy-level-descriptors-using-backend-apis";
        const outputFile = setupOutputFileLocation(imodelName);
        imodel = SnapshotDb.createEmpty(outputFile, { rootSubject: { name: imodelName } });
      });

      after(() => {
        imodel.close();
      });

      it("creates descriptor", async function () {
        const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
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
        validateHierarchyLevel({
          nodes: await provider.getNodes({
            parentNode: undefined,
          }),
          expect: [NodeValidators.createForInstanceNode({ instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: "0x1" }] })],
        });
        const result = await createHierarchyLevelDescriptor({
          imodel,
          parentNode: undefined,
          hierarchyProvider: provider,
          descriptorBuilder: PresentationBackend.getManager(),
        });
        expect(result?.descriptor).to.containSubset({
          selectClasses: [
            {
              selectClassInfo: { name: Subject.classFullName },
            },
          ],
          fields: [
            {
              label: "Model",
              type: { valueFormat: PropertyValueFormat.Primitive, typeName: "navigation" },
            },
            {
              label: "Code",
              type: { valueFormat: PropertyValueFormat.Primitive, typeName: "string" },
            },
            {
              label: "User Label",
              type: { valueFormat: PropertyValueFormat.Primitive, typeName: "string" },
            },
            {
              label: "Description",
              type: { valueFormat: PropertyValueFormat.Primitive, typeName: "string" },
            },
          ],
        } as Partial<Descriptor>);
      });
    });

    describe("using frontend APIs", () => {
      let imodel: IModelConnection;

      before(async () => {
        // eslint-disable-next-line deprecation/deprecation
        imodel = await buildTestIModel("hierarchy-level-descriptors-using-frontend-apis", async () => {});
      });

      after(async () => {
        await imodel.close();
      });

      it("creates descriptor for root hierarchy level", async function () {
        const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
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
        validateHierarchyLevel({
          nodes: await provider.getNodes({
            parentNode: undefined,
          }),
          expect: [NodeValidators.createForInstanceNode({ instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: "0x1" }] })],
        });
        const result = await createHierarchyLevelDescriptor({
          imodel,
          parentNode: undefined,
          hierarchyProvider: provider,
          descriptorBuilder: PresentationFrontend.presentation,
        });
        expect(result?.descriptor).to.containSubset({
          selectClasses: [
            {
              selectClassInfo: { name: Subject.classFullName },
            },
          ],
          fields: [
            {
              label: "Model",
              type: { valueFormat: PropertyValueFormat.Primitive, typeName: "navigation" },
            },
            {
              label: "Code",
              type: { valueFormat: PropertyValueFormat.Primitive, typeName: "string" },
            },
            {
              label: "User Label",
              type: { valueFormat: PropertyValueFormat.Primitive, typeName: "string" },
            },
            {
              label: "Description",
              type: { valueFormat: PropertyValueFormat.Primitive, typeName: "string" },
            },
          ],
        } as Partial<Descriptor>);
      });

      it("creates descriptor for child hierarchy level", async function () {
        const rootSubjectKey: InstanceKey = { className: Subject.classFullName.replace(":", "."), id: "0x1" };
        const selectQueryFactory = new NodeSelectQueryFactory(createMetadataProvider(imodel));
        const hierarchy: IHierarchyLevelDefinitionsFactory = {
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
        validateHierarchyLevel({
          nodes: await provider.getNodes({
            parentNode: rootSubjectNode,
          }),
          expect: [
            NodeValidators.createForInstanceNode({ instanceKeys: [{ className: DictionaryModel.classFullName.replace(":", "."), id: "0x10" }] }),
            NodeValidators.createForInstanceNode({ instanceKeys: [{ className: LinkModel.classFullName.replace(":", "."), id: "0xe" }] }),
          ],
        });
        const result = await createHierarchyLevelDescriptor({
          imodel,
          parentNode: rootSubjectNode,
          hierarchyProvider: provider,
          descriptorBuilder: PresentationFrontend.presentation,
        });
        expect(result?.descriptor).to.containSubset({
          selectClasses: [
            {
              selectClassInfo: { name: DictionaryModel.classFullName },
            },
            {
              selectClassInfo: { name: LinkModel.classFullName },
            },
          ],
          fields: [
            {
              label: "Modeled Element",
              type: { valueFormat: PropertyValueFormat.Primitive, typeName: "navigation" },
            },
          ],
        } as Partial<Descriptor>);
      });
    });
  });
});
