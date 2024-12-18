/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createIModelKey } from "../core-interop/IModelKey.js";

describe("createIModelKey", () => {
  it("returns `key` if set", () => {
    expect(createIModelKey({ key: "k", name: "n" })).to.eq("k");
  });

  it("returns `name` if `key` is not set", () => {
    expect(createIModelKey({ key: "", name: "n" })).to.eq("n");
  });

  it("throws if neither `name` nor `key` are set", () => {
    expect(() => createIModelKey({ key: "", name: "" })).to.throw();
  });
});
