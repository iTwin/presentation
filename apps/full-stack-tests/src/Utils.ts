/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import sinon from "sinon";

export function stubGetBoundingClientRect() {
  let stub: sinon.SinonStub<[], DOMRect>;

  beforeEach(() => {
    stub = sinon.stub(window.Element.prototype, "getBoundingClientRect").returns({
      height: 20,
      width: 20,
      x: 0,
      y: 0,
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
      toJSON: () => {},
    });
  });

  afterEach(() => {
    stub.restore();
  });
}

export function toDisposable(resource: {} | { [Symbol.dispose]: () => void } | { dispose: () => void }): { [Symbol.dispose]: () => void } {
  return {
    [Symbol.dispose]: () => {
      safeDispose(resource);
    },
  };
}

export function safeDispose(disposable: {} | { [Symbol.dispose]: () => void } | { dispose: () => void }) {
  if ("dispose" in disposable) {
    disposable.dispose();
  } else if (Symbol.dispose in disposable) {
    disposable[Symbol.dispose]();
  }
}
