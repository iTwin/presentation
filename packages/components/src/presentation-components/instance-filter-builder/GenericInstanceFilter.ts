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
import { PresentationInstanceFilter, PresentationInstanceFilterCondition, PresentationInstanceFilterConditionGroup } from "./PresentationFilterBuilder";

/**
 * Generic instance filter that has all the necessary information to build query extracted from presentation data structures.
 * @beta
 */
export interface GenericInstanceFilter {
  /** Single filter rule or multiple rules joined by logical operator. */
  rules: GenericInstanceFilterRule | GenericInstanceFilterRuleGroup;
  /**
   * Information about related instances that has access to the properties used in filter.
   * These can be used to create `JOIN` clause when building `ECSQL` query. Each related property
   * used in rule will have `sourceAlias` that matches `RelatedInstanceDescription.alias`.
   * If more than one property of the same related instance is used, they will share the same alias.
   */
  relatedInstances: RelatedInstanceDescription[];
  /**
   * List of classes whose properties are used in rules. Might be used to find common base class when building
   * filter for instance of different classes.
   */
  propertyClasses: ClassInfo[];
  /**
   * List of classes which will be used for additionally only querying items of passed classes
   */
  filteredClasses?: ClassInfo[];
}

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace GenericInstanceFilter {
  /**
   * Extracts information from presentation data structures and creates a generic instance filter for building queries.
   * @beta
   */
  export function fromPresentationInstanceFilter(filter: PresentationInstanceFilter, filteredClasses?: ClassInfo[]): GenericInstanceFilter {
    const context: ConvertContext = { relatedInstances: [], propertyClasses: [], usedRelatedAliases: new Map<string, number>() };

    const rules = createMetadataFromFilter(filter, context);
    return {
      rules,
      relatedInstances: context.relatedInstances.map((instance) => ({ path: RelationshipPath.strip(instance.path), alias: instance.alias })),
      propertyClasses: context.propertyClasses,
      filteredClasses,
    };
  }

  /**
   * Function that checks if supplied object is [[GenericInstanceFilterRuleGroup]].
   * @beta
   */
  export function isFilterRuleGroup(obj: GenericInstanceFilterRule | GenericInstanceFilterRuleGroup): obj is GenericInstanceFilterRuleGroup {
    return (obj as GenericInstanceFilterRuleGroup).rules !== undefined;
  }
}

/**
 * Defines single filter rule.
 * @beta
 */
export interface GenericInstanceFilterRule {
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
  operator: `${PropertyFilterRuleOperator}`;
  /**
   * Value to which property values is compared to. For unary operators value is 'undefined'.
   */
  value?: PrimitiveValue;
  /**
   * Type name of the property. It matches `extendedTypeName` attribute of `ECPrimitiveProperty` if defined
   * or `typeName` attribute otherwise.
   */
  propertyTypeName: string;
}

/**
 * Group of filter rules joined by logical operator.
 * @beta
 */
export interface GenericInstanceFilterRuleGroup {
  /**
   * Operator that should be used to join rules.
   */
  operator: `${PropertyFilterRuleGroupOperator}`;
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
   * Describes path that should be used to reach related instance from the source.
   */
  path: StrippedRelationshipPath;
  /**
   * Related instance alias. This alias match `sourceAlias` in all filter rules where
   * properties of this related instance is used.
   */
  alias: string;
}

interface ConvertContext {
  relatedInstances: RelatedInstance[];
  propertyClasses: ClassInfo[];
  usedRelatedAliases: Map<string, number>;
}

interface RelatedInstance {
  path: RelationshipPath;
  alias: string;
}

function createMetadataFromFilter(filter: PresentationInstanceFilter, ctx: ConvertContext) {
  if (PresentationInstanceFilter.isConditionGroup(filter)) {
    return createGenericInstanceFilterRuleGroup(filter, ctx);
  }
  const result = traverseUniqueValuesCondition(filter, ctx);
  if (result !== undefined) {
    return result;
  }
  return createGenericInstanceFilterRule(filter, ctx);
}

function traverseUniqueValuesCondition(filter: PresentationInstanceFilterCondition, ctx: ConvertContext) {
  // Unique values works only with `IsEqual` and `IsNotEqual` operators.
  if (filter.operator !== "is-equal" && filter.operator !== "is-not-equal") {
    return undefined;
  }
  if (typeof filter.value?.value !== "string" || typeof filter.value?.displayValue !== "string") {
    return undefined;
  }
  const result = handleStringifiedUniqueValues(filter, filter.value.displayValue, filter.value.value);
  if (result === undefined) {
    return undefined;
  }
  return createGenericInstanceFilterRuleGroup(result, ctx);
}

function createGenericInstanceFilterRuleGroup(group: PresentationInstanceFilterConditionGroup, ctx: ConvertContext): GenericInstanceFilterRuleGroup {
  const convertedConditions = group.conditions.map((condition) => createMetadataFromFilter(condition, ctx));
  return {
    operator: group.operator,
    rules: convertedConditions,
  };
}

function createGenericInstanceFilterRule(condition: PresentationInstanceFilterCondition, ctx: ConvertContext): GenericInstanceFilterRule {
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

  const baseAlias = `rel_${propClassName.split(":")[1]}`;
  const index = getAliasIndex(baseAlias, ctx.usedRelatedAliases);
  const newRelated = {
    path: pathToProperty,
    alias: `rel_${propClassName.split(":")[1]}_${index}`,
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

function handleStringifiedUniqueValues(filter: PresentationInstanceFilterCondition, serializedDisplayValues: string, serializedGroupedRawValues: string) {
  const { field, operator } = filter;

  let selectedValueIndex = 0;

  const { displayValues, groupedRawValues } = deserializeDisplayValueGroupArray(serializedDisplayValues, serializedGroupedRawValues);
  if (displayValues === undefined || groupedRawValues === undefined) {
    return undefined;
  }

  const conditionGroup: PresentationInstanceFilterConditionGroup = {
    operator: operator === "is-equal" ? "or" : "and",
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

function getAliasIndex(alias: string, usedAliases: Map<string, number>) {
  const index = usedAliases.has(alias) ? usedAliases.get(alias)! + 1 : 0;
  usedAliases.set(alias, index);
  return index;
}
