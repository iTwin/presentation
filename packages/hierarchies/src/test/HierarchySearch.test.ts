/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  createHierarchySearchHelper,
  HierarchySearchPath,
  HierarchySearchTree,
} from "../hierarchies/HierarchySearch.js";
import { createTestGenericNodeKey, createTestInstanceKey } from "./Utils.js";

import type { Props } from "@itwin/presentation-shared";
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
              expect(
                HierarchySearchPath.mergeOptions(optionsInOrderOfPriority[i], optionsInOrderOfPriority[j]),
              ).toBeUndefined();
            } else {
              expect(
                HierarchySearchPath.mergeOptions(optionsInOrderOfPriority[i], optionsInOrderOfPriority[j]),
              ).toEqual(i < j ? optionsInOrderOfPriority[i] : optionsInOrderOfPriority[j]);
            }
          }
        }
      });
    });

    describe("autoExpand", () => {
      it("returns correct result for different autoExpand options", () => {
        expect(HierarchySearchPath.mergeOptions({ autoExpand: true }, { autoExpand: true })).toEqual({
          autoExpand: true,
        });
        expect(HierarchySearchPath.mergeOptions({ autoExpand: true }, { autoExpand: false })).toEqual({
          autoExpand: true,
        });
        expect(HierarchySearchPath.mergeOptions({ autoExpand: true }, undefined)).toEqual({ autoExpand: true });
        expect(HierarchySearchPath.mergeOptions({ autoExpand: false }, undefined)).toBeUndefined();
        expect(HierarchySearchPath.mergeOptions({ autoExpand: false }, { autoExpand: true })).toEqual({
          autoExpand: true,
        });
        expect(HierarchySearchPath.mergeOptions(undefined, { autoExpand: true })).toEqual({ autoExpand: true });
        expect(HierarchySearchPath.mergeOptions(undefined, { autoExpand: false })).toBeUndefined();
        expect(HierarchySearchPath.mergeOptions(undefined, undefined)).toBeUndefined();
      });
    });
  });
});

