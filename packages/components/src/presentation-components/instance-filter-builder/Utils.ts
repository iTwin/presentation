/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module InstancesFilter
 */

import { useMemo } from "react";
import { PrimitiveValue, PropertyDescription, PropertyValueFormat, StandardTypeNames } from "@itwin/appui-abstract";
import {
  defaultPropertyFilterBuilderRuleValidator,
  isUnaryPropertyFilterBuilderOperator,
  PropertyFilterBuilderRule,
  PropertyFilterBuilderRuleGroup,
  PropertyFilterBuilderRuleOperator,
  PropertyFilterBuilderRuleRangeValue,
} from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { CategoryDescription, ClassInfo, combineFieldNames, Descriptor, Field, NestedContentField, PropertiesField } from "@itwin/presentation-common";
import { createPropertyDescriptionFromFieldInfo } from "../common/ContentBuilder.js";
import { translate } from "../common/Utils.js";
import { NavigationPropertyEditorContextProviderProps } from "../properties/editors/NavigationPropertyEditorContext.js";
import { PresentationInstanceFilterPropertyInfo } from "./PresentationFilterBuilder.js";

/** @internal */
export function createInstanceFilterPropertyInfos(descriptor: Descriptor): PresentationInstanceFilterPropertyInfo[] {
  const propertyInfos = new Array<PresentationInstanceFilterPropertyInfo>();
  for (const field of descriptor.fields) {
    propertyInfos.push(...createPropertyInfos(field));
  }
  return propertyInfos;
}

/** @internal */
export function getInstanceFilterFieldName(property: PropertyDescription) {
  const [_, fieldName] = property.name.split(INSTANCE_FILTER_FIELD_SEPARATOR);
  return fieldName;
}

/** @internal */
export const DEFAULT_ROOT_CATEGORY_NAME = "/selected-item/";

function getPropertySourceClassInfo(field: PropertiesField | NestedContentField): ClassInfo[] {
  if (field.parent) {
    return getPropertySourceClassInfo(field.parent);
  }

  if (field.isPropertiesField()) {
    return field.properties.map((fieldProperty) => {
      return fieldProperty.property.classInfo;
    });
  }
  return [field.pathToPrimaryClass[field.pathToPrimaryClass.length - 1].targetClassInfo];
}

function getPropertyClassInfo(field: PropertiesField): ClassInfo {
  if (field.parent && field.parent.isNestedContentField()) {
    return field.parent.contentClassInfo;
  }

  return field.properties[0].property.classInfo;
}

function createPropertyInfos(field: Field): PresentationInstanceFilterPropertyInfo[] {
  if (field.isNestedContentField()) {
    return field.nestedFields.flatMap((nestedField) => createPropertyInfos(nestedField));
  }
  if (field.isPropertiesField()) {
    return [createPropertyInfoFromPropertiesField(field)];
  }
  /* c8 ignore next 3 */
  return [];
}

interface CategoryInfo {
  name?: string;
  label?: string;
}

function getCategoryInfo(category: CategoryDescription, categoryInfo: CategoryInfo): CategoryInfo {
  if (category.name === DEFAULT_ROOT_CATEGORY_NAME) {
    return categoryInfo;
  }

  const newInfo = {
    name: categoryInfo.name ? `${category.name}/${categoryInfo.name}` : `${category.name}`,
    label: categoryInfo.label ? `${category.label} | ${categoryInfo.label}` : `${category.label}`,
  };

  return category.parent ? getCategoryInfo(category.parent, newInfo) : newInfo;
}

function getParentNames(field: Field, name: string): string {
  if (!field.parent) {
    return combineFieldNames(name, field.name);
  }
  return getParentNames(field.parent, combineFieldNames(name, field.name));
}

