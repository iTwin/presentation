/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { Observable } from "rxjs";
import * as sinon from "sinon";
import { shareReplayWithErrors } from "../../../hierarchies/internal/operators/ShareReplayWithErrors.js";

describe("shareReplayWithErrors", () => {
  it(`has "replay" behavior`, () => {
    const spy = sinon.spy();
    const source = new Observable(spy);
    const shared = source.pipe(shareReplayWithErrors());
    shared.subscribe();
    shared.subscribe();
    expect(spy).to.be.calledOnce;
  });

  it("replays errors", () => {
    const impl = sinon.fake(() => {
      throw new Error();
    });
    const source = new Observable(impl);
    const shared = source.pipe(shareReplayWithErrors());

    const errorListener1 = sinon.spy();
    shared.subscribe({
      error: errorListener1,
    });
    expect(impl).to.be.calledOnce;
    expect(errorListener1).to.be.calledOnce;

    const errorListener2 = sinon.spy();
    shared.subscribe({
      error: errorListener2,
    });
    expect(impl).to.be.calledOnce;
    expect(errorListener2).to.be.calledOnce;
  });
});