describe("HierarchySearchTree", () => {
  describe("createBuilder", () => {
    describe("accept tree", () => {
      it("adds a single tree", async () => {
        const builder = HierarchySearchTree.createBuilder();
        builder.accept({ tree: { identifier: createTestGenericNodeKey({ id: "a" }) } });

        expect(builder.getTree()).toEqual([{ identifier: createTestGenericNodeKey({ id: "a" }) }]);
      });

      it("merges tree branches with the same root", async () => {
        const builder = HierarchySearchTree.createBuilder();
        builder.accept({
          tree: {
            identifier: createTestGenericNodeKey({ id: "a" }),
            children: [{ identifier: createTestGenericNodeKey({ id: "b" }) }],
          },
        });
        builder.accept({
          tree: {
            identifier: createTestGenericNodeKey({ id: "a" }),
            isTarget: true,
            children: [{ identifier: createTestGenericNodeKey({ id: "c" }) }],
          },
        });

        expect(builder.getTree()).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            isTarget: true,
            children: [
              { identifier: createTestGenericNodeKey({ id: "b" }) },
              { identifier: createTestGenericNodeKey({ id: "c" }) },
            ],
          },
        ]);
      });

      it("preserves implied target when extending an existing leaf", async () => {
        const builder = HierarchySearchTree.createBuilder();
        builder.accept({ tree: { identifier: createTestGenericNodeKey({ id: "a" }) } });
        builder.accept({
          tree: {
            identifier: createTestGenericNodeKey({ id: "a" }),
            children: [{ identifier: createTestGenericNodeKey({ id: "b" }) }],
          },
        });

        expect(builder.getTree()).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            isTarget: true,
            children: [{ identifier: createTestGenericNodeKey({ id: "b" }) }],
          },
        ]);
      });

      it("sets as target when node already exists", async () => {
        const builder = HierarchySearchTree.createBuilder();
        builder.accept({
          tree: {
            identifier: createTestGenericNodeKey({ id: "a" }),
            children: [{ identifier: createTestGenericNodeKey({ id: "b" }) }],
          },
        });
        builder.accept({ tree: { identifier: createTestGenericNodeKey({ id: "a" }) } });

        expect(builder.getTree()).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            isTarget: true,
            children: [{ identifier: createTestGenericNodeKey({ id: "b" }) }],
          },
        ]);
      });

      it("merges tree options for matching entries", async () => {
        const builder = HierarchySearchTree.createBuilder();
        builder.accept({
          tree: { identifier: createTestGenericNodeKey({ id: "a" }), options: { autoExpand: { groupingLevel: 1 } } },
        });
        builder.accept({ tree: { identifier: createTestGenericNodeKey({ id: "a" }), options: { autoExpand: true } } });

        expect(builder.getTree()).toEqual([
          { identifier: createTestGenericNodeKey({ id: "a" }), options: { autoExpand: true } },
        ]);
      });
    });

    describe("accept path", () => {
      it("adds a single path in array form", () => {
        const builder = HierarchySearchTree.createBuilder();
        builder.accept({ path: [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" })] });
        expect(builder.getTree()).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            children: [{ identifier: createTestGenericNodeKey({ id: "b" }) }],
          },
        ]);
      });

      it("adds a path in object form and applies path options", () => {
        const builder = HierarchySearchTree.createBuilder();
        builder.accept({
          path: {
            path: [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" })],
            options: { reveal: true },
          },
        });
        expect(builder.getTree()).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: true },
            children: [
              {
                identifier: createTestGenericNodeKey({ id: "b" }),
                options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
              },
            ],
          },
        ]);
      });

      it("merges accepted paths with shared prefix", () => {
        const builder = HierarchySearchTree.createBuilder();
        builder.accept({
          path: {
            path: [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" })],
            options: { reveal: true },
          },
        });
        builder.accept({
          path: {
            path: [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "c" })],
            options: { reveal: true },
          },
        });
        expect(builder.getTree()).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: true },
            children: [
              {
                identifier: createTestGenericNodeKey({ id: "b" }),
                options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
              },
              {
                identifier: createTestGenericNodeKey({ id: "c" }),
                options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
              },
            ],
          },
        ]);
      });

      it("marks node as target when accepting a shorter path after a longer one", () => {
        const builder = HierarchySearchTree.createBuilder();
        builder.accept({
          path: {
            path: [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" })],
            options: { reveal: true },
          },
        });
        builder.accept({ path: { path: [createTestGenericNodeKey({ id: "a" })], options: { reveal: true } } });
        expect(builder.getTree()).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            isTarget: true,
            options: { autoExpand: true },
            children: [
              {
                identifier: createTestGenericNodeKey({ id: "b" }),
                options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
              },
            ],
          },
        ]);
      });

      it("skips path when handler rejects root entry", () => {
        const builder = HierarchySearchTree.createBuilder();
        builder.accept({
          path: [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" })],
          handler: { onNewEntry: () => false },
        });
        expect(builder.getTree()).toEqual([]);
      });
    });

    // Note: These tests are kind of testing test code. Their purpose is to simulate a situation that we expect to have in `@itwin/tree-widget-react` package
    // where we need to merge two search trees in a special way. These tests are here to confirm that kind of merging can be achieved using the `accept` method
    // and its options.
    describe("tree widget sub-tree and search-tree merging", () => {
      type BuilderType = typeof HierarchySearchTree.createBuilder<{
        isSubTreeTarget?: boolean;
        isSubTreeNode?: boolean;
        isSearchTreeNode?: boolean;
        isSearchTarget?: boolean;
        isSearchTargetAncestor?: boolean;
      }>;
      type AcceptHandler = NonNullable<Props<ReturnType<BuilderType>["accept"]>["handler"]>;
      const subTreeAcceptHandler: AcceptHandler = {
        onEntryHandled: ({ treeEntry, inputEntry }) => {
          // Assign extra information to the entry
          treeEntry.extras.isSubTreeTarget ||= inputEntry.isTarget || !inputEntry.hasChildren;
          treeEntry.extras.isSubTreeNode = true;
        },
      };
      const searchTreeAcceptHandler: AcceptHandler = {
        onNewEntry: ({ parentEntries }) => {
          // Only allow adding new entries under sub-tree targets
          const hasSubTreeAncestor = parentEntries.find((entry) => entry.extras.isSubTreeTarget) !== undefined;
          if (!hasSubTreeAncestor) {
            return false;
          }
          // When adding an search-tree entry under a sub-tree, remove the `isTarget` flag - search-tree is more specific.
          //
          // Covers the following case:
          // - sub-tree: [a]
          // - search-tree: [a, b]
          // - expected result:
          //   - a (NOT a target)
          //     - b (implied target)
          const lastEntry = parentEntries.length > 0 ? parentEntries[parentEntries.length - 1] : undefined;
          if (lastEntry?.extras.isSubTreeNode && !lastEntry.extras.isSearchTarget) {
            delete lastEntry.isTarget;
          }
          return true;
        },
        onEntryHandled: ({ treeEntry, inputEntry, parentEntries }) => {
          // Assign extra information to the entry
          treeEntry.extras.isSearchTarget ||= inputEntry.isTarget || !inputEntry.hasChildren;
          treeEntry.extras.isSearchTreeNode = true;

          // Mark all ancestors of search-tree target as search-target-ancestors. This will allow us to keep them in the tree
          // even if they are not sub-tree targets themselves.
          if (treeEntry.extras.isSearchTarget) {
            parentEntries.forEach((parentEntry) => {
              parentEntry.extras.isSearchTargetAncestor = true;
            });
          }

          // If we merged a search-tree entry with sub-tree entry - ensure it doesn't have the `isTarget` flag. Any sub-tree
          // entry must also be a sub-tree target to have the `isTarget` flag.
          //
          // Covers the following case:
          // - sub-tree: [a, b]
          // - search-tree: [a]
          // - expected result:
          //   - a (NOT a target)
          //     - b (implied target)
          if (treeEntry.extras.isSubTreeNode && !treeEntry.extras.isSubTreeTarget) {
            delete treeEntry.isTarget;
          }
        },
      };
      const getTreeProps: Props<ReturnType<BuilderType>["getTree"]> = {
        processEntry: ({ treeEntry, parentEntries }) =>
          // Only include entries that are on the path to search-tree targets. This will allow us to exclude sub-tree branches that are not relevant to search results.
          treeEntry.extras.isSearchTargetAncestor ||
          treeEntry.extras.isSearchTarget ||
          parentEntries.some((parentEntry) => parentEntry.extras.isSearchTarget)
            ? treeEntry
            : undefined,
      };

      it("omits sub-tree branch when it's not above any search-tree target", () => {
        const builder = HierarchySearchTree.createBuilder();
        builder.accept({
          tree: {
            identifier: createTestGenericNodeKey({ id: "a" }),
            children: [
              { identifier: createTestGenericNodeKey({ id: "b" }) },
              { identifier: createTestGenericNodeKey({ id: "c" }) },
            ],
          },
          handler: subTreeAcceptHandler,
        });
        builder.accept({
          tree: {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: true },
            children: [
              {
                identifier: createTestGenericNodeKey({ id: "c" }),
                options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
              },
            ],
          },
          handler: searchTreeAcceptHandler,
        });
        expect(builder.getTree(getTreeProps)).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: true },
            children: [
              {
                identifier: createTestGenericNodeKey({ id: "c" }),
                options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
              },
            ],
          },
        ]);
      });

      it("omits both trees when they don't intersect", () => {
        const builder = HierarchySearchTree.createBuilder();
        builder.accept({ tree: { identifier: createTestGenericNodeKey({ id: "a" }) }, handler: subTreeAcceptHandler });
        builder.accept({
          tree: {
            identifier: createTestGenericNodeKey({ id: "b" }),
            options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
          },
          handler: searchTreeAcceptHandler,
        });
        expect(builder.getTree(getTreeProps)).toEqual([]);
      });

      it("omits both trees when they only intersect above targets", () => {
        const builder = HierarchySearchTree.createBuilder();
        builder.accept({
          tree: {
            identifier: createTestGenericNodeKey({ id: "a" }),
            children: [{ identifier: createTestGenericNodeKey({ id: "b" }) }],
          },
          handler: subTreeAcceptHandler,
        });
        builder.accept({
          tree: {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: true },
            children: [
              {
                identifier: createTestGenericNodeKey({ id: "c" }),
                options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
              },
            ],
          },
          handler: searchTreeAcceptHandler,
        });
        expect(builder.getTree(getTreeProps)).toEqual([]);
      });

      it("doesn't set `isTarget` flag on search-tree path when it's within a sub-tree, but not under a sub-tree target", () => {
        const builder = HierarchySearchTree.createBuilder();
        builder.accept({
          tree: {
            identifier: createTestGenericNodeKey({ id: "a" }),
            children: [{ identifier: createTestGenericNodeKey({ id: "b" }) }],
          },
          handler: subTreeAcceptHandler,
        });
        builder.accept({
          tree: {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
          },
          handler: searchTreeAcceptHandler,
        });
        expect(builder.getTree(getTreeProps)).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
            children: [{ identifier: createTestGenericNodeKey({ id: "b" }) }],
          },
        ]);
      });

      it("merges search-tree target with sub-tree target", () => {
        const builder = HierarchySearchTree.createBuilder();
        builder.accept({ tree: { identifier: createTestGenericNodeKey({ id: "a" }) }, handler: subTreeAcceptHandler });
        builder.accept({
          tree: {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
          },
          handler: searchTreeAcceptHandler,
        });
        expect(builder.getTree(getTreeProps)).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
          },
        ]);
      });

      it("adds search-tree target under sub-tree target and doesn't set `isTarget` flag on sub-tree target", () => {
        const builder = HierarchySearchTree.createBuilder();
        builder.accept({ tree: { identifier: createTestGenericNodeKey({ id: "a" }) }, handler: subTreeAcceptHandler });
        builder.accept({
          tree: {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: true },
            children: [
              {
                identifier: createTestGenericNodeKey({ id: "b" }),
                options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
              },
            ],
          },
          handler: searchTreeAcceptHandler,
        });
        expect(builder.getTree(getTreeProps)).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: true },
            children: [
              {
                identifier: createTestGenericNodeKey({ id: "b" }),
                options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
              },
            ],
          },
        ]);
      });

      it("adds nested search-tree target under sub-tree target and doesn't set `isTarget` flag on sub-tree target", () => {
        const builder = HierarchySearchTree.createBuilder();
        builder.accept({ tree: { identifier: createTestGenericNodeKey({ id: "a" }) }, handler: subTreeAcceptHandler });
        builder.accept({
          tree: {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: true },
            children: [
              {
                identifier: createTestGenericNodeKey({ id: "b" }),
                options: { autoExpand: true },
                children: [
                  {
                    identifier: createTestGenericNodeKey({ id: "c" }),
                    options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                  },
                ],
              },
            ],
          },
          handler: searchTreeAcceptHandler,
        });
        expect(builder.getTree(getTreeProps)).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: true },
            children: [
              {
                identifier: createTestGenericNodeKey({ id: "b" }),
                options: { autoExpand: true },
                children: [
                  {
                    identifier: createTestGenericNodeKey({ id: "c" }),
                    options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                  },
                ],
              },
            ],
          },
        ]);
      });

      it("adds search-tree with multiple targets under sub-tree target", () => {
        const builder = HierarchySearchTree.createBuilder();
        builder.accept({ tree: { identifier: createTestGenericNodeKey({ id: "a" }) }, handler: subTreeAcceptHandler });
        builder.accept({
          tree: {
            identifier: createTestGenericNodeKey({ id: "a" }),
            isTarget: true,
            options: { autoExpand: true },
            children: [
              {
                identifier: createTestGenericNodeKey({ id: "b" }),
                isTarget: true,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: createTestGenericNodeKey({ id: "c" }),
                    options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                  },
                ],
              },
            ],
          },
          handler: searchTreeAcceptHandler,
        });
        expect(builder.getTree(getTreeProps)).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            isTarget: true,
            options: { autoExpand: true },
            children: [
              {
                identifier: createTestGenericNodeKey({ id: "b" }),
                isTarget: true,
                options: { autoExpand: true },
                children: [
                  {
                    identifier: createTestGenericNodeKey({ id: "c" }),
                    options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                  },
                ],
              },
            ],
          },
        ]);
      });
    });
  });

  describe("createFromPathsList", () => {
    it("returns empty array for empty input", async () => {
      expect(await HierarchySearchTree.createFromPathsList([])).toEqual([]);
    });

    it("skips empty paths", async () => {
      const result = await HierarchySearchTree.createFromPathsList([[], [createTestGenericNodeKey({ id: "a" })]]);
      expect(result).toEqual([{ identifier: createTestGenericNodeKey({ id: "a" }) }]);
    });

    it("creates a single root entry from a single-node path", async () => {
      const result = await HierarchySearchTree.createFromPathsList([[createTestGenericNodeKey({ id: "a" })]]);
      expect(result).toEqual([{ identifier: createTestGenericNodeKey({ id: "a" }) }]);
    });

    it("creates a nested tree from a multi-node path", async () => {
      const result = await HierarchySearchTree.createFromPathsList([
        [
          createTestGenericNodeKey({ id: "a" }),
          createTestGenericNodeKey({ id: "b" }),
          createTestGenericNodeKey({ id: "c" }),
        ],
      ]);
      expect(result).toEqual([
        {
          identifier: createTestGenericNodeKey({ id: "a" }),
          children: [
            {
              identifier: createTestGenericNodeKey({ id: "b" }),
              children: [{ identifier: createTestGenericNodeKey({ id: "c" }) }],
            },
          ],
        },
      ]);
    });

    it("handles array-form paths", async () => {
      const result = await HierarchySearchTree.createFromPathsList([
        [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" })],
      ]);
      expect(result).toEqual([
        {
          identifier: createTestGenericNodeKey({ id: "a" }),
          children: [{ identifier: createTestGenericNodeKey({ id: "b" }) }],
        },
      ]);
    });

    it("handles object-form paths", async () => {
      const result = await HierarchySearchTree.createFromPathsList([
        { path: [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" })] },
      ]);
      expect(result).toEqual([
        {
          identifier: createTestGenericNodeKey({ id: "a" }),
          children: [{ identifier: createTestGenericNodeKey({ id: "b" }) }],
        },
      ]);
    });

    it("handles instance key identifiers", async () => {
      const result = await HierarchySearchTree.createFromPathsList([
        [createTestInstanceKey({ id: "0x1" }), createTestInstanceKey({ id: "0x2" })],
      ]);
      expect(result).toEqual([
        {
          identifier: createTestInstanceKey({ id: "0x1" }),
          children: [{ identifier: createTestInstanceKey({ id: "0x2" }) }],
        },
      ]);
    });

    it("merges paths with shared root", async () => {
      const result = await HierarchySearchTree.createFromPathsList([
        [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" })],
        [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "c" })],
      ]);
      expect(result).toEqual([
        {
          identifier: createTestGenericNodeKey({ id: "a" }),
          children: [
            { identifier: createTestGenericNodeKey({ id: "b" }) },
            { identifier: createTestGenericNodeKey({ id: "c" }) },
          ],
        },
      ]);
    });

    it("creates separate roots for unrelated paths", async () => {
      const result = await HierarchySearchTree.createFromPathsList([
        [createTestGenericNodeKey({ id: "a" })],
        [createTestGenericNodeKey({ id: "b" })],
      ]);
      expect(result).toEqual([
        { identifier: createTestGenericNodeKey({ id: "a" }) },
        { identifier: createTestGenericNodeKey({ id: "b" }) },
      ]);
    });

    it("merges paths with shared prefix and diverging suffixes", async () => {
      const result = await HierarchySearchTree.createFromPathsList([
        [
          createTestGenericNodeKey({ id: "a" }),
          createTestGenericNodeKey({ id: "b" }),
          createTestGenericNodeKey({ id: "d" }),
        ],
        [
          createTestGenericNodeKey({ id: "a" }),
          createTestGenericNodeKey({ id: "b" }),
          createTestGenericNodeKey({ id: "e" }),
        ],
      ]);
      expect(result).toEqual([
        {
          identifier: createTestGenericNodeKey({ id: "a" }),
          children: [
            {
              identifier: createTestGenericNodeKey({ id: "b" }),
              children: [
                { identifier: createTestGenericNodeKey({ id: "d" }) },
                { identifier: createTestGenericNodeKey({ id: "e" }) },
              ],
            },
          ],
        },
      ]);
    });

    describe("isTarget", () => {
      it("marks parent as isTarget when extending a previously-leaf node with children", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          [createTestGenericNodeKey({ id: "a" })],
          [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" })],
        ]);
        expect(result).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            isTarget: true,
            children: [{ identifier: createTestGenericNodeKey({ id: "b" }) }],
          },
        ]);
      });

      it("marks node as isTarget when path points to already existing node with children", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" })],
          [createTestGenericNodeKey({ id: "a" })],
        ]);
        expect(result).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            isTarget: true,
            children: [{ identifier: createTestGenericNodeKey({ id: "b" }) }],
          },
        ]);
      });

      it("doesn't set isTarget on intermediate nodes created within the same path", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" })],
        ]);
        expect(result[0].isTarget).toBeUndefined();
      });
    });

    describe("autoExpand option", () => {
      it("sets autoExpand on target when options.autoExpand is true", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          {
            path: [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" })],
            options: { autoExpand: true },
          },
        ]);
        expect(result).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            children: [{ identifier: createTestGenericNodeKey({ id: "b" }), options: { autoExpand: true } }],
          },
        ]);
      });

      it("doesn't set autoExpand when options.autoExpand is false", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          { path: [createTestGenericNodeKey({ id: "a" })], options: { autoExpand: false } },
        ]);
        expect(result).toEqual([{ identifier: createTestGenericNodeKey({ id: "a" }) }]);
      });

      it("doesn't set autoExpand when options.autoExpand is undefined", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          { path: [createTestGenericNodeKey({ id: "a" })] },
        ]);
        expect(result).toEqual([{ identifier: createTestGenericNodeKey({ id: "a" }) }]);
      });
    });

    describe("reveal: true", () => {
      it("auto-expands all ancestors and sets groupingLevel on target", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          {
            path: [
              createTestGenericNodeKey({ id: "a" }),
              createTestGenericNodeKey({ id: "b" }),
              createTestGenericNodeKey({ id: "c" }),
            ],
            options: { reveal: true },
          },
        ]);
        expect(result).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: true },
            children: [
              {
                identifier: createTestGenericNodeKey({ id: "b" }),
                options: { autoExpand: true },
                children: [
                  {
                    identifier: createTestGenericNodeKey({ id: "c" }),
                    options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                  },
                ],
              },
            ],
          },
        ]);
      });

      it("sets groupingLevel on target for single-node path", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          { path: [createTestGenericNodeKey({ id: "a" })], options: { reveal: true } },
        ]);
        expect(result).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
          },
        ]);
      });
    });

    describe("reveal: { groupingLevel }", () => {
      it("auto-expands all ancestors and sets groupingLevel-1 on target", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          {
            path: [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" })],
            options: { reveal: { groupingLevel: 3 } },
          },
        ]);
        expect(result).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: true },
            children: [
              { identifier: createTestGenericNodeKey({ id: "b" }), options: { autoExpand: { groupingLevel: 2 } } },
            ],
          },
        ]);
      });

      it("clamps groupingLevel to 0 when reveal.groupingLevel is 1", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          { path: [createTestGenericNodeKey({ id: "a" })], options: { reveal: { groupingLevel: 1 } } },
        ]);
        expect(result).toEqual([
          { identifier: createTestGenericNodeKey({ id: "a" }), options: { autoExpand: { groupingLevel: 0 } } },
        ]);
      });

      it("clamps groupingLevel to 0 when reveal.groupingLevel is 0", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          { path: [createTestGenericNodeKey({ id: "a" })], options: { reveal: { groupingLevel: 0 } } },
        ]);
        expect(result).toEqual([
          { identifier: createTestGenericNodeKey({ id: "a" }), options: { autoExpand: { groupingLevel: 0 } } },
        ]);
      });
    });

    describe("reveal: { depthInPath }", () => {
      it("auto-expands entries up to depthInPath and sets groupingLevel on entry at depthInPath", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          {
            path: [
              createTestGenericNodeKey({ id: "a" }),
              createTestGenericNodeKey({ id: "b" }),
              createTestGenericNodeKey({ id: "c" }),
            ],
            options: { reveal: { depthInPath: 1 } },
          },
        ]);
        expect(result).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: true },
            children: [
              {
                identifier: createTestGenericNodeKey({ id: "b" }),
                options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
                children: [{ identifier: createTestGenericNodeKey({ id: "c" }) }],
              },
            ],
          },
        ]);
      });

      it("sets groupingLevel on root when depthInPath is 0", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          {
            path: [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" })],
            options: { reveal: { depthInPath: 0 } },
          },
        ]);
        expect(result).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
            children: [{ identifier: createTestGenericNodeKey({ id: "b" }) }],
          },
        ]);
      });

      it("clamps depthInPath to last entry when it exceeds path length", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          {
            path: [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" })],
            options: { reveal: { depthInPath: 10 } },
          },
        ]);
        expect(result).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: true },
            children: [
              {
                identifier: createTestGenericNodeKey({ id: "b" }),
                options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
              },
            ],
          },
        ]);
      });
    });

    describe("reveal: false", () => {
      it("doesn't apply any reveal behavior", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          {
            path: [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" })],
            options: { reveal: false },
          },
        ]);
        expect(result).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            children: [{ identifier: createTestGenericNodeKey({ id: "b" }) }],
          },
        ]);
      });
    });

    describe("combined options", () => {
      it("applies both autoExpand and reveal", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          {
            path: [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" })],
            options: { autoExpand: true, reveal: { groupingLevel: 2 } },
          },
        ]);
        expect(result).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: true },
            children: [{ identifier: createTestGenericNodeKey({ id: "b" }), options: { autoExpand: true } }],
          },
        ]);
      });
    });

    describe("merging from multiple paths", () => {
      it("merges groupingLevel options when multiple paths target the same node", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          { path: [createTestGenericNodeKey({ id: "a" })], options: { reveal: { groupingLevel: 2 } } },
          { path: [createTestGenericNodeKey({ id: "a" })], options: { reveal: { groupingLevel: 4 } } },
        ]);
        expect(result).toEqual([
          { identifier: createTestGenericNodeKey({ id: "a" }), options: { autoExpand: { groupingLevel: 3 } } },
        ]);
      });

      it("merges to true when one path has autoExpand and another has reveal.groupingLevel", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          { path: [createTestGenericNodeKey({ id: "a" })], options: { autoExpand: true } },
          { path: [createTestGenericNodeKey({ id: "a" })], options: { reveal: { groupingLevel: 2 } } },
        ]);
        expect(result).toEqual([{ identifier: createTestGenericNodeKey({ id: "a" }), options: { autoExpand: true } }]);
      });

      it("merges ancestor autoExpand from multiple paths with reveal", async () => {
        const result = await HierarchySearchTree.createFromPathsList([
          {
            path: [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" })],
            options: { reveal: { groupingLevel: 2 } },
          },
          {
            path: [createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "c" })],
            options: { reveal: true },
          },
        ]);
        expect(result).toEqual([
          {
            identifier: createTestGenericNodeKey({ id: "a" }),
            options: { autoExpand: true },
            children: [
              { identifier: createTestGenericNodeKey({ id: "b" }), options: { autoExpand: { groupingLevel: 1 } } },
              {
                identifier: createTestGenericNodeKey({ id: "c" }),
                options: { autoExpand: { groupingLevel: Number.MAX_SAFE_INTEGER } },
              },
            ],
          },
        ]);
      });
    });
  });

  describe("mergeOptions", () => {
    it("returns rhs when lhs is undefined", () => {
      expect(HierarchySearchTree.mergeOptions(undefined, { autoExpand: true })).toEqual({ autoExpand: true });
    });

    it("returns lhs when rhs is undefined", () => {
      expect(HierarchySearchTree.mergeOptions({ autoExpand: true }, undefined)).toEqual({ autoExpand: true });
    });

    it("returns undefined when both are undefined", () => {
      expect(HierarchySearchTree.mergeOptions(undefined, undefined)).toBeUndefined();
    });

    it("returns { autoExpand: true } when both have autoExpand true", () => {
      expect(HierarchySearchTree.mergeOptions({ autoExpand: true }, { autoExpand: true })).toEqual({
        autoExpand: true,
      });
    });

    it("returns { autoExpand: true } when one has true and other has groupingLevel", () => {
      expect(HierarchySearchTree.mergeOptions({ autoExpand: true }, { autoExpand: { groupingLevel: 1 } })).toEqual({
        autoExpand: true,
      });
      expect(HierarchySearchTree.mergeOptions({ autoExpand: { groupingLevel: 1 } }, { autoExpand: true })).toEqual({
        autoExpand: true,
      });
    });

    it("returns larger groupingLevel when both have groupingLevel", () => {
      expect(
        HierarchySearchTree.mergeOptions({ autoExpand: { groupingLevel: 1 } }, { autoExpand: { groupingLevel: 3 } }),
      ).toEqual({ autoExpand: { groupingLevel: 3 } });
      expect(
        HierarchySearchTree.mergeOptions({ autoExpand: { groupingLevel: 3 } }, { autoExpand: { groupingLevel: 1 } }),
      ).toEqual({ autoExpand: { groupingLevel: 3 } });
    });

    it("returns undefined when neither side has autoExpand", () => {
      expect(HierarchySearchTree.mergeOptions({}, {})).toBeUndefined();
    });

    it("returns rhs autoExpand when lhs autoExpand is undefined", () => {
      expect(HierarchySearchTree.mergeOptions({}, { autoExpand: { groupingLevel: 2 } })).toEqual({
        autoExpand: { groupingLevel: 2 },
      });
    });

    it("returns lhs autoExpand when rhs autoExpand is undefined", () => {
      expect(HierarchySearchTree.mergeOptions({ autoExpand: { groupingLevel: 2 } }, {})).toEqual({
        autoExpand: { groupingLevel: 2 },
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
      expect(result).toBeUndefined();
    });

    it("returns undefined child node props when parent node has no search set and search paths are empty", () => {
      const result = createHierarchySearchHelper([], { search: undefined }).createChildNodeProps({
        nodeKey: createTestGenericNodeKey(),
        asyncPathMatcher: async () => true,
      });
      expect(result).toBeUndefined();
    });

    it("returns correct child node props when parent node has no search target paths but has a search target ancestor set and search paths are empty", () => {
      const result = createHierarchySearchHelper([], {
        search: { childrenTargetPaths: undefined, hasSearchTargetAncestor: true },
      }).createChildNodeProps({ nodeKey: createTestGenericNodeKey(), asyncPathMatcher: async () => true });
      expect(result).toEqual({ search: { hasSearchTargetAncestor: true } });
    });

    it("returns correct child node props when parent node has generic node target path", () => {
      const result = createHierarchySearchHelper([], {
        search: {
          childrenTargetPaths: [{ identifier: { type: "generic", id: "test" } }],
          hasSearchTargetAncestor: true,
        },
      }).createChildNodeProps({ nodeKey: { type: "generic", id: "test" } });

      expect(result).toEqual({ search: { hasSearchTargetAncestor: true, isSearchTarget: true } });
    });

    it("returns correct child node props when parent node has instance node target path", () => {
      const result = createHierarchySearchHelper([], {
        search: {
          childrenTargetPaths: [{ identifier: { imodelKey: "a", className: "test:className", id: "id" } }],
          hasSearchTargetAncestor: true,
        },
      }).createChildNodeProps({
        nodeKey: { type: "instances", instanceKeys: [{ imodelKey: "test", className: "test:className", id: "id" }] },
      });

      expect(result).toEqual({ search: { hasSearchTargetAncestor: true } });
    });

    it("returns empty child paths props when parent node has target paths, but has no target ancestor", () => {
      const result = createHierarchySearchHelper([], {
        search: { childrenTargetPaths: [{ identifier: { type: "generic", id: "x" } }], hasSearchTargetAncestor: false },
      }).createChildNodeProps({ nodeKey: createTestGenericNodeKey({ id: "y" }), pathMatcher: () => false });

      expect(result).toEqual({});
    });

    describe("autoExpand", () => {
      it("sets `autoExpand` when provided paths have `autoExpand = true`", () => {
        const result = createHierarchySearchHelper(
          [{ identifier: createTestGenericNodeKey({ id: "x" }), options: { autoExpand: true } }],
          undefined,
        ).createChildNodeProps({ nodeKey: createTestGenericNodeKey({ id: "x" }) });
        expect(result?.autoExpand).toBe(true);
      });

      it("doesn't set `autoExpand` when provided paths have `autoExpand = false`", () => {
        const result = createHierarchySearchHelper(
          [{ identifier: createTestGenericNodeKey({ id: "x" }), options: { autoExpand: false } }],
          undefined,
        ).createChildNodeProps({ nodeKey: createTestGenericNodeKey({ id: "x" }) });
        expect(result?.autoExpand).toBeUndefined();
      });

      it("doesn't set `autoExpand` when provided paths have `autoExpand.groupingLevel`", () => {
        const result = createHierarchySearchHelper(
          [{ identifier: createTestGenericNodeKey({ id: "x" }), options: { autoExpand: { groupingLevel: 1 } } }],
          undefined,
        ).createChildNodeProps({ nodeKey: createTestGenericNodeKey({ id: "x" }) });
        expect(result?.autoExpand).toBeUndefined();
      });
    });
  });
});
