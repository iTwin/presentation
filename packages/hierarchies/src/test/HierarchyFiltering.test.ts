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
        { reveal: undefined },
        undefined,
      ];

      it("returns correct result for different reveal options", () => {
        for (let i = 0; i < optionsInOrderOfPriority.length; ++i) {
          for (let j = 0; j < optionsInOrderOfPriority.length; ++j) {
            if (!optionsInOrderOfPriority[i]?.reveal && !optionsInOrderOfPriority[j]?.reveal) {
              expect(HierarchyFilteringPath.mergeOptions(optionsInOrderOfPriority[i], optionsInOrderOfPriority[j])).to.be.undefined;
            } else {
              expect(HierarchyFilteringPath.mergeOptions(optionsInOrderOfPriority[i], optionsInOrderOfPriority[j])).to.deep.eq(
                i < j ? optionsInOrderOfPriority[i] : optionsInOrderOfPriority[j],
              );
            }
          }
        }
      });
    });
    describe("autoExpand", () => {
      it("returns correct result for different autoExpand options", () => {
        expect(HierarchyFilteringPath.mergeOptions({ autoExpand: true }, { autoExpand: true })).to.deep.eq({ autoExpand: true });
        expect(HierarchyFilteringPath.mergeOptions({ autoExpand: true }, { autoExpand: false })).to.deep.eq({ autoExpand: true });
        expect(HierarchyFilteringPath.mergeOptions({ autoExpand: true }, undefined)).to.deep.eq({ autoExpand: true });
        expect(HierarchyFilteringPath.mergeOptions({ autoExpand: false }, undefined)).to.eq(undefined);
        expect(HierarchyFilteringPath.mergeOptions({ autoExpand: false }, { autoExpand: true })).to.deep.eq({ autoExpand: true });
        expect(HierarchyFilteringPath.mergeOptions(undefined, { autoExpand: true })).to.deep.eq({ autoExpand: true });
        expect(HierarchyFilteringPath.mergeOptions(undefined, { autoExpand: false })).to.eq(undefined);
        expect(HierarchyFilteringPath.mergeOptions(undefined, undefined)).to.eq(undefined);
      });
    });
  });
});
