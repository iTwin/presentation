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
 * The raw category facts of an enumerated property field. Field enumeration only reports these
 * facts; the single categorization pass (`collectCategories`) turns them into concrete category ids,
 * creates the category tree, and assigns each field's `categoryId`.
 */
export interface FieldCategorization {
  /**
   * Which class the field's value comes from, for class-based category anchoring:
   * - `"none"` — a direct field (no class-based category; a schema category, if any, is top-level);
   * - `"targetClass"` — a related field from its step's target class;
   * - `"relationshipClass"` — a related field from its step's relationship class.
   */
  anchor: "none" | "targetClass" | "relationshipClass";
  /**
   * The property's category source, if any — the two sources are mutually exclusive (an explicit
   * spec override takes precedence over the EC schema property category):
   * - `{ source: "override" }` — the category id set by the property's spec override;
   * - `{ source: "schema" }` — the EC schema property category assigned to the property (unscoped).
   */
  category?:
    | { source: "override"; id: CategoryDefinition["id"] }
    | { source: "schema"; id: CategoryDefinition["id"]; label: string };
}

/** A property field paired with the category facts the categorization pass needs. */
export interface CategorizedField {
  field: PropertyField;
  categorization: FieldCategorization;
}

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
 * - `readOnly`/`hidden` come from the merged overrides when present;
 * - `id`/`selectorId` are derived from `(propertyClassName, propertyName, pathFromTarget)`.
 *
 * Each field is paired with its {@link FieldCategorization} — the raw category facts (its EC schema
 * property category and/or spec override, plus the given `anchor`) — but no `categoryId` is assigned
 * and no category is created here: that is the categorization pass's job.
 *
 * Properties with unsupported value types (e.g. `Binary`/`IGeometry`) are skipped. The returned
 * fields are candidates whose identity is finalized (and same-property variants merged) by
 * `mergePropertyFieldsByIdentity`.
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
  /** How the produced fields anchor for categorization (see {@link FieldCategorization.anchor}). */
  anchor: FieldCategorization["anchor"];
  /** When `true`, enumerate only properties declared directly on `className` (exclude inherited ones). */
  excludeInherited?: boolean;
}): Promise<CategorizedField[]> {
  const { imodelAccess, className, pathFromTarget, valueClassNames, spec, anchor, excludeInherited } = props;
  const ecClass = await getClass(imodelAccess, className);
  const result: CategorizedField[] = [];
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
    if (overrides.readOnly !== undefined) {
      field.readOnly = overrides.readOnly;
    }
    if (overrides.hidden !== undefined) {
      field.hidden = overrides.hidden;
    }
    // Report the raw category facts: an explicit spec override, else the EC schema property category.
    const categorization: FieldCategorization = { anchor };
    if (overrides.categoryId !== undefined) {
      categorization.category = { source: "override", id: overrides.categoryId };
    } else {
      const schemaCategory = await property.category;
      if (schemaCategory) {
        categorization.category = {
          source: "schema",
          id: schemaCategory.fullName,
          label: schemaCategory.label ?? schemaCategory.name,
        };
      }
    }
    result.push({ field, categorization });
  }
  return result;
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
