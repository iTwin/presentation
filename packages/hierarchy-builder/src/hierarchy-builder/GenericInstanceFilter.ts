/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { RelationshipPath } from "./Metadata";
import { InstanceKey, PrimitiveValue } from "./values/Values";

/**
 * A data structure that has all the necessary information to build an instance filter for a query.
 * @beta
 */
export interface GenericInstanceFilter {
  /**
   * Full name of ECClass whose properties are used in condition rules.
   */
  propertyClassName: string;

  /**
   * Full names of ECClasses whose instances should be returned. IF specified, the classes should always be
   * equal or more specific to `propertyClassName`.
   */
  filterClassNames?: string[];

  /**
   * Information about related instances that has access to the properties used in filter.
   * These can be used to create a `JOIN` clause when building `ECSQL` query.
   */
  relatedInstances: RelatedInstanceDescription[];

  /** Single filter rule or multiple rules joined by logical operator. */
  rules: GenericInstanceFilterRule | GenericInstanceFilterRuleGroup;
}

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace GenericInstanceFilter {
  /**
   * Function that checks if supplied object is [[GenericInstanceFilterRuleGroup]].
   * @beta
   */
  export function isFilterRuleGroup(obj: GenericInstanceFilterRule | GenericInstanceFilterRuleGroup): obj is GenericInstanceFilterRuleGroup {
    return (obj as GenericInstanceFilterRuleGroup).rules !== undefined;
  }
}

/**
 * Defines possible values used in [[GenericInstanceFilter]].
 * @beta
 */
export type PropertyFilterValue = PrimitiveValue | InstanceKey;
/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace PropertyFilterValue {
  /**
   * Function that checks if supplied value is an [[InstanceKey]].
   * @beta
   */
  export function isInstanceKey(value: PropertyFilterValue): value is InstanceKey {
    return typeof value === "object" && !!(value as InstanceKey).className && !!(value as InstanceKey).id;
  }
  /**
   * Function that checks if supplied value is a [[PrimitiveValue]].
   * @beta
   */
  export function isPrimitive(value: PropertyFilterValue): value is PrimitiveValue {
    return !isInstanceKey(value);
  }
}

/**
 * Operators for defining unary [[GenericInstanceFilterRule]] conditions.
 * @beta
 */
export type PropertyFilterRuleUnaryOperator = "True" | "False" | "Null" | "NotNull";
/**
 * Operators for defining binary [[GenericInstanceFilterRule]] conditions.
 * @beta
 */
export type PropertyFilterRuleBinaryOperator = "Equal" | "NotEqual" | "Greater" | "GreaterOrEqual" | "Less" | "LessOrEqual" | "Like";
/**
 * Operators for defining [[GenericInstanceFilterRule]] conditions.
 * @beta
 */
export type PropertyFilterRuleOperator = PropertyFilterRuleUnaryOperator | PropertyFilterRuleBinaryOperator;
/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace PropertyFilterRuleOperator {
  export function isUnary(op: PropertyFilterRuleOperator): op is PropertyFilterRuleUnaryOperator {
    switch (op) {
      case "True":
      case "False":
      case "Null":
      case "NotNull":
        return true;
    }
    return false;
  }
  export function isBinary(op: PropertyFilterRuleOperator): op is PropertyFilterRuleBinaryOperator {
    switch (op) {
      case "Equal":
      case "NotEqual":
      case "Greater":
      case "GreaterOrEqual":
      case "Less":
      case "LessOrEqual":
      case "Like":
        return true;
    }
    return false;
  }
}

/**
 * Operators for joining multiple [[GenericInstanceFilterRuleGroup]].
 * @beta
 */
export type PropertyFilterRuleGroupOperator = "And" | "Or";

/**
 * Defines single filter rule.
 * @beta
 */
export interface GenericInstanceFilterRule {
  /**
   * Alias of the source to access this property. This should match [[RelatedInstanceDescription.alias]] for
   * related properties and be `undefined` for properties that belong directly to the class referred
   * by [[GenericInstanceFilter.propertyClassName]].
   */
  sourceAlias?: string;
  /**
   * Property name for accessing property value.
   */
  propertyName: string;
  /**
   * Comparison operator that should be used to compare property value.
   */
  operator: PropertyFilterRuleOperator;
  /**
   * Value to which property values is compared to. For unary operators the value is `undefined`.
   */
  value?: PropertyFilterValue;
}

/**
 * Group of filter rules joined by logical operator.
 * @beta
 */
export interface GenericInstanceFilterRuleGroup {
  /**
   * Operator that should be used to join rules.
   */
  operator: PropertyFilterRuleGroupOperator;
  /**
   * List of rules or rule groups that should be joined by `operator`.
   */
  rules: Array<GenericInstanceFilterRule | GenericInstanceFilterRuleGroup>;
}

/**
 * Describes related instance whose property was used in the filter.
 * @beta
 */
export interface RelatedInstanceDescription {
  /**
   * Describes path that should be used to reach related instance from the content classes
   * referenced by [[GenericInstanceFilter.contentClassName]].
   */
  path: RelationshipPath;
  /**
   * Related instance alias. This alias matches [[GenericInstanceFilterRule.sourceAlias]] in all filter
   * rules where properties of this related instance is used.
   */
  alias: string;
}
