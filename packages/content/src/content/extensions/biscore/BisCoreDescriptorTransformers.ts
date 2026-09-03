/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { isBisCoreSchemaAtLeast } from "./BisCoreUtils.js";

import type { DescriptorTransformer } from "../DescriptorTransformer.js";

/**
 * Hides `BisCore:DefinitionElement.IsPrivate` and `BisCore:TypeDefinitionElement.Recipe` before BisCore
 * 1.0.15, where the schema started marking both properties as hidden.
 *
 * @internal
 */
export const hideTypeDefinitionElementInternalPropertiesTransformer: DescriptorTransformer = {
  async transform({ descriptor, imodelAccess }) {
    if (await isBisCoreSchemaAtLeast(imodelAccess, "1.0.15")) {
      return;
    }
    for (const field of Object.values(descriptor.fields)) {
      if (
        field.kind === "property" &&
        ((field.propertyClassName === "BisCore.DefinitionElement" && field.propertyName === "IsPrivate") ||
          (field.propertyClassName === "BisCore.TypeDefinitionElement" && field.propertyName === "Recipe"))
      ) {
        field.hidden = true;
      }
    }
  },
};

/**
 * Renames `BisCore:PhysicalType.PhysicalMaterial` to "Physical Material" for BisCore versions 1.0.11
 * through 1.0.14. The property was introduced in 1.0.11 and gained the schema display label in 1.0.15.
 *
 * @internal
 */
export const renamePhysicalTypePhysicalMaterialTransformer: DescriptorTransformer = {
  async transform({ descriptor, imodelAccess }) {
    if (
      !(await isBisCoreSchemaAtLeast(imodelAccess, "1.0.11")) ||
      (await isBisCoreSchemaAtLeast(imodelAccess, "1.0.15"))
    ) {
      return;
    }
    for (const field of Object.values(descriptor.fields)) {
      if (
        field.kind === "property" &&
        field.propertyClassName === "BisCore.PhysicalType" &&
        field.propertyName === "PhysicalMaterial"
      ) {
        field.label = "Physical Material";
      }
    }
  },
};

/**
 * Creates the set of `DescriptorTransformer` implementations applying BisCore-specific field
 * metadata adjustments.
 *
 * @internal
 */
export function createBisCoreDescriptorTransformers(): DescriptorTransformer[] {
  return [hideTypeDefinitionElementInternalPropertiesTransformer, renamePhysicalTypePhysicalMaterialTransformer];
}
