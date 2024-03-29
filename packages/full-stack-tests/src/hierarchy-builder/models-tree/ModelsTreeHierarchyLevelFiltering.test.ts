/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import {
  insertExternalSourceAspect,
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertPhysicalPartition,
  insertPhysicalSubModel,
  insertSpatialCategory,
  insertSubject,
} from "presentation-test-utilities";
import { ElementOwnsMultiAspects, ExternalSourceAspect, PhysicalModel, SpatialCategory, Subject } from "@itwin/core-backend";
import { GenericInstanceFilter, GenericInstanceFilterRule } from "@itwin/core-common";
import { Descriptor, PropertiesField, PropertyValueFormat } from "@itwin/presentation-common";
import { createHierarchyLevelDescriptor } from "@itwin/presentation-core-interop";
import { Presentation } from "@itwin/presentation-frontend";
import { buildTestIModel } from "@itwin/presentation-testing";
import { buildIModel } from "../../IModelUtils";
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

    it("can filter root level", async function () {
      // eslint-disable-next-line deprecation/deprecation
      const imodel = await buildTestIModel(this, async () => {});
      const provider = createModelsTreeProvider(imodel);

      // validate hierarchy level without filter
      validateHierarchyLevel({
        nodes: await provider.getNodes({
          parentNode: undefined,
        }),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: "0x1" }] })],
      });

      // validate descriptor, that is required for creating the filter
      const result = await createHierarchyLevelDescriptor({
        imodel,
        parentNode: undefined,
        hierarchyProvider: provider,
        descriptorBuilder: Presentation.presentation,
      });
      expect(result?.descriptor).to.containSubset({
        selectClasses: [
          {
            selectClassInfo: { name: Subject.classFullName },
          },
        ],
        fields: subjectFields,
      } as Partial<Descriptor>);

      // validate filtered hierarchy level
      validateHierarchyLevel({
        nodes: await provider.getNodes({
          parentNode: undefined,
          instanceFilter: createInstanceFilter("BisCore.Subject", {
            sourceAlias: "this",
            propertyName: "Description",
            propertyTypeName: "string",
            operator: "is-equal",
            value: { rawValue: "", displayValue: "" },
          }),
        }),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [{ className: Subject.classFullName.replace(":", "."), id: "0x1" }] })],
      });
      validateHierarchyLevel({
        nodes: await provider.getNodes({
          parentNode: undefined,
          instanceFilter: createInstanceFilter("BisCore.Subject", {
            sourceAlias: "this",
            propertyName: "Description",
            propertyTypeName: "string",
            operator: "is-not-equal",
            value: { rawValue: "", displayValue: "" },
          }),
        }),
        expect: [],
      });
    });

    it("can filter Subject children level", async function () {
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

      // validate hierarchy level without filter
      validateHierarchyLevel({
        nodes: await provider.getNodes({ parentNode }),
        expect: [
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.category] }),
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject] }),
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.model] }),
        ],
      });

      // validate descriptor, that is required for creating the filter
      const result = await createHierarchyLevelDescriptor({
        imodel,
        parentNode,
        hierarchyProvider: provider,
        descriptorBuilder: Presentation.presentation,
      });
      expect(result?.descriptor).to.containSubset({
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

      // validate filtered hierarchy level
      validateHierarchyLevel({
        nodes: await provider.getNodes({
          parentNode,
          instanceFilter: createInstanceFilter(keys.childSubject.className, {
            sourceAlias: "",
            propertyName: "Description",
            propertyTypeName: "string",
            operator: "is-null",
          }),
        }),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.childSubject] })],
      });
      validateHierarchyLevel({
        nodes: await provider.getNodes({
          parentNode,
          instanceFilter: createInstanceFilter(keys.category.className, {
            sourceAlias: "",
            propertyName: "UserLabel",
            propertyTypeName: "string",
            operator: "is-null",
          }),
        }),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.category] })],
      });
      validateHierarchyLevel({
        nodes: await provider.getNodes({
          parentNode,
          instanceFilter: createInstanceFilter(keys.model.className, {
            sourceAlias: "",
            propertyName: "IsPlanProjection",
            propertyTypeName: "boolean",
            operator: "is-false",
          }),
        }),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.model] })],
      });
    });

    it("can filter Model children level", async function () {
      // eslint-disable-next-line deprecation/deprecation
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const rootSubject = { className: Subject.classFullName.replace(":", "."), id: "0x1" };
        const category1 = insertSpatialCategory({ builder, codeValue: "category1" });
        const category2 = insertSpatialCategory({ builder, codeValue: "category2" });
        const model = insertPhysicalModelWithPartition({ builder, codeValue: `model`, partitionParentId: rootSubject.id });
        insertPhysicalElement({ builder, userLabel: `element`, modelId: model.id, categoryId: category1.id });
        insertPhysicalElement({ builder, userLabel: `element`, modelId: model.id, categoryId: category2.id });
        return { rootSubject, model, category1, category2 };
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

      // validate hierarchy level without filter
      validateHierarchyLevel({
        nodes: await provider.getNodes({ parentNode }),
        expect: [
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.category1] }),
          NodeValidators.createForInstanceNode({ instanceKeys: [keys.category2] }),
        ],
      });

      // validate descriptor, that is required for creating the filter
      const result = await createHierarchyLevelDescriptor({
        imodel,
        parentNode,
        hierarchyProvider: provider,
        descriptorBuilder: Presentation.presentation,
      });
      expect(result?.descriptor).to.containSubset({
        selectClasses: [
          {
            selectClassInfo: { name: SpatialCategory.classFullName },
          },
        ],
        fields: spatialCategoryFields,
      } as Partial<Descriptor>);

      // validate filtered hierarchy level
      validateHierarchyLevel({
        nodes: await provider.getNodes({
          parentNode,
          instanceFilter: createInstanceFilter(keys.category2.className, {
            sourceAlias: "",
            propertyName: "CodeValue",
            propertyTypeName: "string",
            operator: "is-equal",
            value: { rawValue: "category2", displayValue: "" },
          }),
        }),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.category2] })],
      });
    });

    it("can filter Category children level", async function () {
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

      // validate hierarchy level without filter
      validateHierarchyLevel({
        nodes: await provider.getNodes({ parentNode }),
        expect: [NodeValidators.createForClassGroupingNode({ className: keys.element.className })],
      });

      // validate descriptor, that is required for creating the filter
      const result = await createHierarchyLevelDescriptor({
        imodel,
        parentNode,
        hierarchyProvider: provider,
        descriptorBuilder: Presentation.presentation,
      });
      expect(result?.descriptor).to.containSubset({
        selectClasses: [
          {
            selectClassInfo: { name: keys.element.className.replace(".", ":") },
          },
        ],
        fields: physicalElementFields,
      } as Partial<Descriptor>);

      // validate filtered hierarchy level
      validateHierarchyLevel({
        nodes: await provider.getNodes({
          parentNode,
          instanceFilter: createInstanceFilter(keys.element.className, {
            sourceAlias: "",
            propertyName: "UserLabel",
            propertyTypeName: "string",
            operator: "is-equal",
            value: { rawValue: "element", displayValue: "" },
          }),
        }),
        expect: [NodeValidators.createForClassGroupingNode({ className: keys.element.className })],
      });
      validateHierarchyLevel({
        nodes: await provider.getNodes({
          parentNode,
          instanceFilter: createInstanceFilter(keys.element.className, {
            sourceAlias: "",
            propertyName: "UserLabel",
            propertyTypeName: "string",
            operator: "is-null",
          }),
        }),
        expect: [],
      });
    });

    it("can filter Element children level with child elements", async function () {
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

      // validate hierarchy level without filter
      validateHierarchyLevel({
        nodes: await provider.getNodes({ parentNode }),
        expect: [NodeValidators.createForClassGroupingNode({ className: keys.childElement.className })],
      });

      // validate descriptor, that is required for creating the filter
      const result = await createHierarchyLevelDescriptor({
        imodel,
        parentNode,
        hierarchyProvider: provider,
        descriptorBuilder: Presentation.presentation,
      });
      expect(result?.descriptor).to.containSubset({
        selectClasses: [
          {
            selectClassInfo: { name: keys.childElement.className.replace(".", ":") },
          },
        ],
        fields: physicalElementFields,
      } as Partial<Descriptor>);

      // validate filtered hierarchy level
      validateHierarchyLevel({
        nodes: await provider.getNodes({
          parentNode,
          instanceFilter: createInstanceFilter(keys.childElement.className, {
            sourceAlias: "",
            propertyName: "UserLabel",
            propertyTypeName: "string",
            operator: "is-equal",
            value: { rawValue: "child element", displayValue: "" },
          }),
        }),
        expect: [NodeValidators.createForClassGroupingNode({ className: keys.childElement.className })],
      });
      validateHierarchyLevel({
        nodes: await provider.getNodes({
          parentNode,
          instanceFilter: createInstanceFilter(keys.childElement.className, {
            sourceAlias: "",
            propertyName: "UserLabel",
            propertyTypeName: "string",
            operator: "is-null",
          }),
        }),
        expect: [],
      });
    });

    it("can filter Element children level with modeling elements", async function () {
      // eslint-disable-next-line deprecation/deprecation
      const { imodel, ...keys } = await buildIModel(this, async (builder) => {
        const { items: classes } = await importTestSchema(this, builder);
        const rootSubject = { className: Subject.classFullName.replace(":", "."), id: "0x1" };
        const category = insertSpatialCategory({ builder, codeValue: "category" });
        const model = insertPhysicalModelWithPartition({ builder, codeValue: `model`, partitionParentId: rootSubject.id });
        const modeledElement = insertPhysicalElement({
          builder,
          classFullName: classes.TestPhysicalObject.fullName,
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

      // validate hierarchy level without filter
      validateHierarchyLevel({
        nodes: await provider.getNodes({ parentNode }),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.category] })],
      });

      // validate descriptor, that is required for creating the filter
      const result = await createHierarchyLevelDescriptor({
        imodel,
        parentNode,
        hierarchyProvider: provider,
        descriptorBuilder: Presentation.presentation,
      });
      expect(result?.descriptor).to.containSubset({
        selectClasses: [
          {
            selectClassInfo: { name: SpatialCategory.classFullName },
          },
        ],
        fields: spatialCategoryFields,
      } as Partial<Descriptor>);

      // validate filtered hierarchy level
      validateHierarchyLevel({
        nodes: await provider.getNodes({
          parentNode,
          instanceFilter: createInstanceFilter(keys.category.className, {
            sourceAlias: "",
            propertyName: "CodeValue",
            propertyTypeName: "string",
            operator: "is-equal",
            value: { rawValue: "category", displayValue: "" },
          }),
        }),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.category] })],
      });
      validateHierarchyLevel({
        nodes: await provider.getNodes({
          parentNode,
          instanceFilter: createInstanceFilter(keys.category.className, {
            sourceAlias: "",
            propertyName: "UserLabel",
            propertyTypeName: "string",
            operator: "is-null",
          }),
        }),
        expect: [NodeValidators.createForInstanceNode({ instanceKeys: [keys.category] })],
      });
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
      const result = await createHierarchyLevelDescriptor({
        imodel,
        parentNode,
        hierarchyProvider: provider,
        descriptorBuilder: Presentation.presentation,
      });
      expect(result?.descriptor).to.containSubset({
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

function createInstanceFilter(className: string, rule: GenericInstanceFilterRule): GenericInstanceFilter {
  return {
    propertyClassNames: [className],
    relatedInstances: [],
    rules: {
      operator: "and",
      rules: [rule],
    },
  };
}

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
