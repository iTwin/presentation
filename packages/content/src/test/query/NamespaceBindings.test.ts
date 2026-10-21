/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { namespaceBindings } from "../../content/query/NamespaceBindings.js";

describe("namespaceBindings", () => {
  it("returns the query unchanged when it has no bindings", () => {
    expect(namespaceBindings({ sql: "SELECT 1", bindings: {}, prefix: "source_" })).to.deep.equal({
      sql: "SELECT 1",
      bindings: {},
    });
  });

  it("renames parameters without changing matching text in literals, identifiers, or comments", () => {
    expect(
      namespaceBindings({
        sql: `SELECT ':value', "x:value", [:value] FROM test WHERE x = :value AND y = :other.value -- :value`,
        bindings: { value: { type: "int", value: 1 }, "other.value": { type: "int", value: 2 } },
        prefix: "source_",
      }),
    ).to.deep.equal({
      sql: `SELECT ':value', "x:value", [:value] FROM test WHERE x = :source_value AND y = :source_other.value -- :value`,
      bindings: Object.fromEntries([
        ["source_value", { type: "int", value: 1 }],
        ["source_other.value", { type: "int", value: 2 }],
      ]),
    });
  });
});
