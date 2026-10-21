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

    it("includes instance filters by default", () => {
      const pathA: RelationshipPath = [step({ instanceFilter: { expression: "this.X > 0" } })];
      const pathB: RelationshipPath = [step({ instanceFilter: { expression: "this.X > 1" } })];
      expect(serializeRelationshipPath({ path: pathA })).to.not.equal(serializeRelationshipPath({ path: pathB }));
      expect(serializeRelationshipPath({ path: pathA })).to.not.equal(
        serializeRelationshipPath({ path: pathA, includeInstanceFilters: false }),
      );
    });

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

    it("distinguishes filters with different ID sets", () => {
      const path = (ids: ReadonlySet<string>): RelationshipPath => [
        step({
          instanceFilter: {
            expression: "InVirtualSet(:ids, this.ECInstanceId)",
            bindings: { ids: { type: "idset", value: ids } },
          },
        }),
      ];
      const first = serializeRelationshipPath({ path: path(new Set(["0x1"])) });
      const second = serializeRelationshipPath({ path: path(new Set(["0x2"])) });
      const empty = serializeRelationshipPath({ path: path(new Set()) });

      expect(first).to.not.equal(second);
      expect(first).to.not.equal(empty);
      expect(first).to.contain('"value":["0x1"]');
    });

    it("normalizes ID set insertion order without changing existing array serialization", () => {
      const ids: ReadonlySet<string> = new Set(["0x2", "0x1"]);
      const path = (value: ReadonlySet<string> | readonly string[]): RelationshipPath => [
        step({
          instanceFilter: {
            expression: "InVirtualSet(:ids, this.ECInstanceId)",
            bindings: { ids: { type: "idset", value } },
          },
        }),
      ];

      expect(serializeRelationshipPath({ path: path(ids) })).to.equal(
        serializeRelationshipPath({ path: path(new Set(["0x1", "0x2"])) }),
      );
      expect(serializeRelationshipPath({ path: path(ids) })).to.equal(
        serializeRelationshipPath({ path: path(["0x1", "0x2"]) }),
      );
      expect([...ids]).to.deep.equal(["0x2", "0x1"]);
      expect(serializeRelationshipPath({ path: path(Object.freeze(["0x2", "0x1"])) })).to.contain(
        '"value":["0x2","0x1"]',
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

    it("normalizes filter and binding property order", () => {
      const first: RelationshipPath = [
        step({
          instanceFilter: {
            expression: "InVirtualSet(:ids, this.ECInstanceId)",
            bindings: { ids: { type: "idset", value: new Set(["0x2", "0x1"]) } },
          },
        }),
      ];
      const second: RelationshipPath = [
        step({
          instanceFilter: {
            bindings: { ids: { value: new Set(["0x1", "0x2"]), type: "idset" } },
            expression: "InVirtualSet(:ids, this.ECInstanceId)",
          },
        }),
      ];

      expect(serializeRelationshipPath({ path: first })).to.equal(serializeRelationshipPath({ path: second }));
    });

    it("treats omitted and undefined optional filter properties equally", () => {
      const first: RelationshipPath = [step({ instanceFilter: { expression: "this.X > 0" } })];
      const second: RelationshipPath = [step({ instanceFilter: { expression: "this.X > 0", bindings: undefined } })];

      expect(serializeRelationshipPath({ path: first })).to.equal(serializeRelationshipPath({ path: second }));
    });
  });
});
