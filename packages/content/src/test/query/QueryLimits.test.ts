/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  createJoinBudget,
  packPathsWithinBudget,
  partitionPathsByJoinBudget,
  SQLITE_MAX_JOIN_TABLES,
} from "../../content/query/QueryLimits.js";

import type { ECSql, RelationshipPath } from "@itwin/presentation-shared";
import type { ResolvedPath } from "../../content/ContentTarget.js";

type JoinInfo = Awaited<ReturnType<typeof ECSql.createRelationshipPathJoinInfo>>;

describe("QueryLimits", () => {
  // Minimal join-info builders — only `joinTarget.kind` matters to the table-count logic.
  function classJoin(): JoinInfo["steps"][number]["joins"][number] {
    return {
      joinType: "inner",
      joinTarget: { kind: "class", className: "TestSchema.X" },
      joinAlias: "a",
      joinCondition: "1=1",
    };
  }

  function relationshipSelectJoin(): JoinInfo["steps"][number]["joins"][number] {
    return {
      joinType: "outer",
      joinTarget: {
        kind: "relationship-select",
        relationshipClassName: "TestSchema.R",
        relationshipAlias: "r",
        innerTarget: { kind: "class", className: "TestSchema.X" },
        innerTargetAlias: "t",
        innerJoinCondition: "1=1",
      },
      joinAlias: "r",
      joinCondition: "1=1",
    };
  }

  function step(source: string, relationship: string, target: string, reverse?: boolean): RelationshipPath[number] {
    return {
      sourceClassName: `TestSchema.${source}`,
      relationshipName: `TestSchema.${relationship}`,
      targetClassName: `TestSchema.${target}`,
      ...(reverse ? { relationshipReverse: true } : undefined),
    };
  }

  // A resolved path paired with a join info. `cost` is either the number of single-table class joins
  // to synthesize, or the explicit join entries to use. The single synthesized info step's
  // `targetClassIdSelector` is derived from the path's own class names, so two paths built from
  // different `steps` never accidentally dedupe against one another once merged into a shared budget
  // (mirroring how `assignPrefixAliases` gives every distinct prefix its own stable alias in production).
  function path(
    props: ({ cost: number } | { joins: JoinInfo["steps"][number]["joins"] }) & { steps: RelationshipPath },
  ): ResolvedPath & { joinInfo: JoinInfo } {
    const joins = "cost" in props ? Array.from({ length: props.cost }, classJoin) : props.joins;
    const selector = props.steps.map((s) => s.targetClassName).join(">");
    return {
      path: props.steps,
      targetClassNames: [props.steps[props.steps.length - 1].targetClassName],
      joinInfo: {
        steps: [
          {
            joins,
            relationshipClassIdSelector: selector,
            sourceClassIdSelector: selector,
            targetClassIdSelector: selector,
          },
        ],
      },
    };
  }

  // A single relationship-path hop paired with its own join-info step, for building multi-step paths
  // that genuinely share a prefix hop (the same `hop` reused across two `multiStepPath` calls) so the
  // shared-prefix cost-deduping tests below exercise real, per-hop `targetClassIdSelector` matching.
  function hop(source: string, relationship: string, target: string, cost: number) {
    return {
      step: step(source, relationship, target),
      infoStep: {
        joins: Array.from({ length: cost }, classJoin),
        relationshipClassIdSelector: target,
        sourceClassIdSelector: target,
        targetClassIdSelector: target,
      },
    };
  }

  function multiStepPath(...hops: ReturnType<typeof hop>[]): ResolvedPath & { joinInfo: JoinInfo } {
    return {
      path: hops.map((h) => h.step),
      targetClassNames: [hops[hops.length - 1].step.targetClassName],
      joinInfo: { steps: hops.map((h) => h.infoStep) },
    };
  }

  describe("createJoinBudget", () => {
    it("costOf returns the incremental tables an info would add, without mutating the budget", () => {
      const budget = createJoinBudget({ reservedTables: 0 });
      const a = path({ cost: 3, steps: [step("A", "AtoB", "B")] });
      expect(budget.costOf(a.joinInfo)).to.equal(3);
      // Calling costOf did not mutate the budget, so the same info still costs its full 3 tables.
      expect(budget.costOf(a.joinInfo)).to.equal(3);
      expect(budget.remaining()).to.equal(SQLITE_MAX_JOIN_TABLES);
    });

    it("tryAdd adds an info that fits and reduces remaining() by its cost", () => {
      const budget = createJoinBudget({ reservedTables: 0, budget: 10 });
      const a = path({ cost: 3, steps: [step("A", "AtoB", "B")] });
      expect(budget.tryAdd(a.joinInfo)).to.equal(true);
      expect(budget.remaining()).to.equal(7);
    });

    it("tryAdd rejects an info that would exceed the budget and leaves it unchanged", () => {
      const budget = createJoinBudget({ reservedTables: 0, budget: 2 });
      const a = path({ cost: 3, steps: [step("A", "AtoB", "B")] });
      expect(budget.tryAdd(a.joinInfo)).to.equal(false);
      expect(budget.remaining()).to.equal(2);
    });

    it("remaining() accounts for reservedTables from the start", () => {
      const budget = createJoinBudget({ reservedTables: 5, budget: 10 });
      expect(budget.remaining()).to.equal(5);
    });

    it("costs 0 for a path fully contained in what has already been added", () => {
      const shared = hop("A", "AtoB", "B", 2);
      const full = multiStepPath(shared, hop("B", "BtoC", "C", 2));
      const prefixOnly = multiStepPath(shared);

      const budget = createJoinBudget({ reservedTables: 0 });
      expect(budget.tryAdd(full.joinInfo)).to.equal(true);
      // `prefixOnly`'s single hop is already part of the merged set, so it adds nothing new.
      expect(budget.costOf(prefixOnly.joinInfo)).to.equal(0);
      expect(budget.tryAdd(prefixOnly.joinInfo)).to.equal(true);
    });

    it("charges a path sharing a prefix with one already added only for its own unshared suffix", () => {
      const shared = hop("A", "AtoB", "B", 2);
      const prefix = multiStepPath(shared);
      const extension = multiStepPath(shared, hop("B", "BtoC", "C", 2));

      const budget = createJoinBudget({ reservedTables: 0 });
      expect(budget.tryAdd(prefix.joinInfo)).to.equal(true);
      // `extension` nominally costs 4 (2 hops × 2), but its first hop is already merged in.
      expect(budget.costOf(extension.joinInfo)).to.equal(2);
    });
  });

  describe("partitionPathsByJoinBudget", () => {
    it("returns empty array for no paths", () => {
      expect(partitionPathsByJoinBudget({ paths: [], reservedTables: 0 })).to.deep.equal([]);
    });

    it("packs all paths into one group when they fit the budget", () => {
      const a = path({ cost: 2, steps: [step("A", "AtoB", "B")] });
      const b = path({ cost: 2, steps: [step("A", "AtoC", "C")] });
      expect(partitionPathsByJoinBudget({ paths: [a, b], reservedTables: 0 })).to.deep.equal([[a, b]]);
    });

    it("splits paths across groups when the budget is exhausted", () => {
      const a = path({ cost: 2, steps: [step("A", "AtoB", "B")] });
      const b = path({ cost: 2, steps: [step("A", "AtoC", "C")] });
      // Each path costs 2 tables; a budget of 2 leaves room for one path per group.
      expect(partitionPathsByJoinBudget({ paths: [a, b], reservedTables: 0, budget: 2 })).to.deep.equal([[a], [b]]);
    });

    it("uses each path's own join info for its cost", () => {
      // Single-table nav joins => both paths fit a budget of 2.
      const a = path({ cost: 1, steps: [step("A", "AtoB", "B")] });
      const b = path({ cost: 1, steps: [step("A", "AtoC", "C")] });
      expect(partitionPathsByJoinBudget({ paths: [a, b], reservedTables: 0, budget: 2 })).to.deep.equal([[a, b]]);
    });

    it("counts an outer link-table's relationship-select as two tables", () => {
      // Outer link-table => a relationship-select (2 tables) + the outer target (1) = 3 tables.
      const a = path({ joins: [relationshipSelectJoin(), classJoin()], steps: [step("A", "AtoB", "B")] });
      const b = path({ cost: 1, steps: [step("A", "AtoC", "C")] });
      // `a` alone fills a budget of 3, so `b` (1 table) splits into its own group.
      expect(partitionPathsByJoinBudget({ paths: [a, b], reservedTables: 0, budget: 3 })).to.deep.equal([[a], [b]]);
    });

    it("accounts for reserved tables when computing the available budget", () => {
      const a = path({ cost: 2, steps: [step("A", "AtoB", "B")] });
      const b = path({ cost: 2, steps: [step("A", "AtoC", "C")] });
      // Default budget 64, but 62 reserved leaves only 2 tables => one path per group.
      expect(partitionPathsByJoinBudget({ paths: [a, b], reservedTables: SQLITE_MAX_JOIN_TABLES - 2 })).to.deep.equal([
        [a],
        [b],
      ]);
    });

    it("gives an oversized single path its own group", () => {
      const big = path({ cost: 4, steps: [step("A", "AtoB", "B"), step("B", "BtoC", "C")] });
      const small = path({ cost: 2, steps: [step("A", "AtoD", "D")] });
      // Budget 2 cannot hold the 4-table path, but a path is never split.
      expect(partitionPathsByJoinBudget({ paths: [big, small], reservedTables: 0, budget: 2 })).to.deep.equal([
        [big],
        [small],
      ]);
    });

    it("packs a prefix and its extension into one group even though the per-path sum would not fit", () => {
      const shared = hop("A", "AtoB", "B", 2);
      const prefix = multiStepPath(shared);
      const extension = multiStepPath(shared, hop("B", "BtoC", "C", 2));
      // Per-path sum: 2 + 4 = 6 > a budget of 4. Merged (the shared hop counted once): 2 + 2 = 4, fits.
      expect(partitionPathsByJoinBudget({ paths: [prefix, extension], reservedTables: 0, budget: 4 })).to.deep.equal([
        [prefix, extension],
      ]);
    });

    it("packs sibling paths sharing a prefix into one group even though the per-path sum would not fit", () => {
      const shared = hop("A", "AtoB", "B", 2);
      const siblingC = multiStepPath(shared, hop("B", "BtoC", "C", 2));
      const siblingD = multiStepPath(shared, hop("B", "BtoD", "D", 2));
      // Per-path sum: 4 + 4 = 8 > a budget of 6. Merged (the shared hop counted once): 2 + 2 + 2 = 6, fits.
      expect(partitionPathsByJoinBudget({ paths: [siblingC, siblingD], reservedTables: 0, budget: 6 })).to.deep.equal([
        [siblingC, siblingD],
      ]);
    });

    describe("packPathsWithinBudget", () => {
      it("returns empty fitting and overflow arrays for no paths", () => {
        expect(packPathsWithinBudget({ paths: [], budget: createJoinBudget({ reservedTables: 0 }) })).to.deep.equal({
          fitting: [],
          overflow: [],
        });
      });

      it("keeps all paths when they fit exactly", () => {
        const a = path({ cost: 2, steps: [step("A", "AtoB", "B")] });
        const b = path({ cost: 2, steps: [step("A", "AtoC", "C")] });
        expect(
          packPathsWithinBudget({ paths: [a, b], budget: createJoinBudget({ reservedTables: 1, budget: 5 }) }),
        ).to.deep.equal({ fitting: [a, b], overflow: [] });
      });

      it("routes the first non-fitting path and all later paths to overflow", () => {
        const a = path({ cost: 2, steps: [step("A", "AtoB", "B")] });
        const big = path({ cost: 3, steps: [step("A", "AtoC", "C")] });
        const small = path({ cost: 1, steps: [step("A", "AtoD", "D")] });
        expect(
          packPathsWithinBudget({ paths: [a, big, small], budget: createJoinBudget({ reservedTables: 0, budget: 4 }) }),
        ).to.deep.equal({ fitting: [a], overflow: [big, small] });
      });

      it("routes all paths to overflow when reserved tables consume the budget", () => {
        const a = path({ cost: 1, steps: [step("A", "AtoB", "B")] });
        expect(
          packPathsWithinBudget({ paths: [a], budget: createJoinBudget({ reservedTables: SQLITE_MAX_JOIN_TABLES }) }),
        ).to.deep.equal({ fitting: [], overflow: [a] });
      });

      it("routes an oversized first path to overflow instead of forcing it to fit", () => {
        const big = path({ cost: 4, steps: [step("A", "AtoB", "B"), step("B", "BtoC", "C")] });
        const small = path({ cost: 1, steps: [step("A", "AtoD", "D")] });
        expect(
          packPathsWithinBudget({ paths: [big, small], budget: createJoinBudget({ reservedTables: 0, budget: 2 }) }),
        ).to.deep.equal({ fitting: [], overflow: [big, small] });
      });

      it("packs a path sharing a prefix with an already-added one via the same running budget", () => {
        const shared = hop("A", "AtoB", "B", 2);
        const prefix = multiStepPath(shared);
        const extension = multiStepPath(shared, hop("B", "BtoC", "C", 2));
        // `extension` nominally costs 4; sharing `prefix`'s hop, packing both needs only 2 + 2 = 4 tables.
        expect(
          packPathsWithinBudget({
            paths: [prefix, extension],
            budget: createJoinBudget({ reservedTables: 0, budget: 4 }),
          }),
        ).to.deep.equal({ fitting: [prefix, extension], overflow: [] });
      });
    });
  });
});
