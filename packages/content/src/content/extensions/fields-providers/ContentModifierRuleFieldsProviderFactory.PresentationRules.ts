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
 *   // TODO: Verify that duplicates' skipping actually works.
 *
 * - `handleTargetClassPolymorphically`: This factory always resolves target classes
 *   polymorphically; there is no non-polymorphic mode.
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

export interface SingleSchemaClassSpecification {
  /** Specifies name of the schema which contains the target class. */
  schemaName: string;

  /** Specifies name of the target class. */
  className: string;
}

export interface MultiSchemaClassesSpecification {
  /** Specifies the schema which contains the target classes. */
  schemaName: string;

  /** An array of target ECClass names. */
  classNames: string[];

  /** Defines whether the derived ECClasses should be included in the result. */
  arePolymorphic?: boolean;
}

export interface RelationshipStepSpecification {
  /** This attribute specifies the ECRelationship that should be used to traverse to target class. */
  relationship: SingleSchemaClassSpecification;

  /** This attribute specifies the direction in which the [[relationship]] should be followed. */
  direction: "Forward" | "Backward";

  /** This attribute may be used to specialize the target of the relationship. */
  targetClass?: SingleSchemaClassSpecification;
}

export type RelationshipPathSpecification = RelationshipStepSpecification | RelationshipStepSpecification[];

export type CategoryIdentifier =
  | string
  | { type: "Id"; categoryId: string }
  | { type: "None" }
  | { type: "DefaultParent" | "Root" };

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

export interface RelatedPropertiesSpecification {
  propertiesSource: RelationshipPathSpecification;
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

  /** Deprecated, but needs to be handled. */
  requiredDirection?: "Forward" | "Backward" | "Both";
  /** Deprecated, but needs to be handled. */
  relatedClasses?: MultiSchemaClassesSpecification | MultiSchemaClassesSpecification[]; // TODO: may be a string?
  /** Deprecated, but needs to be handled. Format: `{schemaName1}:{className1},{className2};{schemaName2}:{className3},...`. */
  relatedClassNames?: string;
  /** Deprecated, but needs to be handled. */
  relationships?: MultiSchemaClassesSpecification | MultiSchemaClassesSpecification[]; // TODO: may be a string?
  /** Deprecated, but needs to be handled. Format: `{schemaName1}:{className1},{className2};{schemaName2}:{className3},...`. */
  relationshipClassNames?: string;
  /**
   * Deprecated, but needs to be handled. May be:
   * - `"_none_"` to include no properties
   * - `"*"` to include all properties
   * - An array of property names to include
   * - A comma-separated list of property names to include
   */
  propertyNames?: string[] | string;
}

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
 *
 * @public
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
