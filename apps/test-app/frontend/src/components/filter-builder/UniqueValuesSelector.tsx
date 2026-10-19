/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useMemo } from "react";
import { PropertyValueFormat } from "@itwin/appui-abstract";
import { ComboBox } from "@itwin/itwinui-react";
import { useUniqueFieldValues } from "@itwin/presentation-content-react";

import type { PropertyValue } from "@itwin/appui-abstract";
import type { ReadonlyPropertyField } from "@itwin/presentation-content";
import type { UniqueFieldValue } from "@itwin/presentation-content-react";
import type { ECSchemaProvider, ECSqlQueryExecutor, Value } from "@itwin/presentation-shared";

/**
 * The selection this editor round-trips through `PropertyValue`.
 *
 * `rawValues` is the union of every selected entry's `groupedRawValues` — the values an "is one of"
 * content filter would bind against. It's carried alongside the display values because distinct raw
 * values regularly collapse into a single display value, so the display value alone can't reconstruct
 * what the user actually picked.
 */
interface SelectedUniqueValues {
  displayValues: string[];
  rawValues: Value[];
}

/**
 * Value editor for equality rules, populated with the field's unique values.
 *
 * Demonstrates the `useUniqueFieldValues` round trip end to end: values are loaded through
 * `@itwin/presentation-content`, formatted for display, grouped when several raw values share a display
 * value, and the grouped raw values are carried into the resulting `PropertyValue`.
 */
export function UniqueValuesSelector({
  imodelAccess,
  field,
  value,
  onChange,
}: {
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
  field: ReadonlyPropertyField;
  value?: PropertyValue;
  onChange: (value: PropertyValue) => void;
}) {
  const { values, isLoading } = useUniqueFieldValues({ imodelAccess, field });

  const options = useMemo(
    () =>
      values.map((uniqueValue, index) => ({
        // The display value is not unique enough to key an option by — two entries never share one
        // (they're grouped), but an empty display value would produce an empty option value.
        value: `${index}`,
        label: getOptionLabel(uniqueValue),
        ...(uniqueValue.groupedRawValues.length > 1
          ? { sublabel: `${uniqueValue.groupedRawValues.length} raw values` }
          : undefined),
      })),
    [values],
  );

  const selectedIndices = useMemo(() => {
    const selectedDisplayValues = new Set(parseSelectedValues(value)?.displayValues ?? []);
    return values.flatMap((uniqueValue, index) =>
      selectedDisplayValues.has(uniqueValue.displayValue) ? [`${index}`] : [],
    );
  }, [value, values]);

  const onSelectionChanged = useCallback(
    (newSelection: string[]) => {
      // Option values are indices into `values`, and both are derived from the same render, so every
      // selected index resolves.
      const selected = newSelection.map((index) => values[Number(index)]);
      if (selected.length === 0) {
        onChange({ valueFormat: PropertyValueFormat.Primitive, displayValue: undefined, value: undefined });
        return;
      }
      const selectedValues: SelectedUniqueValues = {
        displayValues: selected.map((entry) => entry.displayValue),
        rawValues: selected.flatMap((entry) => entry.groupedRawValues),
      };
      onChange({
        valueFormat: PropertyValueFormat.Primitive,
        displayValue: selected.map(getOptionLabel).join(", "),
        value: JSON.stringify(selectedValues),
      });
    },
    [onChange, values],
  );

  return (
    <div className="filter-builder-value-selector">
      <ComboBox<string>
        multiple
        enableVirtualization
        options={options}
        value={selectedIndices}
        onChange={onSelectionChanged}
        emptyStateMessage={isLoading ? "Loading values..." : "No values"}
        inputProps={{ placeholder: isLoading ? "Loading values..." : "Select values", size: "small" }}
      />
    </div>
  );
}

/**
 * A NULL value formats to an empty display value, which renders as a blank option — labelling it is
 * deliberately left to the consumer rather than baked into the hook.
 */
function getOptionLabel({ displayValue }: UniqueFieldValue): string {
  return displayValue === "" ? "(empty)" : displayValue;
}

function parseSelectedValues(value: PropertyValue | undefined): SelectedUniqueValues | undefined {
  if (value?.valueFormat !== PropertyValueFormat.Primitive || typeof value.value !== "string") {
    return undefined;
  }
  try {
    return JSON.parse(value.value) as SelectedUniqueValues;
  } catch {
    return undefined;
  }
}
