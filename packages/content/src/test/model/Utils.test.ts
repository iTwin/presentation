/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { computeFieldForkKey, toSortedUniqueClassNames } from "../../content/model/Utils.js";

import type { EC } from "@itwin/presentation-shared";

describe("toSortedUniqueClassNames", () => {
  it("normalizes, de-duplicates, and sorts class names", () => {
    const result = toSortedUniqueClassNames(["Stuff:Window", "Stuff.Door", "Stuff:Window", "Stuff:Door"]);
    expect(result).to.deep.equal(["Stuff.Door", "Stuff.Window"]);
  });
});

describe("computeFieldForkKey", () => {
  it("uses a readable joined key for short subsets", () => {
    expect(computeFieldForkKey(["Stuff:Window", "Stuff:Door"])).to.equal("Stuff.Door;Stuff.Window");
  });

  it("is deterministic and order-independent", () => {
    expect(computeFieldForkKey(["Stuff:Window", "Stuff:Door"])).to.equal(
      computeFieldForkKey(["Stuff:Door", "Stuff:Window"]),
    );
  });

  it("falls back to a bounded hash for long subsets", () => {
    const longSubset = Array.from({ length: 20 }, (_, i) => `Schema.VeryLongClassNameNumber${i}`) as EC.FullClassName[];
    const key = computeFieldForkKey(longSubset);
    expect(key).to.not.contain(";");
    expect(key.length).to.be.lessThan(20);
    // stable across calls
    expect(key).to.equal(computeFieldForkKey(longSubset));
  });
});
