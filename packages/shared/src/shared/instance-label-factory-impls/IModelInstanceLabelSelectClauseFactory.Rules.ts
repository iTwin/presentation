/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/**
 * This module contains hard copies of the code from `@itwin/presentation-common` package.
 */

/**
 * This specification is designed for specifying schema requirements for the [[Ruleset]] or specific
 * presentation rules.
 *
 * @see [Required schema specification reference documentation page]($docs/presentation/RequiredSchemaSpecification.md)
 */
export interface RequiredSchemaSpecification {
  /** Specifies the schema to whom the requirement is being set. */
  name: string;

  /**
   * Minimum required schema version (inclusive).
   * Format: `{read version}.{write version}.{minor version}`, e.g. `2.1.15`.
   *
   * @pattern ^[\d]+\.[\d]+\.[\d]+$
   */
  minVersion?: string;

  /**
   * Maximum allowed schema version (exclusive).
   * Format: `{read version}.{write version}.{minor version}`, e.g. `2.1.15`.
   *
   * @pattern ^[\d]+\.[\d]+\.[\d]+$
   */
  maxVersion?: string;
}

/**
 * Base interface for all [[Rule]] implementations.
 */
export interface RuleBase {
  /** Used for serializing to JSON. */
  ruleType: string;

  /**
   * Defines the order in which rules are handled, higher number means the rule is handled first. If priorities are
   * equal, the rules are handled in the order they're defined.
   *
   * @type integer
   */
  priority?: number;

  /**
   * Tells the library that the rule should only be handled if no other rule of the same type was handled previously (based on rule
   * priorities and definition order). This allows adding fallback rules which can be overriden by higher-priority rules.
   */
  onlyIfNotHandled?: boolean;

  /**
   * A list of [ECSchema requirements]($docs/presentation/RequiredSchemaSpecification.md) that need to be met for the rule to be used.
   */
  requiredSchemas?: RequiredSchemaSpecification[];
}

/**
 * Instance label override rule provides a way to set instance label to one of its property values,
 * other attributes and/or combination of them.
 *
 * @see [Instance label override reference documentation page]($docs/presentation/customization/InstanceLabelOverride.md)
 */
export interface InstanceLabelOverride extends RuleBase {
  /** Used for serializing to JSON. */
  ruleType: "InstanceLabelOverride";

  /**
   * Specifies the ECClass to apply this rule to.
   */
  class: SingleSchemaClassSpecification;

  /**
   * Specifications of values used to override label. The first non-empty value is used as the actual label.
   */
  values: InstanceLabelOverrideValueSpecification[];
}

/**
 * Types of possible [[InstanceLabelOverride]] label values.
 */
type InstanceLabelOverrideValueSpecificationType =
  | "Composite"
  | "Property"
  | "ClassName"
  | "ClassLabel"
  | "BriefcaseId"
  | "LocalId"
  | "String"
  | "RelatedInstanceLabel";

/**
 * Base interface for all [[InstanceLabelOverrideValueSpecification]] implementations.
 */
export interface InstanceLabelOverrideValueSpecificationBase {
  /**
   * Type of the specification
   * @see InstanceLabelOverrideValueSpecificationType
   */
  specType: `${InstanceLabelOverrideValueSpecificationType}`;
}

/**
 * Specification allows creating a label value composited using multiple other specifications.
 *
 * @see [Composite value specification reference documentation page]($docs/presentation/customization/InstanceLabelOverride.md#composite-value-specification)
 */
export interface InstanceLabelOverrideCompositeValueSpecification extends InstanceLabelOverrideValueSpecificationBase {
  specType: "Composite";

  /**
   * Parts of the value.
   *
   * If any of the parts with `isRequired` flag evaluate to an empty string, the
   * result of this specification is also an empty string.
   */
  parts: Array<{ spec: InstanceLabelOverrideValueSpecification; isRequired?: boolean }>;

  /** Separator to use when joining the parts. Defaults to a space character. */
  separator?: string;
}

/**
 * Specification uses property value as the label content.
 *
 * @see [Property value specification reference documentation page]($docs/presentation/customization/InstanceLabelOverride.md#property-value-specification)
 */
export interface InstanceLabelOverridePropertyValueSpecification extends InstanceLabelOverrideValueSpecificationBase {
  specType: "Property";

  /**
   * Name of the property whose value should be used.
   * @note A property with this name must exist on the property class (see [[propertySource]]).
   */
  propertyName: string;

  /**
   * [Specification of the relationship path]($docs/presentation/RelationshipPathSpecification.md) from [[InstanceLabelOverride.class]]
   * to class of the property. If omitted, [[InstanceLabelOverride.class]] is used as property class.
   */
  propertySource?: RelationshipPathSpecification;
}

