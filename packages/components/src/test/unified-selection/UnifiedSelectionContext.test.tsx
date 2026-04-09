/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { PropsWithChildren, useEffect } from "react";
import { beforeEach, describe, expect, it, MockInstance, vi } from "vitest";
import { IModelConnection } from "@itwin/core-frontend";
import { KeySet } from "@itwin/presentation-common";
import { Presentation, SelectionManager } from "@itwin/presentation-frontend";
import {
  UnifiedSelectionContext,
  UnifiedSelectionContextProvider,
  useUnifiedSelectionContext,
} from "../../presentation-components/unified-selection/UnifiedSelectionContext.js";
import { act, render, renderHook, RenderHookResult, waitFor } from "../TestUtils.js";

describe("UnifiedSelectionContext", () => {
  const testIModel = { key: "" } as IModelConnection;

  function renderUnifiedSelectionContextHook(imodel = {} as IModelConnection, selectionLevel?: number): RenderHookResult<UnifiedSelectionContext, unknown> {
    const Wrapper = ({ children }: PropsWithChildren<unknown>) => {
      return (
        <UnifiedSelectionContextProvider imodel={imodel} selectionLevel={selectionLevel}>
          {children}
        </UnifiedSelectionContextProvider>
      );
    };

    return renderHook(() => useUnifiedSelectionContext()!, {
      wrapper: Wrapper,
    });
  }

  beforeEach(() => {
    const selectionManager = new SelectionManager({ scopes: undefined as any });
    vi.spyOn(Presentation, "selection", "get").mockReturnValue(selectionManager);
    IModelConnection.onOpen.raiseEvent(testIModel);
  });

  it("uses selection level 0 by default", () => {
    const { result } = renderUnifiedSelectionContextHook();
    expect(result.current.selectionLevel).toBe(0);
  });

  it("updates context when selection changes on one level above", async () => {
    const { result } = renderUnifiedSelectionContextHook(testIModel, 1);
    const firstResult = result.current;

    act(() => {
      Presentation.selection.addToSelection("", testIModel, [{ className: "schema:test", id: "1" }], 0);
    });

    await waitFor(() => {
      const secondResult = result.current;
      expect(firstResult).not.toBe(secondResult);
      expect(firstResult.getSelection).not.toBe(secondResult.getSelection);
      expect(firstResult.replaceSelection).toBe(secondResult.replaceSelection);
      expect(firstResult.addToSelection).toBe(secondResult.addToSelection);
      expect(firstResult.clearSelection).toBe(secondResult.clearSelection);
      expect(firstResult.removeFromSelection).toBe(secondResult.removeFromSelection);
    });
  });

  it("does not update context when selection changes one level deeper", () => {
    const { result } = renderUnifiedSelectionContextHook(testIModel);
    const firstResult = result.current;

    act(() => {
      Presentation.selection.addToSelection("", testIModel, [{ className: "schema:test", id: "1" }], 1);
    });
    const secondResult = result.current;

    expect(firstResult.getSelection).toBe(secondResult.getSelection);
  });

  it("updates context when receives different imodel connection", async () => {
    function TestComponent({ onChange }: { onChange: (context: UnifiedSelectionContext | undefined) => void }) {
      const context = useUnifiedSelectionContext();
      useEffect(() => {
        onChange(context);
      }, [context, onChange]);
      return <></>;
    }

    const spy = vi.fn<(context: UnifiedSelectionContext | undefined) => void>();
    const { rerender } = render(
      <UnifiedSelectionContextProvider imodel={testIModel}>
        <TestComponent onChange={spy} />
      </UnifiedSelectionContextProvider>,
    );

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const firstResult = spy.mock.calls[spy.mock.calls.length - 1][0] as UnifiedSelectionContext;

    spy.mockReset();
    const newImodel = {} as IModelConnection;
    rerender(
      <UnifiedSelectionContextProvider imodel={newImodel}>
        <TestComponent onChange={spy} />
      </UnifiedSelectionContextProvider>,
    );

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const secondResult = spy.mock.calls[spy.mock.calls.length - 1][0] as UnifiedSelectionContext;

    expect(firstResult).not.toBe(secondResult);
    expect(firstResult.getSelection).not.toBe(secondResult.getSelection);
    expect(firstResult.replaceSelection).not.toBe(secondResult.replaceSelection);
    expect(firstResult.addToSelection).not.toBe(secondResult.addToSelection);
    expect(firstResult.clearSelection).not.toBe(secondResult.clearSelection);
    expect(firstResult.removeFromSelection).not.toBe(secondResult.removeFromSelection);
  });

  describe("context", () => {
    const keys = new KeySet();

    describe("getSelection", () => {
      let stubGetSelection: MockInstance;

      beforeEach(() => {
        stubGetSelection = vi.spyOn(Presentation.selection, "getSelection").mockReturnValue(keys);
      });

      it("gets current selection", () => {
        const { result } = renderUnifiedSelectionContextHook(testIModel);
        result.current.getSelection(10);
        expect(stubGetSelection).toHaveBeenCalledExactlyOnceWith(testIModel, 10);
      });

      it("makes KeySet reference be different from global KeySet", () => {
        const { result } = renderUnifiedSelectionContextHook(testIModel);
        const returnedKeySet = result.current.getSelection();
        expect(returnedKeySet).not.toBe(keys);
      });

      it("returns same KeySet reference for same selection level", () => {
        const { result } = renderUnifiedSelectionContextHook(testIModel);
        const firstKeySet = result.current.getSelection(10);
        const secondKeySet = result.current.getSelection(10);
        expect(firstKeySet).toBe(secondKeySet);
      });

      it("returns different KeySet reference for different selection level", () => {
        const { result } = renderUnifiedSelectionContextHook(testIModel);
        const firstKeySet = result.current.getSelection(10);
        const secondKeySet = result.current.getSelection(9);
        expect(firstKeySet).not.toBe(secondKeySet);
      });

      it("returns different KeySet reference after selection changes", async () => {
        const { result } = renderUnifiedSelectionContextHook(testIModel);
        const firstKeySet = result.current.getSelection();

        act(() => result.current.addToSelection([{ className: "schema:test", id: "1" }]));

        await waitFor(() => {
          const secondKeySet = result.current.getSelection();
          expect(firstKeySet).not.toBe(secondKeySet);
        });
      });

      it("returns a working KeySet", async () => {
        stubGetSelection.mockRestore();
        const { result } = renderUnifiedSelectionContextHook(testIModel);

        const key = { className: "schema:test", id: "1" };
        act(() => result.current.addToSelection([key]));

        await waitFor(() => {
          const returnedKeySet = result.current.getSelection();
          expect(returnedKeySet.has(key)).toBe(true);
        });
      });
    });

    it("replaces current selection", () => {
      const { result } = renderUnifiedSelectionContextHook(testIModel);
      const stub = vi.spyOn(Presentation.selection, "replaceSelection").mockReturnValue();
      result.current.replaceSelection(keys, 10);
      expect(stub).toHaveBeenCalledExactlyOnceWith("UnifiedSelectionContext", testIModel, keys, 10);
    });

    it("adds to current selection", () => {
      const { result } = renderUnifiedSelectionContextHook(testIModel);
      const stub = vi.spyOn(Presentation.selection, "addToSelection").mockReturnValue();
      result.current.addToSelection(keys, 10);
      expect(stub).toHaveBeenCalledExactlyOnceWith("UnifiedSelectionContext", testIModel, keys, 10);
    });

    it("clears current selection", () => {
      const { result } = renderUnifiedSelectionContextHook(testIModel);
      const stub = vi.spyOn(Presentation.selection, "clearSelection").mockReturnValue();
      result.current.clearSelection(10);
      expect(stub).toHaveBeenCalledExactlyOnceWith("UnifiedSelectionContext", testIModel, 10);
    });

    it("removes from current selection", () => {
      const { result } = renderUnifiedSelectionContextHook(testIModel);
      const stub = vi.spyOn(Presentation.selection, "removeFromSelection").mockReturnValue();
      result.current.removeFromSelection(keys, 10);
      expect(stub).toHaveBeenCalledExactlyOnceWith("UnifiedSelectionContext", testIModel, keys, 10);
    });

    it("uses default selection level when one is not specified", () => {
      const { result } = renderUnifiedSelectionContextHook(testIModel, 4);

      const stubGetSelection = vi.spyOn(Presentation.selection, "getSelection").mockReturnValue(keys);
      result.current.getSelection();
      expect(stubGetSelection).toHaveBeenCalledExactlyOnceWith(testIModel, 4);

      const stubReplaceSelection = vi.spyOn(Presentation.selection, "replaceSelection").mockReturnValue();
      result.current.replaceSelection(keys);
      expect(stubReplaceSelection).toHaveBeenCalledExactlyOnceWith("UnifiedSelectionContext", testIModel, keys, 4);

      const stubAddToSelection = vi.spyOn(Presentation.selection, "addToSelection").mockReturnValue();
      result.current.addToSelection(keys);
      expect(stubAddToSelection).toHaveBeenCalledExactlyOnceWith("UnifiedSelectionContext", testIModel, keys, 4);

      const stubClearSelection = vi.spyOn(Presentation.selection, "clearSelection").mockReturnValue();
      result.current.clearSelection();
      expect(stubClearSelection).toHaveBeenCalledExactlyOnceWith("UnifiedSelectionContext", testIModel, 4);

      const stubRemoveFromSelection = vi.spyOn(Presentation.selection, "removeFromSelection").mockReturnValue();
      result.current.removeFromSelection(keys);
      expect(stubRemoveFromSelection).toHaveBeenCalledExactlyOnceWith("UnifiedSelectionContext", testIModel, keys, 4);
    });
  });

  describe("useUnifiedSelectionContext", () => {
    it("returns `undefined` context when there is no unified selection context", () => {
      const { result } = renderHook(() => useUnifiedSelectionContext());
      expect(result.current).toBeUndefined();
    });
  });
});
