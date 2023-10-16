/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module InstancesFilter
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { PrimitiveValue, PropertyValueFormat } from "@itwin/appui-abstract";
import {
  isPropertyFilterRuleGroup,
  PropertyFilter,
  PropertyFilterBuilderRuleValue,
  PropertyFilterBuilderRuleValueRendererProps,
  PropertyFilterRule,
  PropertyFilterRuleGroup,
  PropertyFilterRuleOperator,
} from "@itwin/components-react";
import { assert } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { Input } from "@itwin/itwinui-react";
import { Descriptor, Keys } from "@itwin/presentation-common";
import { useSchemaMetadataContext } from "../common/SchemaMetadataContext";
import { findField } from "../common/Utils";
import { navigationPropertyEditorContext } from "../properties/editors/NavigationPropertyEditorContext";
import { UniquePropertyValuesSelector } from "../properties/inputs/UniquePropertyValuesSelector";
import { useQuantityValueInput, UseQuantityValueInputProps } from "../properties/inputs/UseQuantityValueInput";
import { PresentationInstanceFilterProperty } from "./PresentationInstanceFilterProperty";
import {
  isPresentationInstanceFilterConditionGroup,
  PresentationInstanceFilter,
  PresentationInstanceFilterCondition,
  PresentationInstanceFilterConditionGroup,
} from "./Types";
import {
  createInstanceFilterPropertyInfos,
  createPropertyInfoFromPropertiesField,
  getInstanceFilterFieldName,
  useFilterBuilderNavigationPropertyEditorContext,
} from "./Utils";

/**
 * Props for [[usePropertyInfos]] hook.
 * @beta
 */
export interface UsePropertyInfoProps {
  /** Descriptor to pull properties from. */
  descriptor: Descriptor;
}

/**
 * Custom hook that collects properties from descriptor for filter building.
 * @beta
 */
export function usePropertyInfos({ descriptor }: UsePropertyInfoProps) {
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
  /** Keys used to created descriptor. */
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

/**
 * Converts filter built by [usePropertyFilterBuilder]($components-react) into presentation specific format.
 * @beta
 */
export function createPresentationInstanceFilter(descriptor: Descriptor, filter: PropertyFilter): PresentationInstanceFilter | undefined {
  if (isPropertyFilterRuleGroup(filter)) {
    return createPresentationInstanceFilterConditionGroup(descriptor, filter);
  }
  return createPresentationInstanceFilterCondition(descriptor, filter);
}

/**
 * Converts [[PresentationInstanceFilter]] into format used by [usePropertyFilterBuilder]($components-react).
 * @beta
 */
export function convertPresentationFilterToPropertyFilter(descriptor: Descriptor, filter: PresentationInstanceFilter): PropertyFilter | undefined {
  if (isPresentationInstanceFilterConditionGroup(filter)) {
    return convertPresentationInstanceFilterConditionGroup(filter, descriptor);
  }
  return convertPresentationInstanceFilterCondition(filter, descriptor);
}

function createPresentationInstanceFilterConditionGroup(descriptor: Descriptor, group: PropertyFilterRuleGroup): PresentationInstanceFilter | undefined {
  const conditions = new Array<PresentationInstanceFilter>();
  for (const rule of group.rules) {
    const condition = createPresentationInstanceFilter(descriptor, rule);
    if (!condition) {
      return undefined;
    }
    conditions.push(condition);
  }

  if (conditions.length === 0) {
    return undefined;
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return {
    operator: group.operator,
    conditions,
  };
}

function createPresentationInstanceFilterCondition(descriptor: Descriptor, condition: PropertyFilterRule): PresentationInstanceFilterCondition | undefined {
  const field = findField(descriptor, getInstanceFilterFieldName(condition.property));
  if (!field || !field.isPropertiesField()) {
    return undefined;
  }
  if (condition.value && condition.value.valueFormat !== PropertyValueFormat.Primitive) {
    return undefined;
  }
  return {
    operator: condition.operator,
    field,
    value: condition.value,
  };
}

function convertPresentationInstanceFilterCondition(filter: PresentationInstanceFilterCondition, descriptor: Descriptor) {
  const field = descriptor.getFieldByName(filter.field.name, true);
  if (!field || !field.isPropertiesField()) {
    return undefined;
  }
  return {
    property: createPropertyInfoFromPropertiesField(field).propertyDescription,
    operator: filter.operator,
    value: filter.value,
  };
}

function convertPresentationInstanceFilterConditionGroup(filter: PresentationInstanceFilterConditionGroup, descriptor: Descriptor) {
  const rules: PropertyFilter[] = [];
  for (const condition of filter.conditions) {
    const rule = convertPresentationFilterToPropertyFilter(descriptor, condition);
    if (!rule) {
      return undefined;
    }
    rules.push(rule);
  }
  return {
    operator: filter.operator,
    rules,
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
