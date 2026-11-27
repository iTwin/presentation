/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { Selectables, TRANSIENT_ELEMENT_CLASSNAME } from "@itwin/unified-selection";
import { createContentTargetsFromSelectables } from "../../content-react/content/ContentTargets.js";
import { classA, classB } from "../Helpers.js";
import { createCustomSelectable } from "./Helpers.js";

describe("createContentTargetsFromSelectables", () => {
  it("creates one target per class", async () => {
    const selectables = Selectables.create([
      { className: classA, id: "0x1" },
      { className: classB, id: "0x2" },
      { className: classA, id: "0x3" },
      { className: classB, id: "0x1" },
    ]);
    await expect(createContentTargetsFromSelectables({ selectables })).resolves.toEqual([
      { primaryClass: classA, instanceIds: ["0x1", "0x3"] },
      { primaryClass: classB, instanceIds: ["0x2", "0x1"] },
    ]);
  });

  it("returns no targets for empty selectables", async () => {
    await expect(createContentTargetsFromSelectables({ selectables: Selectables.create([]) })).resolves.toEqual([]);
  });

  it("skips transient instances", async () => {
    const selectables = Selectables.create([
      { className: TRANSIENT_ELEMENT_CLASSNAME, id: "0x1" },
      { className: classA, id: "0x2" },
    ]);
    await expect(createContentTargetsFromSelectables({ selectables })).resolves.toEqual([
      { primaryClass: classA, instanceIds: ["0x2"] },
    ]);
  });

  it("loads instance keys of custom selectables, normalizing class names and removing duplicates", async () => {
    const selectables = Selectables.create([
      { className: classA, id: "0x1" },
      createCustomSelectable("custom", [
        { className: "TestSchema:A", id: "0x1" },
        { className: "TestSchema:B", id: "0x2" },
        { className: TRANSIENT_ELEMENT_CLASSNAME, id: "0x3" },
      ]),
    ]);
    await expect(createContentTargetsFromSelectables({ selectables })).resolves.toEqual([
      { primaryClass: classA, instanceIds: ["0x1"] },
      { primaryClass: classB, instanceIds: ["0x2"] },
    ]);
  });

  it("rejects when aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("aborted"));
    const selectables = Selectables.create([{ className: classA, id: "0x1" }]);
    await expect(createContentTargetsFromSelectables({ selectables, abortSignal: controller.signal })).rejects.toThrow(
      "aborted",
    );
  });

  it("stops loading custom selectables when aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("aborted");
    let loadedCount = 0;
    let finished = false;
    const selectables = Selectables.create([
      {
        identifier: "custom",
        data: undefined,
        async *loadInstanceKeys() {
          try {
            for (let i = 1; ; ++i) {
              loadedCount = i;
              if (i === 2) {
                controller.abort(reason);
              }
              yield { className: classA, id: `0x${i}` };
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          } finally {
            finished = true;
          }
        },
      },
    ]);
    await expect(createContentTargetsFromSelectables({ selectables, abortSignal: controller.signal })).rejects.toBe(
      reason,
    );
    await vi.waitFor(() => expect(finished).toBe(true));
    const loadedWhenFinished = loadedCount;
    await vi.waitFor(() => expect(loadedCount).toBe(loadedWhenFinished));
  });
});
