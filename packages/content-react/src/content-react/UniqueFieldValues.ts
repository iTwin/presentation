/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { getDistinctFieldValues } from "@itwin/presentation-content";
import {
  createDefaultValueFormatter,
  createMainThreadReleaseOnTimePassedHandler,
  formatConcatenatedValue,
  TypedPrimitiveValue,
} from "@itwin/presentation-shared";
import { abortable } from "./Utils.js";

import type { ReadonlyCalculatedField, ReadonlyPropertyField } from "@itwin/presentation-content";
import type {
  ECSchemaProvider,
  ECSqlQueryExecutor,
  IPrimitiveValueFormatter,
  NavigationValue,
  PrimitiveValueDescriptor,
  Value,
} from "@itwin/presentation-shared";

/**
 * A display value paired with every raw value that formats to it.
 *
 * @public
 */
export interface UniqueFieldValue {
  /** Formatted value, suitable for displaying in UI. */
  displayValue: string;
  /**
   * Every raw value that formatted to `displayValue`.
   */
  groupedRawValues: Value[];
}

/**
 * Return of {@link getUniqueFieldValues}.
 *
 * @public
 */
export interface UniqueFieldValuesResult {
  /** Loaded values, in the order their display value was first encountered. */
  values: UniqueFieldValue[];
}

/**
 * Props for {@link getUniqueFieldValues}.
 *
 * @public
 */
export interface GetUniqueFieldValuesProps {
  /** Access to the iModel for running ECSQL queries and accessing schema metadata. */
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;

  /** The field to get unique values for. Array and struct fields are not supported. */
  field: ReadonlyPropertyField | ReadonlyCalculatedField;

  /**
   * Formats raw values into display values. Defaults to `createDefaultValueFormatter()` from
   * `@itwin/presentation-shared`. Supply `createValueFormatter` from
   * `@itwin/presentation-core-interop` to format values of properties that have a kind of quantity.
   */
  valueFormatter?: IPrimitiveValueFormatter;
}

/**
 * Loads distinct values of a single field, formats them for display, and groups raw values that share a
 * display value.
 *
 * The whole stream is consumed before returning, because raw values that format to the same display value
 * may arrive at any point. Returned values are in the order their display value was first encountered.
 *
 * @throws Error if `field` is an array or struct field.
 * @public
 */
export async function getUniqueFieldValues(
  props: GetUniqueFieldValuesProps & {
    /** Cancels the load, releasing the underlying query reader. */
    abortSignal?: AbortSignal;
  },
): Promise<UniqueFieldValuesResult> {
  const { imodelAccess, field, abortSignal } = props;
  const valueFormatter = props.valueFormatter ?? createDefaultValueFormatter();

  if (field.type.kind === "array" || field.type.kind === "struct") {
    throw new Error(`Getting unique values for ${field.type.kind} fields is not supported.`);
  }
  const isNavigation = field.type.kind === "navigation";

  const groups = new Map<string, Value[]>();
  const releaseMainThread = createMainThreadReleaseOnTimePassedHandler();
  for await (const value of abortable(getDistinctFieldValues({ imodelAccess, field }), abortSignal)) {
    const displayValue = await formatDistinctValue({ value, type: field.type, isNavigation, valueFormatter });
    const group = groups.get(displayValue);
    if (group) {
      group.push(value);
    } else {
      groups.set(displayValue, [value]);
    }

    // Formatting is async per value and runs on the main thread — yield periodically so a long
    // stream doesn't block rendering.
    await releaseMainThread();
  }

  return { values: [...groups].map(([displayValue, groupedRawValues]) => ({ displayValue, groupedRawValues })) };
}

/**
 * Formats one streamed distinct value for display.
 *
 * A navigation field's value carries the referenced instance's key and label, and is displayed by its
 * label. Every other field's value is formatted from its own type descriptor. A SQL-NULL arrives as
 * `undefined` for both, and formats to an empty string — labelling it (e.g. as "(empty)") is left to the
 * consumer rendering the UI.
 */
async function formatDistinctValue(props: {
  value: Value;
  type: ReadonlyPropertyField["type"] | ReadonlyCalculatedField["type"];
  isNavigation: boolean;
  valueFormatter: IPrimitiveValueFormatter;
}): Promise<string> {
  const { value, type, isNavigation, valueFormatter } = props;
  if (value === undefined) {
    return "";
  }
  if (isNavigation) {
    return formatConcatenatedValue({ value: (value as NavigationValue).label, valueFormatter });
  }
  return valueFormatter(toTypedPrimitiveValue(type as PrimitiveValueDescriptor, value));
}

/**
 * Bridges a field's value descriptor and a raw value into the shape `IPrimitiveValueFormatter` accepts.
 *
 * The two shapes disagree in two places: the descriptor names its kind of quantity `kindOfQuantity`
 * while the formatter expects `koqName`, and the descriptor may carry enumeration metadata that the
 * formatter has no notion of. An enumeration-backed value is therefore resolved to its enumerator's
 * label up front and handed on as a plain string. A non-strict enumeration may hold values outside its
 * declared enumerators, so an unmatched value falls back to formatting the raw backing value.
 */
function toTypedPrimitiveValue(type: PrimitiveValueDescriptor, value: Value): TypedPrimitiveValue {
  const enumeratorLabel = type.enumeration?.enumerators.find((enumerator) => enumerator.value === value)?.label;
  if (enumeratorLabel !== undefined) {
    return { type: "String", value: enumeratorLabel };
  }
  return TypedPrimitiveValue.create(
    value as Parameters<typeof TypedPrimitiveValue.create>[0],
    type.type,
    type.kindOfQuantity,
    type.extendedType,
  );
}
