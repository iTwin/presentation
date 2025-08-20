/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { HierarchyFilteringPath, HierarchyFilteringPathOptions } from "../hierarchies/HierarchyFiltering.js";

describe("HierarchyFilteringPath", () => {
  describe("mergeOptions", () => {
    describe("autoExpand", () => {
      const optionsInOrderOfPriority: Array<HierarchyFilteringPathOptions | undefined> = [
        { autoExpand: true },
        { autoExpand: { depth: 3 } },
        { autoExpand: { depthInPath: 2 } },
        { autoExpand: { depth: 1 } },
        { autoExpand: { depth: 6, includeGroupingNodes: true } },
        { autoExpand: { depthInHierarchy: 5 } },
        {
          autoExpand: {
            key: {
              type: "label-grouping",
              label: "",
            },
            depth: 4,
          },
        },
        {
          autoExpand: {
            key: {
              type: "label-grouping",
              label: "",
            },
            depth: 3,
          },
        },
        { autoExpand: false },
        undefined,
      ];

      it("returns correct result for different autoExpand options", () => {
        for (let i = 0; i < optionsInOrderOfPriority.length; ++i) {
          for (let j = 0; j < optionsInOrderOfPriority.length; ++j) {
            expect(HierarchyFilteringPath.mergeOptions(optionsInOrderOfPriority[i], optionsInOrderOfPriority[j])).to.deep.eq(
              i < j ? optionsInOrderOfPriority[i] : optionsInOrderOfPriority[j],
            );
          }
        }
      });
    });
  });
});
