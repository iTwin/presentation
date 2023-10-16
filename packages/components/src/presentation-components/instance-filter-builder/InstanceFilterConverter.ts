/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module InstancesFilter
 */

import { Primitives, PrimitiveValue, StandardTypeNames } from "@itwin/appui-abstract";
import { isUnaryPropertyFilterOperator, PropertyFilterRuleGroupOperator, PropertyFilterRuleOperator } from "@itwin/components-react";
import { assert } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { ClassInfo, InstanceFilterDefinition } from "@itwin/presentation-common";
import { getIModelMetadataProvider } from "./ECMetadataProvider";
import { createFilterMetadata, FilterRule, FilterRuleGroup } from "./FilterMetadata";
import { PresentationInstanceFilter } from "./Types";

/**
 * Converts [[PresentationInstanceFilter]] into [InstanceFilterDefinition]($presentation-common) that can be passed
 * to [PresentationManager]($presentation-frontend) through request options in order to filter results.
 * @beta
 */
export async function convertToInstanceFilterDefinition(filter: PresentationInstanceFilter, imodel: IModelConnection): Promise<InstanceFilterDefinition> {
  const { rules, propertyClasses, relatedInstances } = createFilterMetadata(filter);
  const expression = createExpression(rules);

  const baseClass = await findBaseExpressionClass(imodel, propertyClasses);

  return {
    expression,
    selectClassName: baseClass.name,
    relatedInstances: relatedInstances.map((related) => ({
      pathFromSelectToPropertyClass: related.path,
      alias: related.alias,
    })),
  };
}

async function findBaseExpressionClass(imodel: IModelConnection, propertyClasses: ClassInfo[]) {
  if (propertyClasses.length === 1) {
    return propertyClasses[0];
  }

  const metadataProvider = getIModelMetadataProvider(imodel);
  const [firstClass, ...restClasses] = propertyClasses;
  let currentBaseClass = firstClass;
  for (const propClass of restClasses) {
    const propClassInfo = await metadataProvider.getECClassInfo(propClass.id);
    if (propClassInfo && propClassInfo.isDerivedFrom(currentBaseClass.id)) {
      currentBaseClass = propClass;
    }
  }
  return currentBaseClass;
}

function createExpression(filter: FilterRule | FilterRuleGroup) {
  if (isFilterRuleGroup(filter)) {
    return createExpressionFromGroup(filter);
  }

  const { propertyName, propertyTypeName, sourceAlias, operator, value } = filter;
  return createComparison(propertyName, propertyTypeName, sourceAlias, operator, value);
}

function createExpressionFromGroup(group: FilterRuleGroup): string {
  const convertedConditions = group.rules.map((rule) => createExpression(rule));
  return `(${convertedConditions.join(` ${getGroupOperatorString(group.operator)} `)})`;
}

function createComparison(propertyName: string, type: string, alias: string, operator: PropertyFilterRuleOperator, propValue?: PrimitiveValue): string {
  const propertyAccessor = `${alias}.${propertyName}`;
  const operatorExpression = getRuleOperatorString(operator);
  if (propValue === undefined || isUnaryPropertyFilterOperator(operator)) {
    return `${propertyAccessor} ${operatorExpression}`;
  }

  const value = propValue.value;
  if (operator === PropertyFilterRuleOperator.Like && typeof value === "string") {
    return `${propertyAccessor} ${operatorExpression} "%${escapeString(value)}%"`;
  }

  let valueExpression = "";
  switch (typeof value) {
    case "string":
      valueExpression = `"${escapeString(value)}"`;
      break;
    case "number":
      valueExpression = value.toString();
      break;
  }

  if (type === StandardTypeNames.Point2d || type === StandardTypeNames.Point3d) {
    assert(isPoint2d(value));
    return createPointComparision(value, operatorExpression, propertyAccessor);
  }
  if (type === "navigation") {
    return `${propertyAccessor}.Id ${operatorExpression} ${(value as Primitives.InstanceKey).id}`;
  }
  if (type === "double") {
    return `CompareDoubles(${propertyAccessor}, ${valueExpression}) ${operatorExpression} 0`;
  }
  if (type === "dateTime") {
    return `CompareDateTimes(${propertyAccessor}, ${valueExpression}) ${operatorExpression} 0`;
  }

  return `${propertyAccessor} ${operatorExpression} ${valueExpression}`;
}

function getGroupOperatorString(operator: PropertyFilterRuleGroupOperator) {
  switch (operator) {
    case PropertyFilterRuleGroupOperator.And:
      return "AND";
    case PropertyFilterRuleGroupOperator.Or:
      return "OR";
  }
}

function getRuleOperatorString(operator: PropertyFilterRuleOperator) {
  switch (operator) {
    case PropertyFilterRuleOperator.Greater:
      return ">";
    case PropertyFilterRuleOperator.GreaterOrEqual:
      return ">=";
    case PropertyFilterRuleOperator.IsEqual:
      return "=";
    case PropertyFilterRuleOperator.IsFalse:
      return "= FALSE";
    case PropertyFilterRuleOperator.IsNotEqual:
      return "<>";
    case PropertyFilterRuleOperator.IsNotNull:
      return "<> NULL";
    case PropertyFilterRuleOperator.IsNull:
      return "= NULL";
    case PropertyFilterRuleOperator.IsTrue:
      return "= TRUE";
    case PropertyFilterRuleOperator.Less:
      return "<";
    case PropertyFilterRuleOperator.LessOrEqual:
      return "<=";
    case PropertyFilterRuleOperator.Like:
      return "~";
  }
}

function escapeString(str: string) {
  return str.replace(/"/g, `""`);
}

function isFilterRuleGroup(obj: FilterRule | FilterRuleGroup): obj is FilterRuleGroup {
  return (obj as FilterRuleGroup).rules !== undefined;
}

function createPointComparision(point: { x: number; y: number } | { x: number; y: number; z: number }, operatorExpression: string, propertyAccessor: string) {
  const logicalOperator = operatorExpression === "=" ? "AND" : "OR";
  return `(CompareDoubles(${propertyAccessor}.x, ${point.x}) ${operatorExpression} 0) ${logicalOperator} (CompareDoubles(${propertyAccessor}.y, ${
    point.y
  }) ${operatorExpression} 0)${isPoint3d(point) ? ` ${logicalOperator} (CompareDoubles(${propertyAccessor}.z, ${point.z}) ${operatorExpression} 0)` : ""}`;
}

function isPoint2d(obj?: Primitives.Value): obj is { x: number; y: number } {
  return (obj as any).x !== undefined && (obj as any).y !== undefined;
}

function isPoint3d(obj?: Primitives.Value): obj is { x: number; y: number; z: number } {
  return isPoint2d(obj) && (obj as any).z !== undefined;
}
