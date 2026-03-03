/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createHierarchySearchHelper, HierarchySearchPath } from "../hierarchies/HierarchySearch.js";
import { createTestGenericNodeKey } from "./Utils.js";

import type { HierarchySearchPathOptions } from "../hierarchies/HierarchySearch.js";

describe("HierarchySearchPath", () => {
  describe("mergeOptions", () => {
    describe("reveal", () => {
      const optionsInOrderOfPriority: Array<HierarchySearchPathOptions | undefined> = [
        { reveal: true },
        { reveal: { groupingLevel: 2 } },
        { reveal: { groupingLevel: 1 } },
        { reveal: { depthInPath: 2 } },
        { reveal: { depthInPath: 1 } },
        { reveal: false },
        { reveal: undefined },
        undefined,
      ];

      it("returns correct result for different reveal options", () => {
        for (let i = 0; i < optionsInOrderOfPriority.length; ++i) {
          for (let j = 0; j < optionsInOrderOfPriority.length; ++j) {
            if (!optionsInOrderOfPriority[i]?.reveal && !optionsInOrderOfPriority[j]?.reveal) {
              expect(HierarchySearchPath.mergeOptions(optionsInOrderOfPriority[i], optionsInOrderOfPriority[j])).to.be.undefined;
            } else {
              expect(HierarchySearchPath.mergeOptions(optionsInOrderOfPriority[i], optionsInOrderOfPriority[j])).to.deep.eq(
                i < j ? optionsInOrderOfPriority[i] : optionsInOrderOfPriority[j],
              );
            }
          }
        }
      });
    });

    describe("autoExpand", () => {
      it("returns correct result for different autoExpand options", () => {
        expect(HierarchySearchPath.mergeOptions({ autoExpand: true }, { autoExpand: true })).to.deep.eq({ autoExpand: true });
        expect(HierarchySearchPath.mergeOptions({ autoExpand: true }, { autoExpand: false })).to.deep.eq({ autoExpand: true });
        expect(HierarchySearchPath.mergeOptions({ autoExpand: true }, undefined)).to.deep.eq({ autoExpand: true });
        expect(HierarchySearchPath.mergeOptions({ autoExpand: false }, undefined)).to.eq(undefined);
        expect(HierarchySearchPath.mergeOptions({ autoExpand: false }, { autoExpand: true })).to.deep.eq({ autoExpand: true });
        expect(HierarchySearchPath.mergeOptions(undefined, { autoExpand: true })).to.deep.eq({ autoExpand: true });
        expect(HierarchySearchPath.mergeOptions(undefined, { autoExpand: false })).to.eq(undefined);
        expect(HierarchySearchPath.mergeOptions(undefined, undefined)).to.eq(undefined);
      });
    });
  });
});

