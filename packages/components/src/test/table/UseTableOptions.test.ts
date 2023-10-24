/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { FieldDescriptorType, SortDirection } from "@itwin/presentation-common";
import { useTableOptions, UseTableOptionsProps } from "../../presentation-components/table/UseTableOptions";
import { createTestPropertyInfo } from "../_helpers/Common";
import { createTestPropertiesContentField } from "../_helpers/Content";
import { act, renderHook, waitFor } from "../TestUtils";

describe("useTableOptions", () => {
  const propertiesField = createTestPropertiesContentField({ name: "prop_field", label: "Prop Field", properties: [{ property: createTestPropertyInfo() }] });
  const initialProps: UseTableOptionsProps = {
    columns: [
      {
        name: propertiesField.name,
        label: propertiesField.label,
        field: propertiesField,
      },
    ],
  };

  it("applies sorting ascending", async () => {
    const { result } = renderHook((props: UseTableOptionsProps) => useTableOptions(props), { initialProps });

    expect(result.current.options.sorting).to.be.undefined;

    act(() => {
      result.current.sort(propertiesField.name, false);
    });

    await waitFor(() => expect(result.current.options.sorting?.direction).to.be.eq(SortDirection.Ascending));
    expect(result.current.options.sorting?.field.type).to.be.eq(FieldDescriptorType.Properties);
  });

  it("applies sorting descending", async () => {
    const { result } = renderHook((props: UseTableOptionsProps) => useTableOptions(props), { initialProps });

    expect(result.current.options.sorting).to.be.undefined;

    act(() => {
      result.current.sort(propertiesField.name, true);
    });

    await waitFor(() => expect(result.current.options.sorting?.direction).to.be.eq(SortDirection.Descending));
    expect(result.current.options.sorting?.field.type).to.be.eq(FieldDescriptorType.Properties);
  });

  it("removes sorting", async () => {
    const { result } = renderHook((props: UseTableOptionsProps) => useTableOptions(props), { initialProps });

    expect(result.current.options.sorting).to.be.undefined;

    act(() => {
      result.current.sort(propertiesField.name, true);
    });
    await waitFor(() => expect(result.current.options.sorting?.direction).to.be.eq(SortDirection.Descending));

    act(() => {
      result.current.sort();
    });
    await waitFor(() => expect(result.current.options.sorting).to.be.undefined);
  });

  it("does not apply sorting when invalid column", async () => {
    const { result } = renderHook((props: UseTableOptionsProps) => useTableOptions(props), { initialProps });

    expect(result.current.options.sorting).to.be.undefined;

    act(() => {
      result.current.sort("invalid_name", true);
    });
    await waitFor(() => expect(result.current.options.sorting).to.be.undefined);
  });

  it("applies filtering", async () => {
    const { result } = renderHook((props: UseTableOptionsProps) => useTableOptions(props), { initialProps });

    const filterExpression = `${propertiesField.name} = 1`;
    expect(result.current.options.fieldsFilterExpression).to.be.undefined;

    act(() => {
      result.current.filter(filterExpression);
    });
    await waitFor(() => expect(result.current.options.fieldsFilterExpression).to.be.eq(filterExpression));
  });

  it("removes filtering", async () => {
    const { result } = renderHook((props: UseTableOptionsProps) => useTableOptions(props), { initialProps });

    const filterExpression = `${propertiesField.name} = 1`;
    expect(result.current.options.fieldsFilterExpression).to.be.undefined;

    act(() => {
      result.current.filter(filterExpression);
    });
    await waitFor(() => expect(result.current.options.fieldsFilterExpression).to.be.eq(filterExpression));

    act(() => {
      result.current.filter();
    });
    await waitFor(() => expect(result.current.options.fieldsFilterExpression).to.be.undefined);
  });

  it("resets options when columns changes", async () => {
    const { result, rerender } = renderHook((props: UseTableOptionsProps) => useTableOptions(props), { initialProps });

    const filterExpression = `${propertiesField.name} = 1`;
    expect(result.current.options.fieldsFilterExpression).to.be.undefined;

    act(() => {
      result.current.filter(filterExpression);
    });
    await waitFor(() => expect(result.current.options.fieldsFilterExpression).to.be.eq(filterExpression));

    const newField = createTestPropertiesContentField({ name: "new_field", label: "New Field", properties: [{ property: createTestPropertyInfo() }] });
    rerender({ ...initialProps, columns: [{ name: newField.name, label: newField.label, field: newField }] });
    expect(result.current.options.fieldsFilterExpression).to.be.undefined;
  });
});
