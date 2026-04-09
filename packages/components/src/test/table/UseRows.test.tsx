/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createAsyncIterator } from "presentation-test-utilities";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BeUiEvent } from "@itwin/core-bentley";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection, QuantityFormatter } from "@itwin/core-frontend";
import { Content, DescriptorOverrides, KeySet, SortDirection } from "@itwin/presentation-common";
import { Presentation, PresentationManager } from "@itwin/presentation-frontend";
import { ROWS_RELOAD_PAGE_SIZE, useRows, UseRowsProps } from "../../presentation-components/table/UseRows.js";
import { createTestECInstanceKey, createTestPropertyInfo, TestErrorBoundary } from "../_helpers/Common.js";
import {
  createTestCategoryDescription,
  createTestContentDescriptor,
  createTestContentItem,
  createTestNestedContentField,
  createTestPropertiesContentField,
} from "../_helpers/Content.js";
import { act, render, renderHook, waitFor } from "../TestUtils.js";

describe("useRows", () => {
  let onActiveFormattingUnitSystemChanged: QuantityFormatter["onActiveFormattingUnitSystemChanged"];
  const imodel = { key: "test-imodel" } as IModelConnection;
  const initialProps: UseRowsProps = {
    imodel,
    keys: new KeySet([createTestECInstanceKey()]),
    ruleset: "ruleset_id",
    pageSize: 10,
    options: {},
  };

  let presentationManagerSpy: ReturnType<typeof vi.spyOn>;
  const getContentIteratorStub = vi.fn<PresentationManager["getContentIterator"]>();

  beforeEach(() => {
    presentationManagerSpy = vi
      .spyOn(Presentation, "presentation", "get")
      .mockReturnValue({ getContentIterator: getContentIteratorStub } as unknown as PresentationManager);
    onActiveFormattingUnitSystemChanged = new BeUiEvent<FormattingUnitSystemChangedArgs>();
    vi.spyOn(IModelApp, "quantityFormatter", "get").mockReturnValue({
      onActiveFormattingUnitSystemChanged,
    } as unknown as QuantityFormatter);
  });

  afterEach(() => {
    getContentIteratorStub.mockReset();
  });

  describe("when `getContentIterator` is not available", () => {
    const getContentAndSizeStub = vi.fn<PresentationManager["getContentAndSize"]>();

    beforeEach(() => {
      presentationManagerSpy.mockReturnValue({
        getContentAndSize: getContentAndSizeStub,
      } as unknown as PresentationManager);
    });

    it("loads rows", async () => {
      const propertiesField = createTestPropertiesContentField({
        name: "first_field",
        label: "First Field",
        properties: [{ property: createTestPropertyInfo() }],
      });
      const descriptor = createTestContentDescriptor({ fields: [propertiesField] });
      const item = createTestContentItem({
        values: { [propertiesField.name]: "test_value" },
        displayValues: { [propertiesField.name]: "Test value" },
      });
      getContentAndSizeStub.mockResolvedValue({ content: new Content(descriptor, [item]), size: 1 });

      const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps });

      await waitFor(() => expect(result.current.rows).toHaveLength(1));
      const cell = result.current.rows[0].cells[0];
      expect(cell).toMatchObject({ key: propertiesField.name });
    });

    it("returns empty rows list if there are no content", async () => {
      getContentAndSizeStub.mockImplementation(async () => undefined);
      const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.rows).toHaveLength(0);
    });
  });

  it("loads rows when `getContentIterator` is available", async () => {
    const propertiesField = createTestPropertiesContentField({
      name: "first_field",
      label: "First Field",
      properties: [{ property: createTestPropertyInfo() }],
    });
    const descriptor = createTestContentDescriptor({ fields: [propertiesField] });
    const item = createTestContentItem({
      values: { [propertiesField.name]: "test_value" },
      displayValues: { [propertiesField.name]: "Test value" },
    });
    getContentIteratorStub.mockImplementation(async () => ({
      descriptor,
      items: createAsyncIterator([item]),
      total: 1,
    }));

    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps });

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    const cell = result.current.rows[0].cells[0];
    expect(cell).toMatchObject({ key: propertiesField.name });
  });

  it("does not create cells for nested content fields", async () => {
    const nestedCategory = createTestCategoryDescription({ name: "nested_category" });
    const propertiesField = createTestPropertiesContentField({
      name: "first_field",
      label: "First Field",
      properties: [{ property: createTestPropertyInfo() }],
    });
    const nestedField = createTestPropertiesContentField({
      name: "nested_field",
      label: "Nested Field",
      category: nestedCategory,
      properties: [{ property: createTestPropertyInfo() }],
    });
    const nestingField = createTestNestedContentField({
      name: "nesting_field",
      label: "Nesting Field",
      category: nestedCategory,
      nestedFields: [nestedField],
    });
    const descriptor = createTestContentDescriptor({ fields: [propertiesField, nestingField] });
    const item = createTestContentItem({
      values: {
        [propertiesField.name]: "test_value",
        [nestingField.name]: [
          {
            primaryKeys: [],
            values: { [nestedField.name]: "nested_value" },
            displayValues: { [nestedField.name]: "Nested Value" },
            mergedFieldNames: [],
          },
        ],
      },
      displayValues: {
        [propertiesField.name]: "Test value",
        [nestingField.name]: { [nestedField.name]: "Nested Value" },
      },
    });
    getContentIteratorStub.mockImplementation(async () => ({
      descriptor,
      items: createAsyncIterator([item]),
      total: 1,
    }));

    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps });

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0].cells).toHaveLength(1);
    const cell = result.current.rows[0].cells[0];
    expect(cell).toMatchObject({ key: propertiesField.name });
  });

  it("loads next page of rows when 'loadMoreRows' is called", async () => {
    const propertiesField = createTestPropertiesContentField({
      name: "first_field",
      label: "First Field",
      properties: [{ property: createTestPropertyInfo() }],
    });
    const descriptor = createTestContentDescriptor({ fields: [propertiesField] });
    const item1 = createTestContentItem({
      values: { [propertiesField.name]: "test_value_1" },
      displayValues: { [propertiesField.name]: "Test value 1" },
    });
    const item2 = createTestContentItem({
      values: { [propertiesField.name]: "test_value_2" },
      displayValues: { [propertiesField.name]: "Test value 2" },
    });
    getContentIteratorStub.mockImplementation(async (options) => {
      if (options.paging?.start === 0) {
        return { descriptor, items: createAsyncIterator([item1]), total: 2 };
      }
      if (options.paging?.start === 1) {
        return { descriptor, items: createAsyncIterator([item2]), total: 2 };
      }
      return undefined;
    });

    const { result } = renderHook((props: UseRowsProps) => useRows(props), {
      initialProps: { ...initialProps, pageSize: 1 },
    });

    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    act(() => {
      result.current.loadMoreRows();
    });

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
  });

  it("does not attempt to load more rows if there are no more content items", async () => {
    const propertiesField = createTestPropertiesContentField({
      name: "first_field",
      label: "First Field",
      properties: [{ property: createTestPropertyInfo() }],
    });
    const descriptor = createTestContentDescriptor({ fields: [propertiesField] });
    const item = createTestContentItem({
      values: { [propertiesField.name]: "test_value_1" },
      displayValues: { [propertiesField.name]: "Test value 1" },
    });
    getContentIteratorStub.mockImplementation(async () => ({
      descriptor,
      items: createAsyncIterator([item]),
      total: 1,
    }));

    const { result } = renderHook((props: UseRowsProps) => useRows(props), {
      initialProps: { ...initialProps, pageSize: 1 },
    });

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    getContentIteratorStub.mockReset();

    act(() => {
      result.current.loadMoreRows();
    });

    expect(getContentIteratorStub).not.toHaveBeenCalled();
  });

  it("throws in React render loop on failure to get content", async () => {
    // stub console error to avoid warnings/errors in console
    const consoleErrorStub = vi.spyOn(console, "error").mockImplementation(() => {});
    getContentIteratorStub.mockImplementation(() => {
      throw new Error("Failed to load");
    });

    const errorSpy = vi.fn();
    function TestComponent() {
      useRows(initialProps);
      return null;
    }
    render(
      <TestErrorBoundary onError={errorSpy}>
        <TestComponent />
      </TestErrorBoundary>,
    );

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledOnce();
      const [error] = errorSpy.mock.calls[0];
      expect((error as Error).message).toBe("Failed to load");
    });
    consoleErrorStub.mockRestore();
  });

  it("returns empty rows list if there are no content", async () => {
    getContentIteratorStub.mockImplementation(async () => undefined);
    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rows).toHaveLength(0);
  });

  it("returns empty rows list if key set is empty", async () => {
    const emptyKeySet = new KeySet();
    const { result } = renderHook((props: UseRowsProps) => useRows(props), {
      initialProps: { ...initialProps, keys: emptyKeySet },
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rows).toHaveLength(0);
    expect(getContentIteratorStub).not.toHaveBeenCalled();
  });

  it("applies fields filter expression", async () => {
    const filterExpression = "propField = 1";
    getContentIteratorStub.mockImplementation(async () => ({
      descriptor: createTestContentDescriptor({ fields: [] }),
      items: createAsyncIterator([]),
      total: 0,
    }));

    const { result } = renderHook((props: UseRowsProps) => useRows(props), {
      initialProps: { ...initialProps, options: { fieldsFilterExpression: filterExpression } },
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getContentIteratorStub).toHaveBeenCalled();
    expect(getContentIteratorStub.mock.lastCall![0].descriptor.fieldsFilterExpression).toBe(filterExpression);
  });

  it("applies sorting", async () => {
    const propertiesField = createTestPropertiesContentField({
      name: "first_field",
      label: "First Field",
      properties: [{ property: createTestPropertyInfo() }],
    });
    const fieldDescriptor = propertiesField.getFieldDescriptor();
    const sorting = { field: fieldDescriptor, direction: SortDirection.Descending };
    getContentIteratorStub.mockImplementation(async () => ({
      descriptor: createTestContentDescriptor({ fields: [] }),
      items: createAsyncIterator([]),
      total: 0,
    }));

    const { result } = renderHook((props: UseRowsProps) => useRows(props), {
      initialProps: { ...initialProps, options: { sorting } },
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getContentIteratorStub).toHaveBeenCalled();
    expect((getContentIteratorStub.mock.lastCall![0].descriptor as DescriptorOverrides).sorting?.direction).toBe(
      SortDirection.Descending,
    );
  });

  it("reloads rows when active unit system changes", async () => {
    const propertiesField = createTestPropertiesContentField({
      name: "first_field",
      label: "First Field",
      properties: [{ property: createTestPropertyInfo() }],
    });
    const descriptor = createTestContentDescriptor({ fields: [propertiesField] });
    const item1 = createTestContentItem({
      values: { [propertiesField.name]: "test_value_1" },
      displayValues: { [propertiesField.name]: "Test value 1" },
    });
    const item2 = createTestContentItem({
      values: { [propertiesField.name]: "test_value_2" },
      displayValues: { [propertiesField.name]: "Test value 2" },
    });

    getContentIteratorStub.mockImplementation(async () => ({
      descriptor,
      items: createAsyncIterator([item1, item2]),
      total: 2,
    }));
    const { result } = renderHook((props: UseRowsProps) => useRows(props), {
      initialProps: { ...initialProps, pageSize: 10 },
    });

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    // initial rows load request
    expect(getContentIteratorStub).toHaveBeenCalledWith(
      expect.objectContaining({ paging: expect.objectContaining({ start: 0, size: 10 }) }),
    );

    act(() => {
      onActiveFormattingUnitSystemChanged.raiseEvent({ system: "metric" });
    });

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(2);
      // reload request should have page options to get only previously loaded rows.
      expect(getContentIteratorStub).toHaveBeenCalledWith(
        expect.objectContaining({ paging: expect.objectContaining({ start: 0, size: 2 }) }),
      );
    });
  });

  it("does not reload rows when active unit system changes if there are no rows", async () => {
    const propertiesField = createTestPropertiesContentField({
      name: "first_field",
      label: "First Field",
      properties: [{ property: createTestPropertyInfo() }],
    });
    const descriptor = createTestContentDescriptor({ fields: [propertiesField] });
    getContentIteratorStub.mockImplementation(async () => ({ descriptor, items: createAsyncIterator([]), total: 0 }));

    const { result } = renderHook((props: UseRowsProps) => useRows(props), {
      initialProps: { ...initialProps, pageSize: 10 },
    });

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(0);
      expect(result.current.isLoading).toBe(false);
    });

    // initial load request
    expect(getContentIteratorStub).toHaveBeenCalledWith(
      expect.objectContaining({ paging: expect.objectContaining({ start: 0, size: 10 }) }),
    );
    getContentIteratorStub.mockClear();

    act(() => {
      onActiveFormattingUnitSystemChanged.raiseEvent({ system: "metric" });
    });

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(0);
      expect(getContentIteratorStub).not.toHaveBeenCalled();
    });
  });

  it("reloads rows in pages", async () => {
    const propertiesField = createTestPropertiesContentField({
      name: "first_field",
      label: "First Field",
      properties: [{ property: createTestPropertyInfo() }],
    });
    const descriptor = createTestContentDescriptor({ fields: [propertiesField] });
    const itemsCount = ROWS_RELOAD_PAGE_SIZE + 1;
    const items = Array.from(Array(itemsCount).keys()).map((i) =>
      createTestContentItem({
        values: { [propertiesField.name]: `test_value_${i}` },
        displayValues: { [propertiesField.name]: `Test value ${i}` },
      }),
    );

    getContentIteratorStub.mockImplementation(async () => ({
      descriptor,
      items: createAsyncIterator(items),
      total: itemsCount,
    }));

    // all items should be loaded with single request
    const { result } = renderHook((props: UseRowsProps) => useRows(props), {
      initialProps: { ...initialProps, pageSize: itemsCount },
    });
    await waitFor(() => {
      expect(result.current.rows).toHaveLength(itemsCount);
    });

    // setup presentation manager for rows reload
    getContentIteratorStub.mockReset();
    getContentIteratorStub.mockImplementation(async (options) => {
      if (options.paging?.start === 0 && options.paging?.size === ROWS_RELOAD_PAGE_SIZE) {
        return {
          descriptor,
          items: createAsyncIterator(items.slice(0, ROWS_RELOAD_PAGE_SIZE)),
          total: ROWS_RELOAD_PAGE_SIZE,
        };
      }
      if (options.paging?.start === ROWS_RELOAD_PAGE_SIZE && options.paging?.size === 1) {
        return { descriptor, items: createAsyncIterator(items.slice(ROWS_RELOAD_PAGE_SIZE)), total: 1 };
      }
      return undefined;
    });

    act(() => {
      onActiveFormattingUnitSystemChanged.raiseEvent({ system: "metric" });
    });

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(itemsCount);
      expect(getContentIteratorStub).toHaveBeenCalledWith(
        expect.objectContaining({ paging: expect.objectContaining({ start: 0, size: ROWS_RELOAD_PAGE_SIZE }) }),
      );
      expect(getContentIteratorStub).toHaveBeenCalledWith(
        expect.objectContaining({ paging: expect.objectContaining({ start: ROWS_RELOAD_PAGE_SIZE, size: 1 }) }),
      );
    });
  });
});