/**
 * Specification uses ECClass name as the label content.
 *
 * @see [Class name value specification reference documentation page]($docs/presentation/customization/InstanceLabelOverride.md#class-name-value-specification)
 */
export interface InstanceLabelOverrideClassNameSpecification extends InstanceLabelOverrideValueSpecificationBase {
  specType: "ClassName";

  /** Should full (`{schemaName}.{className}`) class name be used */
  full?: boolean;
}

/**
 * Specification uses ECClass display label as the label content.
 *
 * @see [Class label value specification reference documentation page]($docs/presentation/customization/InstanceLabelOverride.md#class-label-value-specification)
 */
export interface InstanceLabelOverrideClassLabelSpecification extends InstanceLabelOverrideValueSpecificationBase {
  specType: "ClassLabel";
}

/**
 * Specification returns ECInstance's briefcase ID in base36 format.
 *
 * @see [BriefcaseId value specification reference documentation page]($docs/presentation/customization/InstanceLabelOverride.md#briefcaseid-value-specification)
 */
export interface InstanceLabelOverrideBriefcaseIdSpecification extends InstanceLabelOverrideValueSpecificationBase {
  specType: "BriefcaseId";
}

/**
 * Specification returns ECInstance's local ID in base36 format.
 *
 * @see [LocalId value specification reference documentation page]($docs/presentation/customization/InstanceLabelOverride.md#localid-value-specification)
 */
export interface InstanceLabelOverrideLocalIdSpecification extends InstanceLabelOverrideValueSpecificationBase {
  specType: "LocalId";
}

/**
 * Specification uses the specified value as the label content.
 *
 * @see [String value specification reference documentation page]($docs/presentation/customization/InstanceLabelOverride.md#string-value-specification)
 */
export interface InstanceLabelOverrideStringValueSpecification extends InstanceLabelOverrideValueSpecificationBase {
  specType: "String";

  /** The value to use as the label content. */
  value: string;
}

/**
 * Specification uses label of another related instance as the label content.
 *
 * @see [Related instance label value specification reference documentation page]($docs/presentation/customization/InstanceLabelOverride.md#related-instance-label-value-specification)
 */
export interface InstanceLabelOverrideRelatedInstanceLabelSpecification extends InstanceLabelOverrideValueSpecificationBase {
  specType: "RelatedInstanceLabel";

  /**
   * [Specification of the relationship path]($docs/presentation/RelationshipPathSpecification.md) from `InstanceLabelOverride.class`
   * to class of the related instance.
   */
  pathToRelatedInstance: RelationshipPathSpecification;
}

/**
 * Specification to define how the label for [[InstanceLabelOverride]] should be created.
 */
export type InstanceLabelOverrideValueSpecification =
  | InstanceLabelOverrideCompositeValueSpecification
  | InstanceLabelOverridePropertyValueSpecification
  | InstanceLabelOverrideStringValueSpecification
  | InstanceLabelOverrideClassNameSpecification
  | InstanceLabelOverrideClassLabelSpecification
  | InstanceLabelOverrideBriefcaseIdSpecification
  | InstanceLabelOverrideLocalIdSpecification
  | InstanceLabelOverrideRelatedInstanceLabelSpecification;

/**
 * Defines direction of a relationship that should be followed
 */
type RelationshipDirection = "Forward" | "Backward";

/**
 * Specification of a single step in [[RelationshipPathSpecification]].
 *
 * @see [Relationship path specification reference documentation page]($docs/presentation/RelationshipPathSpecification.md)
 */
export interface RelationshipStepSpecification {
  /** This attribute specifies the ECRelationship that should be used to traverse to target class. */
  relationship: SingleSchemaClassSpecification;

  /**
   * This attribute specifies the direction in which the [[relationship]] should be followed.
   * @see RelationshipDirection
   */
  direction: `${RelationshipDirection}`;

  /**
   * This attribute may be used to specialize the target of the relationship.
   */
  targetClass?: SingleSchemaClassSpecification;
}

/**
 * Relationship path specification is used to define a relationship path to an ECClass.
 *
 * @see [Relationship path specification reference documentation page]($docs/presentation/RelationshipPathSpecification.md)
 */
export type RelationshipPathSpecification = RelationshipStepSpecification | RelationshipStepSpecification[];

/**
 * This specification is used to point to specific ECClass.
 *
 * @see [Single schema class specification reference documentation page]($docs/presentation/SingleSchemaClassSpecification.md)
 */
export interface SingleSchemaClassSpecification {
  /**
   * Specifies name of the schema which contains the target class.
   *
   * @pattern ^[\w\d]+$
   */
  schemaName: string;

  /**
   * Specifies name of the target class.
   *
   * @pattern ^[\w\d]+$
   */
  className: string;
}
