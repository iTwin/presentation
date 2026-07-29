/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { computeFieldForkKey, serializeRelationshipPath, toSortedUniqueClassNames } from "../../content/model/Utils.js";

import type { EC, RelationshipPath } from "@itwin/presentation-shared";

describe("toSortedUniqueClassNames", () => {
  it("normalizes, de-duplicates, and sorts class names", () => {
    const result = toSortedUniqueClassNames(["Stuff.Window", "Stuff.Door", "Stuff.Window", "Stuff.Door"]);
    expect(result).to.deep.equal(["Stuff.Door", "Stuff.Window"]);
  });
});

describe("computeFieldForkKey", () => {
  it("uses a readable joined key for short subsets", () => {
    expect(computeFieldForkKey(["Stuff.Window", "Stuff.Door"])).to.equal("Stuff.Door;Stuff.Window");
  });

  it("is deterministic and order-independent", () => {
    expect(computeFieldForkKey(["Stuff.Window", "Stuff.Door"])).to.equal(
      computeFieldForkKey(["Stuff.Door", "Stuff.Window"]),
    );
  });

  it("falls back to a bounded hash for long subsets", () => {
    const longSubset = Array.from(
      { length: 20 },
      (_, i): EC.FullClassNameDotNotation => `Schema.VeryLongClassNameNumber${i}`,
    );
    const key = computeFieldForkKey(longSubset);
    expect(key).to.not.contain(";");
    expect(key.length).to.be.lessThan(20);
    // stable across calls
    expect(key).to.equal(computeFieldForkKey(longSubset));
  });
});

describe("serializeRelationshipPath", () => {
  describe("with includeInstanceFilters", () => {
    function step(overrides?: Partial<RelationshipPath[number]>): RelationshipPath[number] {
      return {
        sourceClassName: "Schema.A",
        relationshipName: "Schema.AtoB",
        targetClassName: "Schema.B",
        ...overrides,
      };
    }

    it("matches the plain serialization for a filter-free path", () => {
      const path: RelationshipPath = [step()];
      expect(serializeRelationshipPath({ path, includeInstanceFilters: true })).to.equal(
        serializeRelationshipPath({ path }),
      );
    });

    it("distinguishes paths that differ only by a step instance filter", () => {
      const pathA: RelationshipPath = [step({ instanceFilter: { expression: "this.X > 0" } })];
      const pathB: RelationshipPath = [step({ instanceFilter: { expression: "this.Y > 0" } })];
      expect(serializeRelationshipPath({ path: pathA, includeInstanceFilters: true })).to.not.equal(
        serializeRelationshipPath({ path: pathB, includeInstanceFilters: true }),
      );
      // ...and both differ from the filter-free serialization.
      expect(serializeRelationshipPath({ path: pathA, includeInstanceFilters: true })).to.not.equal(
        serializeRelationshipPath({ path: pathA, includeInstanceFilters: false }),
      );
    });

    it("distinguishes filters that differ only by their bindings", () => {
      const pathA: RelationshipPath = [
        step({ instanceFilter: { expression: "this.X > :p", bindings: { p: { type: "int", value: 1 } } } }),
      ];
      const pathB: RelationshipPath = [
        step({ instanceFilter: { expression: "this.X > :p", bindings: { p: { type: "int", value: 2 } } } }),
      ];
      expect(serializeRelationshipPath({ path: pathA, includeInstanceFilters: true })).to.not.equal(
        serializeRelationshipPath({ path: pathB, includeInstanceFilters: true }),
      );
    });

    it("is deterministic for the same filtered path", () => {
      const path: RelationshipPath = [step({ instanceFilter: { expression: "this.X > 0" } })];
      expect(serializeRelationshipPath({ path, includeInstanceFilters: true })).to.equal(
        serializeRelationshipPath({ path, includeInstanceFilters: true }),
      );
    });

    it("is deterministic for the same filtered path with same bindings", () => {
      const path: RelationshipPath = [
        step({
          instanceFilter: {
            expression: "this.X > :p OR this.Y > :q",
            bindings: { p: { type: "int", value: 1 }, q: { type: "int", value: 2 } },
          },
        }),
      ];
      const path2: RelationshipPath = [
        step({
          instanceFilter: {
            expression: "this.X > :p OR this.Y > :q",
            bindings: { q: { type: "int", value: 2 }, p: { type: "int", value: 1 } },
          },
        }),
      ];
      expect(serializeRelationshipPath({ path, includeInstanceFilters: true })).to.equal(
        serializeRelationshipPath({ path: path2, includeInstanceFilters: true }),
      );
    });
  });
});
