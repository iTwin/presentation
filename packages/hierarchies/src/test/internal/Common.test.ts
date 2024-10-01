/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { hasChildren } from "../../hierarchies/internal/Common";

describe("hasChildren", () => {
  it("returns correct value", () => {
    expect(hasChildren({ children: undefined })).to.be.false;
    expect(hasChildren({ children: false })).to.be.false;
    expect(hasChildren({ children: [] })).to.be.false;
    expect(hasChildren({ children: true })).to.be.true;
    expect(hasChildren({ children: [1] })).to.be.true;
  });
});
