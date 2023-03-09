/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { FieldDescriptorType, SortDirection } from "@itwin/presentation-common";
import { act } from "@testing-library/react";
import { renderHook } from "@testing-library/react-hooks";
import { useTableOptions, UseTableOptionsProps } from "../../presentation-components/table/UseTableOptions";
import { createTestPropertyInfo } from "../_helpers/Common";
import { createTestPropertiesContentField } from "../_helpers/Content";

describe("useTableOptions", () => {
  const propertiesField = createTestPropertiesContentField({ name: "prop_field", label: "Prop Field", properties: [{ property: createTestPropertyInfo() }] });
  const initialProps: UseTableOptionsProps = {
    columns: [{
      name: propertiesField.name,
      label: propertiesField.label,
      field: propertiesField,
    }],
  };

  it("applies sorting ascending", () => {
    const { result } = renderHook(
      (props: UseTableOptionsProps) => useTableOptions(props),
      { initialProps },
    );

    expect(result.current.options.sorting).to.be.undefined;
    act(() => { result.current.sort(propertiesField.name, false); });
    expect(result.current.options.sorting?.direction).to.be.eq(SortDirection.Ascending);
    expect(result.current.options.sorting?.field.type).to.be.eq(FieldDescriptorType.Properties);
  });

  it("applies sorting descending", () => {
    const { result } = renderHook(
      (props: UseTableOptionsProps) => useTableOptions(props),
      { initialProps },
    );

    expect(result.current.options.sorting).to.be.undefined;
    act(() => { result.current.sort(propertiesField.name, true); });
    expect(result.current.options.sorting?.direction).to.be.eq(SortDirection.Descending);
    expect(result.current.options.sorting?.field.type).to.be.eq(FieldDescriptorType.Properties);
  });

  it("removes sorting", () => {
    const { result } = renderHook(
      (props: UseTableOptionsProps) => useTableOptions(props),
      { initialProps },
    );

    expect(result.current.options.sorting).to.be.undefined;
    act(() => { result.current.sort(propertiesField.name, true); });
    expect(result.current.options.sorting?.direction).to.be.eq(SortDirection.Descending);
    act(() => { result.current.sort(); });
    expect(result.current.options.sorting).to.be.undefined;
  });

  it("does not apply sorting when invalid column", () => {
    const { result } = renderHook(
      (props: UseTableOptionsProps) => useTableOptions(props),
      { initialProps },
    );

    expect(result.current.options.sorting).to.be.undefined;
    act(() => { result.current.sort("invalid_name", true); });
    expect(result.current.options.sorting).to.be.undefined;
  });

  it("applies filtering", () => {
    const { result } = renderHook(
      (props: UseTableOptionsProps) => useTableOptions(props),
      { initialProps },
    );

    const filterExpression = `${propertiesField.name} = 1`;
    expect(result.current.options.fieldsFilterExpression).to.be.undefined;
    act(() => { result.current.filter(filterExpression); });
    expect(result.current.options.fieldsFilterExpression).to.be.eq(filterExpression);
  });

  it("removes filtering", () => {
    const { result } = renderHook(
      (props: UseTableOptionsProps) => useTableOptions(props),
      { initialProps },
    );

    const filterExpression = `${propertiesField.name} = 1`;
    expect(result.current.options.fieldsFilterExpression).to.be.undefined;
    act(() => { result.current.filter(filterExpression); });
    expect(result.current.options.fieldsFilterExpression).to.be.eq(filterExpression);
    act(() => { result.current.filter(); });
    expect(result.current.options.fieldsFilterExpression).to.be.undefined;
  });

  it("resets options when columns changes", () => {
    const { result, rerender } = renderHook(
      (props: UseTableOptionsProps) => useTableOptions(props),
      { initialProps },
    );

    const filterExpression = `${propertiesField.name} = 1`;
    expect(result.current.options.fieldsFilterExpression).to.be.undefined;
    act(() => { result.current.filter(filterExpression); });
    expect(result.current.options.fieldsFilterExpression).to.be.eq(filterExpression);

    const newField = createTestPropertiesContentField({ name: "new_field", label: "New Field", properties: [{ property: createTestPropertyInfo() }] });
    rerender({ ...initialProps, columns: [{ name: newField.name, label: newField.label, field: newField }] });
    expect(result.current.options.fieldsFilterExpression).to.be.undefined;
  });
});