/** @internal */
export function createPropertyInfoFromPropertiesField(field: PropertiesField): PresentationInstanceFilterPropertyInfo {
  const categoryInfo = getCategoryInfo(field.category, { name: undefined, label: undefined });
  const name = field.parent ? getParentNames(field.parent, field.name) : field.name;

  const propertyDescription = createPropertyDescriptionFromFieldInfo({
    name: getCategorizedFieldName(name, categoryInfo.name),
    label: field.label,
    type: field.type,
    editor: field.editor,
    enum: field.properties[0].property.enumerationInfo,
    isReadonly: field.isReadonly,
    renderer: field.renderer,
    koqName: field.properties[0].property.kindOfQuantity?.name,
  });

  return {
    field,
    sourceClassIds: getPropertySourceClassInfo(field).map((classInfo) => classInfo.id),
    propertyDescription,
    categoryLabel: categoryInfo.label,
    className: getPropertyClassInfo(field).name,
  };
}

/** @internal */
export function isFilterNonEmpty(rootGroup: PropertyFilterBuilderRuleGroup) {
  return rootGroup.items.length > 1 || (rootGroup.items.length === 1 && rootGroup.items[0].operator !== undefined);
}

/** @internal */
export const INSTANCE_FILTER_FIELD_SEPARATOR = "#";
function getCategorizedFieldName(fieldName: string, categoryName?: string) {
  return `${categoryName ?? ""}${INSTANCE_FILTER_FIELD_SEPARATOR}${fieldName}`;
}

/** @internal */
export function useFilterBuilderNavigationPropertyEditorContextProviderProps(imodel: IModelConnection, descriptor: Descriptor) {
  return useMemo<NavigationPropertyEditorContextProviderProps>(
    () => ({
      imodel,
      getNavigationPropertyInfo: async (property) => {
        const field = descriptor.getFieldByName(getInstanceFilterFieldName(property));
        if (!field || !field.isPropertiesField()) {
          return undefined;
        }

        return field.properties[0].property.navigationPropertyInfo;
      },
    }),
    [imodel, descriptor],
  );
}

/** @internal */
export function filterRuleValidator(item: PropertyFilterBuilderRule) {
  // skip empty rules and rules that do not require value
  if (item.property === undefined || item.operator === undefined || isUnaryPropertyFilterBuilderOperator(item.operator)) {
    return undefined;
  }

  /* c8 ignore next 3 */
  if (item.value !== undefined && item.value.valueFormat !== PropertyValueFormat.Primitive) {
    return undefined;
  }

  const error = numericPropertyValidator({
    property: item.property,
    operator: item.operator,
    value: item.value,
  });

  if (error) {
    return error;
  }

  // TODO: refactor to `useDefaultPropertyFilterBuilderRuleValidator` after AppUI peer dep bumped to 5.0
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  return defaultPropertyFilterBuilderRuleValidator(item);
}

interface ValidatorContext {
  property: PropertyDescription;
  operator: PropertyFilterBuilderRuleOperator;
  value?: PrimitiveValue;
}

function numericPropertyValidator({ property, value, operator }: ValidatorContext) {
  // If equality operator is set the value should not be validated since it is supplied by the `UniquePropertyValuesSelector`.
  if (!isPropertyNumeric(property.typename) || value === undefined || isEqualityOperator(operator)) {
    return undefined;
  }

  function getErrorMessage() {
    return property.quantityType === undefined
      ? translate("instance-filter-builder.error-messages.not-a-number")
      : translate("instance-filter-builder.error-messages.invalid");
  }

  if (operator === "between") {
    const { from, to } = PropertyFilterBuilderRuleRangeValue.parse(value);
    return isInvalidNumericValue(from) || isInvalidNumericValue(to) ? getErrorMessage() : undefined;
  }

  if (isInvalidNumericValue(value)) {
    return getErrorMessage();
  }

  return undefined;
}

function isEqualityOperator(operator: PropertyFilterBuilderRuleOperator) {
  return operator === "is-equal" || operator === "is-not-equal";
}

function isPropertyNumeric(typename: string) {
  return (
    typename === StandardTypeNames.Number || typename === StandardTypeNames.Int || typename === StandardTypeNames.Float || typename === StandardTypeNames.Double
  );
}

function isInvalidNumericValue(value: PrimitiveValue) {
  return value.displayValue && isNaN(Number(value.value));
}
