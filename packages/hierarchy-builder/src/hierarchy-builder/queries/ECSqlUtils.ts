/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PrimitiveValue, PrimitiveValueType, TypedPrimitiveValue } from "../values/Values";

/**
 * A union of property types that need special handling when creating a property value selector.
 * @see [[createPropertyValueSelector]]
 * @beta
 */
export type SpecialPropertyType = "Navigation" | "Guid" | "Point2d" | "Point3d";

/**
 * Creates a value selector, given class alias and property name. Example result: `[classAlias].[PropertyName]`.
 * @beta
 */
export function createPropertyValueSelector(classAlias: string, propertyName: string): string;
/**
 * Creates a value selector for special property types:
 * - `Navigation`: `["[classAlias].[PropertyName].[Id]", "Id"]`.
 * - `Guid`: `["GuidToStr([classAlias].[PropertyName])", "String"]`.
 * - `Point2d`: `["json_object('x': [classAlias].[PropertyName].[x], 'y': [classAlias].[PropertyName].[y])", "Point2d"]`.
 * - `Point3d`: `["json_object('x': [classAlias].[PropertyName].[x], 'y': [classAlias].[PropertyName].[y], 'z': [classAlias].[PropertyName].[z])", "Point3d"]`.
 *
 * @beta
 */
export function createPropertyValueSelector(classAlias: string, propertyName: string, specialType: SpecialPropertyType): [string, PrimitiveValueType];
/** @beta */
export function createPropertyValueSelector(
  classAlias: string,
  propertyName: string,
  specialType?: SpecialPropertyType,
): string | [string, PrimitiveValueType] {
  const propertySelector = `[${classAlias}].[${propertyName}]`;
  if (!specialType) {
    return propertySelector;
  }
  switch (specialType) {
    case "Navigation":
      return [`${propertySelector}.[Id]`, "Id"];
    case "Guid":
      return [`GuidToStr(${propertySelector})`, "String"];
    case "Point2d":
      return [`json_object('x', ${propertySelector}.[x], 'y', ${propertySelector}.[y])`, "Point2d"];
    case "Point3d":
      return [`json_object('x', ${propertySelector}.[x], 'y', ${propertySelector}.[y], 'z', ${propertySelector}.[z])`, "Point3d"];
  }
}

/**
 * Creates a clause for returning `NULL` when `checkSelector` returns `NULL`, or result of `valueSelector`
 * otherwise. Example result: `IIF(CHECK_SELECTOR IS NOT NULL, VALUE_SELECTOR, NULL)`.
 *
 * @beta
 */
export function createNullableSelector(props: { checkSelector: string; valueSelector: string }): string {
  return `IIF(${props.checkSelector} IS NOT NULL, ${props.valueSelector}, NULL)`;
}

/**
 * Props for selecting property value along with its metadata.
 *
 * It's recommended to only select properties with metadata only when they need additional formatting and
 * otherwise use [[createPropertyValueSelector]] to select their value.
 *
 * @beta
 */
export interface PropertyValueSelectClauseProps {
  /** Full class name of the property. Format: `SchemaName.ClassName`. */
  propertyClassName: string;
  /** Query alias of the class that contains the property. */
  propertyClassAlias: string;
  /** Name of the property. */
  propertyName: string;
  /** Special type of the property if it matches any. */
  specialType?: SpecialPropertyType;
  /**
   * Indication of how `NULL` property values should be handled:
   * - `null` means that selector will result in `NULL` value if the property value is `NULL`.
   * - `selector` means that selector will return a valid JSON object with `NULL` property value stored inside it.
   */
  nullValueResult?: "null" | "selector";
}

/**
 * Props for selecting a primitive value using given ECSQL selector.
 * @beta
 */
export interface PrimitiveValueSelectorProps {
  /** ECSQL selector to query the value */
  selector: string;
  /** Type of the value. Defaults to `String`. */
  type?: PrimitiveValueType;
  /**
   * Indication of how `NULL` property values should be handled:
   * - `null` means that selector will result in `NULL` value if the property value is `NULL`.
   * - `selector` means that selector will return a valid JSON object with `NULL` property value stored inside it.
   *
   * Defaults to `null`.
   */
  nullValueResult?: "null" | "selector";
}

/**
 * A union of prop types for selecting a value and its metadata in ECSQL query.
 * @see [[createTypedValueSelector]]
 * @beta
 */
