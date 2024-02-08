/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module InstancesFilter
 */

import { Primitives, PrimitiveValue, PropertyValueFormat } from "@itwin/appui-abstract";
import {
  isPropertyFilterRuleGroup,
  PropertyFilter,
  PropertyFilterRule,
  PropertyFilterRuleGroup,
  PropertyFilterRuleGroupOperator,
  PropertyFilterRuleOperator,
} from "@itwin/components-react";
import { assert } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import {
  ClassInfo,
  Descriptor,
  Field,
  InstanceFilterDefinition,
  NestedContentField,
  PresentationError,
  PresentationStatus,
  PropertiesField,
  RelationshipPath,
  Value,
} from "@itwin/presentation-common";
import { deserializeUniqueValues, findField, serializeUniqueValues, UniqueValue } from "../common/Utils";
import {
  GenericInstanceFilter,
  GenericInstanceFilterRelatedInstanceDescription,
  GenericInstanceFilterRelationshipStep,
  GenericInstanceFilterRule,
  GenericInstanceFilterRuleGroup,
  GenericInstanceFilterRuleValue,
} from "./GenericInstanceFilter";
import { createExpression, findBaseExpressionClassName } from "./InstanceFilterConverter";
import { createPropertyInfoFromPropertiesField, getInstanceFilterFieldName } from "./Utils";

/**
 * Type that describes instance filter based on [Descriptor]($presentation-common) fields. It can be
 * one filter condition or group of filter conditions joined by logical operator.
 * @beta
 */
export type PresentationInstanceFilter = PresentationInstanceFilterConditionGroup | PresentationInstanceFilterCondition;

/**
 * Data structure that describes group of filter condition joined by logical operator.
 * @beta
 */
export interface PresentationInstanceFilterConditionGroup {
  /** Operator that should be used to join conditions. */
  operator: `${PropertyFilterRuleGroupOperator}`;
  /** Conditions in this group. */
  conditions: PresentationInstanceFilter[];
}

/**
 * Data structure that describes single filter condition.
 * @beta
 */
export interface PresentationInstanceFilterCondition {
  /** [PropertiesField]($presentation-common) that contains property used in this condition. */
  field: PropertiesField;
  /** Operator that should be used to compare property value. */
  operator: `${PropertyFilterRuleOperator}`;
  /** Value that property should be compared to. */
  value?: PrimitiveValue;
}

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace PresentationInstanceFilter {
  /**
   * Converts filter built by [usePropertyFilterBuilder]($components-react) into presentation specific format.
   * @throws if presentation data cannot be found for properties used in `filter`.
   *
   * @beta
   */
  export function fromComponentsPropertyFilter(descriptor: Descriptor, filter: PropertyFilter): PresentationInstanceFilter {
    if (isPropertyFilterRuleGroup(filter)) {
      return createPresentationInstanceFilterConditionGroup(descriptor, filter);
    }
    return createPresentationInstanceFilterCondition(descriptor, filter);
  }

  /**
   * Converts [[PresentationInstanceFilter]] into format used by [usePropertyFilterBuilder]($components-react).
   * @throws if fields used in filter cannot be found in `descriptor`.
   *
   * @beta
   */
  export function toComponentsPropertyFilter(descriptor: Descriptor, filter: PresentationInstanceFilter): PropertyFilter {
    if (PresentationInstanceFilter.isConditionGroup(filter)) {
      return createPropertyFilterRuleGroup(filter, descriptor);
    }
    return createPropertyFilterRule(filter, descriptor);
  }

  /**
   * Extracts information from presentation data structures and creates a generic instance filter for building queries.
   * @beta
   */
  export function toGenericInstanceFilter(filter: PresentationInstanceFilter, filteredClasses?: ClassInfo[]): GenericInstanceFilter {
    const context: ConvertContext = { relatedInstances: [], propertyClasses: [], usedRelatedAliases: new Map<string, number>() };

    const rules = createGenericInstanceFilter(filter, context);
    return {
      rules,
      relatedInstances: context.relatedInstances.map((instance) => ({ path: toRelationshipStep(instance.path), alias: instance.alias })),
      propertyClassNames: context.propertyClasses.map((classInfo) => classInfo.name),
      filteredClassNames: filteredClasses?.map((classInfo) => classInfo.name),
    };
  }

  /**
   * Creates `PresentationInstanceFilter`.
   * @beta
   */
  export function fromGenericInstanceFilter(descriptor: Descriptor, filter: GenericInstanceFilter): PresentationInstanceFilter {
    return parseGenericFilter(filter, descriptor);
  }

  /**
   * Converts [[PresentationInstanceFilter]] into [InstanceFilterDefinition]($presentation-common) that can be passed
   * to [PresentationManager]($presentation-frontend) through request options in order to filter results.
   * @beta
   */
  export async function toInstanceFilterDefinition(
    filter: PresentationInstanceFilter,
    imodel: IModelConnection,
    filteredClasses?: ClassInfo[],
  ): Promise<InstanceFilterDefinition> {
    const { rules, propertyClassNames, relatedInstances } = toGenericInstanceFilter(filter);
    const expression = createExpression(rules, filteredClasses);

    const baseClassName = await findBaseExpressionClassName(imodel, propertyClassNames);

    return {
      expression,
      selectClassName: baseClassName,
      relatedInstances: relatedInstances.map((related) => ({
        pathFromSelectToPropertyClass: related.path.map((step) => ({
          sourceClassName: step.sourceClassName,
          targetClassName: step.targetClassName,
          relationshipName: step.relationshipClassName,
          isForwardRelationship: step.isForwardRelationship,
        })),
        alias: related.alias,
      })),
    };
  }

  /**
   * Function that checks if supplied [[PresentationInstanceFilter]] is [[PresentationInstanceFilterConditionGroup]].
   * @beta
   */
  export function isConditionGroup(filter: PresentationInstanceFilter): filter is PresentationInstanceFilterConditionGroup {
    return (filter as any).conditions !== undefined;
  }
}

