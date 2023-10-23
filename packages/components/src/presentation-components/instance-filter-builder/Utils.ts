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
  isUnaryPropertyFilterOperator,
  PropertyFilterBuilderRule,
  PropertyFilterRuleOperator,
} from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { CategoryDescription, ClassInfo, combineFieldNames, Descriptor, Field, NestedContentField, PropertiesField } from "@itwin/presentation-common";
import { createPropertyDescriptionFromFieldInfo } from "../common/ContentBuilder";
import { translate } from "../common/Utils";
import { NavigationPropertyEditorContextProps } from "../properties/editors/NavigationPropertyEditorContext";
import { PresentationInstanceFilterPropertyInfo } from "./PresentationFilterBuilder";

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

function getPropertySourceClassInfo(field: PropertiesField | NestedContentField): ClassInfo {
  if (field.parent) {
    return getPropertySourceClassInfo(field.parent);
  }

  if (field.isPropertiesField()) {
    return field.properties[0].property.classInfo;
  }
  return field.pathToPrimaryClass[field.pathToPrimaryClass.length - 1].targetClassInfo;
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
  // istanbul ignore else
  if (field.isPropertiesField()) {
    return [createPropertyInfoFromPropertiesField(field)];
  }
  // istanbul ignore next
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
    sourceClassId: getPropertySourceClassInfo(field).id,
    propertyDescription,
    categoryLabel: categoryInfo.label,
    className: getPropertyClassInfo(field).name,
  };
}

/** @internal */
export const INSTANCE_FILTER_FIELD_SEPARATOR = "#";
function getCategorizedFieldName(fieldName: string, categoryName?: string) {
  return `${categoryName ?? ""}${INSTANCE_FILTER_FIELD_SEPARATOR}${fieldName}`;
}

/** @internal */
export function useFilterBuilderNavigationPropertyEditorContext(imodel: IModelConnection, descriptor: Descriptor) {
  return useMemo<NavigationPropertyEditorContextProps>(
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
  if (item.property === undefined || item.operator === undefined || isUnaryPropertyFilterOperator(item.operator)) {
    return undefined;
  }

  // istanbul ignore if
  if (item.value !== undefined && item.value.valueFormat !== PropertyValueFormat.Primitive) {
    return undefined;
  }

  const error = combineValidators(
    quantityPropertyValidator,
    numericPropertyValidator,
  )({
    property: item.property,
    operator: item.operator,
    value: item.value,
  });

  if (error) {
    return error;
  }

  return defaultPropertyFilterBuilderRuleValidator(item);
}

function combineValidators(...validators: Array<(ctx: ValidatorContext) => string | undefined>) {
  return (ctx: ValidatorContext) => {
    for (const validator of validators) {
      const error = validator(ctx);
      if (error) {
        return error;
      }
    }
    return undefined;
  };
}

interface ValidatorContext {
  property: PropertyDescription;
  operator: PropertyFilterRuleOperator;
  value?: PrimitiveValue;
}

function quantityPropertyValidator({ property, value }: ValidatorContext) {
  // rules with non quantity properties or without values
  if (property.quantityType === undefined || value === undefined) {
    return undefined;
  }
  if (isInvalidNumericValue(value)) {
    return translate("instance-filter-builder.error-messages.invalid");
  }

  return undefined;
}

function numericPropertyValidator({ property, value }: ValidatorContext) {
  if (!isPropertyNumeric(property.typename) || value === undefined) {
    return undefined;
  }

  if (isInvalidNumericValue(value)) {
    return translate("instance-filter-builder.error-messages.not-a-number");
  }

  return undefined;
}

function isPropertyNumeric(typename: string) {
  return (
    typename === StandardTypeNames.Number || typename === StandardTypeNames.Int || typename === StandardTypeNames.Float || typename === StandardTypeNames.Double
  );
}

function isInvalidNumericValue(value: PrimitiveValue) {
  return value.displayValue !== undefined && value.displayValue !== "" && isNaN(Number(value.value));
}
