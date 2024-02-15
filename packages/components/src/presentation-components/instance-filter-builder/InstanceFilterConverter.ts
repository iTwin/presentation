/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module InstancesFilter
 */

import { Primitives, StandardTypeNames } from "@itwin/appui-abstract";
import { isUnaryPropertyFilterOperator } from "@itwin/components-react";
import { assert } from "@itwin/core-bentley";
import {
  GenericInstanceFilter,
  GenericInstanceFilterRule,
  GenericInstanceFilterRuleGroup,
  GenericInstanceFilterRuleGroupOperator,
  GenericInstanceFilterRuleOperator,
  GenericInstanceFilterRuleValue,
} from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { ClassInfo } from "@itwin/presentation-common";
import { getIModelMetadataProvider } from "./ECMetadataProvider";
import { PresentationInstanceFilter } from "./PresentationInstanceFilter";

/** @internal */
export async function findBaseExpressionClassName(imodel: IModelConnection, propertyClassNames: string[]) {
  if (propertyClassNames.length === 1) {
    return propertyClassNames[0];
  }

  const metadataProvider = getIModelMetadataProvider(imodel);
  const [firstClassName, ...restClassNames] = propertyClassNames;
  let currentBaseClassInfo = await metadataProvider.getECClassInfo(firstClassName);
  // istanbul ignore if
  if (!currentBaseClassInfo) {
    return firstClassName;
  }

  for (const propClassName of restClassNames) {
    const propClassInfo = await metadataProvider.getECClassInfo(propClassName);
    if (propClassInfo && propClassInfo.isDerivedFrom(currentBaseClassInfo.id)) {
      currentBaseClassInfo = propClassInfo;
    }
  }
  return currentBaseClassInfo.name;
}

/** @internal */
export async function createInstanceFilterDefinitionBase(filter: PresentationInstanceFilter, imodel: IModelConnection) {
  const { rules, propertyClassNames, relatedInstances } = PresentationInstanceFilter.toGenericInstanceFilter(filter);
  const filterExpression = createFilterExpression(rules);

  const baseClassName = await findBaseExpressionClassName(imodel, propertyClassNames);

  return {
    expression: filterExpression,
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

/** @internal */
export function createFilterExpression(filter: GenericInstanceFilterRule | GenericInstanceFilterRuleGroup) {
  return createComparisonExpression(filter);
}

function createComparisonExpression(filter: GenericInstanceFilterRule | GenericInstanceFilterRuleGroup) {
  if (GenericInstanceFilter.isFilterRuleGroup(filter)) {
    return createExpressionFromGroup(filter);
  }

  const { propertyName, propertyTypeName, sourceAlias, operator, value } = filter;
  return createComparison(propertyName, propertyTypeName, sourceAlias, operator, value);
}

function createExpressionFromGroup(group: GenericInstanceFilterRuleGroup): string {
  const convertedConditions = group.rules.map((rule) => createComparisonExpression(rule));
  return `(${convertedConditions.join(` ${getGroupOperatorString(group.operator)} `)})`;
}

/** @internal */
export function createFilterClassExpression(usedClasses: ClassInfo[]) {
  return `(${usedClasses.map((classInfo) => `this.IsOfClass(${classInfo.id})`).join(" OR ")})`;
}

function createComparison(
  propertyName: string,
  type: string,
  alias: string,
  operator: GenericInstanceFilterRuleOperator,
  propValue?: GenericInstanceFilterRuleValue,
): string {
  const propertyAccessor = `${alias}.${propertyName}`;
  const operatorExpression = getRuleOperatorString(operator);
  if (propValue === undefined || isUnaryPropertyFilterOperator(operator)) {
    return `${propertyAccessor} ${operatorExpression}`;
  }

  const value = propValue.rawValue;
  if (operator === "like" && typeof value === "string") {
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
    assert(GenericInstanceFilterRuleValue.isPoint2d(value));
    return createPointComparison(value, operatorExpression, propertyAccessor);
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

function getGroupOperatorString(operator: GenericInstanceFilterRuleGroupOperator): string {
  switch (operator) {
    case "and":
      return "AND";
    case "or":
      return "OR";
  }
}

function getRuleOperatorString(operator: GenericInstanceFilterRuleOperator): string {
  switch (operator) {
    case "is-true":
      return "= TRUE";
    case "is-false":
      return "= FALSE";
    case "is-equal":
      return "=";
    case "is-not-equal":
      return "<>";
    case "greater":
      return ">";
    case "greater-or-equal":
      return ">=";
    case "less":
      return "<";
    case "less-or-equal":
      return "<=";
    case "like":
      return "~";
    case "is-null":
      return "= NULL";
    case "is-not-null":
      return "<> NULL";
  }
}

function escapeString(str: string) {
  return str.replace(/"/g, `""`);
}

function createPointComparison(point: { x: number; y: number } | { x: number; y: number; z: number }, operatorExpression: string, propertyAccessor: string) {
  const logicalOperator = operatorExpression === "=" ? "AND" : "OR";
  return `(CompareDoubles(${propertyAccessor}.x, ${point.x}) ${operatorExpression} 0) ${logicalOperator} (CompareDoubles(${propertyAccessor}.y, ${
    point.y
  }) ${operatorExpression} 0)${GenericInstanceFilterRuleValue.isPoint3d(point) ? ` ${logicalOperator} (CompareDoubles(${propertyAccessor}.z, ${point.z}) ${operatorExpression} 0)` : ""}`;
}
