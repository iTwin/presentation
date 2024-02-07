/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module InstancesFilter
 */

import { Primitives, PrimitiveValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { assert } from "@itwin/core-bentley";
import {
  ClassInfo,
  Descriptor,
  Field,
  NestedContentField,
  PresentationError,
  PresentationStatus,
  PropertiesField,
  RelationshipPath,
  Value,
} from "@itwin/presentation-common";
import { deserializeUniqueValues, serializeUniqueValues, UniqueValue } from "../common/Utils";
import { PresentationInstanceFilter, PresentationInstanceFilterCondition, PresentationInstanceFilterConditionGroup } from "./PresentationFilterBuilder";

export interface ClassDefinition {
  id: string;
  name: string;
  label: string;
}

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
  propertyClasses: ClassDefinition[];
  /**
   * List of classes which will be used for additionally only querying items of passed classes
   */
  filteredClasses?: ClassDefinition[];
}

export type GenericInstanceFilterRuleOperator =
  | "is-equal"
  | "is-not-equal"
  | "is-null"
  | "is-not-null"
  | "is-true"
  | "is-false"
  | "less"
  | "less-or-equal"
  | "greater"
  | "greater-or-equal"
  | "like";

export interface GenericInstanceFilterRuleValue {
  displayValue?: string;
  rawValue?: GenericInstanceFilterRuleValue.Values;
}

// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace GenericInstanceFilterRuleValue {
  export interface Point2d {
    x: number;
    y: number;
  }
  export interface Point3d {
    x: number;
    y: number;
    z: number;
  }
  export interface InstanceKey {
    id: string;
    className: string;
  }
  export function isPoint2d(value: GenericInstanceFilterRuleValue.Values): value is GenericInstanceFilterRuleValue.Point2d {
    return (value as GenericInstanceFilterRuleValue.Point2d).x !== undefined && (value as GenericInstanceFilterRuleValue.Point2d).y !== undefined;
  }
  export function isPoint3d(value: GenericInstanceFilterRuleValue.Values): value is GenericInstanceFilterRuleValue.Point3d {
    return isPoint2d(value) && (value as GenericInstanceFilterRuleValue.Point3d).z !== undefined;
  }
  export function isInstanceKey(value: GenericInstanceFilterRuleValue.Values): value is GenericInstanceFilterRuleValue.InstanceKey {
    return (value as GenericInstanceFilterRuleValue.InstanceKey) !== undefined && (value as GenericInstanceFilterRuleValue.InstanceKey).className !== undefined;
  }
  export type Values =
    | string
    | number
    | boolean
    | Date
    | GenericInstanceFilterRuleValue.Point2d
    | GenericInstanceFilterRuleValue.Point3d
    | GenericInstanceFilterRuleValue.InstanceKey;
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
  operator: GenericInstanceFilterRuleOperator;
  /**
   * Value to which property values is compared to. For unary operators value is 'undefined'.
   */
  value?: GenericInstanceFilterRuleValue;
  /**
   * Type name of the property. It matches `extendedTypeName` attribute of `ECPrimitiveProperty` if defined
   * or `typeName` attribute otherwise.
   */
  propertyTypeName: string;
}

export type GenericInstanceFilterRuleGroupOperator = "and" | "or";

/**
 * Group of filter rules joined by logical operator.
 * @beta
 */
export interface GenericInstanceFilterRuleGroup {
  /**
   * Operator that should be used to join rules.
   */
  operator: GenericInstanceFilterRuleGroupOperator;
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
  path: RelationshipStep[];
  /**
   * Related instance alias. This alias match `sourceAlias` in all filter rules where
   * properties of this related instance is used.
   */
  alias: string;
}

