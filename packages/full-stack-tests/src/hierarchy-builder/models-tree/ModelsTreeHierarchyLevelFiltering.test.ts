/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { ElementOwnsMultiAspects, ExternalSourceAspect, PhysicalModel, SpatialCategory, Subject } from "@itwin/core-backend";
import { Descriptor, PropertiesField, PropertyValueFormat } from "@itwin/presentation-common";
import { createHierarchyLevelDescriptor } from "@itwin/presentation-core-interop";
import { Presentation } from "@itwin/presentation-frontend";
import { buildTestIModel } from "@itwin/presentation-testing";
import {
  buildIModel,
  insertExternalSourceAspect,
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertPhysicalPartition,
  insertPhysicalSubModel,
  insertSpatialCategory,
  insertSubject,
} from "../../IModelUtils";
import { initialize, terminate } from "../../IntegrationTests";
import { NodeValidators, validateHierarchyLevel } from "../HierarchyValidation";
import { createModelsTreeProvider, importTestSchema } from "./ModelsTreeTestUtils";

describe("Stateless hierarchy builder", () => {
  describe("Models tree hierarchy level filtering", () => {
    before(async function () {
      await initialize();
    });

    after(async () => {
      await terminate();
    });

    it("creates root level descriptor", async function () {
      // eslint-disable-next-line deprecation/deprecation
      const imodel = await buildTestIModel(this, async () => {});
      const provider = createModelsTreeProvider(imodel);
      validateHierarchyLevel({
        nodes: await provider.getNodes({
          parentNode: undefined,
        }),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: "0x1" }] })],
      });
      const descriptor = await createHierarchyLevelDescriptor({
        imodel,
        parentNode: undefined,
        hierarchyProvider: provider,
        descriptorBuilder: Presentation.presentation,
      });
      expect(descriptor).to.containSubset({
        selectClasses: [
          {
            selectClassInfo: { name: Subject.classFullName },
          },
        ],
        fields: subjectFields,
      } as Partial<Descriptor>);
    });

    it("creates Subject child level descriptor", async function () {
      // eslint-disable-next-line deprecation/deprecation
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: Subject.classFullName.replace(":", "."), id: "0x1" };
        const category = insertSpatialCategory({ builder, codeValue: "category" });

        // set up child subject node
        const childSubject = insertSubject({ builder, codeValue: "child subject 1", parentId: rootSubject.id });
        insertPhysicalElement({
          builder,
          userLabel: `root element 1`,
          modelId: insertPhysicalModelWithPartition({ builder, codeValue: `model 1`, partitionParentId: childSubject.id }).id,
          categoryId: category.id,
        });

        // set up child model node
        const model = insertPhysicalModelWithPartition({ builder, codeValue: `model 2`, partitionParentId: rootSubject.id });
        insertPhysicalElement({ builder, userLabel: `element`, modelId: model.id, categoryId: category.id });

        // set up child category node
        insertPhysicalElement({
          builder,
          userLabel: `element`,
          modelId: insertPhysicalSubModel({
            builder,
            modeledElementId: insertPhysicalPartition({
              builder,
              codeValue: `model 3`,
              parentId: rootSubject.id,
              // eslint-disable-next-line @typescript-eslint/naming-convention
              jsonProperties: { PhysicalPartition: { Model: { Content: true } } },
            }).id,
          }).id,
          categoryId: category.id,
        });

        return { rootSubject, childSubject, model, category };
      });
      const provider = createModelsTreeProvider(imodel);
      const parentNode = {
        key: {
          type: "instances" as const,
          instanceKeys: [keys.rootSubject],
        },
        parentKeys: [],
        label: "",
      };
      validateHierarchyLevel({
        nodes: await provider.getNodes({ parentNode }),
        expect: [
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.category] }),
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject] }),
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.model] }),
        ],
      });
      const descriptor = await createHierarchyLevelDescriptor({
        imodel,
        parentNode,
        hierarchyProvider: provider,
        descriptorBuilder: Presentation.presentation,
      });
      expect(descriptor).to.containSubset({
        selectClasses: [
          {
            selectClassInfo: { name: Subject.classFullName },
          },
          {
            selectClassInfo: { name: PhysicalModel.classFullName },
          },
          {
            selectClassInfo: { name: SpatialCategory.classFullName },
          },
        ],
        fields: mergeFieldLists([subjectFields, physicalModelFields, spatialCategoryFields]),
      } as Partial<Descriptor>);
    });

    it("creates Model child level descriptor", async function () {
      // eslint-disable-next-line deprecation/deprecation
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: Subject.classFullName.replace(":", "."), id: "0x1" };
        const category = insertSpatialCategory({ builder, codeValue: "category" });
        const model = insertPhysicalModelWithPartition({ builder, codeValue: `model`, partitionParentId: rootSubject.id });
        insertPhysicalElement({ builder, userLabel: `element`, modelId: model.id, categoryId: category.id });
        return { rootSubject, model, category };
      });
      const provider = createModelsTreeProvider(imodel);
      const parentNode = {
        key: {
          type: "instances" as const,
          instanceKeys: [keys.model],
        },
        parentKeys: [
          {
            type: "instances" as const,
            instanceKeys: [keys.rootSubject],
          },
        ],
        label: "",
      };
      validateHierarchyLevel({
        nodes: await provider.getNodes({ parentNode }),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.category] })],
      });
      const descriptor = await createHierarchyLevelDescriptor({
        imodel,
        parentNode,
        hierarchyProvider: provider,
        descriptorBuilder: Presentation.presentation,
      });
      expect(descriptor).to.containSubset({
        selectClasses: [
          {
            selectClassInfo: { name: SpatialCategory.classFullName },
          },
        ],
        fields: spatialCategoryFields,
      } as Partial<Descriptor>);
    });

    it("creates Category child level descriptor", async function () {
      // eslint-disable-next-line deprecation/deprecation
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: Subject.classFullName.replace(":", "."), id: "0x1" };
        const category = insertSpatialCategory({ builder, codeValue: "category" });
        const model = insertPhysicalModelWithPartition({ builder, codeValue: `model`, partitionParentId: rootSubject.id });
        const element = insertPhysicalElement({ builder, userLabel: `element`, modelId: model.id, categoryId: category.id });
        return { rootSubject, model, category, element };
      });
      const provider = createModelsTreeProvider(imodel);
      const parentNode = {
        key: {
          type: "instances" as const,
          instanceKeys: [keys.category],
        },
        parentKeys: [
          {
            type: "instances" as const,
            instanceKeys: [keys.rootSubject],
          },
          {
            type: "instances" as const,
            instanceKeys: [keys.model],
          },
        ],
        extendedData: {
          modelIds: [keys.model.id],
        },
        label: "",
      };
      validateHierarchyLevel({
        nodes: await provider.getNodes({ parentNode }),
        expect: [NodeValidators.createForClassGroupingNode({ className: keys.element.className })],
      });
      const descriptor = await createHierarchyLevelDescriptor({
        imodel,
        parentNode,
        hierarchyProvider: provider,
        descriptorBuilder: Presentation.presentation,
      });
      expect(descriptor).to.containSubset({
        selectClasses: [
          {
            selectClassInfo: { name: keys.element.className.replace(".", ":") },
          },
        ],
        fields: physicalElementFields,
      } as Partial<Descriptor>);
    });

    it("creates Element child level descriptor from child elements", async function () {
      // eslint-disable-next-line deprecation/deprecation
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: Subject.classFullName.replace(":", "."), id: "0x1" };
        const category = insertSpatialCategory({ builder, codeValue: "category" });
        const model = insertPhysicalModelWithPartition({ builder, codeValue: `model`, partitionParentId: rootSubject.id });
        const parentElement = insertPhysicalElement({ builder, userLabel: `parent element`, modelId: model.id, categoryId: category.id });
        const childElement = insertPhysicalElement({
          builder,
          userLabel: `child element`,
          modelId: model.id,
          categoryId: category.id,
          parentId: parentElement.id,
        });
        return { rootSubject, model, category, parentElement, childElement };
      });
      const provider = createModelsTreeProvider(imodel);
      const parentNode = {
        key: {
          type: "instances" as const,
          instanceKeys: [keys.parentElement],
        },
        parentKeys: [
          {
            type: "instances" as const,
            instanceKeys: [keys.rootSubject],
          },
          {
            type: "instances" as const,
            instanceKeys: [keys.model],
          },
          {
            type: "instances" as const,
            instanceKeys: [keys.category],
          },
        ],
        label: "",
      };
      validateHierarchyLevel({
        nodes: await provider.getNodes({ parentNode }),
        expect: [NodeValidators.createForClassGroupingNode({ className: keys.childElement.className })],
      });
      const descriptor = await createHierarchyLevelDescriptor({
        imodel,
        parentNode,
        hierarchyProvider: provider,
        descriptorBuilder: Presentation.presentation,
      });
      expect(descriptor).to.containSubset({
        selectClasses: [
          {
            selectClassInfo: { name: keys.childElement.className.replace(".", ":") },
          },
        ],
        fields: physicalElementFields,
      } as Partial<Descriptor>);
    });

    it("creates Element child level descriptor from modeling elements", async function () {
      // eslint-disable-next-line deprecation/deprecation
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const { items: classes } = await importTestSchema(this, builder);
        const rootSubject = { className: Subject.classFullName.replace(":", "."), id: "0x1" };
        const category = insertSpatialCategory({ builder, codeValue: "category" });
        const model = insertPhysicalModelWithPartition({ builder, codeValue: `model`, partitionParentId: rootSubject.id });
        const modeledElement = insertPhysicalElement({
          builder,
          classFullName: classes.PhysicalObject.fullName,
          userLabel: `parent element`,
          modelId: model.id,
          categoryId: category.id,
        });
        const subModel = insertPhysicalSubModel({ builder, modeledElementId: modeledElement.id });
        const modelingElement = insertPhysicalElement({
          builder,
          userLabel: `modeling element`,
          modelId: subModel.id,
          categoryId: category.id,
        });
        return { rootSubject, model, category, modeledElement, modelingElement };
      });
      const provider = createModelsTreeProvider(imodel);
      const parentNode = {
        key: {
          type: "instances" as const,
          instanceKeys: [keys.modeledElement],
        },
        parentKeys: [
          {
            type: "instances" as const,
            instanceKeys: [keys.rootSubject],
          },
          {
            type: "instances" as const,
            instanceKeys: [keys.model],
          },
          {
            type: "instances" as const,
            instanceKeys: [keys.category],
          },
        ],
        label: "",
      };
      validateHierarchyLevel({
        nodes: await provider.getNodes({ parentNode }),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.category] })],
      });
      const descriptor = await createHierarchyLevelDescriptor({
        imodel,
        parentNode,
        hierarchyProvider: provider,
        descriptorBuilder: Presentation.presentation,
      });
      expect(descriptor).to.containSubset({
        selectClasses: [
          {
            selectClassInfo: { name: SpatialCategory.classFullName },
          },
        ],
        fields: spatialCategoryFields,
      } as Partial<Descriptor>);
    });

    it("creates descriptor with related properties", async function () {
      // eslint-disable-next-line deprecation/deprecation
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: Subject.classFullName.replace(":", "."), id: "0x1" };
        const category = insertSpatialCategory({ builder, codeValue: "category" });
        const model = insertPhysicalModelWithPartition({ builder, codeValue: `model`, partitionParentId: rootSubject.id });
        const element = insertPhysicalElement({ builder, userLabel: `element`, modelId: model.id, categoryId: category.id });
        const aspect = insertExternalSourceAspect({ builder, elementId: element.id, identifier: "test aspect" });
        return { rootSubject, model, category, element, aspect };
      });
      const provider = createModelsTreeProvider(imodel);
      const parentNode = {
        key: {
          type: "instances" as const,
          instanceKeys: [keys.category],
        },
        parentKeys: [
          {
            type: "instances" as const,
            instanceKeys: [keys.rootSubject],
          },
          {
            type: "instances" as const,
            instanceKeys: [keys.model],
          },
        ],
        extendedData: {
          modelIds: [keys.model.id],
        },
        label: "",
      };
      validateHierarchyLevel({
        nodes: await provider.getNodes({ parentNode }),
        expect: [NodeValidators.createForClassGroupingNode({ className: keys.element.className })],
      });
      const descriptor = await createHierarchyLevelDescriptor({
        imodel,
        parentNode,
        hierarchyProvider: provider,
        descriptorBuilder: Presentation.presentation,
      });
      expect(descriptor).to.containSubset({
        selectClasses: [
          {
            selectClassInfo: { name: keys.element.className.replace(".", ":") },
            relatedPropertyPaths: [
              [
                {
                  relationshipInfo: { name: ElementOwnsMultiAspects.classFullName },
                  isForwardRelationship: true,
                },
              ],
            ],
          },
        ],
        fields: [
          ...physicalElementFields,
          {
            contentClassInfo: { name: ExternalSourceAspect.classFullName },
            pathToPrimaryClass: [
              {
                sourceClassInfo: { name: ExternalSourceAspect.classFullName },
                relationshipInfo: { name: ElementOwnsMultiAspects.classFullName },
                isForwardRelationship: false,
                targetClassInfo: { name: keys.element.className.replace(".", ":") },
              },
            ],
            nestedFields: [
              {
                label: "Source Element ID",
                type: { valueFormat: PropertyValueFormat.Primitive, typeName: "string" },
              },
            ],
          },
        ],
      } as Partial<Descriptor>);
    });
  });
});

function mergeFieldLists<TField extends Pick<PropertiesField, "label">>(fieldLists: TField[][]): TField[] {
  const map = new Map<string, TField>();
  fieldLists.forEach((list) => list.forEach((field) => map.set(field.label, field)));
  return [...map.values()];
}

const subjectFields = [
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
];

const physicalModelFields = [
  {
    label: "Modeled Element",
    type: { valueFormat: PropertyValueFormat.Primitive, typeName: "navigation" },
  },
  {
    label: "Is Plan Projection",
    type: { valueFormat: PropertyValueFormat.Primitive, typeName: "boolean" },
  },
];

const spatialCategoryFields = [
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
];

const physicalElementFields = [
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
    label: "Category",
    type: { valueFormat: PropertyValueFormat.Primitive, typeName: "navigation" },
  },
  {
    label: "Physical Material",
    type: { valueFormat: PropertyValueFormat.Primitive, typeName: "navigation" },
  },
];
