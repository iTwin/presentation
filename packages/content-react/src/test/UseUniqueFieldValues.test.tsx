/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDistinctFieldValues } from "@itwin/presentation-content";
import { renderHook, waitFor } from "@testing-library/react";
import { useUniqueFieldValues } from "../content-react/UseUniqueFieldValues.js";
import { classA, createPropertyField, createValuesStream } from "./Helpers.js";

import type * as PresentationContent from "@itwin/presentation-content";
import type { ECSchemaProvider, ECSqlQueryExecutor, IPrimitiveValueFormatter, Value } from "@itwin/presentation-shared";

vi.mock("@itwin/presentation-content", async (importOriginal) => ({
  ...(await importOriginal<typeof PresentationContent>()),
  getDistinctFieldValues: vi.fn(),
}));

const imodelAccess = {} as ECSqlQueryExecutor & ECSchemaProvider;
const field = createPropertyField({ id: "a", valueClassNames: [classA] });

function stubDistinctValues(values: Value[]) {
  const stream = createValuesStream(values);
  vi.mocked(getDistinctFieldValues).mockReturnValue(stream.iterable);
  return stream;
}

describe("useUniqueFieldValues", () => {
  beforeEach(() => {
    vi.mocked(getDistinctFieldValues).mockReset();
  });

  it("loads and groups values", async () => {
    stubDistinctValues(["a", "b"]);

    const { result } = renderHook(() => useUniqueFieldValues({ imodelAccess, field }));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.values).toEqual([
      { displayValue: "a", groupedRawValues: ["a"] },
      { displayValue: "b", groupedRawValues: ["b"] },
    ]);
  });

  it("reloads and cancels the previous stream when the field changes", async () => {
    let firstStreamReturned = false;
    vi.mocked(getDistinctFieldValues).mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        [Symbol.asyncIterator]() {
          return this;
        },
        // Never settles — the first load is still in flight when the field changes.
        next: async () => new Promise<IteratorResult<Value>>(() => {}),
        return: async () => {
          firstStreamReturned = true;
          return { value: undefined, done: true } as IteratorResult<Value>;
        },
      }),
    });
    const otherField = createPropertyField({ id: "b", valueClassNames: [classA] });

    const { result, rerender } = renderHook(
      (props: { field: typeof field }) => useUniqueFieldValues({ imodelAccess, field: props.field }),
      { initialProps: { field } },
    );
    expect(result.current.isLoading).toBe(true);

    stubDistinctValues(["b"]);
    rerender({ field: otherField });

    await waitFor(() => {
      expect(result.current.values).toEqual([{ displayValue: "b", groupedRawValues: ["b"] }]);
    });
    expect(firstStreamReturned).toBe(true);
    expect(vi.mocked(getDistinctFieldValues).mock.calls.at(-1)?.[0].field).toBe(otherField);
  });

  it("drops the previous field's values while the new field's values load", async () => {
    stubDistinctValues(["a"]);
    const otherField = createPropertyField({ id: "b", valueClassNames: [classA] });

    const { result, rerender } = renderHook(
      (props: { field: typeof field }) => useUniqueFieldValues({ imodelAccess, field: props.field }),
      { initialProps: { field } },
    );
    await waitFor(() => {
      expect(result.current.values).toEqual([{ displayValue: "a", groupedRawValues: ["a"] }]);
    });

    vi.mocked(getDistinctFieldValues).mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        // Never settles — the new field's values are still loading.
        next: async () => new Promise<IteratorResult<Value>>(() => {}),
      }),
    });
    rerender({ field: otherField });

    expect(result.current).toEqual({ values: [], isLoading: true });
  });

  it("reloads values when the iModel access changes", async () => {
    stubDistinctValues(["a"]);
    const otherIModelAccess = {} as ECSqlQueryExecutor & ECSchemaProvider;

    const { result, rerender } = renderHook(
      (props: { imodelAccess: ECSqlQueryExecutor & ECSchemaProvider }) =>
        useUniqueFieldValues({ imodelAccess: props.imodelAccess, field }),
      { initialProps: { imodelAccess } },
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    stubDistinctValues(["b"]);
    rerender({ imodelAccess: otherIModelAccess });

    await waitFor(() => {
      expect(result.current).toEqual({ values: [{ displayValue: "b", groupedRawValues: ["b"] }], isLoading: false });
    });
    expect(getDistinctFieldValues).toHaveBeenCalledTimes(2);
    expect(vi.mocked(getDistinctFieldValues).mock.calls.at(-1)?.[0].imodelAccess).toBe(otherIModelAccess);
  });

  it("doesn't reload or reformat values when rerendered with the same props", async () => {
    stubDistinctValues(["a"]);
    const valueFormatter = vi.fn(async () => "x");

    const { result, rerender } = renderHook(() => useUniqueFieldValues({ imodelAccess, field, valueFormatter }));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    const values = result.current.values;

    rerender();

    expect(result.current).toEqual({ values, isLoading: false });
    expect(getDistinctFieldValues).toHaveBeenCalledOnce();
    expect(valueFormatter).toHaveBeenCalledOnce();
  });

  it("reformats and regroups loaded values without reloading when the formatter changes", async () => {
    stubDistinctValues(["a", "b"]);
    const sameFormatter = async () => "same";

    const { result, rerender } = renderHook(
      (props: { valueFormatter?: IPrimitiveValueFormatter }) =>
        useUniqueFieldValues({ imodelAccess, field, valueFormatter: props.valueFormatter }),
      { initialProps: {} },
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    const initialValues = [
      { displayValue: "a", groupedRawValues: ["a"] },
      { displayValue: "b", groupedRawValues: ["b"] },
    ];
    expect(result.current.values).toEqual(initialValues);

    rerender({ valueFormatter: sameFormatter });

    expect(result.current).toEqual({ values: initialValues, isLoading: true });
    await waitFor(() => {
      expect(result.current).toEqual({
        values: [{ displayValue: "same", groupedRawValues: ["a", "b"] }],
        isLoading: false,
      });
    });
    expect(getDistinctFieldValues).toHaveBeenCalledOnce();
  });

  it("returns no values when loading fails", async () => {
    const arrayField = createPropertyField({
      id: "a",
      valueClassNames: [classA],
      type: { kind: "array", elementType: { kind: "primitive", type: "String" } },
    });

    const { result } = renderHook(() => useUniqueFieldValues({ imodelAccess, field: arrayField }));

    await waitFor(() => {
      expect(result.current).toEqual({ values: [], isLoading: false });
    });
  });

  it("cancels the stream on unmount", async () => {
    let returned = false;
    vi.mocked(getDistinctFieldValues).mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        [Symbol.asyncIterator]() {
          return this;
        },
        // Never settles — the load is still in flight when the component unmounts.
        next: async () => new Promise<IteratorResult<Value>>(() => {}),
        return: async () => {
          returned = true;
          return { value: undefined, done: true } as IteratorResult<Value>;
        },
      }),
    });

    const { unmount } = renderHook(() => useUniqueFieldValues({ imodelAccess, field }));
    unmount();

    await waitFor(() => {
      expect(returned).toBe(true);
    });
  });
});
