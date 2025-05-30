/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { expect } from "chai";
import { PropsWithChildren, useEffect } from "react";
import sinon from "sinon";
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
    sinon.stub(Presentation, "selection").get(() => selectionManager);
    IModelConnection.onOpen.raiseEvent(testIModel);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("uses selection level 0 by default", () => {
    const { result } = renderUnifiedSelectionContextHook();
    expect(result.current.selectionLevel).to.be.equal(0);
  });

  it("updates context when selection changes on one level above", async () => {
    const { result } = renderUnifiedSelectionContextHook(testIModel, 1);
    const firstResult = result.current;

    act(() => {
      Presentation.selection.addToSelection("", testIModel, [{ className: "schema:test", id: "1" }], 0);
    });

    await waitFor(() => {
      const secondResult = result.current;
      expect(firstResult).not.to.be.equal(secondResult);
      expect(firstResult.getSelection).not.to.be.equal(secondResult.getSelection);
      expect(firstResult.replaceSelection).to.be.equal(secondResult.replaceSelection);
      expect(firstResult.addToSelection).to.be.equal(secondResult.addToSelection);
      expect(firstResult.clearSelection).to.be.equal(secondResult.clearSelection);
      expect(firstResult.removeFromSelection).to.be.equal(secondResult.removeFromSelection);
    });
  });

  it("does not update context when selection changes one level deeper", () => {
    const { result } = renderUnifiedSelectionContextHook(testIModel);
    const firstResult = result.current;

    act(() => {
      Presentation.selection.addToSelection("", testIModel, [{ className: "schema:test", id: "1" }], 1);
    });
    const secondResult = result.current;

    expect(firstResult.getSelection).to.be.equal(secondResult.getSelection);
  });

  it("updates context when receives different imodel connection", async () => {
    function TestComponent({ onChange }: { onChange: (context: UnifiedSelectionContext | undefined) => void }) {
      const context = useUnifiedSelectionContext();
      useEffect(() => {
        onChange(context);
      }, [context, onChange]);
      return <></>;
    }

    const spy = sinon.stub<[UnifiedSelectionContext | undefined], void>();
    const { rerender } = render(
      <UnifiedSelectionContextProvider imodel={testIModel}>
        <TestComponent onChange={spy} />
      </UnifiedSelectionContextProvider>,
    );

    await waitFor(() => expect(spy).to.be.called);
    const firstResult = spy.args[spy.args.length - 1][0] as UnifiedSelectionContext;

    spy.resetHistory();
    const newImodel = {} as IModelConnection;
    rerender(
      <UnifiedSelectionContextProvider imodel={newImodel}>
        <TestComponent onChange={spy} />
      </UnifiedSelectionContextProvider>,
    );

    await waitFor(() => expect(spy).to.be.called);
    const secondResult = spy.args[spy.args.length - 1][0] as UnifiedSelectionContext;

    expect(firstResult).not.to.be.equal(secondResult);
    expect(firstResult.getSelection).not.to.be.equal(secondResult.getSelection);
    expect(firstResult.replaceSelection).not.to.be.equal(secondResult.replaceSelection);
    expect(firstResult.addToSelection).not.to.be.equal(secondResult.addToSelection);
    expect(firstResult.clearSelection).not.to.be.equal(secondResult.clearSelection);
    expect(firstResult.removeFromSelection).not.to.be.equal(secondResult.removeFromSelection);
  });

  describe("context", () => {
    const keys = new KeySet();

    describe("getSelection", () => {
      let stubGetSelection: sinon.SinonStub<[IModelConnection, number?], Readonly<KeySet>>;

      beforeEach(() => {
        stubGetSelection = sinon.stub(Presentation.selection, "getSelection").returns(keys);
      });

      it("gets current selection", () => {
        const { result } = renderUnifiedSelectionContextHook(testIModel);
        result.current.getSelection(10);
        expect(stubGetSelection).to.have.been.calledOnceWithExactly(testIModel, 10);
      });

      it("makes KeySet reference be different from global KeySet", () => {
        const { result } = renderUnifiedSelectionContextHook(testIModel);
        const returnedKeySet = result.current.getSelection();
        expect(returnedKeySet).not.to.be.equal(keys);
      });

      it("returns same KeySet reference for same selection level", () => {
        const { result } = renderUnifiedSelectionContextHook(testIModel);
        const firstKeySet = result.current.getSelection(10);
        const secondKeySet = result.current.getSelection(10);
        expect(firstKeySet).to.be.equal(secondKeySet);
      });

      it("returns different KeySet reference for different selection level", () => {
        const { result } = renderUnifiedSelectionContextHook(testIModel);
        const firstKeySet = result.current.getSelection(10);
        const secondKeySet = result.current.getSelection(9);
        expect(firstKeySet).not.to.be.equal(secondKeySet);
      });

      it("returns different KeySet reference after selection changes", async () => {
        const { result } = renderUnifiedSelectionContextHook(testIModel);
        const firstKeySet = result.current.getSelection();

        act(() => result.current.addToSelection([{ className: "schema:test", id: "1" }]));

        await waitFor(() => {
          const secondKeySet = result.current.getSelection();
          expect(firstKeySet).not.to.be.equal(secondKeySet);
        });
      });

      it("returns a working KeySet", async () => {
        stubGetSelection.restore();
        const { result } = renderUnifiedSelectionContextHook(testIModel);

        const key = { className: "schema:test", id: "1" };
        act(() => result.current.addToSelection([key]));

        await waitFor(() => {
          const returnedKeySet = result.current.getSelection();
          expect(returnedKeySet.has(key)).to.be.true;
        });
      });
    });

    it("replaces current selection", () => {
      const { result } = renderUnifiedSelectionContextHook(testIModel);
      const stub = sinon.stub(Presentation.selection, "replaceSelection").returns();
      result.current.replaceSelection(keys, 10);
      expect(stub).to.have.been.calledOnceWithExactly("UnifiedSelectionContext", testIModel, keys, 10);
    });

    it("adds to current selection", () => {
      const { result } = renderUnifiedSelectionContextHook(testIModel);
      const stub = sinon.stub(Presentation.selection, "addToSelection").returns();
      result.current.addToSelection(keys, 10);
      expect(stub).to.have.been.calledOnceWithExactly("UnifiedSelectionContext", testIModel, keys, 10);
    });

    it("clears current selection", () => {
      const { result } = renderUnifiedSelectionContextHook(testIModel);
      const stub = sinon.stub(Presentation.selection, "clearSelection").returns();
      result.current.clearSelection(10);
      expect(stub).to.have.been.calledOnceWithExactly("UnifiedSelectionContext", testIModel, 10);
    });

    it("removes from current selection", () => {
      const { result } = renderUnifiedSelectionContextHook(testIModel);
      const stub = sinon.stub(Presentation.selection, "removeFromSelection").returns();
      result.current.removeFromSelection(keys, 10);
      expect(stub).to.have.been.calledOnceWithExactly("UnifiedSelectionContext", testIModel, keys, 10);
    });

    it("uses default selection level when one is not specified", () => {
      const { result } = renderUnifiedSelectionContextHook(testIModel, 4);

      const stubGetSelection = sinon.stub(Presentation.selection, "getSelection").returns(keys);
      result.current.getSelection();
      expect(stubGetSelection).to.have.been.calledOnceWithExactly(testIModel, 4);

      const stubReplaceSelection = sinon.stub(Presentation.selection, "replaceSelection").returns();
      result.current.replaceSelection(keys);
      expect(stubReplaceSelection).to.have.been.calledOnceWithExactly("UnifiedSelectionContext", testIModel, keys, 4);

      const stubAddToSelection = sinon.stub(Presentation.selection, "addToSelection").returns();
      result.current.addToSelection(keys);
      expect(stubAddToSelection).to.have.been.calledOnceWithExactly("UnifiedSelectionContext", testIModel, keys, 4);

      const stubClearSelection = sinon.stub(Presentation.selection, "clearSelection").returns();
      result.current.clearSelection();
      expect(stubClearSelection).to.have.been.calledOnceWithExactly("UnifiedSelectionContext", testIModel, 4);

      const stubRemoveFromSelection = sinon.stub(Presentation.selection, "removeFromSelection").returns();
      result.current.removeFromSelection(keys);
      expect(stubRemoveFromSelection).to.have.been.calledOnceWithExactly("UnifiedSelectionContext", testIModel, keys, 4);
    });
  });

  describe("useUnifiedSelectionContext", () => {
    it("returns `undefined` context when there is no unified selection context", () => {
      const { result } = renderHook(() => useUnifiedSelectionContext());
      expect(result.current).to.be.undefined;
    });
  });
});