function createPresentationInstanceFilterConditionGroup(descriptor: Descriptor, group: PropertyFilterRuleGroup): PresentationInstanceFilterConditionGroup {
  return {
    operator: group.operator,
    conditions: group.rules.map((rule) => PresentationInstanceFilter.fromComponentsPropertyFilter(descriptor, rule)),
  };
}

function createPresentationInstanceFilterCondition(descriptor: Descriptor, condition: PropertyFilterRule): PresentationInstanceFilterCondition {
  const field = findField(descriptor, getInstanceFilterFieldName(condition.property));
  if (!field || !field.isPropertiesField()) {
    throw new PresentationError(PresentationStatus.Error, `Failed to find properties field for property - ${condition.property.name}`);
  }
  if (condition.value && condition.value.valueFormat !== PropertyValueFormat.Primitive) {
    throw new PresentationError(PresentationStatus.Error, `Property '${condition.property.name}' cannot be compared with non primitive value.`);
  }
  return {
    operator: condition.operator,
    field,
    value: condition.value,
  };
}

function createPropertyFilterRule(condition: PresentationInstanceFilterCondition, descriptor: Descriptor): PropertyFilterRule {
  const field = descriptor.getFieldByName(condition.field.name, true);
  if (!field || !field.isPropertiesField()) {
    throw new PresentationError(PresentationStatus.Error, `Failed to find properties field - ${condition.field.name} in descriptor`);
  }
  return {
    property: createPropertyInfoFromPropertiesField(field).propertyDescription,
    operator: condition.operator,
    value: condition.value,
  };
}

function createPropertyFilterRuleGroup(group: PresentationInstanceFilterConditionGroup, descriptor: Descriptor): PropertyFilterRuleGroup {
  return {
    operator: group.operator,
    rules: group.conditions.map((condition) => PresentationInstanceFilter.toComponentsPropertyFilter(descriptor, condition)),
  };
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

function createGenericInstanceFilter(filter: PresentationInstanceFilter, ctx: ConvertContext) {
  if (PresentationInstanceFilter.isConditionGroup(filter)) {
    return createGenericInstanceFilterRuleGroup(filter, ctx);
  }
  const result = createGenericInstanceFilterUniqueValueRules(filter, ctx);
  if (result !== undefined) {
    return result;
  }
  return createGenericInstanceFilterRule(filter, ctx);
}

function createGenericInstanceFilterUniqueValueRules(filter: PresentationInstanceFilterCondition, ctx: ConvertContext) {
  // Unique values works only with `IsEqual` and `IsNotEqual` operators.
  if (filter.operator !== "is-equal" && filter.operator !== "is-not-equal") {
    return undefined;
  }
  if (typeof filter.value?.value !== "string" || typeof filter.value?.displayValue !== "string") {
    return undefined;
  }
  const result = createUniqueValueConditions(filter, filter.value.displayValue, filter.value.value);
  if (result === undefined) {
    return undefined;
  }
  return createGenericInstanceFilterRuleGroup(result, ctx);
}

function createGenericInstanceFilterRuleGroup(group: PresentationInstanceFilterConditionGroup, ctx: ConvertContext): GenericInstanceFilterRuleGroup {
  const convertedConditions = group.conditions.map((condition) => createGenericInstanceFilter(condition, ctx));
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
    value: toGenericInstanceFilterRuleValue(value),
    sourceAlias: propertyAlias,
    propertyName: property.name,
    propertyTypeName: field.type.typeName,
  };
}

