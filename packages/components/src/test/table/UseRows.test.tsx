/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createAsyncIterator } from "presentation-test-utilities";
import sinon from "sinon";
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

  let presentationManagerStub: sinon.SinonStub;
  const getContentIteratorStub = sinon.stub<Parameters<PresentationManager["getContentIterator"]>, ReturnType<PresentationManager["getContentIterator"]>>();

  beforeEach(() => {
    presentationManagerStub = sinon.stub(Presentation, "presentation");
    presentationManagerStub.get(() => ({
      getContentIterator: getContentIteratorStub,
    }));
    onActiveFormattingUnitSystemChanged = new BeUiEvent<FormattingUnitSystemChangedArgs>();
    sinon.stub(IModelApp, "quantityFormatter").get(() => ({
      onActiveFormattingUnitSystemChanged,
    }));
  });

  afterEach(() => {
    sinon.restore();
  });

  afterEach(() => {
    getContentIteratorStub.reset();
  });

  describe("when `getContentIterator` is not available", () => {
    const getContentAndSizeStub = sinon.stub<Parameters<PresentationManager["getContentAndSize"]>, ReturnType<PresentationManager["getContentAndSize"]>>();

    beforeEach(() => {
      presentationManagerStub.resetBehavior();
      presentationManagerStub.get(() => ({
        getContentAndSize: getContentAndSizeStub,
      }));
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
      getContentAndSizeStub.resolves({ content: new Content(descriptor, [item]), size: 1 });

      const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps });

      await waitFor(() => expect(result.current.rows).to.have.lengthOf(1));
      const cell = result.current.rows[0].cells[0];
      expect(cell).to.containSubset({
        key: propertiesField.name,
      });
    });

    it("returns empty rows list if there are no content", async () => {
      getContentAndSizeStub.callsFake(async () => undefined);
      const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps });
      await waitFor(() => expect(result.current.isLoading).to.be.false);
      expect(result.current.rows).to.have.lengthOf(0);
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
    getContentIteratorStub.callsFake(async () => ({ descriptor, items: createAsyncIterator([item]), total: 1 }));

    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps });

    await waitFor(() => expect(result.current.rows).to.have.lengthOf(1));
    const cell = result.current.rows[0].cells[0];
    expect(cell).to.containSubset({
      key: propertiesField.name,
    });
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
    const nestingField = createTestNestedContentField({ name: "nesting_field", label: "Nesting Field", category: nestedCategory, nestedFields: [nestedField] });
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
        [nestingField.name]: {
          [nestedField.name]: "Nested Value",
        },
      },
    });
    getContentIteratorStub.callsFake(async () => ({ descriptor, items: createAsyncIterator([item]), total: 1 }));

    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps });

    await waitFor(() => expect(result.current.rows).to.have.lengthOf(1));
    expect(result.current.rows[0].cells).to.have.lengthOf(1);
    const cell = result.current.rows[0].cells[0];
    expect(cell).to.containSubset({
      key: propertiesField.name,
    });
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
    getContentIteratorStub.callsFake(async (options) => {
      if (options.paging?.start === 0) {
        return { descriptor, items: createAsyncIterator([item1]), total: 2 };
      }
      if (options.paging?.start === 1) {
        return { descriptor, items: createAsyncIterator([item2]), total: 2 };
      }
      return undefined;
    });

    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps: { ...initialProps, pageSize: 1 } });

    await waitFor(() => expect(result.current.rows).to.have.lengthOf(1));

    act(() => {
      result.current.loadMoreRows();
    });

    await waitFor(() => expect(result.current.rows).to.have.lengthOf(2));
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
    getContentIteratorStub.callsFake(async () => ({ descriptor, items: createAsyncIterator([item]), total: 1 }));

    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps: { ...initialProps, pageSize: 1 } });

    await waitFor(() => expect(result.current.rows).to.have.lengthOf(1));
    getContentIteratorStub.reset();

    act(() => {
      result.current.loadMoreRows();
    });

    expect(getContentIteratorStub).to.not.be.called;
  });

  it("throws in React render loop on failure to get content", async () => {
    // stub console error to avoid warnings/errors in console
    const consoleErrorStub = sinon.stub(console, "error").callsFake(() => {});
    getContentIteratorStub.throws(new Error("Failed to load"));

    const errorSpy = sinon.spy();
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
      expect(errorSpy).to.be.calledOnce.and.calledWith(sinon.match((error: Error) => error.message === "Failed to load"));
    });
    consoleErrorStub.restore();
  });

  it("returns empty rows list if there are no content", async () => {
    getContentIteratorStub.callsFake(async () => undefined);
    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps });

    await waitFor(() => expect(result.current.isLoading).to.be.false);
    expect(result.current.rows).to.have.lengthOf(0);
  });

  it("returns empty rows list if key set is empty", async () => {
    const emptyKeySet = new KeySet();
    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps: { ...initialProps, keys: emptyKeySet } });

    await waitFor(() => expect(result.current.isLoading).to.be.false);
    expect(result.current.rows).to.have.lengthOf(0);
    expect(getContentIteratorStub).to.not.be.called;
  });

  it("applies fields filter expression", async () => {
    const filterExpression = "propField = 1";
    getContentIteratorStub.callsFake(async () => ({ descriptor: createTestContentDescriptor({ fields: [] }), items: createAsyncIterator([]), total: 0 }));

    const { result } = renderHook((props: UseRowsProps) => useRows(props), {
      initialProps: { ...initialProps, options: { fieldsFilterExpression: filterExpression } },
    });

    await waitFor(() => expect(result.current.isLoading).to.be.false);
    expect(getContentIteratorStub).to.be.calledWith(
      sinon.match((options: Parameters<typeof getContentIteratorStub>[0]) => options.descriptor.fieldsFilterExpression === filterExpression),
    );
  });

  it("applies sorting", async () => {
    const propertiesField = createTestPropertiesContentField({
      name: "first_field",
      label: "First Field",
      properties: [{ property: createTestPropertyInfo() }],
    });
    const fieldDescriptor = propertiesField.getFieldDescriptor();
    const sorting = {
      field: fieldDescriptor,
      direction: SortDirection.Descending,
    };
    getContentIteratorStub.callsFake(async () => ({ descriptor: createTestContentDescriptor({ fields: [] }), items: createAsyncIterator([]), total: 0 }));

    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps: { ...initialProps, options: { sorting } } });

    await waitFor(() => expect(result.current.isLoading).to.be.false);
    expect(getContentIteratorStub).to.be.calledWith(
      sinon.match(
        (options: Parameters<typeof getContentIteratorStub>[0]) => (options.descriptor as DescriptorOverrides).sorting?.direction === SortDirection.Descending,
      ),
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

    getContentIteratorStub.callsFake(async () => ({ descriptor, items: createAsyncIterator([item1, item2]), total: 2 }));
    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps: { ...initialProps, pageSize: 10 } });

    await waitFor(() => expect(result.current.rows).to.have.lengthOf(2));
    // initial rows load request
    expect(getContentIteratorStub).to.be.calledWith(
      sinon.match(({ paging }: Parameters<typeof getContentIteratorStub>[0]) => paging?.start === 0 && paging?.size === 10),
    );

    act(() => {
      onActiveFormattingUnitSystemChanged.raiseEvent({ system: "metric" });
    });

    await waitFor(() => {
      expect(result.current.rows).to.have.lengthOf(2);
      // reload request should have page options to get only previously loaded rows.
      expect(getContentIteratorStub).to.be.calledWith(
        sinon.match(({ paging }: Parameters<typeof getContentIteratorStub>[0]) => paging?.start === 0 && paging?.size === 2),
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
    getContentIteratorStub.callsFake(async () => ({ descriptor, items: createAsyncIterator([]), total: 0 }));

    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps: { ...initialProps, pageSize: 10 } });

    await waitFor(() => {
      expect(result.current.rows).to.have.lengthOf(0);
      expect(result.current.isLoading).to.be.false;
    });

    // initial load request
    expect(getContentIteratorStub).to.be.calledWith(
      sinon.match(({ paging }: Parameters<typeof getContentIteratorStub>[0]) => paging?.start === 0 && paging?.size === 10),
    );
    getContentIteratorStub.resetHistory();

    act(() => {
      onActiveFormattingUnitSystemChanged.raiseEvent({ system: "metric" });
    });

    await waitFor(() => {
      expect(result.current.rows).to.have.lengthOf(0);
      expect(getContentIteratorStub).to.not.be.called;
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

    getContentIteratorStub.callsFake(async () => ({ descriptor, items: createAsyncIterator(items), total: itemsCount }));

    // all items should be loaded with single request
    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps: { ...initialProps, pageSize: itemsCount } });
    await waitFor(() => {
      expect(result.current.rows).to.have.lengthOf(itemsCount);
    });

    // setup presentation manager for rows reload
    getContentIteratorStub.reset();
    getContentIteratorStub.callsFake(async (options) => {
      if (options.paging?.start === 0 && options.paging?.size === ROWS_RELOAD_PAGE_SIZE) {
        return { descriptor, items: createAsyncIterator(items.slice(0, ROWS_RELOAD_PAGE_SIZE)), total: ROWS_RELOAD_PAGE_SIZE };
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
      expect(result.current.rows).to.have.lengthOf(itemsCount);
      expect(getContentIteratorStub).to.be.calledWith(
        sinon.match(({ paging }: Parameters<typeof getContentIteratorStub>[0]) => paging?.start === 0 && paging?.size === ROWS_RELOAD_PAGE_SIZE),
      );
      expect(getContentIteratorStub).to.be.calledWith(
        sinon.match(({ paging }: Parameters<typeof getContentIteratorStub>[0]) => paging?.start === ROWS_RELOAD_PAGE_SIZE && paging?.size === 1),
      );
    });
  });
});
