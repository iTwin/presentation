/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ExternalFieldsProvider } from "../extensions/ExternalFieldsProvider.js";
import type { ExternalField, Field } from "../model/Field.js";

/**
 * Collects the `ExternalField`s declared by the configured external fields providers.
 *
 * Each declared field's global id is `${providerId}:${localId}`. External fields have no value
 * selector because providers populate them outside SQL.
 */
export function collectExternalFields(
  externalFieldsProviders: ExternalFieldsProvider[],
): Record<Field["id"], ExternalField> {
  const fields: Record<Field["id"], ExternalField> = {};
  for (const provider of externalFieldsProviders) {
    for (const declaration of provider.fields) {
      const id = `${provider.id}:${declaration.id}`;
      const field: ExternalField = {
        kind: "external",
        id,
        label: declaration.label,
        type: declaration.type,
        providerId: provider.id,
      };
      if (declaration.categoryId !== undefined) {
        field.categoryId = declaration.categoryId;
      }
      fields[id] = field;
    }
  }
  return fields;
}
