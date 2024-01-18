/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64 } from "@itwin/core-bentley";
import { PrimitiveValueType } from "../../Metadata";
import { PrimitiveValue, TypedPrimitiveValue } from "../../values/Values";

/**
 * A union of property types that need special handling when creating a property value selector.
 * For example, Guid values are stored as binary and need to be selected with `GuidToStr` function to
 * get a meaningful value.
 *
 * @beta
 */
export type SpecialPropertyType = "Navigation" | "Guid" | "Point2d" | "Point3d";

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
 * Creates an ECSQL selector for raw property value, or, optionally - it's component. Example result:
 * `[classAlias].[propertyName].[componentName]`.
 *
 * @beta
 */
export function createRawPropertyValueSelector(classAlias: string, propertyName: string, componentName?: string): string {
  let propertySelector = `[${classAlias}].[${propertyName}]`;
  if (componentName) {
    propertySelector += `.[${componentName}]`;
  }
  return propertySelector;
}

/**
 * Creates an ECSQL selector for a raw primitive value.
 * - `undefined` is selected as `NULL`.
 * - `Date` values are selected in julian day format.
 * - `Point2d` and `Point3d` values are selected as serialized JSON objects, e.g. `{ x: 1, y: 2, z: 3 }`.
 * - Other kinds of values are selected as-is.
 *
 * @beta
 */
export function createRawPrimitiveValueSelector(value: PrimitiveValue | undefined) {
  if (value === undefined) {
    return "NULL";
  }
  if (value instanceof Date) {
    return `julianday('${value.toISOString()}')`;
  }
  if (PrimitiveValue.isPoint3d(value)) {
    return `json_object('x', ${value.x}, 'y', ${value.y}, 'z', ${value.z})`;
  }
  if (PrimitiveValue.isPoint2d(value)) {
    return `json_object('x', ${value.x}, 'y', ${value.y})`;
  }
  switch (typeof value) {
    case "string":
      return Id64.isId64(value) ? value : `'${value}'`;
    case "number":
      return value.toString();
    case "boolean":
      return value ? "TRUE" : "FALSE";
  }
}

/**
 * Creates a clause for returning `NULL` when `checkSelector` returns a falsy value, or result of `valueSelector`
 * otherwise. Example result: `IIF(CHECK_SELECTOR, VALUE_SELECTOR, NULL)`.
 *
 * @note In SQL `NULL` is not considered falsy, so when checking for `NULL` values, the `checkSelector` should
 * be like `{selector} IS NOT NULL`.
 *
 * @beta
 */
export function createNullableSelector(props: { checkSelector: string; valueSelector: string }): string {
  return `IIF(${props.checkSelector}, ${props.valueSelector}, NULL)`;
}

/**
 * Create an ECSQL selector combined of multiple typed value selectors in a form of a JSON array. This allows handling results
 * of each value selector individually when parsing query result.
 *
 * Example result: `json_array(VALUE_SELECTOR_1, VALUE_SELECTOR_2, ...)`.
 *
 * Optionally, the function also accepts a `checkSelector` argument, which can be used to make the selector return
 * `NULL` result when the argument selector results in `NULL`. Example result with `checkSelector`:
 * `IIF(CHECK_SELECTOR, json_array(VALUE_SELECTOR_1, VALUE_SELECTOR_2, ...), NULL)`.
 *
 * @note The resulting JSON is of [[ConcatenatedValue]] type and it's recommended to use [[ConcatenatedValue.serialize]] to
 * handle each individual part.
 *
 * @see ConcatenatedValue
 *
 * @beta
 */
