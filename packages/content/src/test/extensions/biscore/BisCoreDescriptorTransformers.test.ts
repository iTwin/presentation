/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  createBisCoreDescriptorTransformers,
  hideTypeDefinitionElementInternalPropertiesTransformer,
  renamePhysicalTypePhysicalMaterialTransformer,
} from "../../../content/extensions/biscore/BisCoreDescriptorTransformers.js";
import { createTransformableDescriptor } from "../../../content/extensions/DescriptorTransformer.js";
import { PropertyField } from "../../../content/model/Field.js";
import { toSortedUniqueClassNames } from "../../../content/model/Utils.js";

import type { EC, ECSchemaProvider } from "@itwin/presentation-shared";
import type { ContentDescriptor } from "../../../content/model/ContentDescriptor.js";
import type { Field } from "../../../content/model/Field.js";

function propertyField(props: {
  propertyClassName: EC.FullClassNameDotNotation;
  propertyName: string;
  valueClassNames?: EC.FullClassNameDotNotation[];
  pathFromTarget?: PropertyField["pathFromTarget"];
  label?: string;
}): PropertyField {
  const id = PropertyField.computeId({
    propertyClassName: props.propertyClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget,
  });
  const valueClassNames = toSortedUniqueClassNames(props.valueClassNames ?? [props.propertyClassName]);
  return {
    kind: "property",
    id,
    selectorId: id,
    label: props.label ?? "Label",
    type: { kind: "primitive", type: "String" },
    propertyClassName: props.propertyClassName,
    propertyName: props.propertyName,
    pathFromTarget: props.pathFromTarget ?? [],
    valueClassNames,
    primaryClassNames: props.pathFromTarget ? [props.pathFromTarget[0].sourceClassName] : valueClassNames,
  };
}

function createDescriptor(fields: Field[]): ContentDescriptor {
  return {
    sources: [],
    categories: {},
    selectors: {},
    fields: Object.fromEntries(fields.map((field) => [field.id, field])),
  };
}

function createImodelAccess(bisCoreVersion?: EC.SchemaVersion): ECSchemaProvider {
  return {
    getSchema: async (name: string) => {
      if (name !== "BisCore" || !bisCoreVersion) {
        return undefined;
      }
      return {
        name,
        version: bisCoreVersion,
        isHidden: false,
        getClass: () => undefined,
        getEnumeration: () => undefined,
        getKindOfQuantity: () => undefined,
        getPropertyCategory: () => undefined,
      };
    },
    classDerivesFrom: async (derived, base) => derived === base,
  };
}

describe("hideTypeDefinitionElementInternalPropertiesTransformer", () => {
  it("hides IsPrivate at DefinitionElement and Recipe at TypeDefinitionElement before BisCore 1.0.15", async () => {
    const isPrivate = propertyField({
      propertyClassName: "BisCore.DefinitionElement",
      propertyName: "IsPrivate",
      valueClassNames: ["TestSchema.DerivedTypeDefinition"],
    });
    const recipe = propertyField({
      propertyClassName: "BisCore.TypeDefinitionElement",
      propertyName: "Recipe",
      valueClassNames: ["TestSchema.DerivedTypeDefinition"],
    });
    const descriptor = createDescriptor([isPrivate, recipe]);

    await hideTypeDefinitionElementInternalPropertiesTransformer.transform({
      descriptor: createTransformableDescriptor(descriptor),
      imodelAccess: createImodelAccess({ read: 1, write: 0, minor: 14 }),
    });

    expect(descriptor.fields[isPrivate.id].hidden).to.be.true;
    expect(descriptor.fields[recipe.id].hidden).to.be.true;
  });

  it("does not hide properties already marked hidden by BisCore 1.0.15", async () => {
    const isPrivate = propertyField({ propertyClassName: "BisCore.DefinitionElement", propertyName: "IsPrivate" });
    const recipe = propertyField({ propertyClassName: "BisCore.TypeDefinitionElement", propertyName: "Recipe" });
    const descriptor = createDescriptor([isPrivate, recipe]);

    await hideTypeDefinitionElementInternalPropertiesTransformer.transform({
      descriptor: createTransformableDescriptor(descriptor),
      imodelAccess: createImodelAccess({ read: 1, write: 0, minor: 15 }),
    });

    expect(descriptor.fields[isPrivate.id].hidden).to.be.undefined;
    expect(descriptor.fields[recipe.id].hidden).to.be.undefined;
  });

  it("does not hide fields with the same property names declared by other classes", async () => {
    const unrelatedIsPrivate = propertyField({ propertyClassName: "TestSchema.Other", propertyName: "IsPrivate" });
    const unrelatedRecipe = propertyField({ propertyClassName: "TestSchema.Other", propertyName: "Recipe" });
    const relatedRecipe = propertyField({
      propertyClassName: "BisCore.TypeDefinitionElement",
      propertyName: "Recipe",
      pathFromTarget: [
        {
          sourceClassName: "BisCore.GeometricElement3d",
          targetClassName: "BisCore.TypeDefinitionElement",
          relationshipName: "BisCore.GeometricElement3dHasTypeDefinition",
        },
      ],
    });
    const descriptor = createDescriptor([unrelatedIsPrivate, unrelatedRecipe, relatedRecipe]);

    await hideTypeDefinitionElementInternalPropertiesTransformer.transform({
      descriptor: createTransformableDescriptor(descriptor),
      imodelAccess: createImodelAccess({ read: 1, write: 0, minor: 14 }),
    });

    expect(descriptor.fields[unrelatedIsPrivate.id].hidden).to.be.undefined;
    expect(descriptor.fields[unrelatedRecipe.id].hidden).to.be.undefined;
    expect(descriptor.fields[relatedRecipe.id].hidden).to.be.true;
  });
});

