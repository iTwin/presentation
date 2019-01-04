/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as faker from "faker";
import * as React from "react";
import * as utils from "../../common/Utils";

class TestComponent extends React.Component {
}

describe("Utils", () => {

  describe("prioritySortFunction", () => {

    it("sorts by priority", () => {
      const arr = [
        { priority: 2 },
        { priority: 3 },
        { priority: 3 },
        { priority: 1 },
      ];
      arr.sort(utils.prioritySortFunction);
      expect(arr).to.deep.eq([
        { priority: 3 },
        { priority: 3 },
        { priority: 2 },
        { priority: 1 },
      ]);
    });

  });

  describe("getDisplayName", () => {

    beforeEach(() => {
      (TestComponent as any).displayName = undefined;
      Object.defineProperty(TestComponent, "name", { value: undefined });
    });

    it("returns displayName property value, if set", () => {
      const displayName = faker.random.word();
      (TestComponent as any).displayName = displayName;
      expect(utils.getDisplayName(TestComponent)).to.eq(displayName);
    });

    it("returns name property value, if set", () => {
      const displayName = faker.random.word();
      Object.defineProperty(TestComponent, "name", { value: displayName });
      expect(utils.getDisplayName(TestComponent)).to.eq(displayName);
    });

    it("returns 'Component' if neither displayName nor name properties are set", () => {
      expect(utils.getDisplayName(TestComponent)).to.eq("Component");
    });

  });

});