export function createConcatenatedValueJsonSelector(selectors: TypedValueSelectClauseProps[], checkSelector?: string) {
  const combinedSelectors = `json_array(${selectors.map((sel) => createTypedValueJsonSelector(sel)).join(", ")})`;
  if (checkSelector) {
    return createNullableSelector({ checkSelector, valueSelector: combinedSelectors });
  }
  return combinedSelectors;
}
function createTypedValueJsonSelector(props: TypedValueSelectClauseProps): string {
  if (TypedValueSelectClauseProps.isPropertySelector(props)) {
    if (props.specialType) {
      // eslint-disable-next-line @typescript-eslint/no-shadow
      const [valueSelector, typeOverride] = createSpecialPropertyValueJsonSelector(props.propertyClassAlias, props.propertyName, props.specialType);
      return createTypedValueJsonSelector({ selector: valueSelector, type: typeOverride });
    }
    return `
      json_object(
        'className', '${props.propertyClassName}',
        'propertyName', '${props.propertyName}',
        'value', ${createRawPropertyValueSelector(props.propertyClassAlias, props.propertyName)}
      )
    `;
  }
  if (TypedValueSelectClauseProps.isPrimitiveValueSelector(props)) {
    if (props.type) {
      return `
        json_object(
          'value', ${props.selector},
          'type', '${props.type}'
        )
      `;
    }
    return props.selector;
  }
  return `
    json_object(
      'value', ${createPrimitiveValueJsonSelector(props.value)},
      'type', '${props.type}'
    )
  `;
}
function createSpecialPropertyValueJsonSelector(classAlias: string, propertyName: string, specialType: SpecialPropertyType): [string, PrimitiveValueType] {
  const propertySelector = `[${classAlias}].[${propertyName}]`;
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
function createPrimitiveValueJsonSelector(value: PrimitiveValue) {
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
      return Id64.isId64(value) ? value : `'${value}'`;
    case "number":
      return value.toString();
    case "boolean":
      return value ? "TRUE" : "FALSE";
  }
}

/**
 * Create an ECSQL selector combined of multiple typed value selectors in a form of a string.
 *
 * Example result: `VALUE_SELECTOR_1 || VALUE_SELECTOR_2 || ...`.
 *
 * Optionally, the function also accepts a `checkSelector` argument, which can be used to make the selector return
 * `NULL` result when `checkSelector` results in a falsy value. Example result with `checkSelector`:
 * `IIF(CHECK_SELECTOR, VALUE_SELECTOR_1 || VALUE_SELECTOR_2 || ..., NULL)`.
 *
 * @note Not all types of [[TypedValueSelectClauseProps]] can be serialized to a user-friendly string, e.g. when
 * selecting a numeric value with units, this function is going to select the raw value. To create properly formatted
 * concatenated values:
 * 1. They should be selected with [[createConcatenatedValueJsonSelector]], which returns a serialized JSON object.
 * 2. The JSON should be parsed from resulting string and passed to [[ConcatenatedValue.serialize]], which additionally
 *    takes a formatter. One can be created using [[createDefaultValueFormatter]].
 *
 * @beta
 */
export function createConcatenatedValueStringSelector(selectors: TypedValueSelectClauseProps[], checkSelector?: string) {
  const combinedSelectors = selectors.length ? selectors.map((sel) => createTypedValueStringSelector(sel)).join(" || ") : "''";
  if (checkSelector) {
    return createNullableSelector({ checkSelector, valueSelector: combinedSelectors });
  }
  return combinedSelectors;
}
function createTypedValueStringSelector(props: TypedValueSelectClauseProps): string {
  if (TypedValueSelectClauseProps.isPropertySelector(props)) {
    if (props.specialType) {
      // eslint-disable-next-line @typescript-eslint/no-shadow
      const [valueSelector, typeOverride] = createSpecialPropertyValueStringSelector(props.propertyClassAlias, props.propertyName, props.specialType);
      return createTypedValueStringSelector({ selector: valueSelector, type: typeOverride });
    }
    return createRawPropertyValueSelector(props.propertyClassAlias, props.propertyName);
  }
  if (TypedValueSelectClauseProps.isPrimitiveValueSelector(props)) {
    return props.selector;
  }
  return createPrimitiveValueStringSelector(props.value);
}
function createSpecialPropertyValueStringSelector(classAlias: string, propertyName: string, specialType: SpecialPropertyType): [string, PrimitiveValueType] {
  const propertySelector = createRawPropertyValueSelector(classAlias, propertyName);
  switch (specialType) {
    case "Navigation":
      return [`CAST(${propertySelector}.[Id] AS TEXT)`, "Id"];
    case "Guid":
      return [`GuidToStr(${propertySelector})`, "String"];
    case "Point2d":
      return [`'(' || ${propertySelector}.[x] || ', ' || ${propertySelector}.[y] || ')'`, "Point2d"];
    case "Point3d":
      return [`'(' || ${propertySelector}.[x] || ', ' || ${propertySelector}.[y] || ', ' || ${propertySelector}.[z] || ')'`, "Point3d"];
  }
}
function createPrimitiveValueStringSelector(value: PrimitiveValue) {
  if (value instanceof Date) {
    return `'${value.toLocaleString()}'`;
  }
  if (PrimitiveValue.isPoint3d(value)) {
    return `'(${value.x}, ${value.y}, ${value.z})'`;
  }
  if (PrimitiveValue.isPoint2d(value)) {
    return `'(${value.x}, ${value.y})'`;
  }
  return `'${value.toString()}'`;
}
