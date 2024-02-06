/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { BeUiEvent } from "@itwin/core-bentley";
import { FormattingUnitSystemChangedArgs, IModelApp, IModelConnection, QuantityFormatter } from "@itwin/core-frontend";
import { Content, DescriptorOverrides, KeySet, SortDirection } from "@itwin/presentation-common";
import { Presentation, PresentationManager } from "@itwin/presentation-frontend";
import { ROWS_RELOAD_PAGE_SIZE, useRows, UseRowsProps } from "../../presentation-components/table/UseRows";
import { createTestECInstanceKey, createTestPropertyInfo, TestErrorBoundary } from "../_helpers/Common";
import {
  createTestCategoryDescription,
  createTestContentDescriptor,
  createTestContentItem,
  createTestNestedContentField,
  createTestPropertiesContentField,
} from "../_helpers/Content";
import { act, render, renderHook, waitFor } from "../TestUtils";

describe("useRows", () => {
  let onActiveFormattingUnitSystemChanged: QuantityFormatter["onActiveFormattingUnitSystemChanged"];
  const imodel = {} as IModelConnection;
  const initialProps: UseRowsProps = {
    imodel,
    keys: new KeySet([createTestECInstanceKey()]),
    ruleset: "ruleset_id",
    pageSize: 10,
    options: {},
  };

  const getContentAndSizeStub = sinon.stub<Parameters<PresentationManager["getContentAndSize"]>, ReturnType<PresentationManager["getContentAndSize"]>>();

  before(() => {
    sinon.stub(Presentation, "presentation").get(() => ({
      getContentAndSize: getContentAndSizeStub,
    }));
    onActiveFormattingUnitSystemChanged = new BeUiEvent<FormattingUnitSystemChangedArgs>();
    sinon.stub(IModelApp, "quantityFormatter").get(() => ({
      onActiveFormattingUnitSystemChanged,
    }));
  });

  after(() => {
    sinon.restore();
  });

  afterEach(() => {
    getContentAndSizeStub.reset();
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
    getContentAndSizeStub.resolves({ content: new Content(descriptor, [item]), size: 1 });

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
    getContentAndSizeStub.callsFake(async (options) => {
      if (options.paging?.start === 0) {
        return { content: new Content(descriptor, [item1]), size: 2 };
      }
      if (options.paging?.start === 1) {
        return { content: new Content(descriptor, [item2]), size: 2 };
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
    getContentAndSizeStub.resolves({ content: new Content(descriptor, [item]), size: 1 });

    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps: { ...initialProps, pageSize: 1 } });

    await waitFor(() => expect(result.current.rows).to.have.lengthOf(1));
    getContentAndSizeStub.reset();

    act(() => {
      result.current.loadMoreRows();
    });

    expect(getContentAndSizeStub).to.not.be.called;
  });

  it("throws in React render loop on failure to get content", async () => {
    getContentAndSizeStub.throws(new Error("Failed to load"));

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
  });

  it("returns empty rows list if there are no content", async () => {
    getContentAndSizeStub.resolves(undefined);
    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps });

    await waitFor(() => expect(result.current.isLoading).to.be.false);
    expect(result.current.rows).to.have.lengthOf(0);
  });

  it("returns empty rows list if key set is empty", async () => {
    const emptyKeySet = new KeySet();
    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps: { ...initialProps, keys: emptyKeySet } });

    await waitFor(() => expect(result.current.isLoading).to.be.false);
    expect(result.current.rows).to.have.lengthOf(0);
    expect(getContentAndSizeStub).to.not.be.called;
  });

  it("applies fields filter expression", async () => {
    const filterExpression = "propField = 1";
    getContentAndSizeStub.resolves({ content: new Content(createTestContentDescriptor({ fields: [] }), []), size: 0 });

    const { result } = renderHook((props: UseRowsProps) => useRows(props), {
      initialProps: { ...initialProps, options: { fieldsFilterExpression: filterExpression } },
    });

    await waitFor(() => expect(result.current.isLoading).to.be.false);
    expect(getContentAndSizeStub).to.be.calledWith(
      sinon.match((options: Parameters<typeof getContentAndSizeStub>[0]) => options.descriptor.fieldsFilterExpression === filterExpression),
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
    getContentAndSizeStub.resolves({ content: new Content(createTestContentDescriptor({ fields: [] }), []), size: 0 });

    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps: { ...initialProps, options: { sorting } } });

    await waitFor(() => expect(result.current.isLoading).to.be.false);
    expect(getContentAndSizeStub).to.be.calledWith(
      sinon.match(
        (options: Parameters<typeof getContentAndSizeStub>[0]) => (options.descriptor as DescriptorOverrides).sorting?.direction === SortDirection.Descending,
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

    getContentAndSizeStub.resolves({ content: new Content(descriptor, [item1, item2]), size: 2 });
    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps: { ...initialProps, pageSize: 10 } });

    await waitFor(() => expect(result.current.rows).to.have.lengthOf(2));
    // initial rows load request
    expect(getContentAndSizeStub).to.be.calledWith(
      sinon.match(({ paging }: Parameters<typeof getContentAndSizeStub>[0]) => paging?.start === 0 && paging?.size === 10),
    );

    act(() => {
      onActiveFormattingUnitSystemChanged.raiseEvent({ system: "metric" });
    });

    await waitFor(() => {
      expect(result.current.rows).to.have.lengthOf(2);
      // reload request should have page options to get only previously loaded rows.
      expect(getContentAndSizeStub).to.be.calledWith(
        sinon.match(({ paging }: Parameters<typeof getContentAndSizeStub>[0]) => paging?.start === 0 && paging?.size === 2),
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
    getContentAndSizeStub.resolves({ content: new Content(descriptor, []), size: 0 });

    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps: { ...initialProps, pageSize: 10 } });

    await waitFor(() => {
      expect(result.current.rows).to.have.lengthOf(0);
      expect(result.current.isLoading).to.be.false;
    });

    // initial load request
    expect(getContentAndSizeStub).to.be.calledWith(
      sinon.match(({ paging }: Parameters<typeof getContentAndSizeStub>[0]) => paging?.start === 0 && paging?.size === 10),
    );
    getContentAndSizeStub.resetHistory();

    act(() => {
      onActiveFormattingUnitSystemChanged.raiseEvent({ system: "metric" });
    });

    await waitFor(() => {
      expect(result.current.rows).to.have.lengthOf(0);
      expect(getContentAndSizeStub).to.not.be.called;
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

    getContentAndSizeStub.resolves({ content: new Content(descriptor, items), size: itemsCount });

    // all items should be loaded with single request
    const { result } = renderHook((props: UseRowsProps) => useRows(props), { initialProps: { ...initialProps, pageSize: itemsCount } });
    await waitFor(() => {
      expect(result.current.rows).to.have.lengthOf(itemsCount);
    });

    // setup presentation manager for rows reload
    getContentAndSizeStub.reset();
    getContentAndSizeStub.callsFake(async (options) => {
      if (options.paging?.start === 0 && options.paging?.size === ROWS_RELOAD_PAGE_SIZE) {
        return { content: new Content(descriptor, items.slice(0, ROWS_RELOAD_PAGE_SIZE)), size: ROWS_RELOAD_PAGE_SIZE };
      }
      if (options.paging?.start === ROWS_RELOAD_PAGE_SIZE && options.paging?.size === 1) {
        return { content: new Content(descriptor, items.slice(ROWS_RELOAD_PAGE_SIZE)), size: 1 };
      }
      return undefined;
    });

    act(() => {
      onActiveFormattingUnitSystemChanged.raiseEvent({ system: "metric" });
    });

    await waitFor(() => {
      expect(result.current.rows).to.have.lengthOf(itemsCount);
      expect(getContentAndSizeStub).to.be.calledWith(
        sinon.match(({ paging }: Parameters<typeof getContentAndSizeStub>[0]) => paging?.start === 0 && paging?.size === ROWS_RELOAD_PAGE_SIZE),
      );
      expect(getContentAndSizeStub).to.be.calledWith(
        sinon.match(({ paging }: Parameters<typeof getContentAndSizeStub>[0]) => paging?.start === ROWS_RELOAD_PAGE_SIZE && paging?.size === 1),
      );
    });
  });
});
