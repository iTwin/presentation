/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64 } from "@itwin/core-bentley";
import { getClass } from "../Metadata.js";
import { PrimitiveValue } from "../Values.js";

import type { ECSchemaProvider, PrimitiveValueType } from "../Metadata.js";
import type { TypedPrimitiveValue } from "../Values.js";

/**
 * Props for selecting a `TypedPrimitiveValue` using given ECSQL selector.
 * @public
 */
type TypedPrimitiveValueSelectorProps = {
  /** ECSQL selector to query the value */
  selector: string;
} & (
  | {
      /** Type of the value. Defaults to `String`. */
      type?: undefined;
    }
  | {
      type: Exclude<PrimitiveValueType, "Double">;
      extendedType?: string;
    }
  | {
      type: Extract<PrimitiveValueType, "Double">;
      extendedType?: string;
      koqName?: string;
    }
);

/**
 * A union of prop types for selecting a value and its metadata in ECSQL query.
 * @public
 */
export type TypedValueSelectClauseProps = TypedPrimitiveValue | TypedPrimitiveValueSelectorProps;

/** @public */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace TypedValueSelectClauseProps {
  export function isPrimitiveValue(props: TypedValueSelectClauseProps): props is TypedPrimitiveValue {
    return "value" in props;
  }
  export function isPrimitiveValueSelector(props: TypedValueSelectClauseProps): props is TypedPrimitiveValueSelectorProps {
    return "selector" in props;
  }
}

/**
 * A function for a creating a `TypedPrimitiveValueSelectorProps` object from given primitive ECProperty information.
 * @throws Error if the property is not found, is not primitive or has unsupported primitive type (Binary, IGeometry).
 * @public
 */
export async function createPrimitivePropertyValueSelectorProps({
  schemaProvider,
  propertyClassAlias,
  propertyClassName,
  propertyName,
}: {
  /** Access to schema information. */
  schemaProvider: ECSchemaProvider;
  /** Full class name of the property. Format: `SchemaName.ClassName`. */
  propertyClassName: string;
  /** Query alias of the class that contains the property. */
  propertyClassAlias: string;
  /** Name of the property to create `TypedPrimitiveValue` for. */
  propertyName: string;
}): Promise<TypedPrimitiveValueSelectorProps> {
  const ecClass = await getClass(schemaProvider, propertyClassName);
  const property = await ecClass.getProperty(propertyName);
  if (!property) {
    throw new Error(`The property "${propertyName}" not found in class "${propertyClassName}".`);
  }

  const propertySelector = createRawPropertyValueSelector(propertyClassAlias, propertyName);

  if (property.isNavigation()) {
    return { selector: `${propertySelector}.[Id]`, type: "Id" };
  }

  if (!property.isPrimitive()) {
    throw new Error(`The property "${propertyName}" should be of either navigation or primitive type.`);
  }

  const propertyValueType = property.primitiveType;
  const extendedType = property.extendedTypeName;

  switch (propertyValueType) {
    case "IGeometry":
      throw new Error(`The property "${propertyName}" of type "IGeometry" is not supported.`);
    case "Binary":
      if (extendedType === "BeGuid") {
        return { selector: `GuidToStr(${propertySelector})`, type: "String" };
      }
      throw new Error(`The property "${propertyName}" of type "Binary" is not supported.`);
    case "Point2d":
      return {
        selector: `json_object('x', ${propertySelector}.[x], 'y', ${propertySelector}.[y])`,
        type: "Point2d",
        ...(extendedType ? { extendedType } : /* c8 ignore next */ {}),
      };
    case "Point3d":
      return {
        selector: `json_object('x', ${propertySelector}.[x], 'y', ${propertySelector}.[y], 'z', ${propertySelector}.[z])`,
        type: "Point3d",
        ...(extendedType ? { extendedType } : /* c8 ignore next */ {}),
      };
    case "Double":
      const koqName = (await property.kindOfQuantity)?.fullName;
      return {
        selector: propertySelector,
        type: "Double",
        ...(extendedType ? { extendedType } : /* c8 ignore next */ {}),
        ...(koqName ? { koqName } : /* c8 ignore next */ {}),
      };
  }
  return {
    selector: propertySelector,
    type: propertyValueType,
    ...(extendedType ? { extendedType } : /* c8 ignore next */ {}),
  };
}

