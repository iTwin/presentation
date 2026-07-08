/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Local copies of presentation rule specification types.
 * These mirror shapes from `@itwin/presentation-common` but are self-contained —
 * only fields that are actually mapped by this factory are defined.
 *
 * Fields intentionally excluded from all types:
 *
 * - `autoExpand`: UI concern — whether a field is expanded by default should be decided
 *   at the view-model layer, not in the data model.
 *
 * - `renderer`, `editor`: UI concerns — consumers should assign renderer and editor
 *   attributes on their view-model when converting the returned data model.
 *
 * - `skipIfDuplicate`: This factory always skips duplicate fields internally.
 *
 * - `handleTargetClassPolymorphically`: This factory always resolves target classes
 *   polymorphically; there is no non-polymorphic mode.
 */

/**
 * Specifies a schema that an iModel must contain (optionally within a version range) for a
 * `ContentModifierRule` to apply.
 */
export interface RequiredSchemaSpecification {
  /** Specifies the schema to whom the requirement is being set. */
  name: string;

  /**
   * Minimum required schema version (inclusive).
   * Format: `{read version}.{write version}.{minor version}`, e.g. `2.1.15`.
   */
  minVersion?: string;

  /**
   * Maximum allowed schema version (exclusive).
   * Format: `{read version}.{write version}.{minor version}`, e.g. `2.1.15`.
   */
  maxVersion?: string;
}

/**
 * Identifies a single ECClass by its schema and class name.
 */
export interface SingleSchemaClassSpecification {
  /** Specifies name of the schema which contains the target class. */
  schemaName: string;

  /** Specifies name of the target class. */
  className: string;
}

/**
 * Identifies one or more ECClasses within a single schema.
 */
export interface MultiSchemaClassesSpecification {
  /** Specifies the schema which contains the target classes. */
  schemaName: string;

  /** An array of target ECClass names. */
  classNames: string[];

  /** Defines whether the derived ECClasses should be included in the result. */
  arePolymorphic?: boolean;
}

/**
 * Describes a single relationship traversal step in a related-properties path.
 */
export interface RelationshipStepSpecification {
  /** This attribute specifies the ECRelationship that should be used to traverse to target class. */
  relationship: SingleSchemaClassSpecification;

  /** This attribute specifies the direction in which the [[relationship]] should be followed. */
  direction: "Forward" | "Backward";

  /** This attribute may be used to specialize the target of the relationship. */
  targetClass?: SingleSchemaClassSpecification;
}

/**
 * A single relationship step or an ordered list of steps describing a path to related properties.
 */
export type RelationshipPathSpecification = RelationshipStepSpecification | RelationshipStepSpecification[];

/**
 * Identifies the category a property or field should be assigned to.
 */
export type CategoryIdentifier =
  | string
  | { type: "Id"; categoryId: string }
  | { type: "None" }
  | { type: "DefaultParent" | "Root" };

/**
 * Describes how a single property of a related class should be displayed.
 */
export interface PropertySpecification {
  name: string;
  /** This is an attribute that allows overriding the property label. May be [localized]($docs/presentation/advanced/Localization.md). */
  labelOverride?: string;
  /** The attribute allows moving the property into a different category. */
  categoryId?: CategoryIdentifier;
  /** When `false`, the property is hidden. String ECExpression values are not mapped. */
  isDisplayed?: boolean | string;
  /**
   * This attribute controls whether making the property visible using [[isDisplayed]] attribute should automatically hide
   * all other properties of the same class. When `true`, this behavior is disabled.
   */
  doNotHideOtherPropertiesOnDisplayOverride?: boolean;
  /**
   * This attribute controls whether the property field is read-only. If the attribute value is not set, the field is
   * read-only when at least one of the properties is read-only.
   */
  isReadOnly?: boolean;
}

/**
 * Members shared by both the current and the deprecated forms of `RelatedPropertiesSpecification`.
 */
interface RelatedPropertiesSpecificationBase {
  /**
   * ECExpression filter applied to the last step's target instances.
   * @see convertECExpressionToECSql
   */
  instanceFilter?: string;
  relationshipMeaning?: "SameInstance" | "RelatedInstance";
  nestedRelatedProperties?: RelatedPropertiesSpecification[];
  properties?: Array<string | PropertySpecification> | "_none_" | "*";
  relationshipProperties?: Array<string | PropertySpecification> | "_none_" | "*";
  forceCreateRelationshipCategory?: boolean;
  /**
   * Deprecated alternative to `properties`. May be:
   * - `"_none_"` to include no properties
   * - `"*"` to include all properties
   * - An array of property names to include
   * - A comma-separated list of property names to include
   */
  propertyNames?: string[] | string;
}

