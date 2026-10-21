/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { FieldDescriptorType, SortDirection } from "@itwin/presentation-common";
import { useTableOptions } from "../../presentation-components/table/UseTableOptions.js";
import { createTestPropertyInfo } from "../_helpers/Common.js";
import { createTestPropertiesContentField } from "../_helpers/Content.js";
import { act, renderHook, waitFor } from "../TestUtils.js";

import type { UseTableOptionsProps } from "../../presentation-components/table/UseTableOptions.js";

describe("useTableOptions", () => {
  const propertiesField = createTestPropertiesContentField({
    name: "prop_field",
    label: "Prop Field",
    properties: [{ property: createTestPropertyInfo() }],
  });
  const initialProps: UseTableOptionsProps = {
    columns: [{ name: propertiesField.name, label: propertiesField.label, field: propertiesField }],
  };

  it("applies sorting ascending", async () => {
    const { result } = renderHook((props: UseTableOptionsProps) => useTableOptions(props), { initialProps });

    expect(result.current.options.sorting).toBeUndefined();

    act(() => {
      result.current.sort(propertiesField.name, false);
    });

    await waitFor(() => expect(result.current.options.sorting?.direction).toBe(SortDirection.Ascending));
    expect(result.current.options.sorting?.field.type).toBe(FieldDescriptorType.Properties);
  });

  it("applies sorting descending", async () => {
    const { result } = renderHook((props: UseTableOptionsProps) => useTableOptions(props), { initialProps });

    expect(result.current.options.sorting).toBeUndefined();

    act(() => {
      result.current.sort(propertiesField.name, true);
    });

    await waitFor(() => expect(result.current.options.sorting?.direction).toBe(SortDirection.Descending));
    expect(result.current.options.sorting?.field.type).toBe(FieldDescriptorType.Properties);
  });

  it("removes sorting", async () => {
    const { result } = renderHook((props: UseTableOptionsProps) => useTableOptions(props), { initialProps });

    expect(result.current.options.sorting).toBeUndefined();

    act(() => {
      result.current.sort(propertiesField.name, true);
    });
    await waitFor(() => expect(result.current.options.sorting?.direction).toBe(SortDirection.Descending));

    act(() => {
      result.current.sort();
    });
    await waitFor(() => expect(result.current.options.sorting).toBeUndefined());
  });

  it("does not apply sorting when invalid column", async () => {
    const { result } = renderHook((props: UseTableOptionsProps) => useTableOptions(props), { initialProps });

    expect(result.current.options.sorting).toBeUndefined();

    act(() => {
      result.current.sort("invalid_name", true);
    });
    await waitFor(() => expect(result.current.options.sorting).toBeUndefined());
  });

  it("applies filtering", async () => {
    const { result } = renderHook((props: UseTableOptionsProps) => useTableOptions(props), { initialProps });

    const filterExpression = `${propertiesField.name} = 1`;
    expect(result.current.options.fieldsFilterExpression).toBeUndefined();

    act(() => {
      result.current.filter(filterExpression);
    });
    await waitFor(() => expect(result.current.options.fieldsFilterExpression).toBe(filterExpression));
  });

  it("removes filtering", async () => {
    const { result } = renderHook((props: UseTableOptionsProps) => useTableOptions(props), { initialProps });

    const filterExpression = `${propertiesField.name} = 1`;
    expect(result.current.options.fieldsFilterExpression).toBeUndefined();

    act(() => {
      result.current.filter(filterExpression);
    });
    await waitFor(() => expect(result.current.options.fieldsFilterExpression).toBe(filterExpression));

    act(() => {
      result.current.filter();
    });
    await waitFor(() => expect(result.current.options.fieldsFilterExpression).toBeUndefined());
  });

  it("resets options when columns changes", async () => {
    const { result, rerender } = renderHook((props: UseTableOptionsProps) => useTableOptions(props), { initialProps });

    const filterExpression = `${propertiesField.name} = 1`;
    expect(result.current.options.fieldsFilterExpression).toBeUndefined();

    act(() => {
      result.current.filter(filterExpression);
    });
    await waitFor(() => expect(result.current.options.fieldsFilterExpression).toBe(filterExpression));

    const newField = createTestPropertiesContentField({
      name: "new_field",
      label: "New Field",
      properties: [{ property: createTestPropertyInfo() }],
    });
    rerender({ ...initialProps, columns: [{ name: newField.name, label: newField.label, field: newField }] });
    expect(result.current.options.fieldsFilterExpression).toBeUndefined();
  });
});
