/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { EC, RelationshipPath } from "@itwin/presentation-shared";
import type { ExternalFieldsProvider, InputPropertyDeclaration } from "../extensions/ExternalFieldsProvider.js";
import type { ExternalField, Field } from "../model/Field.js";

/** Column coordinates of a property an external fields provider needs as input. */
export interface ExternalInput {
  propertyClassName: EC.FullClassName;
  propertyName: string;
  pathFromTarget?: RelationshipPath;
}

/**
 * Collects the `ExternalField`s declared by the configured external fields providers, along with the
 * input columns those providers require.
 *
 * Each declared field's global id is `${providerId}:${localId}`. External fields have no value
 * selector (they are populated out-of-band, not via SQL); the returned `inputs` are the property
 * columns that must nonetheless be selected so their values can feed the providers' `getValues`.
 *
 * @internal
 */
export function collectExternalFields(externalFieldsProviders: ExternalFieldsProvider[]): {
  fields: Record<Field["id"], ExternalField>;
  inputs: ExternalInput[];
} {
  const fields: Record<Field["id"], ExternalField> = {};
  const inputs: ExternalInput[] = [];
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
    if (provider.inputs) {
      const declarations: ReadonlyArray<InputPropertyDeclaration> = Object.values(provider.inputs);
      for (const input of declarations) {
        inputs.push({
          propertyClassName: input.propertyClassName,
          propertyName: input.propertyName,
          ...(input.path ? { pathFromTarget: input.path } : undefined),
        });
      }
    }
  }
  return { fields, inputs };
}