describe("createHierarchySearchHelper", () => {
  describe("createChildNodeProps", () => {
    it("returns undefined child node props when parent node and search paths are undefined", () => {
      const result = createHierarchySearchHelper(undefined, undefined).createChildNodeProps({
        nodeKey: createTestGenericNodeKey(),
        asyncPathMatcher: async () => true,
      });
      expect(result).to.be.undefined;
    });

    it("returns undefined child node props when parent node has no search set and search paths are empty", () => {
      const result = createHierarchySearchHelper([], { parentKeys: [], search: undefined }).createChildNodeProps({
        nodeKey: createTestGenericNodeKey(),
        asyncPathMatcher: async () => true,
      });
      expect(result).to.be.undefined;
    });

    it("returns correct child node props when parent node has no search target paths but has a search target ancestor set and search paths are empty", () => {
      const result = createHierarchySearchHelper([], {
        parentKeys: [],
        search: { childrenTargetPaths: undefined, hasSearchTargetAncestor: true },
      }).createChildNodeProps({
        nodeKey: createTestGenericNodeKey(),
        asyncPathMatcher: async () => true,
      });
      expect(result).to.deep.eq({ search: { hasSearchTargetAncestor: true } });
    });

    it("returns correct child node props when parent node has generic node target path", () => {
      const result = createHierarchySearchHelper([], {
        parentKeys: [],
        search: { childrenTargetPaths: [[{ type: "generic", id: "test" }]], hasSearchTargetAncestor: true },
      }).createChildNodeProps({
        nodeKey: { type: "generic", id: "test" },
      });

      expect(result).to.deep.eq({
        search: {
          hasSearchTargetAncestor: true,
          isSearchTarget: true,
          searchTargetOptions: undefined,
        },
      });
    });

    it("returns correct child node props when parent node has instance node target path", () => {
      const result = createHierarchySearchHelper([], {
        parentKeys: [],
        search: { childrenTargetPaths: [[{ imodelKey: "a", className: "test:className", id: "id" }]], hasSearchTargetAncestor: true },
      }).createChildNodeProps({
        nodeKey: { type: "instances", instanceKeys: [{ imodelKey: "test", className: "test:className", id: "id" }] },
      });

      expect(result).to.deep.eq({
        search: {
          hasSearchTargetAncestor: true,
        },
      });
    });

    it("returns empty child paths props when parent node has target paths, but has no target ancestor", () => {
      const result = createHierarchySearchHelper([], {
        parentKeys: [],
        search: { childrenTargetPaths: [[createTestGenericNodeKey({ id: "x" })]], hasSearchTargetAncestor: false },
      }).createChildNodeProps({
        nodeKey: createTestGenericNodeKey({ id: "y" }),
        pathMatcher: () => false,
      });

      expect(result).to.deep.eq({});
    });

    describe("autoExpand", () => {
      it("sets `autoExpand` when provided paths have `autoExpand = true`", () => {
        const result = createHierarchySearchHelper(
          [{ path: [createTestGenericNodeKey({ id: "x" })], options: { reveal: false, autoExpand: true } }],
          undefined,
        ).createChildNodeProps({
          nodeKey: createTestGenericNodeKey({ id: "x" }),
          pathMatcher: () => true,
        });
        expect(result?.autoExpand).to.be.true;
      });

      it("sets `autoExpand` when children search target options have `reveal = true`", () => {
        const result = createHierarchySearchHelper(
          [{ path: [createTestGenericNodeKey({ id: "x" }), createTestGenericNodeKey({ id: "y" })], options: { reveal: true } }],
          undefined,
        ).createChildNodeProps({
          nodeKey: createTestGenericNodeKey({ id: "x" }),
          pathMatcher: () => true,
        });
        expect(result?.autoExpand).to.be.true;
      });

      it("sets `autoExpand` when children search target options have `reveal.groupingLevel`", () => {
        const result = createHierarchySearchHelper(
          [{ path: [createTestGenericNodeKey({ id: "x" }), createTestGenericNodeKey({ id: "y" })], options: { reveal: { groupingLevel: 1 } } }],
          undefined,
        ).createChildNodeProps({
          nodeKey: createTestGenericNodeKey({ id: "x" }),
          pathMatcher: () => true,
        });
        expect(result?.autoExpand).to.be.true;
      });

      it("sets `autoExpand` when children search target options have `reveal.depthInPath` that meets depth criteria", () => {
        const result = createHierarchySearchHelper(
          [{ path: [createTestGenericNodeKey({ id: "x" }), createTestGenericNodeKey({ id: "y" })], options: { reveal: { depthInPath: 1 } } }],
          undefined,
        ).createChildNodeProps({
          nodeKey: createTestGenericNodeKey({ id: "x" }),
          pathMatcher: () => true,
        });
        expect(result?.autoExpand).to.be.true;
      });

      it("doesn't set `autoExpand` when children search target options have `reveal.depthInPath` that doesn't meet depth criteria", () => {
        const result = createHierarchySearchHelper(
          [
            {
              path: [createTestGenericNodeKey({ id: "x" }), createTestGenericNodeKey({ id: "y" }), createTestGenericNodeKey({ id: "z" })],
              options: { reveal: { depthInPath: 1 } },
            },
          ],
          {
            parentKeys: [createTestGenericNodeKey({ id: "x" })],
            search: {
              hasSearchTargetAncestor: false,
              childrenTargetPaths: [
                {
                  path: [createTestGenericNodeKey({ id: "y" }), createTestGenericNodeKey({ id: "z" })],
                  options: { reveal: { depthInPath: 1 } },
                },
              ],
            },
          },
        ).createChildNodeProps({
          nodeKey: createTestGenericNodeKey({ id: "y" }),
        });
        expect(result?.autoExpand).to.be.undefined;
      });
    });
  });
});
