/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { HIDDEN_SCHEMA_MEMBERS_TRANSFORMER_PRIORITY } from "../HiddenSchemaMembersTransformer.js";
import { isBisCoreSchemaAtLeast } from "./BisCoreUtils.js";

import type { DescriptorTransformer } from "../DescriptorTransformer.js";

/**
 * Priority for bis-core descriptor transformers. Higher priority than hidden schema members transformer
 * to make sure that some of them could be overridden.
 */
const BIS_CORE_TRANSFORMER_PRIORITY = HIDDEN_SCHEMA_MEMBERS_TRANSFORMER_PRIORITY + 100;

/**
 * Hides `BisCore:DefinitionElement.IsPrivate` and `BisCore:TypeDefinitionElement.Recipe` before BisCore
 * 1.0.15, where the schema started marking both properties as hidden.
 *
 * @internal
 */
export const hideTypeDefinitionElementInternalPropertiesTransformer: DescriptorTransformer = {
  priority: BIS_CORE_TRANSFORMER_PRIORITY,
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
  priority: BIS_CORE_TRANSFORMER_PRIORITY,
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
 * Makes `BisCore.ExternalSourceAspect` property `Identifier` visible even though it is hidden by the schema.
 *
 * @internal
 */
export const showExternalSourceAspectPropsTransformer: DescriptorTransformer = {
  priority: BIS_CORE_TRANSFORMER_PRIORITY,
  async transform({ descriptor }) {
    const identifierField = Object.values(descriptor.fields).find(
      (field) =>
        field.kind === "property" &&
        field.propertyClassName === "BisCore.ExternalSourceAspect" &&
        field.propertyName === "Identifier",
    );
    if (identifierField) {
      identifierField.hidden = false;
    }
  },
};
