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
      const filteringPathOptions: Array<HierarchyFilteringPathOptions | undefined> = [
        { autoExpand: true },
        { autoExpand: false },
        { autoExpand: undefined },
        undefined,
      ];

      it("returns correct result for different autoExpand options", () => {
        for (const lhs of filteringPathOptions) {
          for (const rhs of filteringPathOptions) {
            const mergeResult = HierarchyFilteringPath.mergeOptions(lhs, rhs);
            if (lhs === undefined || rhs === undefined) {
              expect(mergeResult).to.deep.eq(lhs ?? rhs);
            } else {
              expect(mergeResult).to.deep.eq(lhs.autoExpand || rhs.autoExpand ? { autoExpand: true } : {});
            }
          }
        }
      });
    });
  });
});
