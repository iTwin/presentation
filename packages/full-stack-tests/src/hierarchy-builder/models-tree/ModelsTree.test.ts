/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModel } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { InstanceKey } from "@itwin/presentation-common";
import { createMetadataProvider } from "@itwin/presentation-core-interop";
import { HierarchyProvider } from "@itwin/presentation-hierarchy-builder";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { buildTestIModel, TestIModelBuilder } from "@itwin/presentation-testing";
import {
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertPhysicalPartition,
  insertPhysicalSubModel,
  insertSpatialCategory,
  insertSubject,
} from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchy } from "../HierarchyValidation";

describe("Stateless hierarchy builder", () => {
  describe("Models tree", () => {
    before(async function () {
      await initialize();
    });

    after(async () => {
      await terminate();
    });

    it("creates Subject - Model - Category - Element hierarchy", async function () {
      const { imodel, keys } = await buildIModel(this, async (builder) => {
        const { physicalElementClassName } = await importTestSchema(builder);
        const rootSubject: InstanceKey = { className: "BisCore:Subject", id: IModel.rootSubjectId };
        const childSubject = insertSubject({ builder, label: "child subject", parentId: rootSubject.id });
        const model = insertPhysicalModelWithPartition({ builder, label: `model`, partitionParentId: childSubject.id });
        const category = insertSpatialCategory({ builder, label: "category" });
        const rootElement1 = insertPhysicalElement({ builder, userLabel: `root element 1`, modelId: model.id, categoryId: category.id });
        const childElement = insertPhysicalElement({
          builder,
          userLabel: `child element`,
          modelId: model.id,
          categoryId: category.id,
          parentId: rootElement1.id,
        });
        const rootElement2 = insertPhysicalElement({
          builder,
          classFullName: physicalElementClassName,
          userLabel: `root element 2`,
          modelId: model.id,
          categoryId: category.id,
        });
        const subModel = insertPhysicalSubModel({ builder, modeledElementId: rootElement2.id });
        const modelingElement = insertPhysicalElement({ builder, userLabel: `modeling element`, modelId: subModel.id, categoryId: category.id });
        return { rootSubject, childSubject, model, category, rootElement1, rootElement2, childElement, modelingElement };
      });
      await validateHierarchy({
        provider: createModelsTreeProvider(imodel),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.rootSubject],
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.childSubject],
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.model],
                    children: [
                      NodeValidators.createForInstanceNode({
                        instanceKeys: [keys.category],
                        children: [
                          NodeValidators.createForClassGroupingNode({
                            className: keys.rootElement1.className,
                            children: [
                              NodeValidators.createForInstanceNode({
                                instanceKeys: [keys.rootElement1],
                                children: [
                                  NodeValidators.createForClassGroupingNode({
                                    className: keys.childElement.className,
                                    children: [
                                      NodeValidators.createForInstanceNode({
                                        instanceKeys: [keys.childElement],
                                        children: false,
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                            ],
                          }),
                          NodeValidators.createForClassGroupingNode({
                            className: keys.rootElement2.className,
                            children: [
                              NodeValidators.createForInstanceNode({
                                instanceKeys: [keys.rootElement2],
                                children: [
                                  NodeValidators.createForInstanceNode({
                                    instanceKeys: [keys.category],
                                    children: [
                                      NodeValidators.createForClassGroupingNode({
                                        className: keys.modelingElement.className,
                                        children: [
                                          NodeValidators.createForInstanceNode({
                                            instanceKeys: [keys.modelingElement],
                                            children: false,
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });
    });

    it('hides subjects with `Subject.Model.Type = "Hierarchy"` json property', async function () {
      const { imodel, keys } = await buildIModel(this, async (builder) => {
        const rootSubject: InstanceKey = { className: "BisCore:Subject", id: IModel.rootSubjectId };
        const childSubject = insertSubject({
          builder,
          label: "child subject",
          parentId: rootSubject.id,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          jsonProperties: { Subject: { Model: { Type: "Hierarchy" } } },
        });
        const model = insertPhysicalModelWithPartition({ builder, label: `model`, partitionParentId: childSubject.id });
        const category = insertSpatialCategory({ builder, label: "category" });
        const element = insertPhysicalElement({ builder, userLabel: `element`, modelId: model.id, categoryId: category.id });
        return { rootSubject, childSubject, model, category, element };
      });
      await validateHierarchy({
        provider: createModelsTreeProvider(imodel),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.rootSubject],
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.model],
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.category],
                    children: [
                      NodeValidators.createForClassGroupingNode({
                        className: "Generic:PhysicalObject",
                        children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.element], children: false })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });
    });

    it("hides childless subjects", async function () {
      const { imodel, keys } = await buildIModel(this, async (builder) => {
        const rootSubject: InstanceKey = { className: "BisCore:Subject", id: IModel.rootSubjectId };
        const childSubject = insertSubject({ builder, label: "child subject", parentId: rootSubject.id });
        return { rootSubject, childSubject };
      });
      await validateHierarchy({
        provider: createModelsTreeProvider(imodel),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.rootSubject],
            children: false,
          }),
        ],
      });
    });

    it("hides subjects with childless models", async function () {
      const { imodel, keys } = await buildIModel(this, async (builder) => {
        const rootSubject: InstanceKey = { className: "BisCore:Subject", id: IModel.rootSubjectId };
        const childSubject = insertSubject({ builder, label: "child subject", parentId: rootSubject.id });
        const model = insertPhysicalModelWithPartition({ builder, label: `model`, partitionParentId: childSubject.id });
        return { rootSubject, childSubject, model };
      });
      await validateHierarchy({
        provider: createModelsTreeProvider(imodel),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.rootSubject],
            children: false,
          }),
        ],
      });
    });

    it("shows subjects with child models related with subject through `Subject.Model.TargetPartition` json property", async function () {
      const { imodel, keys } = await buildIModel(this, async (builder) => {
        const rootSubject: InstanceKey = { className: "BisCore:Subject", id: IModel.rootSubjectId };
        const childSubject1 = insertSubject({ builder, label: "child subject 1", parentId: rootSubject.id });
        const model = insertPhysicalModelWithPartition({ builder, label: `model`, partitionParentId: childSubject1.id });
        const category = insertSpatialCategory({ builder, label: "category" });
        const element = insertPhysicalElement({ builder, userLabel: `element`, modelId: model.id, categoryId: category.id });
        const childSubject2 = insertSubject({
          builder,
          label: "child subject 2",
          parentId: rootSubject.id,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          jsonProperties: { Subject: { Model: { TargetPartition: model.id } } },
        });
        return { rootSubject, childSubject1, childSubject2, model, category, element };
      });
      await validateHierarchy({
        provider: createModelsTreeProvider(imodel),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.rootSubject],
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.childSubject1],
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.model],
                    children: [
                      NodeValidators.createForInstanceNode({
                        instanceKeys: [keys.category],
                        children: [
                          NodeValidators.createForClassGroupingNode({
                            className: "Generic:PhysicalObject",
                            children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.element], children: false })],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.childSubject2],
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [keys.model],
                    children: [
                      NodeValidators.createForInstanceNode({
                        instanceKeys: [keys.category],
                        children: [
                          NodeValidators.createForClassGroupingNode({
                            className: "Generic:PhysicalObject",
                            children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.element], children: false })],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });
    });

    it("hides models with `PhysicalPartition.Model.Content` json property", async function () {
      const { imodel, keys } = await buildIModel(this, async (builder) => {
        const rootSubject: InstanceKey = { className: "BisCore:Subject", id: IModel.rootSubjectId };
        const partition = insertPhysicalPartition({
          builder,
          label: "model",
          parentId: rootSubject.id,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          jsonProperties: { PhysicalPartition: { Model: { Content: true } } },
        });
        const model = insertPhysicalSubModel({ builder, modeledElementId: partition.id });
        const category = insertSpatialCategory({ builder, label: "category" });
        const element = insertPhysicalElement({ builder, userLabel: `element`, modelId: model.id, categoryId: category.id });
        return { rootSubject, model, category, element };
      });
      await validateHierarchy({
        provider: createModelsTreeProvider(imodel),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.rootSubject],
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.category],
                children: [
                  NodeValidators.createForClassGroupingNode({
                    className: "Generic:PhysicalObject",
                    children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.element], children: false })],
                  }),
                ],
              }),
            ],
          }),
        ],
      });
    });

    it("hides models with `GraphicalPartition3d.Model.Content` json property", async function () {
      const { imodel, keys } = await buildIModel(this, async (builder) => {
        const rootSubject: InstanceKey = { className: "BisCore:Subject", id: IModel.rootSubjectId };
        const partition = insertPhysicalPartition({
          builder,
          label: "model",
          parentId: rootSubject.id,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          jsonProperties: { GraphicalPartition3d: { Model: { Content: true } } },
        });
        const model = insertPhysicalSubModel({ builder, modeledElementId: partition.id });
        const category = insertSpatialCategory({ builder, label: "category" });
        const element = insertPhysicalElement({ builder, userLabel: `element`, modelId: model.id, categoryId: category.id });
        return { rootSubject, model, category, element };
      });
      await validateHierarchy({
        provider: createModelsTreeProvider(imodel),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.rootSubject],
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [keys.category],
                children: [
                  NodeValidators.createForClassGroupingNode({
                    className: "Generic:PhysicalObject",
                    children: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.element], children: false })],
                  }),
                ],
              }),
            ],
          }),
        ],
      });
    });

    it("hides private models and their content", async function () {
      const { imodel, keys } = await buildIModel(this, async (builder) => {
        const rootSubject: InstanceKey = { className: "BisCore:Subject", id: IModel.rootSubjectId };
        const partition = insertPhysicalPartition({ builder, label: "model", parentId: rootSubject.id });
        const model = insertPhysicalSubModel({ builder, modeledElementId: partition.id, isPrivate: true });
        const category = insertSpatialCategory({ builder, label: "category" });
        const element = insertPhysicalElement({ builder, userLabel: `element`, modelId: model.id, categoryId: category.id });
        return { rootSubject, model, category, element };
      });
      await validateHierarchy({
        provider: createModelsTreeProvider(imodel),
        expect: [
          NodeValidators.createForInstanceNode({
            instanceKeys: [keys.rootSubject],
            children: false,
          }),
        ],
      });
    });

    function createModelsTreeProvider(imodel: IModelConnection) {
      const schemas = new SchemaContext();
      schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
      const metadataProvider = createMetadataProvider(schemas);
      return new HierarchyProvider({
        metadataProvider,
        queryExecutor: imodel,
        hierarchyDefinition: new ModelsTreeDefinition({ metadataProvider }),
      });
    }

    async function buildIModel<TKeys extends {}>(mochaContext: Mocha.Context, setup: (builder: TestIModelBuilder) => Promise<TKeys>) {
      let keys!: TKeys;
      // eslint-disable-next-line deprecation/deprecation
      const imodel = await buildTestIModel(mochaContext, async (builder) => {
        keys = await setup(builder);
      });
      return { imodel, keys };
    }

    interface TestSchemaInfo {
      schemaName: string;
      physicalElementClassName: string;
    }
    async function importTestSchema(builder: TestIModelBuilder): Promise<TestSchemaInfo> {
      const TEST_SCHEMA_NAME = "HierarchyBuilderTestSchema";
      const TEST_SCHEMA_ALIAS = "hbts";
      const PHYSICAL_ELEMENT_CLASS_NAME = "PhysicalObject";
      const TEST_SCHEMA_XML = `
      <?xml version="1.0" encoding="UTF-8"?>
      <ECSchema schemaName="${TEST_SCHEMA_NAME}" alias="${TEST_SCHEMA_ALIAS}" version="01.00" xmlns="http://www.bentley.com/schemas/Bentley.ECXML.3.1">
          <ECSchemaReference name="BisCore" version="01.00" alias="bis" />
          <ECEntityClass typeName="${PHYSICAL_ELEMENT_CLASS_NAME}" displayLabel="Physical Object" modifier="Sealed" description="Similar to generic:PhysicalObject but also sub-modelable.">
              <BaseClass>bis:PhysicalElement</BaseClass>
              <BaseClass>bis:ISubModeledElement</BaseClass>
          </ECEntityClass>
      </ECSchema>
    `;
      await builder.importSchema(TEST_SCHEMA_XML);
      return {
        schemaName: TEST_SCHEMA_NAME,
        physicalElementClassName: `${TEST_SCHEMA_NAME}:${PHYSICAL_ELEMENT_CLASS_NAME}`,
      };
    }
  });
});
