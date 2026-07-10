/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass } from "@itwin/presentation-shared";
import { PropertyField } from "../model/Field.js";
import { createValueDescriptorFromProperty } from "../model/PropertyValueDescriptor.js";

import type { EC, ECSchemaProvider, RelationshipPath } from "@itwin/presentation-shared";
import type { ClassPropertySpec } from "../model/PropertySpec.js";

/** Per-property metadata overrides, derived from a `ClassPropertySpec`. */
type PropertyOverrides = NonNullable<ClassPropertySpec["overrides"]>[string];

/**
 * Enumerates the properties of an EC class into `PropertyField` candidates.
 *
 * Shared by direct-property enumeration (zero-length `pathFromTarget`) and related-property
 * enumeration (a non-empty path to the class). The `spec` controls which properties are included
 * (`select`) and applies metadata overrides; direct enumeration passes `{ select: "all" }`.
 *
 * For each included property whose value type is supported:
 * - `sourceClassName` is the class that *declares* the property (may be a base class), so an
 *   inherited property is attributed to its declaring class;
 * - `label` resolves to the override label, else the property's label, else its name;
 * - `categoryId`/`readOnly`/`hidden` come from the merged overrides when present;
 * - `id`/`selectorId` are derived from `(sourceClassName, propertyName, pathFromTarget)`.
 *
 * Properties with unsupported value types (e.g. `Binary`/`IGeometry`) are skipped. The returned
 * fields are candidates whose identity is finalized (and same-property variants merged) by
 * `mergePropertyFieldsByIdentity`.
 *
 * @internal
 */
export async function createClassPropertyFields(props: {
  imodelAccess: ECSchemaProvider;
  /** The class whose properties are enumerated. */
  className: EC.FullClassName;
  /** Relationship path from the content target to `className` (`[]` for direct properties). */
  pathFromTarget: RelationshipPath;
  /** Concrete value-supplier classes for the produced fields. */
  valueClassNames: EC.FullClassName[];
  /** Property selection + overrides. Pass `{ select: "all" }` to include every property unchanged. */
  spec: ClassPropertySpec;
}): Promise<PropertyField[]> {
  const { imodelAccess, className, pathFromTarget, valueClassNames, spec } = props;
  const ecClass = await getClass(imodelAccess, className);
  const fields: PropertyField[] = [];
  for (const property of await ecClass.getProperties()) {
    if (!isSelected(property.name, spec.select)) {
      continue;
    }
    const type = await createValueDescriptorFromProperty(property);
    if (type === undefined) {
      continue;
    }
    const overrides: PropertyOverrides = { ...spec.defaultOverrides, ...spec.overrides?.[property.name] };
    const sourceClassName = property.class.fullName;
    const id = PropertyField.computeId({
      propertyClassName: sourceClassName,
      propertyName: property.name,
      pathFromTarget,
    });
    const field: PropertyField = {
      kind: "property",
      id,
      selectorId: id,
      label: overrides.label ?? property.label ?? property.name,
      type,
      sourceClassName,
      propertyName: property.name,
      pathFromTarget,
      valueClassNames,
    };
    if (overrides.categoryId !== undefined) {
      field.categoryId = overrides.categoryId;
    }
    if (overrides.readOnly !== undefined) {
      field.readOnly = overrides.readOnly;
    }
    if (overrides.hidden !== undefined) {
      field.hidden = overrides.hidden;
    }
    fields.push(field);
  }
  return fields;
}

/** Determines whether a property is selected by a `ClassPropertySpec.select` value. */
function isSelected(propertyName: string, select: ClassPropertySpec["select"]): boolean {
  if (select === "all") {
    return true;
  }
  if (select === "none") {
    return false;
  }
  if ("include" in select) {
    return select.include.includes(propertyName);
  }
  return !select.exclude.includes(propertyName);
}
