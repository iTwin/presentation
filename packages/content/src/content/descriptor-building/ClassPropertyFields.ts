/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getClass } from "@itwin/presentation-shared";
import { PropertyField } from "../model/Field.js";
import { createValueDescriptorFromProperty } from "../model/PropertyValueDescriptor.js";

import type { EC, ECSchemaProvider, RelationshipPath } from "@itwin/presentation-shared";
import type { CategoryDefinition } from "../model/Category.js";
import type { ClassPropertySpec } from "../model/PropertySpec.js";

/** Per-property metadata overrides, derived from a `ClassPropertySpec`. */
type PropertyOverrides = NonNullable<ClassPropertySpec["overrides"]>[string];

/**
 * Enumerates the properties of an EC class into `PropertyField` candidates.
 *
 * Shared by direct-property enumeration (zero-length `pathFromTarget`) and related-property
 * enumeration (a non-empty path to the class). The `spec` controls which properties are included
 * (`select`) and applies metadata overrides; direct enumeration passes `{ select: "all" }`. Pass
 * `excludeInherited` to enumerate only the properties declared directly on `className` (used by
 * direct-field enumeration to visit each declaring class exactly once).
 *
 * For each included property whose value type is supported:
 * - `propertyClassName` is the class that *declares* the property (may be a base class), so an
 *   inherited property is attributed to its declaring class;
 * - `label` resolves to the override label, else the property's label, else its name;
 * - `categoryId` resolves to the override category, else the EC schema property category (if the
 *   property has one assigned), which is emitted top-level — callers that enumerate related
 *   properties re-parent it under the path's class-based category;
 * - `readOnly`/`hidden` come from the merged overrides when present;
 * - `id`/`selectorId` are derived from `(propertyClassName, propertyName, pathFromTarget)`.
 *
 * Properties with unsupported value types (e.g. `Binary`/`IGeometry`) are skipped. The returned
 * fields are candidates whose identity is finalized (and same-property variants merged) by
 * `mergePropertyFieldsByIdentity`; the returned `categories` are the EC schema property categories
 * the fields reference and must be registered with the descriptor's category registry.
 *
 * @internal
 */
export async function collectClassPropertyFields(props: {
  imodelAccess: ECSchemaProvider;
  /** The class whose properties are enumerated. */
  className: EC.FullClassName;
  /** Relationship path from the content target to `className` (`[]` for direct properties). */
  pathFromTarget: RelationshipPath;
  /** Concrete value-supplier classes for the produced fields. */
  valueClassNames: EC.FullClassName[];
  /** Property selection + overrides. Pass `{ select: "all" }` to include every property unchanged. */
  spec: ClassPropertySpec;
  /** When `true`, enumerate only properties declared directly on `className` (exclude inherited ones). */
  excludeInherited?: boolean;
}): Promise<{ fields: PropertyField[]; categories: CategoryDefinition[] }> {
  const { imodelAccess, className, pathFromTarget, valueClassNames, spec, excludeInherited } = props;
  const ecClass = await getClass(imodelAccess, className);
  const fields: PropertyField[] = [];
  const categories = new Map<CategoryDefinition["id"], CategoryDefinition>();
  const properties = excludeInherited ? await ecClass.getOwnProperties() : await ecClass.getProperties();
  for (const property of properties) {
    if (!isSelected(property.name, spec.select)) {
      continue;
    }
    const type = await createValueDescriptorFromProperty(property);
    if (type === undefined) {
      continue;
    }
    const overrides: PropertyOverrides = { ...spec.defaultOverrides, ...spec.overrides?.[property.name] };
    const propertyClassName = property.class.fullName;
    const id = PropertyField.computeId({ propertyClassName, propertyName: property.name, pathFromTarget });
    const field: PropertyField = {
      kind: "property",
      id,
      selectorId: id,
      label: overrides.label ?? property.label ?? property.name,
      type,
      propertyClassName,
      propertyName: property.name,
      pathFromTarget,
      valueClassNames,
    };
    // Category precedence: explicit override wins; otherwise fall back to the EC schema property
    // category (registered so it lands in the descriptor's category registry).
    let categoryId = overrides.categoryId;
    if (categoryId === undefined) {
      const schemaCategory = await property.category;
      if (schemaCategory) {
        const definition = createSchemaCategory(schemaCategory);
        categories.set(definition.id, definition);
        categoryId = definition.id;
      }
    }
    if (categoryId !== undefined) {
      field.categoryId = categoryId;
    }
    if (overrides.readOnly !== undefined) {
      field.readOnly = overrides.readOnly;
    }
    if (overrides.hidden !== undefined) {
      field.hidden = overrides.hidden;
    }
    fields.push(field);
  }
  return { fields, categories: [...categories.values()] };
}

/**
 * Builds a top-level `CategoryDefinition` for an EC schema property category. Nesting a related
 * property's schema category under its path's class-based category is the related pipeline's concern,
 * so this enumeration stays path-agnostic.
 */
function createSchemaCategory(schemaCategory: EC.PropertyCategory): CategoryDefinition {
  return { id: schemaCategory.fullName, label: schemaCategory.label ?? schemaCategory.name };
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
