/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { HierarchySearchPath, HierarchySearchPathOptions } from "../hierarchies/HierarchySearch.js";

describe("HierarchySearchPath", () => {
  describe("mergeOptions", () => {
    describe("autoExpand", () => {
      const optionsInOrderOfPriority: Array<HierarchySearchPathOptions | undefined> = [
        { autoExpand: true },
        { autoExpand: { depth: 2 } },
        { autoExpand: { depth: 1 } },
        { autoExpand: { depth: 4, includeGroupingNodes: true } },
        { autoExpand: { depth: 3, includeGroupingNodes: true } },
        { autoExpand: false },
        undefined,
      ];

      it("returns correct result for different autoExpand options", () => {
        for (let i = 0; i < optionsInOrderOfPriority.length; ++i) {
          for (let j = 0; j < optionsInOrderOfPriority.length; ++j) {
            expect(HierarchySearchPath.mergeOptions(optionsInOrderOfPriority[i], optionsInOrderOfPriority[j])).to.deep.eq(
              i < j ? optionsInOrderOfPriority[i] : optionsInOrderOfPriority[j],
            );
          }
        }
      });
    });
  });
});
