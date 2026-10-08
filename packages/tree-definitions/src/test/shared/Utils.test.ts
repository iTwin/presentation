/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { createHiddenClassesWhereClauseFactory } from "../../tree-definitions/shared/Utils.js";

import type { ECSchemaProvider, HiddenClassesTreeNode } from "@itwin/presentation-shared";

describe("createHiddenClassesWhereClauseFactory", () => {
  it("loads the tree once and synchronously creates predicates for different aliases", async () => {
    const tree: HiddenClassesTreeNode[] = [
      { fullName: "Test.Hidden", state: "hide", children: [{ fullName: "Test.Shown", state: "show", children: [] }] },
    ];
    const schemaProvider = {
      getHiddenClassesTree: vi.fn<ECSchemaProvider["getHiddenClassesTree"]>().mockResolvedValue(tree),
    };
    const visibility = await createHiddenClassesWhereClauseFactory({ schemaProvider, className: "Test.Base" });

    expect(schemaProvider.getHiddenClassesTree).toHaveBeenCalledExactlyOnceWith("Test.Base");
    for (const alias of ["child", "parent"]) {
      expect(visibility(alias)).toBe(
        `([${alias}].[ECClassId] IS NOT ([Test].[Hidden]) OR [${alias}].[ECClassId] IS ([Test].[Shown]))`,
      );
    }
    expect(schemaProvider.getHiddenClassesTree).toHaveBeenCalledTimes(1);
  });

  it("returns empty predicates when the tree has no restrictions", async () => {
    const schemaProvider = {
      getHiddenClassesTree: vi.fn<ECSchemaProvider["getHiddenClassesTree"]>().mockResolvedValue([]),
    };
    const visibility = await createHiddenClassesWhereClauseFactory({ schemaProvider, className: "Test.Base" });

    expect(visibility("child")).toBe("");
    expect(visibility("parent")).toBe("");
    expect(schemaProvider.getHiddenClassesTree).toHaveBeenCalledTimes(1);
  });

  it("fetches the current tree for each new factory", async () => {
    const schemaProvider = {
      getHiddenClassesTree: vi
        .fn<ECSchemaProvider["getHiddenClassesTree"]>()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ fullName: "Test.Hidden", state: "hide", children: [] }]),
    };
    const first = await createHiddenClassesWhereClauseFactory({ schemaProvider, className: "Test.Base" });
    const second = await createHiddenClassesWhereClauseFactory({ schemaProvider, className: "Test.Base" });

    expect(first("child")).toBe("");
    expect(second("child")).toBe("[child].[ECClassId] IS NOT ([Test].[Hidden])");
    expect(schemaProvider.getHiddenClassesTree).toHaveBeenCalledTimes(2);
  });

  it("propagates schema lookup errors", async () => {
    const error = new Error("Schema unavailable");
    const schemaProvider = {
      getHiddenClassesTree: vi.fn<ECSchemaProvider["getHiddenClassesTree"]>().mockRejectedValue(error),
    };

    await expect(createHiddenClassesWhereClauseFactory({ schemaProvider, className: "Test.Base" })).rejects.toBe(error);
  });
});
