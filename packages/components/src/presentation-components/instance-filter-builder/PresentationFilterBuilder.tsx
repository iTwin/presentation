/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module InstancesFilter
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { PrimitiveValue, PropertyDescription, PropertyValueFormat } from "@itwin/appui-abstract";
import {
  isPropertyFilterRuleGroup,
  PropertyFilter,
  PropertyFilterBuilderRuleValue,
  PropertyFilterBuilderRuleValueRendererProps,
  PropertyFilterRule,
  PropertyFilterRuleGroup,
  PropertyFilterRuleGroupOperator,
  PropertyFilterRuleOperator,
} from "@itwin/components-react";
import { assert } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { Input } from "@itwin/itwinui-react";
import {
  ClassId,
  ClassInfo,
  Descriptor,
  InstanceFilterDefinition,
  Keys,
  PresentationError,
  PresentationStatus,
  PropertiesField,
} from "@itwin/presentation-common";
import { useSchemaMetadataContext } from "../common/SchemaMetadataContext";
import { findField } from "../common/Utils";
import { navigationPropertyEditorContext } from "../properties/editors/NavigationPropertyEditorContext";
import { UniquePropertyValuesSelector } from "../properties/inputs/UniquePropertyValuesSelector";
import { useQuantityValueInput, UseQuantityValueInputProps } from "../properties/inputs/UseQuantityValueInput";
import { GenericInstanceFilter } from "./GenericInstanceFilter";
import { createExpression, findBaseExpressionClass } from "./InstanceFilterConverter";
import { PresentationInstanceFilterProperty } from "./PresentationInstanceFilterProperty";
import {
  createInstanceFilterPropertyInfos,
  createPropertyInfoFromPropertiesField,
  getInstanceFilterFieldName,
  useFilterBuilderNavigationPropertyEditorContext,
} from "./Utils";

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
   * Converts [[PresentationInstanceFilter]] into [InstanceFilterDefinition]($presentation-common) that can be passed
   * to [PresentationManager]($presentation-frontend) through request options in order to filter results.
   * @beta
   */
  export async function toInstanceFilterDefinition(filter: PresentationInstanceFilter, imodel: IModelConnection): Promise<InstanceFilterDefinition> {
    const { rules, propertyClasses, relatedInstances } = GenericInstanceFilter.fromPresentationInstanceFilter(filter);
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

  /**
   * Function that checks if supplied [[PresentationInstanceFilter]] is [[PresentationInstanceFilterConditionGroup]].
   * @beta
   */
  export function isConditionGroup(filter: PresentationInstanceFilter): filter is PresentationInstanceFilterConditionGroup {
    return (filter as any).conditions !== undefined;
  }
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
export interface PresentationInstanceFilterPropertyInfo {
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

/**
 * Props for [[useInstanceFilterPropertyInfos]] hook.
 * @beta
 */
export interface UseInstanceFilterPropertyInfosProps {
  /** Descriptor to pull properties from. */
  descriptor: Descriptor;
}

/**
 * Custom hook that collects properties from descriptor for filter building.
 * @beta
 */
export function useInstanceFilterPropertyInfos({ descriptor }: UseInstanceFilterPropertyInfosProps) {
  const propertyInfos = useMemo(() => createInstanceFilterPropertyInfos(descriptor), [descriptor]);

  const propertyRenderer = useCallback(
    (name: string) => {
      const instanceFilterPropertyInfo = propertyInfos.find((info) => info.propertyDescription.name === name);
      assert(instanceFilterPropertyInfo !== undefined);
      return (
        <PresentationInstanceFilterProperty
          propertyDescription={instanceFilterPropertyInfo.propertyDescription}
          fullClassName={instanceFilterPropertyInfo.className}
          categoryLabel={instanceFilterPropertyInfo.categoryLabel}
        />
      );
    },
    [propertyInfos],
  );

  return {
    propertyInfos,
    propertyRenderer,
  };
}

/**
 * Props for [[PresentationFilterBuilderValueRenderer]].
 * @beta
 */
export interface PresentationFilterBuilderValueRendererProps extends PropertyFilterBuilderRuleValueRendererProps {
  /** iModel used to pull data from. */
  imodel: IModelConnection;
  /** Descriptor used to get properties for filter builder. */
  descriptor: Descriptor;
  /** Keys used to create the descriptor. */
  descriptorInputKeys?: Keys;
}

/**
 * Custom renderer of the filter rule value input. It extends default value input functionality:
 * - For `IsEqual` and `IsNotEqual` operators it renders a selector with unique property values. Unique values are collected from
 * the instances described by the descriptor ([[PresentationFilterBuilderValueRendererProps.descriptor]] and [[PresentationFilterBuilderValueRendererProps.descriptorInputKeys]]).
 * - For kind of quantity properties it renders input with units support.
 *
 * @beta
 */
export function PresentationFilterBuilderValueRenderer({ imodel, descriptor, descriptorInputKeys, ...props }: PresentationFilterBuilderValueRendererProps) {
  const navigationPropertyEditorContextValue = useFilterBuilderNavigationPropertyEditorContext(imodel, descriptor);
  const schemaMetadataContext = useSchemaMetadataContext();
  if (props.operator === PropertyFilterRuleOperator.IsEqual || props.operator === PropertyFilterRuleOperator.IsNotEqual) {
    return <UniquePropertyValuesSelector {...props} imodel={imodel} descriptor={descriptor} descriptorInputKeys={descriptorInputKeys} />;
  }

  if (props.property.quantityType && schemaMetadataContext) {
    const initialValue = (props.value as PrimitiveValue)?.value as number;
    return (
      <QuantityPropertyValue
        onChange={props.onChange}
        koqName={props.property.quantityType}
        schemaContext={schemaMetadataContext.schemaContext}
        initialRawValue={initialValue}
      />
    );
  }

  return (
    <navigationPropertyEditorContext.Provider value={navigationPropertyEditorContextValue}>
      <PropertyFilterBuilderRuleValue {...props} />
    </navigationPropertyEditorContext.Provider>
  );
}

function createPresentationInstanceFilterConditionGroup(descriptor: Descriptor, group: PropertyFilterRuleGroup): PresentationInstanceFilter {
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

function QuantityPropertyValue({
  onChange,
  ...koqInputProps
}: UseQuantityValueInputProps & { onChange: PropertyFilterBuilderRuleValueRendererProps["onChange"] }) {
  const { quantityValue, inputProps } = useQuantityValueInput(koqInputProps);

  const onChangeRef = useLatestRef(onChange);
  useEffect(() => {
    onChangeRef.current({ valueFormat: PropertyValueFormat.Primitive, value: quantityValue.rawValue, displayValue: quantityValue.formattedValue });
  }, [quantityValue, onChangeRef]);

  return <Input size="small" {...inputProps} />;
}

function useLatestRef<T>(value: T) {
  const valueRef = useRef<T>(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  return valueRef;
}
