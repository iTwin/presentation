/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { InstanceKey } from "../../hierarchy-builder/values/Values";

describe("InstanceKey", () => {
  describe("equals", () => {
    it("compares two keys", () => {
      expect(InstanceKey.equals({ className: "a", id: "1" }, { className: "a", id: "1" })).to.be.true;
      expect(InstanceKey.equals({ className: "a", id: "1" }, { className: "b", id: "2" })).to.be.false;
      expect(InstanceKey.equals({ className: "a", id: "1" }, { className: "b", id: "1" })).to.be.false;
      expect(InstanceKey.equals({ className: "a", id: "1" }, { className: "a", id: "2" })).to.be.false;
    });
  });
});
