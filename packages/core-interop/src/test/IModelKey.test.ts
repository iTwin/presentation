/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createIModelKey } from "../core-interop/IModelKey.js";

describe("createIModelKey", () => {
  it("returns `key` if set", () => {
    expect(createIModelKey({ key: "k", name: "n" })).toBe("k");
  });

  it("returns `name` if `key` is not set", () => {
    expect(createIModelKey({ key: "", name: "n" })).toBe("n");
  });

  it("throws if neither `name` nor `key` are set", () => {
    expect(() => createIModelKey({ key: "", name: "" })).toThrow();
  });
});
