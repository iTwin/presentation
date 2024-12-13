/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { safeDispose } from "../unified-selection/Utils.js";

describe("safeDispose", () => {
  it("disposes object with `Symbol.dispose` method", () => {
    const disposable = { [Symbol.dispose]: sinon.stub() };
    safeDispose(disposable);
    expect(disposable[Symbol.dispose]).to.be.calledOnce;
  });

  it("disposes object with `dispose` method", () => {
    const disposable = { dispose: sinon.stub() };
    safeDispose(disposable);
    expect(disposable.dispose).to.be.calledOnce;
  });

  it("does nothing with non-disposable object", () => {
    const disposable = { x: 123 };
    expect(() => safeDispose(disposable)).to.not.throw();
  });
});
