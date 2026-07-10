/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { normalizeFullClassName } from "@itwin/presentation-shared";
import { createClassPropertyFields } from "./ClassPropertyFields.js";

import type { ECSchemaProvider } from "@itwin/presentation-shared";
import type { ContentSource } from "../ContentTarget.js";
import type { PropertyField } from "../model/Field.js";

/**
 * Enumerates the **direct** property fields of a content source — the properties of the source's
 * primary class, reached with no relationship path (`pathFromTarget: []`).
 *
 * Delegates to `createClassPropertyFields`, passing the source's resolved primary classes as the
 * fields' value classes (falling back to the normalized `primaryClass` when none were resolved).
 * Direct fields are schema-derived, so the enumerated fields carry no contributing provider.
 *
 * @internal
 */
export async function createDirectPropertyFields(props: {
  imodelAccess: ECSchemaProvider;
  source: ContentSource;
}): Promise<Array<{ field: PropertyField }>> {
  const { imodelAccess, source } = props;
  const valueClassNames =
    source.resolvedPrimaryClasses.length > 0
      ? source.resolvedPrimaryClasses
      : [normalizeFullClassName(source.target.primaryClass)];
  const fields = await createClassPropertyFields({
    imodelAccess,
    className: source.target.primaryClass,
    pathFromTarget: [],
    valueClassNames,
    spec: { select: "all" },
  });
  return fields.map((field) => ({ field }));
}