export type TypedValueSelectClauseProps = PropertyValueSelectClauseProps | TypedPrimitiveValue | PrimitiveValueSelectorProps;

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace TypedValueSelectClauseProps {
  /** @beta */
  export function isPropertySelector(props: TypedValueSelectClauseProps): props is PropertyValueSelectClauseProps {
    return !!(props as PropertyValueSelectClauseProps).propertyName;
  }
  /** @beta */
  export function isPrimitiveValue(props: TypedValueSelectClauseProps): props is TypedPrimitiveValue {
    return !!(props as TypedPrimitiveValue).value;
  }
  /** @beta */
  export function isPrimitiveValueSelector(props: TypedValueSelectClauseProps): props is PrimitiveValueSelectorProps {
    return !!(props as PrimitiveValueSelectorProps).selector;
  }
}

/**
 * Create a selector combined of multiple typed value selectors in a form of a JSON array. This allows handling results
 * of each value selector individually when parsing query result.
 *
 * Example result: `json_array(VALUE_SELECTOR_1, VALUE_SELECTOR_2, ...)`.
 *
 * Optionally, the function also accepts a `checkSelector` argument, which can be used to make the selector return
 * `NULL` result when the argument selector results in `NULL`. Example result with `checkSelector`:
 * `IIF(CHECK_SELECTOR, json_array(VALUE_SELECTOR_1, VALUE_SELECTOR_2, ...), NULL)`.
 *
 * @beta
 */
export function createConcatenatedTypedValueSelector(selectors: TypedValueSelectClauseProps[], checkSelector?: string) {
  if (selectors.length === 0) {
    return "''";
  }
  const combinedSelectors = `json_array(${selectors.map(createTypedValueSelector).join(", ")})`;
  if (checkSelector) {
    return createNullableSelector({ checkSelector, valueSelector: combinedSelectors });
  }
  return combinedSelectors;
}

/**
 * Creates an ECSQL selector for a value and its metadata based on given props.
 * @beta
 */
export function createTypedValueSelector(props: TypedValueSelectClauseProps): string {
  if (TypedValueSelectClauseProps.isPropertySelector(props)) {
    if (props.specialType) {
      // eslint-disable-next-line @typescript-eslint/no-shadow
      const [valueSelector, typeOverride] = createPropertyValueSelector(props.propertyClassAlias, props.propertyName, props.specialType);
      return createTypedValueSelector({ selector: valueSelector, type: typeOverride, nullValueResult: props.nullValueResult });
    }
    const valueSelector = createPropertyValueSelector(props.propertyClassAlias, props.propertyName);
    // note: json object's structure must match `PropertyValue` interface
    const typedSelector = `
      json_object(
        'className', '${props.propertyClassName}',
        'propertyName', '${props.propertyName}',
        'value', ${valueSelector}
      )
    `;
    return withNullSelectorHandling({ nullValueResult: props.nullValueResult, valueSelector: typedSelector, checkSelector: valueSelector });
  }
  if (TypedValueSelectClauseProps.isPrimitiveValueSelector(props)) {
    if (props.type) {
      const typedSelector = `
        json_object(
          'value', ${props.selector},
          'type', '${props.type}'
        )
      `;
      return withNullSelectorHandling({ nullValueResult: props.nullValueResult, valueSelector: typedSelector, checkSelector: props.selector });
    }
    return props.selector;
  }
  return `
    json_object(
      'value', ${createPrimitiveValueSelector(props.value)},
      'type', '${props.type}'
    )
  `;
}

function withNullSelectorHandling(props: { nullValueResult?: "null" | "selector"; valueSelector: string; checkSelector: string }) {
  const { checkSelector, valueSelector, nullValueResult } = props;
  return nullValueResult === "null" ? createNullableSelector({ valueSelector, checkSelector }) : valueSelector;
}

function createPrimitiveValueSelector(value: PrimitiveValue) {
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  if (PrimitiveValue.isPoint3d(value)) {
    return `json_object('x', ${value.x}, 'y', ${value.y}, 'z', ${value.z})`;
  }
  if (PrimitiveValue.isPoint2d(value)) {
    return `json_object('x', ${value.x}, 'y', ${value.y})`;
  }
  switch (typeof value) {
    case "string":
      return `'${value}'`;
    case "number":
      return value.toString();
    case "boolean":
      return `CAST(${value ? "1" : "0"} AS BOOLEAN)`;
  }
}
