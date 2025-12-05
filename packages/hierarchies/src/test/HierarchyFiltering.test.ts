/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { HierarchyFilteringPath, HierarchyFilteringPathOptions } from "../hierarchies/HierarchyFiltering.js";

describe("HierarchyFilteringPath", () => {
  describe("mergeOptions", () => {
    describe("reveal", () => {
      const optionsInOrderOfPriority: Array<HierarchyFilteringPathOptions | undefined> = [
        { reveal: true },
        { reveal: { depthInPath: 2 } },
        { reveal: { depthInPath: 1 } },
        { reveal: { depthInHierarchy: 4 } },
        { reveal: { depthInHierarchy: 3 } },
        { reveal: false },
        undefined,
      ];

      it("returns correct result for different reveal options", () => {
        for (let i = 0; i < optionsInOrderOfPriority.length; ++i) {
          for (let j = 0; j < optionsInOrderOfPriority.length; ++j) {
            expect(HierarchyFilteringPath.mergeOptions(optionsInOrderOfPriority[i], optionsInOrderOfPriority[j])).to.deep.eq(
              i < j ? optionsInOrderOfPriority[i] : optionsInOrderOfPriority[j],
            );
          }
        }
      });
    });
    describe("autoExpand", () => {
      const autoExpandOptions: Array<HierarchyFilteringPathOptions | undefined> = [{ autoExpand: true }, { autoExpand: false }, undefined];

      it("returns correct result for different autoExpand options", () => {
        for (const autoExpandOption of autoExpandOptions) {
          for (const autoExpandOption2 of autoExpandOptions) {
            expect(HierarchyFilteringPath.mergeOptions(autoExpandOption, autoExpandOption2)).to.deep.eq(
              autoExpandOption || autoExpandOption2 ? { autoExpand: true } : undefined,
            );
          }
        }
      });
    });
  });
});