describe("renamePhysicalTypePhysicalMaterialTransformer", () => {
  it("renames PhysicalMaterial declared on PhysicalType from BisCore 1.0.11 through 1.0.14", async () => {
    const physicalMaterial = propertyField({
      propertyClassName: "BisCore.PhysicalType",
      propertyName: "PhysicalMaterial",
      valueClassNames: ["TestSchema.DerivedPhysicalType"],
      label: "PhysicalMaterial",
    });
    const descriptor = createDescriptor([physicalMaterial]);

    await renamePhysicalTypePhysicalMaterialTransformer.transform({
      descriptor: createTransformableDescriptor(descriptor),
      imodelAccess: createImodelAccess({ read: 1, write: 0, minor: 11 }),
    });

    expect(descriptor.fields[physicalMaterial.id].label).to.equal("Physical Material");
  });

  it("does not rename fields declared by other classes", async () => {
    const wrongClass = propertyField({
      propertyClassName: "TestSchema.Other",
      propertyName: "PhysicalMaterial",
      label: "PhysicalMaterial",
    });
    const related = propertyField({
      propertyClassName: "BisCore.PhysicalType",
      propertyName: "PhysicalMaterial",
      pathFromTarget: [
        {
          sourceClassName: "BisCore.GeometricElement3d",
          targetClassName: "BisCore.PhysicalType",
          relationshipName: "BisCore.GeometricElement3dHasTypeDefinition",
        },
      ],
      label: "PhysicalMaterial",
    });
    const descriptor = createDescriptor([wrongClass, related]);

    await renamePhysicalTypePhysicalMaterialTransformer.transform({
      descriptor: createTransformableDescriptor(descriptor),
      imodelAccess: createImodelAccess({ read: 1, write: 0, minor: 11 }),
    });

    expect(descriptor.fields[wrongClass.id].label).to.equal("PhysicalMaterial");
    expect(descriptor.fields[related.id].label).to.equal("Physical Material");
  });

  it("does not rename PhysicalMaterial before BisCore 1.0.11", async () => {
    const physicalMaterial = propertyField({
      propertyClassName: "BisCore.PhysicalType",
      propertyName: "PhysicalMaterial",
      label: "PhysicalMaterial",
    });
    const descriptor = createDescriptor([physicalMaterial]);

    await renamePhysicalTypePhysicalMaterialTransformer.transform({
      descriptor: createTransformableDescriptor(descriptor),
      imodelAccess: createImodelAccess({ read: 1, write: 0, minor: 10 }),
    });

    expect(descriptor.fields[physicalMaterial.id].label).to.equal("PhysicalMaterial");
  });

  it("does not rename PhysicalMaterial from BisCore 1.0.15, where the schema supplies its display label", async () => {
    const physicalMaterial = propertyField({
      propertyClassName: "BisCore.PhysicalType",
      propertyName: "PhysicalMaterial",
      label: "PhysicalMaterial",
    });
    const descriptor = createDescriptor([physicalMaterial]);

    await renamePhysicalTypePhysicalMaterialTransformer.transform({
      descriptor: createTransformableDescriptor(descriptor),
      imodelAccess: createImodelAccess({ read: 1, write: 0, minor: 15 }),
    });

    expect(descriptor.fields[physicalMaterial.id].label).to.equal("PhysicalMaterial");
  });
});

describe("createBisCoreDescriptorTransformers", () => {
  it("returns both BisCore descriptor transformers", () => {
    expect(createBisCoreDescriptorTransformers()).to.deep.equal([
      hideTypeDefinitionElementInternalPropertiesTransformer,
      renamePhysicalTypePhysicalMaterialTransformer,
    ]);
  });
});
