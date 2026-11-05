/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { transformContent } from "../../content/transform/TransformContent.js";
import { createDescriptor, createItem, createPropertyField } from "./Helpers.js";

import type { ContentRecords, ContentTransformContext } from "../../content/transform/TransformContent.js";

describe("transformContent", () => {
  it("creates initial records with one field entry per descriptor field", () => {
    const fieldA = createPropertyField("a");
    const fieldB = createPropertyField("b");
    const descriptor = createDescriptor([fieldA, fieldB]);
    const items = [
      createItem({ descriptor, values: { a: "a1", b: 1 } }),
      createItem({ descriptor, primaryKey: { className: "BisCore.Element", id: "0x2" }, values: { a: "a2" } }),
    ];

    const result = transformContent({ descriptor, items }, { steps: [] });

    expect(result).to.deep.equal({
      entries: [
        { kind: "field", field: fieldA, values: ["a1", "a2"] },
        { kind: "field", field: fieldB, values: [1, undefined] },
      ],
    });
  });

  it("runs steps in order, passing output of one step to the next and the same context to all", () => {
    const descriptor = createDescriptor([createPropertyField("a")]);
    const items = [createItem({ descriptor })];
    const first = vi.fn((records: ContentRecords, _context: ContentTransformContext): ContentRecords => ({
      ...records,
      entries: [],
    }));
    const secondResult: ContentRecords = { entries: [] };
    const second = vi.fn((_records: ContentRecords, _context: ContentTransformContext): ContentRecords => secondResult);

    const result = transformContent({ descriptor, items }, { steps: [first, second] });

    expect(first).toHaveBeenCalledOnce();
    const context = first.mock.calls[0][1];
    expect(context).to.deep.equal({ descriptor, items });
    expect(second).toHaveBeenCalledWith(first.mock.results[0].value, context);
    expect(second.mock.calls[0][1]).to.equal(context);
    expect(result).to.equal(secondResult);
  });
});
