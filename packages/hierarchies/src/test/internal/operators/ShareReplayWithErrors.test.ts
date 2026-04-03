/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Observable } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { shareReplayWithErrors } from "../../../hierarchies/internal/operators/ShareReplayWithErrors.js";

describe("shareReplayWithErrors", () => {
  it(`has "replay" behavior`, () => {
    const spy = vi.fn();
    const source = new Observable(spy);
    const shared = source.pipe(shareReplayWithErrors());
    shared.subscribe();
    shared.subscribe();
    expect(spy).toHaveBeenCalledOnce();
  });

  it("replays errors", () => {
    const impl = vi.fn().mockImplementation(() => {
      throw new Error();
    });
    const source = new Observable(impl);
    const shared = source.pipe(shareReplayWithErrors());

    const errorListener1 = vi.fn();
    shared.subscribe({
      error: errorListener1,
    });
    expect(impl).toHaveBeenCalledOnce();
    expect(errorListener1).toHaveBeenCalledOnce();

    const errorListener2 = vi.fn();
    shared.subscribe({
      error: errorListener2,
    });
    expect(impl).toHaveBeenCalledOnce();
    expect(errorListener2).toHaveBeenCalledOnce();
  });
});
