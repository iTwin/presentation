/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { renderHook } from "@testing-library/react";
import { useLatest } from "../../presentation-components/hooks/UseLatest";

describe("useLatest", () => {
  it("returns initial value", () => {
    const spy = sinon.spy();
    const { result } = renderHook(() => useLatest(spy));
    result.current.current?.();
    expect(spy).to.be.calledOnce;
  });

  it("returns latest value", () => {
    const spy1 = sinon.spy();
    const spy2 = sinon.spy();
    const { result, rerender } = renderHook((spy) => useLatest(spy), { initialProps: spy1 });
    rerender(spy2);

    result.current.current?.();
    expect(spy1).to.not.be.called;
    expect(spy2).to.be.calledOnce;
  });
});
