/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import {
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertPhysicalPartition,
  insertPhysicalSubModel,
  insertSpatialCategory,
  insertSubject,
} from "presentation-test-utilities";
import { Id64, Id64String } from "@itwin/core-bentley";
import { IModel } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
import { InstanceKey } from "@itwin/presentation-common";
import { createECSqlQueryExecutor, createMetadataProvider } from "@itwin/presentation-core-interop";
import { HierarchyNodeIdentifier, HierarchyNodeIdentifiersPath, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { addCTEs } from "@itwin/presentation-hierarchies/lib/cjs/hierarchies/queries/LimitingECSqlQueryExecutor";
import { ModelsTreeDefinition } from "@itwin/presentation-models-tree";
import { buildTestIModel, TestIModelBuilder } from "@itwin/presentation-testing";
import { buildIModel } from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { ExpectedHierarchyDef, NodeValidators, validateHierarchy } from "../HierarchyValidation";
import { createModelsTreeProvider, importTestSchema } from "./ModelsTreeTestUtils";

interface TreeFilteringTestCaseDefinition<TIModelSetupResult> {
  name: string;
  setupIModel: (builder: TestIModelBuilder, mochaContext: Mocha.Context) => Promise<TIModelSetupResult>;
  getTargetInstancePaths: (setupResult: TIModelSetupResult) => HierarchyNodeIdentifiersPath[];
  getTargetInstanceKeys: (setupResult: TIModelSetupResult) => InstanceKey[];
  getTargetInstanceLabel: (setupResult: TIModelSetupResult) => string;
  getExpectedHierarchy: (setupResult: TIModelSetupResult) => ExpectedHierarchyDef[];
}

namespace TreeFilteringTestCaseDefinition {
  // only need this to get generic type inferred using setupIModel return type
  export function create<TIModelSetupResult>(
    name: string,
    setupIModel: (builder: TestIModelBuilder, mochaContext: Mocha.Context) => Promise<TIModelSetupResult>,
    getTargetInstancePaths: (setupResult: TIModelSetupResult) => HierarchyNodeIdentifiersPath[],
    getTargetInstanceKeys: (setupResult: TIModelSetupResult) => InstanceKey[],
    getTargetInstanceLabel: (setupResult: TIModelSetupResult) => string,
    getExpectedHierarchy: (setupResult: TIModelSetupResult) => ExpectedHierarchyDef[],
  ): TreeFilteringTestCaseDefinition<TIModelSetupResult> {
    return {
      name,
      setupIModel,
      getTargetInstancePaths,
      getTargetInstanceKeys,
      getTargetInstanceLabel,
      getExpectedHierarchy,
    };
  }
}

describe("Stateless hierarchy builder", () => {
  describe("Models tree filtering", () => {
    before(async function () {
      await initialize();
    });

    after(async () => {
      await terminate();
    });

    const TEST_CASE_DEFS = [
      TreeFilteringTestCaseDefinition.create(
        "immediate Subject nodes",
        async (builder) => {
          const rootSubject: InstanceKey = { className: "BisCore.Subject", id: IModel.rootSubjectId };
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          const childSubject1 = insertSubject({ builder, codeValue: "matching subject 1", parentId: rootSubject.id });
          const childSubject2 = insertSubject({ builder, codeValue: "subject 2", parentId: rootSubject.id });
          const childSubject3 = insertSubject({ builder, codeValue: "matching subject 3", parentId: rootSubject.id });
          insertModelWithElements(builder, 1, category.id, childSubject1.id);
          insertModelWithElements(builder, 2, category.id, childSubject2.id);
          insertModelWithElements(builder, 3, category.id, childSubject3.id);
          return { rootSubject, childSubject1, childSubject2, childSubject3 };
        },
        (x) => [
          [x.rootSubject, x.childSubject1],
          [x.rootSubject, x.childSubject3],
        ],
        (x) => [x.childSubject1, x.childSubject3],
        (_x) => "matching",
        (x) => [
          NodeValidators.createForInstanceNode({
            instanceKeys: [x.rootSubject],
            autoExpand: true,
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [x.childSubject1],
                label: "matching subject 1",
                autoExpand: false,
                children: [
                  NodeValidators.createForInstanceNode({
                    label: "model-1",
                    children: [
                      NodeValidators.createForInstanceNode({
                        label: "category",
                        children: [
                          NodeValidators.createForClassGroupingNode({
                            label: "Physical Object",
                            children: [NodeValidators.createForInstanceNode({ label: /^element-1/, children: false })],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              NodeValidators.createForInstanceNode({
                instanceKeys: [x.childSubject3],
                label: "matching subject 3",
                autoExpand: false,
                children: [
                  NodeValidators.createForInstanceNode({
                    label: "model-3",
                    children: [
                      NodeValidators.createForInstanceNode({
                        label: "category",
                        children: [
                          NodeValidators.createForClassGroupingNode({
                            label: "Physical Object",
                            children: [NodeValidators.createForInstanceNode({ label: /^element-3/, children: false })],
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
      ),
      TreeFilteringTestCaseDefinition.create(
        "nested Subject nodes",
        async (builder) => {
          const rootSubject: InstanceKey = { className: "BisCore.Subject", id: IModel.rootSubjectId };
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          const intermediateSubject = insertSubject({ builder, codeValue: `subject-x` });
          const childSubject1 = insertSubject({ builder, codeValue: "matching subject 1", parentId: intermediateSubject.id });
          const childSubject2 = insertSubject({ builder, codeValue: "subject 2", parentId: intermediateSubject.id });
          const childSubject3 = insertSubject({ builder, codeValue: "matching subject 3", parentId: intermediateSubject.id });
          insertModelWithElements(builder, 1, category.id, childSubject1.id);
          insertModelWithElements(builder, 2, category.id, childSubject2.id);
          insertModelWithElements(builder, 3, category.id, childSubject3.id);
          return { rootSubject, intermediateSubject, childSubject1, childSubject2, childSubject3 };
        },
        (x) => [
          [x.rootSubject, x.intermediateSubject, x.childSubject1],
          [x.rootSubject, x.intermediateSubject, x.childSubject3],
        ],
        (x) => [x.childSubject1, x.childSubject3],
        (_x) => "matching",
        (x) => [
          NodeValidators.createForInstanceNode({
            instanceKeys: [x.rootSubject],
            autoExpand: true,
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [x.intermediateSubject],
                label: "subject-x",
                autoExpand: true,
                children: [
                  NodeValidators.createForInstanceNode({
                    label: "matching subject 1",
                    autoExpand: false,
                    children: [
                      NodeValidators.createForInstanceNode({
                        label: "model-1",
                        children: [
                          NodeValidators.createForInstanceNode({
                            label: "category",
                            children: [
                              NodeValidators.createForClassGroupingNode({
                                label: "Physical Object",
                                children: [NodeValidators.createForInstanceNode({ label: /^element-1/, children: false })],
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                  NodeValidators.createForInstanceNode({
                    label: "matching subject 3",
                    autoExpand: false,
                    children: [
                      NodeValidators.createForInstanceNode({
                        label: "model-3",
                        children: [
                          NodeValidators.createForInstanceNode({
                            label: "category",
                            children: [
                              NodeValidators.createForClassGroupingNode({
                                label: "Physical Object",
                                children: [NodeValidators.createForInstanceNode({ label: /^element-3/, children: false })],
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
      ),
      TreeFilteringTestCaseDefinition.create(
        "two levels of Subject nodes",
        async (builder) => {
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          const rootSubject: InstanceKey = { className: "BisCore.Subject", id: IModel.rootSubjectId };
          const intermediateSubject1 = insertSubject({ builder, codeValue: `matching intermediate subject 1`, parentId: rootSubject.id });
          const intermediateSubject2 = insertSubject({ builder, codeValue: `intermediate subject 2`, parentId: rootSubject.id });
          insertModelWithElements(builder, 1, category.id, intermediateSubject2.id);
          const childSubject1 = insertSubject({ builder, codeValue: "matching subject 1", parentId: intermediateSubject1.id });
          const childSubject2 = insertSubject({ builder, codeValue: "subject 2", parentId: intermediateSubject1.id });
          insertModelWithElements(builder, 1, category.id, childSubject1.id);
          insertModelWithElements(builder, 2, category.id, childSubject2.id);
          return { rootSubject, intermediateSubject1, intermediateSubject2, childSubject1, childSubject2 };
        },
        (x) => [
          [x.rootSubject, x.intermediateSubject1],
          [x.rootSubject, x.intermediateSubject1, x.childSubject1],
        ],
        (x) => [x.intermediateSubject1, x.childSubject1],
        (_x) => "matching",
        (x) => [
          NodeValidators.createForInstanceNode({
            instanceKeys: [x.rootSubject],
            autoExpand: true,
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [x.intermediateSubject1],
                label: "matching intermediate subject 1",
                autoExpand: true,
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [x.childSubject1],
                    label: "matching subject 1",
                    autoExpand: false,
                    children: [
                      NodeValidators.createForInstanceNode({
                        label: "model-1",
                        children: [
                          NodeValidators.createForInstanceNode({
                            label: "category",
                            children: [
                              NodeValidators.createForClassGroupingNode({
                                label: "Physical Object",
                                children: [NodeValidators.createForInstanceNode({ label: /^element-1/, children: false })],
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [x.childSubject2],
                    label: "subject 2",
                    autoExpand: false,
                    children: [
                      NodeValidators.createForInstanceNode({
                        label: "model-2",
                        children: [
                          NodeValidators.createForInstanceNode({
                            label: "category",
                            children: [
                              NodeValidators.createForClassGroupingNode({
                                label: "Physical Object",
                                children: [NodeValidators.createForInstanceNode({ label: /^element-2/, children: false })],
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
      ),
      TreeFilteringTestCaseDefinition.create(
        "Model nodes",
        async (builder) => {
          const rootSubject: InstanceKey = { className: "BisCore.Subject", id: IModel.rootSubjectId };
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          const model1 = insertPhysicalModelWithPartition({ builder, codeValue: `matching model 1`, partitionParentId: rootSubject.id });
          const model2 = insertPhysicalModelWithPartition({ builder, codeValue: `model 2`, partitionParentId: rootSubject.id });
          const model3 = insertPhysicalModelWithPartition({ builder, codeValue: `matching model 3`, partitionParentId: rootSubject.id });
          insertPhysicalElement({ builder, userLabel: `element-1`, modelId: model1.id, categoryId: category.id });
          insertPhysicalElement({ builder, userLabel: `element-2`, modelId: model2.id, categoryId: category.id });
          insertPhysicalElement({ builder, userLabel: `element-3`, modelId: model3.id, categoryId: category.id });
          return { rootSubject, model1, model2, model3 };
        },
        (x) => [
          [x.rootSubject, x.model1],
          [x.rootSubject, x.model3],
        ],
        (x) => [x.model1, x.model3],
        (_x) => "matching",
        (x) => [
          NodeValidators.createForInstanceNode({
            instanceKeys: [x.rootSubject],
            autoExpand: true,
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [x.model1],
                label: "matching model 1",
                autoExpand: false,
                children: [
                  NodeValidators.createForInstanceNode({
                    label: "category",
                    children: [
                      NodeValidators.createForClassGroupingNode({
                        label: "Physical Object",
                        children: [NodeValidators.createForInstanceNode({ label: /^element-1/, children: false })],
                      }),
                    ],
                  }),
                ],
              }),
              NodeValidators.createForInstanceNode({
                instanceKeys: [x.model3],
                label: "matching model 3",
                autoExpand: false,
                children: [
                  NodeValidators.createForInstanceNode({
                    label: "category",
                    children: [
                      NodeValidators.createForClassGroupingNode({
                        label: "Physical Object",
                        children: [NodeValidators.createForInstanceNode({ label: /^element-3/, children: false })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      ),
      TreeFilteringTestCaseDefinition.create(
        "Category nodes",
        async (builder) => {
          const rootSubject: InstanceKey = { className: "BisCore.Subject", id: IModel.rootSubjectId };
          const model1 = insertPhysicalModelWithPartition({ builder, codeValue: `model-1`, partitionParentId: rootSubject.id });
          const model2 = insertPhysicalModelWithPartition({ builder, codeValue: `model-2`, partitionParentId: rootSubject.id });

          const category1 = insertSpatialCategory({ builder, codeValue: "matching category 1" });
          const category2 = insertSpatialCategory({ builder, codeValue: "category-2" });
          const category3 = insertSpatialCategory({ builder, codeValue: "matching category 3" });

          insertPhysicalElement({ builder, userLabel: `element-1`, modelId: model1.id, categoryId: category1.id });
          insertPhysicalElement({ builder, userLabel: `element-2`, modelId: model1.id, categoryId: category2.id });
          insertPhysicalElement({ builder, userLabel: `element-3`, modelId: model2.id, categoryId: category3.id });

          return { rootSubject, model1, model2, category1, category2, category3 };
        },
        (x) => [
          [x.rootSubject, x.model1, x.category1],
          [x.rootSubject, x.model2, x.category3],
        ],
        (x) => [x.category1, x.category3],
        (_x) => "matching",
        (x) => [
          NodeValidators.createForInstanceNode({
            instanceKeys: [x.rootSubject],
            autoExpand: true,
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [x.model1],
                label: "model-1",
                autoExpand: true,
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [x.category1],
                    label: "matching category 1",
                    autoExpand: false,
                    children: [
                      NodeValidators.createForClassGroupingNode({
                        label: "Physical Object",
                        children: [NodeValidators.createForInstanceNode({ label: /^element-1/, children: false })],
                      }),
                    ],
                  }),
                ],
              }),
              NodeValidators.createForInstanceNode({
                instanceKeys: [x.model2],
                label: "model-2",
                autoExpand: true,
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [x.category3],
                    label: "matching category 3",
                    autoExpand: false,
                    children: [
                      NodeValidators.createForClassGroupingNode({
                        label: "Physical Object",
                        children: [NodeValidators.createForInstanceNode({ label: /^element-3/, children: false })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      ),
      TreeFilteringTestCaseDefinition.create(
        "root Element nodes",
        async (builder) => {
          const rootSubject: InstanceKey = { className: "BisCore.Subject", id: IModel.rootSubjectId };
          const model1 = insertPhysicalModelWithPartition({ builder, codeValue: `model-1`, partitionParentId: rootSubject.id });
          const model2 = insertPhysicalModelWithPartition({ builder, codeValue: `model-2`, partitionParentId: rootSubject.id });

          const category1 = insertSpatialCategory({ builder, codeValue: "category-1" });
          const category2 = insertSpatialCategory({ builder, codeValue: "category-2" });

          const element11 = insertPhysicalElement({ builder, userLabel: `matching element 11`, modelId: model1.id, categoryId: category1.id });
          const element12 = insertPhysicalElement({ builder, userLabel: `element 12`, modelId: model1.id, categoryId: category1.id });

          const element21 = insertPhysicalElement({ builder, userLabel: `element 21`, modelId: model2.id, categoryId: category2.id });
          const element22 = insertPhysicalElement({ builder, userLabel: `matching element 22`, modelId: model2.id, categoryId: category2.id });

          return { rootSubject, model1, model2, category1, category2, element11, element12, element21, element22 };
        },
        (x) => [
          [x.rootSubject, x.model1, x.category1, x.element11],
          [x.rootSubject, x.model2, x.category2, x.element22],
        ],
        (x) => [x.element11, x.element22],
        (_x) => "matching",
        (x) => [
          NodeValidators.createForInstanceNode({
            instanceKeys: [x.rootSubject],
            autoExpand: true,
            children: [
              NodeValidators.createForInstanceNode({
                label: "model-1",
                autoExpand: true,
                children: [
                  NodeValidators.createForInstanceNode({
                    label: "category-1",
                    autoExpand: true,
                    children: [
                      NodeValidators.createForClassGroupingNode({
                        label: "Physical Object",
                        autoExpand: true,
                        children: [NodeValidators.createForInstanceNode({ label: /^matching element 11/, autoExpand: false, children: false })],
                      }),
                    ],
                  }),
                ],
              }),
              NodeValidators.createForInstanceNode({
                label: "model-2",
                autoExpand: true,
                children: [
                  NodeValidators.createForInstanceNode({
                    label: "category-2",
                    autoExpand: true,
                    children: [
                      NodeValidators.createForClassGroupingNode({
                        label: "Physical Object",
                        autoExpand: true,
                        children: [NodeValidators.createForInstanceNode({ label: /^matching element 22/, autoExpand: false, children: false })],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      ),
      TreeFilteringTestCaseDefinition.create(
        "child Element nodes",
        async (builder) => {
          const rootSubject: InstanceKey = { className: "BisCore.Subject", id: IModel.rootSubjectId };
          const model = insertPhysicalModelWithPartition({ builder, codeValue: `model-x`, partitionParentId: rootSubject.id });
          const category = insertSpatialCategory({ builder, codeValue: "category-x" });
          const rootElement = insertPhysicalElement({ builder, userLabel: `root element 0`, modelId: model.id, categoryId: category.id });
          const childElement1 = insertPhysicalElement({
            builder,
            userLabel: `matching element 1`,
            modelId: model.id,
            categoryId: category.id,
            parentId: rootElement.id,
          });
          const childElement2 = insertPhysicalElement({
            builder,
            userLabel: `element 2`,
            modelId: model.id,
            categoryId: category.id,
            parentId: rootElement.id,
          });
          const childElement3 = insertPhysicalElement({
            builder,
            userLabel: `matching element 3`,
            modelId: model.id,
            categoryId: category.id,
            parentId: rootElement.id,
          });
          return { rootSubject, model, category, rootElement, childElement1, childElement2, childElement3 };
        },
        (x) => [
          [x.rootSubject, x.model, x.category, x.rootElement, x.childElement1],
          [x.rootSubject, x.model, x.category, x.rootElement, x.childElement3],
        ],
        (x) => [x.childElement1, x.childElement3],
        (_x) => "matching",
        (x) => [
          NodeValidators.createForInstanceNode({
            instanceKeys: [x.rootSubject],
            autoExpand: true,
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [x.model],
                label: "model-x",
                autoExpand: true,
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [x.category],
                    label: "category-x",
                    autoExpand: true,
                    children: [
                      NodeValidators.createForClassGroupingNode({
                        label: "Physical Object",
                        autoExpand: true,
                        children: [
                          NodeValidators.createForInstanceNode({
                            instanceKeys: [x.rootElement],
                            label: /^root element/,
                            autoExpand: true,
                            children: [
                              NodeValidators.createForClassGroupingNode({
                                label: "Physical Object",
                                autoExpand: true,
                                children: [
                                  NodeValidators.createForInstanceNode({
                                    instanceKeys: [x.childElement1],
                                    label: /^matching element 1/,
                                    autoExpand: false,
                                    children: false,
                                  }),
                                  NodeValidators.createForInstanceNode({
                                    instanceKeys: [x.childElement3],
                                    label: /^matching element 3/,
                                    autoExpand: false,
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
      ),
      TreeFilteringTestCaseDefinition.create(
        "sub-modeled Element nodes",
        async (builder, mochaContext) => {
          const { items } = await importTestSchema(mochaContext, builder);
          const rootSubject: InstanceKey = { className: "BisCore.Subject", id: IModel.rootSubjectId };
          const model = insertPhysicalModelWithPartition({ builder, codeValue: `model`, partitionParentId: rootSubject.id });
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          const rootElement = insertPhysicalElement({
            builder,
            classFullName: items.TestPhysicalObject.fullName,
            userLabel: `root element`,
            modelId: model.id,
            categoryId: category.id,
          });
          const subModel = insertPhysicalSubModel({ builder, modeledElementId: rootElement.id });
          const subModeledElement1 = insertPhysicalElement({ builder, userLabel: `matching element 1`, modelId: subModel.id, categoryId: category.id });
          const subModeledElement2 = insertPhysicalElement({ builder, userLabel: `element 2`, modelId: subModel.id, categoryId: category.id });
          const subModeledElement3 = insertPhysicalElement({ builder, userLabel: `matching element 3`, modelId: subModel.id, categoryId: category.id });
          return { rootSubject, model, category, rootElement, subModel, subModeledElement1, subModeledElement2, subModeledElement3 };
        },
        (x) => [
          [x.rootSubject, x.model, x.category, x.rootElement, x.subModel, x.category, x.subModeledElement1],
          [x.rootSubject, x.model, x.category, x.rootElement, x.subModel, x.category, x.subModeledElement3],
        ],
        (x) => [x.subModeledElement1, x.subModeledElement3],
        (_x) => "matching",
        (x) => [
          NodeValidators.createForInstanceNode({
            instanceKeys: [x.rootSubject],
            autoExpand: true,
            children: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [x.model],
                label: "model",
                autoExpand: true,
                children: [
                  NodeValidators.createForInstanceNode({
                    instanceKeys: [x.category],
                    label: "category",
                    autoExpand: true,
                    children: [
                      NodeValidators.createForClassGroupingNode({
                        label: "Test Physical Object",
                        autoExpand: true,
                        children: [
                          NodeValidators.createForInstanceNode({
                            instanceKeys: [x.rootElement],
                            label: /^root element/,
                            autoExpand: true,
                            children: [
                              NodeValidators.createForInstanceNode({
                                instanceKeys: [x.category],
                                label: "category",
                                autoExpand: true,
                                children: [
                                  NodeValidators.createForClassGroupingNode({
                                    label: "Physical Object",
                                    autoExpand: true,
                                    children: [
                                      NodeValidators.createForInstanceNode({
                                        instanceKeys: [x.subModeledElement1],
                                        label: /^matching element 1/,
                                        autoExpand: false,
                                        children: false,
                                      }),
                                      NodeValidators.createForInstanceNode({
                                        instanceKeys: [x.subModeledElement3],
                                        label: /^matching element 3/,
                                        autoExpand: false,
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
      ),
      TreeFilteringTestCaseDefinition.create(
        "Element node through hidden ancestors",
        async (builder) => {
          const rootSubject: InstanceKey = { className: "BisCore.Subject", id: IModel.rootSubjectId };
          const hiddenChildSubject = insertSubject({
            builder,
            codeValue: `hidden-subject`,
            parentId: rootSubject.id,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            jsonProperties: { Subject: { Job: { Bridge: "Test" } } },
          });
          const partition = insertPhysicalPartition({
            builder,
            codeValue: `hidden-model`,
            parentId: hiddenChildSubject.id,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            jsonProperties: { PhysicalPartition: { Model: { Content: true } } },
          });
          const model = insertPhysicalSubModel({ builder, modeledElementId: partition.id });
          const category = insertSpatialCategory({ builder, codeValue: "category" });
          const element1 = insertPhysicalElement({ builder, userLabel: `matching element 1`, modelId: model.id, categoryId: category.id });
          const element2 = insertPhysicalElement({ builder, userLabel: `element 2`, modelId: model.id, categoryId: category.id });
          return { rootSubject, model, category, element1, element2 };
        },
        (x) => [[x.rootSubject, x.model, x.category, x.element1]],
        (x) => [x.element1],
        (_x) => "matching",
        (x) => [
          NodeValidators.createForInstanceNode({
            instanceKeys: [x.rootSubject],
            autoExpand: true,
            children: [
              NodeValidators.createForInstanceNode({
                label: "category",
                autoExpand: true,
                children: [
                  NodeValidators.createForClassGroupingNode({
                    label: "Physical Object",
                    autoExpand: true,
                    children: [NodeValidators.createForInstanceNode({ label: /^matching element 1/, autoExpand: false, children: false })],
                  }),
                ],
              }),
            ],
          }),
        ],
      ),
    ];

    TEST_CASE_DEFS.forEach((testCase: TreeFilteringTestCaseDefinition<any>) => {
      describe(testCase.name, () => {
        let imodel: IModelConnection;
        let instanceKeyPaths!: HierarchyNodeIdentifiersPath[];
        let targetInstanceKeys!: InstanceKey[];
        let targetInstanceLabel!: string;
        let expectedHierarchy!: ExpectedHierarchyDef[];

        let hierarchyProvider: HierarchyProvider;

        before(async function () {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          const mochaContext = this;
          // eslint-disable-next-line deprecation/deprecation
          imodel = await buildTestIModel(this, async (builder) => {
            const imodelSetupResult = await testCase.setupIModel(builder, mochaContext);
            instanceKeyPaths = testCase.getTargetInstancePaths(imodelSetupResult).sort(instanceKeyPathSorter);
            targetInstanceKeys = testCase.getTargetInstanceKeys(imodelSetupResult);
            targetInstanceLabel = testCase.getTargetInstanceLabel(imodelSetupResult);
            expectedHierarchy = testCase.getExpectedHierarchy(imodelSetupResult);
          });
        });

        beforeEach(() => {
          hierarchyProvider = createModelsTreeProvider(imodel, instanceKeyPaths);
        });

        after(async function () {
          await imodel.close();
        });

        it("filters hierarchy by instance key paths", async function () {
          await validateHierarchy({
            provider: hierarchyProvider,
            expect: expectedHierarchy,
          });
        });

        it("finds instance key paths by target instance key", async function () {
          const schemas = new SchemaContext();
          schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
          const metadataProvider = createMetadataProvider(schemas);

          const actualInstanceKeyPaths = (
            await ModelsTreeDefinition.createInstanceKeyPaths({
              metadataProvider,
              queryExecutor: hierarchyProvider.queryExecutor,
              keys: targetInstanceKeys,
            })
          ).sort(instanceKeyPathSorter);
          expect(actualInstanceKeyPaths).to.deep.eq(instanceKeyPaths);
        });

        it("finds instance key paths by target instance label", async function () {
          const schemas = new SchemaContext();
          schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
          const metadataProvider = createMetadataProvider(schemas);

          const actualInstanceKeyPaths = (
            await ModelsTreeDefinition.createInstanceKeyPaths({
              metadataProvider,
              queryExecutor: hierarchyProvider.queryExecutor,
              label: targetInstanceLabel,
            })
          ).sort(instanceKeyPathSorter);
          expect(actualInstanceKeyPaths).to.deep.eq(instanceKeyPaths);
        });
      });
    });

    it("finds elements by base36 ECInstanceId suffix", async function () {
      const { imodel, expectedPaths, formattedECInstanceId } = await buildIModel(this, async (builder) => {
        const rootSubject: InstanceKey = { className: "BisCore.Subject", id: IModel.rootSubjectId };
        const model = insertPhysicalModelWithPartition({ builder, codeValue: `model`, partitionParentId: rootSubject.id });
        const category = insertSpatialCategory({ builder, codeValue: "category" });
        const element = insertPhysicalElement({ builder, userLabel: `element 21`, modelId: model.id, categoryId: category.id });
        const elementBriefcaseId = Id64.getBriefcaseId(element.id).toString(36).toLocaleUpperCase();
        const elementLocalId = Id64.getLocalId(element.id).toString(36).toLocaleUpperCase();
        return {
          formattedECInstanceId: `[${elementBriefcaseId}-${elementLocalId}]`,
          expectedPaths: [[rootSubject, model, category, element]].sort(instanceKeyPathSorter),
        };
      });

      const schemas = new SchemaContext();
      schemas.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
      const metadataProvider = createMetadataProvider(schemas);

      const actualInstanceKeyPaths = (
        await ModelsTreeDefinition.createInstanceKeyPaths({
          metadataProvider,
          queryExecutor: {
            createQueryReader(query, config) {
              return createECSqlQueryExecutor(imodel).createQueryReader(addCTEs(query.ecsql, query.ctes), query.bindings, config);
            },
          },
          label: formattedECInstanceId,
        })
      ).sort(instanceKeyPathSorter);
      expect(actualInstanceKeyPaths).to.deep.eq(expectedPaths);
    });

    function insertModelWithElements(builder: TestIModelBuilder, modelNo: number, elementsCategoryId: Id64String, parentId?: Id64String) {
      const modelKey = insertPhysicalModelWithPartition({ builder, codeValue: `model-${modelNo}`, partitionParentId: parentId });
      insertPhysicalElement({ builder, userLabel: `element-${modelNo}`, modelId: modelKey.id, categoryId: elementsCategoryId });
      return modelKey;
    }

    function instanceKeyPathSorter(lhs: HierarchyNodeIdentifiersPath, rhs: HierarchyNodeIdentifiersPath) {
      if (lhs.length !== rhs.length) {
        return lhs.length - rhs.length;
      }
      for (let i = 0; i < lhs.length; ++i) {
        const lhsId = lhs[i];
        const rhsId = rhs[i];
        if (HierarchyNodeIdentifier.isInstanceNodeIdentifier(lhsId) && HierarchyNodeIdentifier.isInstanceNodeIdentifier(rhsId)) {
          const classNameCmp = lhsId.className.localeCompare(rhsId.className);
          if (0 !== classNameCmp) {
            return classNameCmp;
          }
          return lhsId.id.localeCompare(rhsId.id);
        }
        if (HierarchyNodeIdentifier.isCustomNodeIdentifier(lhsId) && HierarchyNodeIdentifier.isCustomNodeIdentifier(rhsId)) {
          return lhsId.key.localeCompare(rhsId.key);
        }
        return HierarchyNodeIdentifier.isCustomNodeIdentifier(lhsId) ? -1 : 1;
      }
      return 0;
    }
  });
});
