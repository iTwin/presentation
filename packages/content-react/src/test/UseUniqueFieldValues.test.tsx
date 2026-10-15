/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDistinctFieldValues } from "@itwin/presentation-content";
import { renderHook, waitFor } from "@testing-library/react";
import { useUniqueFieldValues } from "../content-react/UseUniqueFieldValues.js";
import { classA, createDistinctValuesStream, createPropertyField } from "./Helpers.js";

import type * as PresentationContent from "@itwin/presentation-content";
import type { ECSchemaProvider, ECSqlQueryExecutor, Value } from "@itwin/presentation-shared";

vi.mock("@itwin/presentation-content", async (importOriginal) => ({
  ...(await importOriginal<typeof PresentationContent>()),
  getDistinctFieldValues: vi.fn(),
}));

const imodelAccess = {} as ECSqlQueryExecutor & ECSchemaProvider;
const field = createPropertyField({ id: "a", valueClassNames: [classA] });

function stubDistinctValues(values: Value[]) {
  const stream = createDistinctValuesStream(values);
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
