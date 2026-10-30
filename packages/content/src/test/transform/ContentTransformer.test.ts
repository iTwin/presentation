/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { createContentTransformer } from "../../content/transform/ContentTransformer.js";
import { createDescriptor, createItem, createPropertyField } from "./Helpers.js";

import type { ContentRecords } from "../../content/transform/ContentTransformer.js";

describe("createContentTransformer", () => {
  it("creates initial records with one field entry per descriptor field", () => {
    const fieldA = createPropertyField("a", { categoryId: "cat" });
    const fieldB = createPropertyField("b");
    const descriptor = createDescriptor([fieldA, fieldB], [{ id: "cat", label: "Category" }]);
    const items = [
      createItem({ descriptor, values: { a: "a1", b: 1 } }),
      createItem({ descriptor, primaryKey: { className: "BisCore.Element", id: "0x2" }, values: { a: "a2" } }),
    ];

    const result = createContentTransformer()({ descriptor, items });

    expect(result).to.deep.equal({
      descriptor,
      items,
      categories: descriptor.categories,
      entries: [
        { kind: "field", field: fieldA, categoryId: "cat", values: ["a1", "a2"] },
        { kind: "field", field: fieldB, values: [1, undefined] },
      ],
    });
  });

  it("runs steps in order, passing output of one step to the next", () => {
    const descriptor = createDescriptor([createPropertyField("a")]);
    const first = vi.fn((records: ContentRecords): ContentRecords => ({ ...records, entries: [] }));
    const secondResult = { ...createContentTransformer()({ descriptor, items: [] }) };
    const second = vi.fn((): ContentRecords => secondResult);

    const result = createContentTransformer(first, second)({ descriptor, items: [] });

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledWith(first.mock.results[0].value);
    expect(result).to.equal(secondResult);
  });
});