/**
 * Creates an ECSQL selector for raw property value, or, optionally - it's component. Example result:
 * `[classAlias].[propertyName].[componentName]`.
 *
 * @public
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
 * @public
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
 * Creates an ECSQL selector that results in a stringified `InstanceKey` object.
 * @public
 */
export function createInstanceKeySelector(props: { alias: string }) {
  const classIdSelector = `[${props.alias}].[ECClassId]`;
  const instanceHexIdSelector = `IdToHex([${props.alias}].[ECInstanceId])`;
  return `json_object('className', ec_classname(${classIdSelector}, 's.c'), 'id', ${instanceHexIdSelector})`;
}

/**
 * Creates a clause for returning `NULL` when `checkSelector` returns a falsy value, or result of `valueSelector`
 * otherwise. Example result: `IIF(CHECK_SELECTOR, VALUE_SELECTOR, NULL)`.
 *
 * @note In SQL `NULL` is not considered falsy, so when checking for `NULL` values, the `checkSelector` should
 * be like `{selector} IS NOT NULL` rather than just `${selector}`.
 *
 * @public
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
 * @note The resulting JSON is of `ConcatenatedValue` type and it's recommended to use `ConcatenatedValue.serialize` to
 * handle each individual part.
 *
 * @see `ConcatenatedValue`
 *
 * @public
 */
export function createConcatenatedValueJsonSelector(selectors: TypedValueSelectClauseProps[], checkSelector?: string) {
  const combinedSelectors = `json_array(${selectors.map((sel) => createTypedValueJsonSelector(sel)).join(", ")})`;
  if (checkSelector) {
    return createNullableSelector({ checkSelector, valueSelector: combinedSelectors });
  }
  return combinedSelectors;
}
function createTypedValueJsonSelector(props: TypedValueSelectClauseProps): string {
  let valueSelector: string;
  if (TypedValueSelectClauseProps.isPrimitiveValue(props)) {
    valueSelector = createPrimitiveValueJsonSelector(props.value);
  } else if (props.type) {
    valueSelector = props.selector;
  } else {
    return props.selector;
  }

  const args = {
    value: valueSelector,
    type: `'${props.type}'`,
    ...(props.extendedType ? { extendedType: `'${props.extendedType}'` } : {}),
    ...(props.type === "Double" && props.koqName ? { koqName: `'${props.koqName}'` } : {}),
  };
  return `
    json_object(${Object.entries(args)
      .map(([key, value]) => `'${key}', ${value}`)
      .join(", ")})
  `;
}
function createPrimitiveValueJsonSelector(value: PrimitiveValue): string {
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
 * @note Not all types of `TypedValueSelectClauseProps` can be serialized to a user-friendly string, e.g. when
 * selecting a numeric value with units, this function is going to select the raw value. To create properly formatted
 * concatenated values:
 * 1. They should be selected with `createConcatenatedValueJsonSelector`, which returns a serialized JSON object.
 * 2. The JSON should be parsed from resulting string and passed to `ConcatenatedValue.serialize`, which additionally
 *    takes a formatter. One can be created using `createDefaultValueFormatter`.
 *
 * @public
 */
export function createConcatenatedValueStringSelector(selectors: TypedValueSelectClauseProps[], checkSelector?: string) {
  const combinedSelectors = selectors.length ? selectors.map((sel) => createTypedValueStringSelector(sel)).join(" || ") : "''";
  if (checkSelector) {
    return createNullableSelector({ checkSelector, valueSelector: combinedSelectors });
  }
  return combinedSelectors;
}
function createTypedValueStringSelector(props: TypedValueSelectClauseProps): string {
  if (TypedValueSelectClauseProps.isPrimitiveValueSelector(props)) {
    return `CAST(${props.selector} AS TEXT)`;
  }
  return createPrimitiveValueStringSelector(props.value);
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
