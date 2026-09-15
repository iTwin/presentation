/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { buildKeysetPredicate } from "../../../content/query/value-loading/Keyset.js";

import type { KeysetOrderColumn } from "../../../content/query/value-loading/Keyset.js";

describe("buildKeysetPredicate", () => {
  it("builds an OR-of-AND ladder over the ordered columns", () => {
    const columns: KeysetOrderColumn[] = [
      { expression: "[q].[pres_sort_0]", direction: "asc", type: "String", value: "A" },
      { expression: "[q].[pres_primary_class]", direction: "asc", type: "String", value: "Schema.A" },
      { expression: "[q].[pres_primary_id]", direction: "asc", type: "Id", value: "0x1" },
    ];
    const { clause, bindings } = buildKeysetPredicate({ columns });
    expect(clause).to.equal(
      [
        "[q].[pres_sort_0] > :pres_keyset_0",
        "([q].[pres_sort_0] = :pres_keyset_0 AND [q].[pres_primary_class] > :pres_keyset_1)",
        "([q].[pres_sort_0] = :pres_keyset_0 AND [q].[pres_primary_class] = :pres_keyset_1 AND [q].[pres_primary_id] > :pres_keyset_2)",
      ].join(" OR "),
    );
    expect(bindings).to.deep.equal({
      ["pres_keyset_0"]: { type: "string", value: "A" },
      ["pres_keyset_1"]: { type: "string", value: "Schema.A" },
      ["pres_keyset_2"]: { type: "id", value: "0x1" },
    });
  });

  it("reverses the comparison for descending columns and treats NULL as last", () => {
    const { clause } = buildKeysetPredicate({
      columns: [{ expression: "[q].[pres_sort_0]", direction: "desc", type: "String", value: "M" }],
    });
    expect(clause).to.equal("([q].[pres_sort_0] < :pres_keyset_0 OR [q].[pres_sort_0] IS NULL)");
  });

  it("advances past an ascending NULL cursor to any non-null value", () => {
    const { clause, bindings } = buildKeysetPredicate({
      columns: [
        { expression: "[q].[pres_sort_0]", direction: "asc", type: "String", value: undefined },
        { expression: "[q].[pres_primary_id]", direction: "asc", type: "Id", value: "0x1" },
      ],
    });
    expect(clause).to.equal(
      ["[q].[pres_sort_0] IS NOT NULL", "([q].[pres_sort_0] IS NULL AND [q].[pres_primary_id] > :pres_keyset_1)"].join(
        " OR ",
      ),
    );
    // The NULL cursor column contributes no binding.
    expect(bindings).to.deep.equal({ ["pres_keyset_1"]: { type: "id", value: "0x1" } });
  });

  it("stops on a descending NULL cursor", () => {
    const { clause } = buildKeysetPredicate({
      columns: [
        { expression: "[q].[pres_sort_0]", direction: "desc", type: "String", value: undefined },
        { expression: "[q].[pres_primary_id]", direction: "asc", type: "Id", value: "0x1" },
      ],
    });
    expect(clause).to.equal(
      ["FALSE", "([q].[pres_sort_0] IS NULL AND [q].[pres_primary_id] > :pres_keyset_1)"].join(" OR "),
    );
  });
});
