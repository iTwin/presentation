/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
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

  describe("partitionPathsByJoinBudget", () => {
    function step(source: string, relationship: string, target: string, reverse?: boolean): RelationshipPath[number] {
      return {
        sourceClassName: `TestSchema.${source}`,
        relationshipName: `TestSchema.${relationship}`,
        targetClassName: `TestSchema.${target}`,
        ...(reverse ? { relationshipReverse: true } : undefined),
      };
    }

    // A resolved path paired with a join info. `cost` is either the number of single-table class
    // joins to synthesize, or the explicit join entries to use.
    function path(
      props: ({ cost: number } | { joins: JoinInfo["steps"][number]["joins"] }) & { steps: RelationshipPath },
    ): ResolvedPath & { joinInfo: JoinInfo } {
      const joins = "cost" in props ? Array.from({ length: props.cost }, classJoin) : props.joins;
      // Only the flattened join entries matter to the table-count logic, so wrap them in a single step.
      return {
        path: props.steps,
        targetClassNames: [props.steps[props.steps.length - 1].targetClassName],
        joinInfo: {
          steps: [{ joins, relationshipClassIdSelector: "", sourceClassIdSelector: "", targetClassIdSelector: "" }],
        },
      };
    }

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

    describe("packPathsWithinBudget", () => {
      it("returns empty fitting and overflow arrays for no paths", () => {
        expect(packPathsWithinBudget({ paths: [], reservedTables: 0 })).to.deep.equal({ fitting: [], overflow: [] });
      });

      it("keeps all paths when they fit exactly", () => {
        const a = path({ cost: 2, steps: [step("A", "AtoB", "B")] });
        const b = path({ cost: 2, steps: [step("A", "AtoC", "C")] });
        expect(packPathsWithinBudget({ paths: [a, b], reservedTables: 1, budget: 5 })).to.deep.equal({
          fitting: [a, b],
          overflow: [],
        });
      });

      it("routes the first non-fitting path and all later paths to overflow", () => {
        const a = path({ cost: 2, steps: [step("A", "AtoB", "B")] });
        const big = path({ cost: 3, steps: [step("A", "AtoC", "C")] });
        const small = path({ cost: 1, steps: [step("A", "AtoD", "D")] });
        expect(packPathsWithinBudget({ paths: [a, big, small], reservedTables: 0, budget: 4 })).to.deep.equal({
          fitting: [a],
          overflow: [big, small],
        });
      });

      it("routes all paths to overflow when reserved tables consume the budget", () => {
        const a = path({ cost: 1, steps: [step("A", "AtoB", "B")] });
        expect(packPathsWithinBudget({ paths: [a], reservedTables: SQLITE_MAX_JOIN_TABLES })).to.deep.equal({
          fitting: [],
          overflow: [a],
        });
      });

      it("routes an oversized first path to overflow instead of forcing it to fit", () => {
        const big = path({ cost: 4, steps: [step("A", "AtoB", "B"), step("B", "BtoC", "C")] });
        const small = path({ cost: 1, steps: [step("A", "AtoD", "D")] });
        expect(packPathsWithinBudget({ paths: [big, small], reservedTables: 0, budget: 2 })).to.deep.equal({
          fitting: [],
          overflow: [big, small],
        });
      });
    });
  });
});