/**
 * Current form: the path to the related instances is described by `propertiesSource`. The deprecated
 * relationship attributes are not allowed in this form.
 */
interface CurrentRelatedPropertiesPathSpecifier {
  /** Relationship path to the related instances whose properties should be included. */
  propertiesSource: RelationshipPathSpecification;

  requiredDirection?: never;
  relationships?: never;
  relationshipClassNames?: never;
  relatedClasses?: never;
  relatedClassNames?: never;
}

/**
 * Deprecated: specifies the relationship(s) to follow. `relationships` and `relationshipClassNames`
 * are mutually exclusive.
 */
type DeprecatedRelationshipsSpecifier =
  | {
      relationships: MultiSchemaClassesSpecification | MultiSchemaClassesSpecification[];
      relationshipClassNames?: never;
    }
  | {
      relationships?: never;
      /** Format: `{schemaName1}:{className1},{className2};{schemaName2}:{className3},...`. */
      relationshipClassNames: string;
    };

/** Deprecated form with neither relationship specifier set. */
interface NoDeprecatedRelationships {
  relationships?: never;
  relationshipClassNames?: never;
}

/**
 * Deprecated: specifies the target class(es) of the relationship. `relatedClasses` and
 * `relatedClassNames` are mutually exclusive.
 */
type DeprecatedRelatedClassesSpecifier =
  | { relatedClasses: MultiSchemaClassesSpecification | MultiSchemaClassesSpecification[]; relatedClassNames?: never }
  | {
      relatedClasses?: never;
      /** Format: `{schemaName1}:{className1},{className2};{schemaName2}:{className3},...`. */
      relatedClassNames: string;
    };

/** Deprecated form with neither related-class specifier set. */
interface NoDeprecatedRelatedClasses {
  relatedClasses?: never;
  relatedClassNames?: never;
}

/**
 * Deprecated form: the path to the related instances is described by the legacy `relationships` /
 * `relationshipClassNames` + `relatedClasses` / `relatedClassNames` + `requiredDirection` attributes
 * instead of `propertiesSource`. At least one of the relationship or related-class specifiers must be set.
 */
type DeprecatedRelatedPropertiesPathSpecifier = {
  propertiesSource?: never;
  /** Deprecated. Defaults to `"Both"`, which expands into separate `"Forward"` and `"Backward"` traversals. */
  requiredDirection?: "Forward" | "Backward" | "Both";
} & (
  | (DeprecatedRelationshipsSpecifier & (DeprecatedRelatedClassesSpecifier | NoDeprecatedRelatedClasses))
  | (NoDeprecatedRelationships & DeprecatedRelatedClassesSpecifier)
);

/**
 * Specifies properties of related instances that should be included as fields, along with the
 * relationship path used to reach them.
 *
 * The path may be described either by the current `propertiesSource` attribute or by the deprecated
 * `relationships` / `relationshipClassNames` + `relatedClasses` / `relatedClassNames` +
 * `requiredDirection` attributes. The two forms are mutually exclusive.
 */
export type RelatedPropertiesSpecification = RelatedPropertiesSpecificationBase &
  (CurrentRelatedPropertiesPathSpecifier | DeprecatedRelatedPropertiesPathSpecifier);

/**
 * Specifies a field whose value is computed from an ECExpression rather than read from a property.
 */
export interface CalculatedPropertiesSpecification {
  label: string;
  /**
   * ECExpression that computes the field value.
   * Only primitive property access expressions are supported, e.g. `this.PropertyName + this.OtherPropertyName`.
   */
  value: string;
  categoryId?: CategoryIdentifier;
  /**
   * Type hint. Defaults to `"string"` when omitted.
   */
  type?: "int" | "long" | "double" | "bool" | "string";
}

/**
 * Defines a category that fields can be assigned to.
 */
export interface PropertyCategorySpecification {
  id: string;

  /** Display label of the category. */
  label: string;

  /**
   * Extensive description of the category. The description is assigned to the category object that's set
   * on content fields and it's up to UI component to decide how the description is displayed.
   */
  description?: string;

  parentId?: CategoryIdentifier;
}

/**
 * A `ContentModifier`-like rule for declaring field contributions.
 */
export interface ContentModifierRule {
  priority?: number;
  requiredSchemas?: RequiredSchemaSpecification[];
  /** When omitted the provider applies to all target classes. */
  class?: SingleSchemaClassSpecification;
  applyOnNestedContent?: boolean;
  relatedProperties?: RelatedPropertiesSpecification[];
  calculatedProperties?: CalculatedPropertiesSpecification[];
  propertyCategories?: PropertyCategorySpecification[];
  propertyOverrides?: PropertySpecification[];
}
