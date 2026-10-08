/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createHiddenClassesWhereClause } from "../../shared/ecsql-snippets/ECSqlHiddenClassesSnippets.js";

describe("createHiddenClassesWhereClause", () => {
  it("returns empty string for unrestricted tree", () => {
    expect(createHiddenClassesWhereClause({ tree: [], classAlias: "x" })).toBe("");
  });

  it("excludes hidden classes", () => {
    expect(
      createHiddenClassesWhereClause({
        tree: [
          { fullName: "s.a", state: "hide", children: [] },
          { fullName: "t.b", state: "hide", children: [] },
        ],
        classAlias: "x",
      }),
    ).toBe("[x].[ECClassId] IS NOT ([s].[a], [t].[b])");
  });

  it("includes shown descendants of hidden classes", () => {
    expect(
      createHiddenClassesWhereClause({
        tree: [{ fullName: "s.a", state: "hide", children: [{ fullName: "s.b", state: "show", children: [] }] }],
        classAlias: "x",
      }),
    ).toBe("([x].[ECClassId] IS NOT ([s].[a]) OR [x].[ECClassId] IS ([s].[b]))");
  });

  it("excludes hidden descendants of shown classes", () => {
    expect(
      createHiddenClassesWhereClause({
        tree: [
          {
            fullName: "s.a",
            state: "hide",
            children: [
              { fullName: "s.b", state: "show", children: [{ fullName: "s.c", state: "hide", children: [] }] },
            ],
          },
        ],
        classAlias: "x",
      }),
    ).toBe("([x].[ECClassId] IS NOT ([s].[a]) OR ([x].[ECClassId] IS ([s].[b]) AND [x].[ECClassId] IS NOT ([s].[c])))");
  });

  it("ignores root shown classes, but applies their hidden descendants", () => {
    expect(
      createHiddenClassesWhereClause({
        tree: [
          { fullName: "s.a", state: "show", children: [{ fullName: "s.b", state: "hide", children: [] }] },
          { fullName: "s.c", state: "show", children: [] },
        ],
        classAlias: "x",
      }),
    ).toBe("[x].[ECClassId] IS NOT ([s].[b])");
  });
});
