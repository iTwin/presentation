/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { createHiddenClassesFilter } from "../../shared/ecsql-snippets/ECSqlHiddenClassesSnippets.js";

import type { ECSchemaProvider, HiddenClassesTreeNode } from "../../shared/Metadata.js";

describe("createHiddenClassesFilter", () => {
  function createSchemaProvider(tree: HiddenClassesTreeNode[]) {
    return { getHiddenClassesTree: vi.fn<ECSchemaProvider["getHiddenClassesTree"]>().mockResolvedValue(tree) };
  }

  async function createWhereClause(tree: HiddenClassesTreeNode[]) {
    const filter = await createHiddenClassesFilter({
      schemaProvider: createSchemaProvider(tree),
      baseClassName: "s.base",
    });
    return filter.createWhereClause("x");
  }

  it("creates empty clauses when tree is empty", async () => {
    expect(await createWhereClause([])).toBe("");
  });

  it("excludes hidden classes", async () => {
    expect(
      await createWhereClause([
        { fullName: "s.a", state: "hide", children: [] },
        { fullName: "t.b", state: "hide", children: [] },
      ]),
    ).toBe("[x].[ECClassId] IS NOT ([s].[a], [t].[b])");
  });

  it("includes shown descendants of hidden classes", async () => {
    expect(
      await createWhereClause([
        { fullName: "s.a", state: "hide", children: [{ fullName: "s.b", state: "show", children: [] }] },
      ]),
    ).toBe("([x].[ECClassId] IS NOT ([s].[a]) OR [x].[ECClassId] IS ([s].[b]))");
  });

  it("excludes hidden descendants of shown classes", async () => {
    expect(
      await createWhereClause([
        {
          fullName: "s.a",
          state: "hide",
          children: [{ fullName: "s.b", state: "show", children: [{ fullName: "s.c", state: "hide", children: [] }] }],
        },
      ]),
    ).toBe("([x].[ECClassId] IS NOT ([s].[a]) OR ([x].[ECClassId] IS ([s].[b]) AND [x].[ECClassId] IS NOT ([s].[c])))");
  });

  it("ignores root shown classes, but applies their hidden descendants", async () => {
    expect(
      await createWhereClause([
        { fullName: "s.a", state: "show", children: [{ fullName: "s.b", state: "hide", children: [] }] },
        { fullName: "s.c", state: "show", children: [] },
      ]),
    ).toBe("[x].[ECClassId] IS NOT ([s].[b])");
  });

  it("requests tree of the base class once and creates clauses for multiple aliases", async () => {
    const schemaProvider = createSchemaProvider([{ fullName: "s.hidden", state: "hide", children: [] }]);
    const filter = await createHiddenClassesFilter({ schemaProvider, baseClassName: "s.base" });
    expect(filter.createWhereClause("x")).toBe("[x].[ECClassId] IS NOT ([s].[hidden])");
    expect(filter.createWhereClause("y")).toBe("[y].[ECClassId] IS NOT ([s].[hidden])");
    expect(schemaProvider.getHiddenClassesTree).toHaveBeenCalledExactlyOnceWith("s.base");
  });

  it("propagates provider errors", async () => {
    const error = new Error("test error");
    const schemaProvider = {
      getHiddenClassesTree: vi.fn<ECSchemaProvider["getHiddenClassesTree"]>().mockRejectedValue(error),
    };
    await expect(createHiddenClassesFilter({ schemaProvider, baseClassName: "s.base" })).rejects.toBe(error);
  });
});
