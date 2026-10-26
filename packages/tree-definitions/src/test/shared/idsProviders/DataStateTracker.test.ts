/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { combineDataStates } from "../../../tree-definitions/shared/idsProviders/DataStateTracker.js";

import type { IdsProviderDataState } from "../../../tree-definitions/shared/idsProviders/SharedIdsProvider.js";

const statesInPriority: IdsProviderDataState[] = ["failed", "not-requested", "requested", "loaded"];

describe("combineDataStates", () => {
  it("returns `loaded` when there are no states", () => {
    expect(combineDataStates([])).toBe("loaded");
  });

  it.each<IdsProviderDataState>(statesInPriority)("returns the state of a single part: %s", (state) => {
    expect(combineDataStates([state])).toBe(state);
  });

  it.each(
    statesInPriority.flatMap((lhs, lhsIndex) =>
      statesInPriority.map((rhs, rhsIndex) => ({ lhs, rhs, expected: statesInPriority[Math.min(lhsIndex, rhsIndex)] })),
    ),
  )("combines $lhs and $rhs into $expected", ({ lhs, rhs, expected }) => {
    expect(combineDataStates([lhs, rhs])).toBe(expected);
  });
});