export interface RelationshipStep {
  sourceClassName: string;
  targetClassName: string;
  relationshipClassName: string;
  isForwardRelationship: boolean;
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
      relatedInstances: context.relatedInstances.map((instance) => ({ path: toRelationshipStep(instance.path), alias: instance.alias })),
      propertyClasses: context.propertyClasses,
      filteredClasses,
    };
  }

  /**
   * Creates `PresentationInstanceFilter`.
   * @beta
   */
  export function toPresentationInstanceFilter(filter: GenericInstanceFilter, descriptor: Descriptor): PresentationInstanceFilter {
    return parseGenericFilter(filter, descriptor);
  }

  /**
   * Function that checks if supplied object is [[GenericInstanceFilterRuleGroup]].
   * @beta
   */
  export function isFilterRuleGroup(obj: GenericInstanceFilterRule | GenericInstanceFilterRuleGroup): obj is GenericInstanceFilterRuleGroup {
    return (obj as GenericInstanceFilterRuleGroup).rules !== undefined;
  }
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
    value: toGenericInstanceFilterRuleValue(value),
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
    value: rule.value
      ? { valueFormat: PropertyValueFormat.Primitive, displayValue: rule.value.displayValue, value: rule.value as Primitives.Value }
      : undefined,
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

function findRelatedField(fields: Field[], propName: string, alias: string, paths: RelatedInstanceDescription[]): PropertiesField | undefined {
  const path = paths.find((relPath) => alias === relPath.alias);
  if (!path) {
    return undefined;
  }

  const pathToPrimaryClass = reverseRelationshipSteps(path.path);

  const relatedField = findFieldByPath(fields, pathToPrimaryClass);
  return relatedField ? findDirectField(relatedField.nestedFields, propName) : undefined;
}

function findFieldByPath(fields: Field[], pathToField: RelationshipStep[]): NestedContentField | undefined {
  for (const field of fields) {
    if (!field.isNestedContentField()) {
      continue;
    }

    const pathMatchResult = pathStartsWith(pathToField, field.pathToPrimaryClass);
    if (!pathMatchResult.matches) {
      continue;
    }

    if (pathMatchResult.leftOver.length === 0) {
      return field;
    }

    const nestedField = findFieldByPath(field.nestedFields, pathMatchResult.leftOver);
    if (nestedField) {
      return nestedField;
    }
  }

  return undefined;
}

function pathStartsWith(
  prefix: RelationshipStep[],
  path: RelationshipPath,
):
  | {
      matches: false;
    }
  | {
      matches: true;
      leftOver: RelationshipStep[];
    } {
  if (prefix.length < path.length) {
    return { matches: false };
  }

  for (let i = 0; i < prefix.length; ++i) {
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

function reverseRelationshipSteps(path: RelationshipStep[]): RelationshipStep[] {
  return [...path].reverse().map((step) => ({
    ...step,
    sourceClassName: step.targetClassName,
    targetClassName: step.sourceClassName,
    isForwardRelationship: !step.isForwardRelationship,
  }));
}

function toRelationshipStep(path: RelationshipPath): RelationshipStep[] {
  return path.map((step) => ({
    sourceClassName: step.sourceClassInfo.name,
    targetClassName: step.targetClassInfo.name,
    relationshipClassName: step.relationshipInfo.name,
    isForwardRelationship: step.isForwardRelationship,
  }));
}

function toGenericInstanceFilterRuleValue(primitiveValue?: PrimitiveValue): GenericInstanceFilterRuleValue | undefined {
  if (!primitiveValue) {
    return undefined;
  }

  return { displayValue: primitiveValue.displayValue, rawValue: toGenericPrimitiveValue(primitiveValue.value) };
}

function toGenericPrimitiveValue(value?: Primitives.Value): GenericInstanceFilterRuleValue.Values | undefined {
  if (value === undefined) {
    return value;
  }

  switch (typeof value) {
    case "string":
      return value;
    case "number":
      return value;
    case "boolean":
      return value;
  }

  if (isPoint2dLike(value)) {
    return value;
  }
  if (isPoint3dLike(value)) {
    return value;
  }
  if (isInstanceKeyLike(value)) {
    return value;
  }

  return undefined;
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
