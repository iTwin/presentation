/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module InstancesFilter
 */

import { PrimitiveValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { PropertyFilterRuleGroupOperator, PropertyFilterRuleOperator } from "@itwin/components-react";
import { ClassInfo, NestedContentField, PropertiesField, RelationshipPath, StrippedRelationshipPath } from "@itwin/presentation-common";
import { deserializeDisplayValueGroupArray } from "../common/Utils";
import { PresentationInstanceFilter, PresentationInstanceFilterCondition, PresentationInstanceFilterConditionGroup } from "./Types";

/**
 * Contains metadata that is need to convert filter to other formats. E.g. `ECExpression` or `ECSQL` query.
 * @beta
 */
export interface FilterMetadata {
  /** Single filter rule or multiple rules joined by logical operator. */
  rules: FilterRule | FilterRuleGroup;
  /**
   * Information about related instances that has access to the properties used in filter.
   * These can be used to create `JOIN` clause when building `ECSQL` query. Each related property
   * used in rule will have `sourceAlias` that matches `RelatedInstanceDescription.alias`.
   * If more than one property of same related instance is used they will shared same alias.
   */
  relatedInstances: RelatedInstanceDescription[];
  /**
   * List of classes whose properties are used in rules. Might be used to find common base class when building
   * filter for instance of different classes.
   */
  propertyClasses: ClassInfo[];
}

/**
 * Defines single filter rule.
 * @beta
 */
export interface FilterRule {
  /**
   * Alias of the source to access this property. If it is direct property `sourceAlias` is set to `this`.
   * For related properties `sourceAlias` is created based on related instance class.
   */
  sourceAlias: string;
  /**
   * Property name for accessing property value.
   */
  propertyName: string;
  /**
   * Comparison operator that should be used to compare property value.
   */
  operator: PropertyFilterRuleOperator;
  /**
   * Value to which property values is compared to. For unary operators value is 'undefined'.
   */
  value?: PrimitiveValue;
  /**
   * Type name of the property.
   */
  propertyTypeName: string;
}

/**
 * Group of filter rules joined by logical operator.
 * @beta
 */
export interface FilterRuleGroup {
  /**
   * Operator that should be used to join rules.
   */
  operator: PropertyFilterRuleGroupOperator;
  /**
   * List of rules or rule groups that should be joined by `operator`.
   */
  rules: Array<FilterRule | FilterRuleGroup>;
}

/**
 * Describes related instance whose property was used in the filter.
 * @beta
 */
export interface RelatedInstanceDescription {
  /**
   * Describes path that should be used to reach related instance from the source.
   */
  path: StrippedRelationshipPath;
  /**
   * Related instance alias. This alias match `sourceAlias` in all filter rules where
   * properties of this related instance is used.
   */
  alias: string;
}

/**
 * Creates metadata that is needed to convert filter into other formats.
 * @beta
 */
export function createFilterMetadata(filter: PresentationInstanceFilter): FilterMetadata {
  const context: ConvertContext = { relatedInstances: [], propertyClasses: [] };

  const rules = createMetadataFromFilter(filter, context);
  return {
    rules,
    relatedInstances: context.relatedInstances.map((instance) => ({ path: RelationshipPath.strip(instance.path), alias: instance.alias })),
    propertyClasses: context.propertyClasses,
  };
}

interface ConvertContext {
  relatedInstances: RelatedInstance[];
  propertyClasses: ClassInfo[];
}

interface RelatedInstance {
  path: RelationshipPath;
  alias: string;
}

function createMetadataFromFilter(filter: PresentationInstanceFilter, ctx: ConvertContext) {
  if (isFilterConditionGroup(filter)) {
    return createMetadataFromGroup(filter, ctx);
  }
  const result = traverseUniqueValuesCondition(filter, ctx);
  if (result !== undefined) {
    return result;
  }
  return createMetadataFromCondition(filter, ctx);
}

function traverseUniqueValuesCondition(filter: PresentationInstanceFilterCondition, ctx: ConvertContext) {
  // Unique values works only with `IsEqual` and `IsNotEqual` operators.
  if (filter.operator !== PropertyFilterRuleOperator.IsEqual && filter.operator !== PropertyFilterRuleOperator.IsNotEqual) {
    return undefined;
  }
  if (typeof filter.value?.value !== "string" || typeof filter.value?.displayValue !== "string") {
    return undefined;
  }
  const result = handleStringifiedUniqueValues(filter, filter.value.displayValue, filter.value.value);
  if (result === undefined) {
    return undefined;
  }
  return createMetadataFromGroup(result, ctx);
}

function createMetadataFromGroup(group: PresentationInstanceFilterConditionGroup, ctx: ConvertContext): FilterRuleGroup {
  const convertedConditions = group.conditions.map((condition) => createMetadataFromFilter(condition, ctx));
  return {
    operator: group.operator,
    rules: convertedConditions,
  };
}

function createMetadataFromCondition(condition: PresentationInstanceFilterCondition, ctx: ConvertContext): FilterRule {
  const { field, operator, value } = condition;
  const property = field.properties[0].property;
  const relatedInstance = getRelatedInstanceDescription(field, property.classInfo.name, ctx);
  addClassInfoToContext(relatedInstance ? relatedInstance.path[0].sourceClassInfo : property.classInfo, ctx);
  const propertyAlias = relatedInstance?.alias ?? "this";

  return {
    operator,
    value,
    sourceAlias: propertyAlias,
    propertyName: property.name,
    propertyTypeName: field.type.typeName,
  };
}

function addClassInfoToContext(classInfo: ClassInfo, ctx: ConvertContext) {
  if (ctx.propertyClasses.find((existing) => existing.id === classInfo.id)) {
    return;
  }

  ctx.propertyClasses.push(classInfo);
}

function getRelatedInstanceDescription(field: PropertiesField, propClassName: string, ctx: ConvertContext): RelatedInstance | undefined {
  if (!field.parent) {
    return undefined;
  }

  const pathToProperty = RelationshipPath.reverse(getPathToPrimaryClass(field.parent));
  const existing = ctx.relatedInstances.find((instance) => RelationshipPath.equals(pathToProperty, instance.path));
  if (existing) {
    return existing;
  }

  const newRelated = {
    path: pathToProperty,
    alias: `rel_${propClassName.split(":")[1]}`,
  };

  ctx.relatedInstances.push(newRelated);
  return newRelated;
}

function getPathToPrimaryClass(field: NestedContentField): RelationshipPath {
  if (field.parent) {
    return [...field.pathToPrimaryClass, ...getPathToPrimaryClass(field.parent)];
  }
  return [...field.pathToPrimaryClass];
}

function isFilterConditionGroup(obj: PresentationInstanceFilter): obj is PresentationInstanceFilterConditionGroup {
  return (obj as PresentationInstanceFilterConditionGroup).conditions !== undefined;
}

function handleStringifiedUniqueValues(filter: PresentationInstanceFilterCondition, serializedDisplayValues: string, serializedGroupedRawValues: string) {
  const { field, operator } = filter;

  let selectedValueIndex = 0;

  const { displayValues, groupedRawValues } = deserializeDisplayValueGroupArray(serializedDisplayValues, serializedGroupedRawValues);
  if (displayValues === undefined || groupedRawValues === undefined) {
    return undefined;
  }

  const conditionGroup: PresentationInstanceFilterConditionGroup = {
    operator: operator === PropertyFilterRuleOperator.IsEqual ? PropertyFilterRuleGroupOperator.Or : PropertyFilterRuleGroupOperator.And,
    conditions: [],
  };
  for (const displayValue of displayValues) {
    for (const value of groupedRawValues[selectedValueIndex]) {
      conditionGroup.conditions.push({
        field,
        operator,
        value: { valueFormat: PropertyValueFormat.Primitive, displayValue, value },
      });
    }
    selectedValueIndex++;
  }
  return conditionGroup;
}
