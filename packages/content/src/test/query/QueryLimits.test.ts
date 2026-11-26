/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import {
  createJoinBudget,
  MAX_TABLES_PER_ASPECT_OR_MODEL_CLASS,
  MAX_TABLES_PER_ENTITY_CLASS,
  MAX_TABLES_PER_LINK_TABLE_RELATIONSHIP,
  packPathsWithinBudget,
  partitionPathsByJoinBudget,
  resolveClassTableCounts,
  SQLITE_MAX_JOIN_TABLES,
} from "../../content/query/QueryLimits.js";

import type { EC, ECSql, RelationshipPath } from "@itwin/presentation-shared";
import type { ResolvedPath } from "../../content/ContentTarget.js";

type JoinInfo = Awaited<ReturnType<typeof ECSql.createRelationshipPathJoinInfo>>;

describe("QueryLimits", () => {
  describe("resolveClassTableCounts", () => {
    it("estimates tables for every entity class kind", async () => {
      const bases: Record<string, string> = {
        "TestSchema.Element": "BisCore.Element",
        "TestSchema.Aspect": "BisCore.ElementAspect",
        "TestSchema.Model": "BisCore.Model",
      };
      const classDerivesFrom = vi.fn(
        (derived: EC.FullClassNameDotNotation, candidate: EC.FullClassNameDotNotation) => bases[derived] === candidate,
      );
      const classTableCounts = await resolveClassTableCounts({
        schemaProvider: { classDerivesFrom },
        // `TestSchema.Entity` has no BIS base, like a class in a plain ECDb file.
        classNames: new Set(["TestSchema.Element", "TestSchema.Entity", "TestSchema.Aspect", "TestSchema.Model"]),
      });

      expect(classTableCounts).to.deep.equal(
        new Map([
          ["TestSchema.Element", MAX_TABLES_PER_ENTITY_CLASS],
          ["TestSchema.Entity", MAX_TABLES_PER_ENTITY_CLASS],
          ["TestSchema.Aspect", MAX_TABLES_PER_ASPECT_OR_MODEL_CLASS],
          ["TestSchema.Model", MAX_TABLES_PER_ASPECT_OR_MODEL_CLASS],
        ]),
      );
    });
  });

  // Minimal join-info builders — only `joinTarget.kind` matters to the table-count logic.
  function classJoin(
    className: EC.FullClassNameDotNotation = "TestSchema.X",
  ): JoinInfo["steps"][number]["joins"][number] {
    return { joinType: "inner", joinTarget: { kind: "class", className }, joinAlias: "a", joinCondition: "1=1" };
  }

  function relationshipSelectJoin(
    className: EC.FullClassNameDotNotation = "TestSchema.X",
  ): JoinInfo["steps"][number]["joins"][number] {
    return {
      joinType: "outer",
      joinTarget: {
        kind: "relationship-select",
        relationshipClassName: "TestSchema.R",
        relationshipAlias: "r",
        innerTarget: { kind: "class", className },
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

  // `count` single-class (navigation-property-like) info steps, each costing one class. Selectors are
  // derived from `id`, so infos built for different paths / hops never accidentally dedupe against one
  // another once merged into a shared budget (mirroring how `assignPrefixAliases` gives every distinct
  // prefix its own stable alias in production).
  function classSteps(id: string, count: number): JoinInfo["steps"] {
    return Array.from({ length: count }, (_, i) => ({
      joins: [classJoin()],
      relationshipClassIdSelector: `${id}#${i}`,
      sourceClassIdSelector: `${id}#${i}`,
      targetClassIdSelector: `${id}#${i}`,
    }));
  }

  // A resolved path paired with a join info. `cost` is either the number of classes to join, or the
  // explicit join entries of a single info step.
  function path(
    props: ({ cost: number } | { joins: JoinInfo["steps"][number]["joins"] }) & { steps: RelationshipPath },
  ): ResolvedPath & { joinInfo: JoinInfo } {
    const selector = props.steps.map((s) => s.targetClassName).join(">");
    return {
      path: props.steps,
      targetClassNames: [props.steps[props.steps.length - 1].targetClassName],
      joinInfo: {
        steps:
          "cost" in props
            ? classSteps(selector, props.cost)
            : [
                {
                  joins: props.joins,
                  relationshipClassIdSelector: selector,
                  sourceClassIdSelector: selector,
                  targetClassIdSelector: selector,
                },
              ],
      },
    };
  }

  // A single relationship-path hop paired with its own join-info steps, for building multi-step paths
  // that genuinely share a prefix hop (the same `hop` reused across two `multiStepPath` calls) so the
  // shared-prefix cost-deduping tests below exercise real, per-hop `targetClassIdSelector` matching.
  function hop(source: string, relationship: string, target: string, cost: number) {
    return { step: step(source, relationship, target), infoSteps: classSteps(target, cost) };
  }

  function multiStepPath(...hops: ReturnType<typeof hop>[]): ResolvedPath & { joinInfo: JoinInfo } {
    return {
      path: hops.map((h) => h.step),
      targetClassNames: [hops[hops.length - 1].step.targetClassName],
      joinInfo: { steps: hops.flatMap((h) => h.infoSteps) },
    };
  }

  describe("createJoinBudget", () => {
    it("costOf returns the incremental tables an info would add, without mutating the budget", () => {
      const budget = createJoinBudget({ reservedTables: 0 });
      const a = path({ cost: 3, steps: [step("A", "AtoB", "B")] });
      // Every joined class is counted at the default MAX_TABLES_PER_ENTITY_CLASS tables.
      expect(budget.costOf(a.joinInfo)).to.equal(3 * MAX_TABLES_PER_ENTITY_CLASS);
      // Calling costOf did not mutate the budget, so the same info still costs its full 3 * MAX_TABLES_PER_ENTITY_CLASS tables.
      expect(budget.costOf(a.joinInfo)).to.equal(3 * MAX_TABLES_PER_ENTITY_CLASS);
      expect(budget.remaining()).to.equal(SQLITE_MAX_JOIN_TABLES);
    });

    it("tryAdd adds an info that fits and reduces remaining() by its cost", () => {
      const budget = createJoinBudget({ reservedTables: 0, budget: 10 * MAX_TABLES_PER_ENTITY_CLASS });
      const a = path({ cost: 3, steps: [step("A", "AtoB", "B")] });
      expect(budget.tryAdd(a.joinInfo)).to.equal(true);
      expect(budget.remaining()).to.equal(7 * MAX_TABLES_PER_ENTITY_CLASS);
    });

    it("tryAdd rejects an info that would exceed the budget and leaves it unchanged", () => {
      const budget = createJoinBudget({ reservedTables: 0, budget: 2 * MAX_TABLES_PER_ENTITY_CLASS });
      const a = path({ cost: 3, steps: [step("A", "AtoB", "B")] });
      expect(budget.tryAdd(a.joinInfo)).to.equal(false);
      expect(budget.remaining()).to.equal(2 * MAX_TABLES_PER_ENTITY_CLASS);
    });

    it("does not validate conflicting bindings for an info that exceeds the budget", () => {
      const budget = createJoinBudget({ reservedTables: 0, budget: MAX_TABLES_PER_ENTITY_CLASS });
      const a = path({ cost: 1, steps: [step("A", "AtoB", "B")] });
      const b = path({ cost: 1, steps: [step("A", "AtoC", "C")] });
      a.joinInfo.bindings = { p: { type: "int", value: 1 } };
      b.joinInfo.bindings = { p: { type: "int", value: 2 } };

      expect(budget.tryAdd(a.joinInfo)).to.equal(true);
      expect(budget.tryAdd(b.joinInfo)).to.equal(false);
    });

    it("rejects conflicting bindings when an info fits the budget", () => {
      const budget = createJoinBudget({ reservedTables: 0, budget: 2 * MAX_TABLES_PER_ENTITY_CLASS });
      const a = path({ cost: 1, steps: [step("A", "AtoB", "B")] });
      const b = path({ cost: 1, steps: [step("A", "AtoC", "C")] });
      a.joinInfo.bindings = { p: { type: "int", value: 1 } };
      b.joinInfo.bindings = { p: { type: "int", value: 2 } };

      expect(budget.tryAdd(a.joinInfo)).to.equal(true);
      expect(() => budget.tryAdd(b.joinInfo)).to.throw('Duplicate ECSQL binding name "p"');
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
      // `extension` nominally costs 4 classes (2 hops × 2), but its first hop is already merged in.
      expect(budget.costOf(extension.joinInfo)).to.equal(2 * MAX_TABLES_PER_ENTITY_CLASS);
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
      // Each path joins 2 classes; a budget of 2 classes leaves room for one path per group.
      expect(
        partitionPathsByJoinBudget({ paths: [a, b], reservedTables: 0, budget: 2 * MAX_TABLES_PER_ENTITY_CLASS }),
      ).to.deep.equal([[a], [b]]);
    });

    it("uses each path's own join info for its cost", () => {
      // Single-class nav joins => both paths fit a budget of 2 classes.
      const a = path({ cost: 1, steps: [step("A", "AtoB", "B")] });
      const b = path({ cost: 1, steps: [step("A", "AtoC", "C")] });
      expect(
        partitionPathsByJoinBudget({ paths: [a, b], reservedTables: 0, budget: 2 * MAX_TABLES_PER_ENTITY_CLASS }),
      ).to.deep.equal([[a, b]]);
    });

    it("counts entity, aspect or model, and link-table relationship joins at their estimated table counts", () => {
      const classTableCounts = new Map([
        ["TestSchema.Element", MAX_TABLES_PER_ENTITY_CLASS],
        ["TestSchema.Model", MAX_TABLES_PER_ASPECT_OR_MODEL_CLASS],
        ["TestSchema.Target", MAX_TABLES_PER_ASPECT_OR_MODEL_CLASS],
      ]);
      const budget = createJoinBudget({ reservedTables: 0, classTableCounts });
      const element = path({ joins: [classJoin("TestSchema.Element")], steps: [step("A", "AtoB", "B")] });
      const model = path({ joins: [classJoin("TestSchema.Model")], steps: [step("A", "AtoC", "C")] });
      expect(budget.costOf(element.joinInfo)).to.equal(MAX_TABLES_PER_ENTITY_CLASS);
      expect(budget.costOf(model.joinInfo)).to.equal(MAX_TABLES_PER_ASPECT_OR_MODEL_CLASS);

      // Inner link-table => the relationship plus the target entity class.
      const inner = path({
        joins: [classJoin("TestSchema.R"), classJoin("TestSchema.Target")],
        steps: [step("A", "AtoD", "D")],
      });
      expect(budget.costOf(inner.joinInfo)).to.equal(
        MAX_TABLES_PER_LINK_TABLE_RELATIONSHIP + MAX_TABLES_PER_ASPECT_OR_MODEL_CLASS,
      );
      // Outer link-table => relationship + inner target, and then the outer target again.
      const outer = path({
        joins: [relationshipSelectJoin("TestSchema.Target"), classJoin("TestSchema.Target")],
        steps: [step("A", "AtoE", "E")],
      });
      expect(budget.costOf(outer.joinInfo)).to.equal(
        MAX_TABLES_PER_LINK_TABLE_RELATIONSHIP + 2 * MAX_TABLES_PER_ASPECT_OR_MODEL_CLASS,
      );
    });

    it("accounts for reserved tables when computing the available budget", () => {
      const a = path({ cost: 2, steps: [step("A", "AtoB", "B")] });
      const b = path({ cost: 2, steps: [step("A", "AtoC", "C")] });
      // Default budget 64, but the reserved tables leave room for only 2 classes => one path per group.
      expect(
        partitionPathsByJoinBudget({
          paths: [a, b],
          reservedTables: SQLITE_MAX_JOIN_TABLES - 2 * MAX_TABLES_PER_ENTITY_CLASS,
        }),
      ).to.deep.equal([[a], [b]]);
    });

    it("rejects an oversized single path", () => {
      const big = path({ cost: 4, steps: [step("A", "AtoB", "B"), step("B", "BtoC", "C")] });
      const small = path({ cost: 2, steps: [step("A", "AtoD", "D")] });
      expect(() => partitionPathsByJoinBudget({ paths: [big, small], reservedTables: 0, budget: 2 })).to.throw(
        "A relationship path exceeds the SQLite JOIN-table limit.",
      );
    });

    it("packs a prefix and its extension into one group even though the per-path sum would not fit", () => {
      const shared = hop("A", "AtoB", "B", 2);
      const prefix = multiStepPath(shared);
      const extension = multiStepPath(shared, hop("B", "BtoC", "C", 2));
      // Per-path sum: 2 + 4 = 6 > a budget of 4 classes. Merged (the shared hop counted once): 2 + 2 = 4, fits.
      expect(
        partitionPathsByJoinBudget({
          paths: [prefix, extension],
          reservedTables: 0,
          budget: 4 * MAX_TABLES_PER_ENTITY_CLASS,
        }),
      ).to.deep.equal([[prefix, extension]]);
    });

    it("packs sibling paths sharing a prefix into one group even though the per-path sum would not fit", () => {
      const shared = hop("A", "AtoB", "B", 2);
      const siblingC = multiStepPath(shared, hop("B", "BtoC", "C", 2));
      const siblingD = multiStepPath(shared, hop("B", "BtoD", "D", 2));
      // Per-path sum: 4 + 4 = 8 > a budget of 6 classes. Merged (the shared hop counted once): 2 + 2 + 2 = 6, fits.
      expect(
        partitionPathsByJoinBudget({
          paths: [siblingC, siblingD],
          reservedTables: 0,
          budget: 6 * MAX_TABLES_PER_ENTITY_CLASS,
        }),
      ).to.deep.equal([[siblingC, siblingD]]);
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
          packPathsWithinBudget({
            paths: [a, b],
            budget: createJoinBudget({
              reservedTables: MAX_TABLES_PER_ENTITY_CLASS,
              budget: 5 * MAX_TABLES_PER_ENTITY_CLASS,
            }),
          }),
        ).to.deep.equal({ fitting: [a, b], overflow: [] });
      });

      it("routes the first non-fitting path and all later paths to overflow", () => {
        const a = path({ cost: 2, steps: [step("A", "AtoB", "B")] });
        const big = path({ cost: 3, steps: [step("A", "AtoC", "C")] });
        const small = path({ cost: 1, steps: [step("A", "AtoD", "D")] });
        expect(
          packPathsWithinBudget({
            paths: [a, big, small],
            budget: createJoinBudget({ reservedTables: 0, budget: 4 * MAX_TABLES_PER_ENTITY_CLASS }),
          }),
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
        // `extension` nominally joins 4 classes; sharing `prefix`'s hop, packing both needs only 2 + 2 = 4.
        expect(
          packPathsWithinBudget({
            paths: [prefix, extension],
            budget: createJoinBudget({ reservedTables: 0, budget: 4 * MAX_TABLES_PER_ENTITY_CLASS }),
          }),
        ).to.deep.equal({ fitting: [prefix, extension], overflow: [] });
      });
    });
  });
});
