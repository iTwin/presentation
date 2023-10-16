/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module InstancesFilter
 */

import { PrimitiveValue, PropertyDescription } from "@itwin/appui-abstract";
import { PropertyFilterRuleGroupOperator, PropertyFilterRuleOperator } from "@itwin/components-react";
import { ClassId, ClassInfo, PropertiesField } from "@itwin/presentation-common";

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
  operator: PropertyFilterRuleGroupOperator;
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
  operator: PropertyFilterRuleOperator;
  /** Value that property should be compared to. */
  value?: PrimitiveValue;
}

/**
 * Function that checks if supplied [[PresentationInstanceFilter]] is [[PresentationInstanceFilterConditionGroup]].
 * @beta
 */
export function isPresentationInstanceFilterConditionGroup(filter: PresentationInstanceFilter): filter is PresentationInstanceFilterConditionGroup {
  return (filter as any).conditions !== undefined;
}

/**
 * Data structure that stores information about filter built by [[PresentationInstanceFilterDialog]].
 * @beta
 */
export interface PresentationInstanceFilterInfo {
  /** Instance filter. */
  filter: PresentationInstanceFilter;
  /** Classes of the properties used in filter. */
  usedClasses: ClassInfo[];
}

/**
 * Data structure that contains information about property used for building filter.
 * @beta
 */
export interface InstanceFilterPropertyInfo {
  /** Content descriptor field that represents this property. */
  field: PropertiesField;
  /** Property description  */
  propertyDescription: PropertyDescription;
  /** Id of the class where this property is defined. */
  sourceClassId: ClassId;
  /** Name of the class that was used to access this property. */
  className: string;
  /** Label of related property category. */
  categoryLabel?: string;
}