function createUniqueValueConditions(filter: PresentationInstanceFilterCondition, serializedDisplayValues: string, serializedGroupedRawValues: string) {
  const { field, operator } = filter;

  const uniqueValues = deserializeUniqueValues(serializedDisplayValues, serializedGroupedRawValues);
  if (uniqueValues === undefined) {
    return undefined;
  }

  const conditionGroup: PresentationInstanceFilterConditionGroup = {
    operator: operator === "is-equal" ? "or" : "and",
    conditions: [],
  };
  for (const { displayValue, groupedRawValues } of uniqueValues) {
    for (const value of groupedRawValues) {
      conditionGroup.conditions.push({
        field,
        operator,
        value: { valueFormat: PropertyValueFormat.Primitive, displayValue, value },
      });
    }
  }
  return conditionGroup;
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

function addClassInfoToContext(classInfo: ClassInfo, ctx: ConvertContext) {
  if (ctx.propertyClasses.find((existing) => existing.id === classInfo.id)) {
    return;
  }

  ctx.propertyClasses.push(classInfo);
}

function getPathToPrimaryClass(field: NestedContentField): RelationshipPath {
  if (field.parent) {
    return [...field.pathToPrimaryClass, ...getPathToPrimaryClass(field.parent)];
  }
  return [...field.pathToPrimaryClass];
}

function getAliasIndex(alias: string, usedAliases: Map<string, number>) {
  const index = usedAliases.has(alias) ? usedAliases.get(alias)! + 1 : 0;
  usedAliases.set(alias, index);
  return index;
}

interface GenericFilterParsingContext {
  findField: (propName: string, alias: string) => PropertiesField;
}

function parseGenericFilter(filter: GenericInstanceFilter, descriptor: Descriptor): PresentationInstanceFilter {
  const ctx: GenericFilterParsingContext = {
    findField: (propName, alias) => {
      const field =
        alias === "this" ? findDirectField(descriptor.fields, propName) : findRelatedField(descriptor.fields, propName, alias, filter.relatedInstances);
      if (!field) {
        throw new PresentationError(PresentationStatus.Error, `Failed to find field for property - ${alias}.${propName}`);
      }

      return field;
    },
  };

  return parseGenericFilterRules(filter.rules, ctx);
}

function parseGenericFilterRules(
  rules: GenericInstanceFilterRule | GenericInstanceFilterRuleGroup,
  ctx: GenericFilterParsingContext,
): PresentationInstanceFilter {
  if (GenericInstanceFilter.isFilterRuleGroup(rules)) {
    return parseGenericFilterRuleGroup(rules, ctx);
  }

  return parseGenericFilterRule(rules, ctx);
}

function parseGenericFilterRuleGroup(
  group: GenericInstanceFilterRuleGroup,
  ctx: GenericFilterParsingContext,
): PresentationInstanceFilterConditionGroup | PresentationInstanceFilterCondition {
  if (group.rules.every((rule) => !GenericInstanceFilter.isFilterRuleGroup(rule) && (rule.operator === "is-equal" || rule.operator === "is-not-equal"))) {
    const uniqueValueRule = parseUniqueValuesRule(group.rules as GenericInstanceFilterRule[], ctx);
    if (uniqueValueRule) {
      return uniqueValueRule;
    }
  }

  return {
    operator: group.operator,
    conditions: group.rules.map((rule) => parseGenericFilterRules(rule, ctx)),
  };
}

function parseGenericFilterRule(rule: GenericInstanceFilterRule, ctx: GenericFilterParsingContext): PresentationInstanceFilterCondition {
  const field = ctx.findField(rule.propertyName, rule.sourceAlias);

  return {
    field,
    operator: rule.operator,
    value: rule.value ? { valueFormat: PropertyValueFormat.Primitive, displayValue: rule.value.displayValue, value: rule.value.rawValue } : undefined,
  };
}

function parseUniqueValuesRule(rules: GenericInstanceFilterRule[], ctx: GenericFilterParsingContext): PresentationInstanceFilterCondition | undefined {
  // check if all rules in group use same property and operator
  const ruleInfo = { propName: rules[0].propertyName, alias: rules[0].sourceAlias, operator: rules[0].operator };
  if (!rules.every((rule) => rule.operator === ruleInfo.operator && rule.propertyName === ruleInfo.propName && rule.sourceAlias === ruleInfo.alias)) {
    return undefined;
  }

  const field = ctx.findField(rules[0].propertyName, rules[0].sourceAlias);

  const uniqueValues: UniqueValue[] = [];
  for (const rule of rules) {
    assert(rule.value?.displayValue !== undefined && rule.value.rawValue !== undefined);
    const displayValue = rule.value.displayValue;
    const value = rule.value.rawValue as Value;

    const currentValue = uniqueValues.find((val) => val.displayValue === displayValue);
    if (currentValue) {
      currentValue.groupedRawValues.push(value);
    } else {
      uniqueValues.push({
        displayValue,
        groupedRawValues: [value],
      });
    }
  }

  const { displayValues, groupedRawValues } = serializeUniqueValues(uniqueValues);
  return {
    operator: rules[0].operator,
    field,
    value: { valueFormat: PropertyValueFormat.Primitive, displayValue: displayValues, value: groupedRawValues },
  };
}

function findDirectField(fields: Field[], propName: string): PropertiesField | undefined {
  for (const field of fields) {
    if (!field.isPropertiesField()) {
      continue;
    }

    if (field.properties[0].property.name === propName) {
      return field;
    }
  }
  return undefined;
}

function findRelatedField(
  fields: Field[],
  propName: string,
  alias: string,
  relatedInstances: GenericInstanceFilterRelatedInstanceDescription[],
): PropertiesField | undefined {
  const relatedInstance = relatedInstances.find((rel) => alias === rel.alias);
  if (!relatedInstance) {
    return undefined;
  }

  const relatedField = findFieldByPath(fields, relatedInstance.path);
  return relatedField ? findDirectField(relatedField.nestedFields, propName) : undefined;
}

function findFieldByPath(fields: Field[], pathToField: GenericInstanceFilterRelationshipStep[]): NestedContentField | undefined {
  for (const field of fields) {
    if (!field.isNestedContentField()) {
      continue;
    }

    const pathMatchResult = pathStartsWith(pathToField, RelationshipPath.reverse(field.pathToPrimaryClass));
    if (!pathMatchResult.matches) {
      continue;
    }

    if (pathMatchResult.leftOver.length === 0) {
      return field;
    }

    const nestedField = findFieldByPath(field.nestedFields, pathMatchResult.leftOver);
    // istanbul ignore else
    if (nestedField) {
      return nestedField;
    }
  }

  return undefined;
}

function pathStartsWith(
  prefix: GenericInstanceFilterRelationshipStep[],
  path: RelationshipPath,
):
  | {
      matches: false;
    }
  | {
      matches: true;
      leftOver: GenericInstanceFilterRelationshipStep[];
    } {
  if (prefix.length < path.length) {
    return { matches: false };
  }

  for (let i = 0; i < path.length; ++i) {
    const prefixStep = prefix[i];
    const pathStep = path[i];

    if (
      prefixStep.sourceClassName !== pathStep.sourceClassInfo.name ||
      prefixStep.targetClassName !== pathStep.targetClassInfo.name ||
      prefixStep.relationshipClassName !== pathStep.relationshipInfo.name ||
      prefixStep.isForwardRelationship !== pathStep.isForwardRelationship
    ) {
      return { matches: false };
    }
  }

  const leftOver = prefix.slice(path.length);
  return {
    matches: true,
    leftOver,
  };
}

function toRelationshipStep(path: RelationshipPath): GenericInstanceFilterRelationshipStep[] {
  return path.map((step) => ({
    sourceClassName: step.sourceClassInfo.name,
    targetClassName: step.targetClassInfo.name,
    relationshipClassName: step.relationshipInfo.name,
    isForwardRelationship: step.isForwardRelationship,
  }));
}

function toGenericInstanceFilterRuleValue(primitiveValue?: PrimitiveValue): GenericInstanceFilterRuleValue | undefined {
  if (!primitiveValue || primitiveValue.value === undefined || !isGenericPrimitiveValueLike(primitiveValue.value)) {
    return undefined;
  }

  return { displayValue: primitiveValue.displayValue ?? "", rawValue: primitiveValue.value };
}

function isGenericPrimitiveValueLike(value: Primitives.Value): value is GenericInstanceFilterRuleValue.Values {
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return true;
  }

  return isPoint3dLike(value) || isPoint2dLike(value) || isInstanceKeyLike(value);
}

function isPoint2dLike(value: object): value is { x: number; y: number } {
  return (value as any).x !== undefined && (value as any).y !== undefined;
}

function isPoint3dLike(value: object): value is { x: number; y: number; z: number } {
  return isPoint2dLike(value) && (value as any).z !== undefined;
}

function isInstanceKeyLike(value: object): value is { id: string; className: string } {
  return (value as any).id !== undefined && (value as any).className !== undefined;
}
