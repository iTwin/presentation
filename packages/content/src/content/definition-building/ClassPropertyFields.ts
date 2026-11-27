/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PropertyField } from "../model/Field.js";
import { createValueDescriptorFromProperty } from "../model/PropertyValueDescriptor.js";

import type { EC } from "@itwin/presentation-shared";
import type {
  CardinalityHint,
  CategoryContext,
  NonEmptyRelationshipPath,
  RelationshipMeaning,
} from "../ContentTarget.js";
import type { CategoryDefinition } from "../model/Category.js";
import type { ClassPropertySpec } from "../model/PropertySpec.js";

/** Per-property metadata overrides, derived from a `ClassPropertySpec`. */
type PropertyOverrides = NonNullable<ClassPropertySpec["overrides"]>[string];

/**
 * The raw category facts of an enumerated property field. Field enumeration only reports these
 * facts; the single categorization pass (`collectCategories`) turns them into concrete category ids,
 * creates the category tree, and places each field in its category (`field.category`).
 */
export interface FieldCategorization {
  /**
   * The property's category source, if any — the two sources are mutually exclusive (an explicit
   * spec override takes precedence over the EC schema property category):
   * - `{ source: "override" }` — the category id set by the property's spec override;
   * - `{ source: "propertyCategory" }` — the EC property category assigned to the property (unscoped).
   */
  category?:
    | { source: "override"; id: CategoryDefinition["id"] }
    | { source: "propertyCategory"; id: EC.FullClassNameDotNotation; label: string };
  /** The `relationshipMeaning` in effect for the field's step; `"relatedInstance"` for direct fields. */
  relationshipMeaning: RelationshipMeaning;
  /**
   * Ordered enclosing class categories; an empty context places the field's category at the root. For a
   * property category of a `"sameInstance"` step, excludes the field's own step.
   */
  categoryContext: Readonly<CategoryContext>;
}

/** A property field paired with the category facts the categorization pass needs. */
export interface CategorizedField {
  field: PropertyField;
  categorization: FieldCategorization;
}

/** Props for {@link createPropertyFields}. */
type CreatePropertyFieldsProps = {
  /** The properties to convert, as read from the class in effect. */
  properties: EC.Property[];
  /** Concrete value-supplier classes for the produced fields. */
  valueClassNames: EC.FullClassNameDotNotation[];
  /** Property selection + overrides. Pass `{ select: "all" }` to include every property unchanged. */
  spec: ClassPropertySpec;
  /** See {@link FieldCategorization.relationshipMeaning}. */
  relationshipMeaning: RelationshipMeaning;
  /** See {@link FieldCategorization.categoryContext}. */
  categoryContext: CategoryContext;
} & (
  | {
      /** Direct properties have no class-based category; a property category, if any, is top-level. */
      anchor: "none";
      relationshipInfo?: undefined;
    }
  | {
      /**
       * Whether the related properties come from the step's target or relationship class. Sets the
       * fields' `related.propertyClassKind`, which also anchors their class-based category.
       */
      anchor: "targetClass" | "relationshipClass";
      /** Information on how to reach the related properties. */
      relationshipInfo: {
        /** Relationship path from the content target to the properties' class. */
        pathFromTarget: NonEmptyRelationshipPath;
        /**
         * Cardinality of `pathFromTarget` as the contributing declaration sees it. Declarations that
         * disagree about a shared path are reconciled by `mergePropertyFieldsByIdentity`.
         */
        pathCardinality: CardinalityHint;
        /**
         * Concrete primary classes that have access to the produced fields. Direct properties use
         * `valueClassNames` instead (the primary class is itself the value origin). Related-property
         * enumeration passes the concrete source classes of the path's first step.
         */
        primaryClassNames: EC.FullClassNameDotNotation[];
      };
    }
);

/**
 * Converts EC properties into `PropertyField` candidates.
 *
 * Shared by direct-property enumeration (no `related` attributes) and related-property
 * enumeration (a non-empty path to the class). The `spec` controls which properties are included
 * (`select`) and applies metadata overrides; direct enumeration passes `{ select: "all" }`.
 *
 * For each included property whose value type is supported:
 * - `propertyClassName` is the class that *declares* the property (may be a base class), so an
 *   inherited property is attributed to its declaring class;
 * - `label` resolves to the override label, else the property's label, else its name;
 * - `readOnly` comes from the merged overrides when present, else is `true` when the schema declares
 *   the property read-only; `hidden` comes from the merged overrides when present;
 * - `id` is derived from `(propertyClassName, propertyName, related.pathFromTarget)`.
 *
 * Each field is paired with its {@link FieldCategorization} — the raw category facts (its EC schema
 * property category and/or spec override, plus the given relationship meaning and context). Fields start in the content target's
 * category (`{ type: "target" }`) and no category is created here: placing fields in their categories is
 * the categorization pass's job.
 *
 * Properties with unsupported value types (e.g. `Binary`/`IGeometry`) are skipped. The returned
 * fields are candidates whose identity is finalized (and same-property variants merged) by
 * `mergePropertyFieldsByIdentity`.
 */
export function createPropertyFields(props: CreatePropertyFieldsProps): CategorizedField[] {
  const { properties, valueClassNames, spec, relationshipMeaning, categoryContext } = props;
  const related: PropertyField["related"] = props.relationshipInfo
    ? {
        pathFromTarget: props.relationshipInfo.pathFromTarget,
        pathCardinality: props.relationshipInfo.pathCardinality,
        propertyClassKind: props.anchor === "relationshipClass" ? "relationship" : "target",
      }
    : undefined;
  const primaryClassNames = props.relationshipInfo?.primaryClassNames ?? valueClassNames;
  const result: CategorizedField[] = [];
  for (const property of properties) {
    if (!isSelected(property.name, spec.select)) {
      continue;
    }
    const type = createValueDescriptorFromProperty(property);
    if (type === undefined) {
      continue;
    }
    const overrides: PropertyOverrides = { ...spec.defaultOverrides, ...spec.overrides?.[property.name] };
    const propertyClassName = property.class.fullName;
    const id = PropertyField.computeId({ propertyClassName, propertyName: property.name, related });
    const field: PropertyField = {
      kind: "property",
      id,
      label: overrides.label ?? property.label ?? property.name,
      type,
      propertyClassName,
      propertyName: property.name,
      ...(related ? { related } : {}),
      valueClassNames,
      primaryClassNames,
      // The categorization pass places the field in its category.
      category: { type: "target" },
    };
    if (overrides.readOnly !== undefined) {
      field.readOnly = overrides.readOnly;
    } else if (property.isReadOnly) {
      field.readOnly = true;
    }
    if (overrides.hidden !== undefined) {
      field.hidden = overrides.hidden;
    }
    // Report the raw category facts: an explicit spec override, else the EC schema property category.
    const categorization: FieldCategorization = { relationshipMeaning, categoryContext };
    if (overrides.categoryId !== undefined) {
      categorization.category = { source: "override", id: overrides.categoryId };
    } else {
      const propertyCategory = property.category;
      if (propertyCategory) {
        categorization.category = {
          source: "propertyCategory",
          id: propertyCategory.fullName,
          label: propertyCategory.label ?? propertyCategory.name,
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
