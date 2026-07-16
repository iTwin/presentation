/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ResolvablePromise } from "presentation-test-utilities";
import { describe, expect, it } from "vitest";
import { collectInParallel, getClassLabel, stableStringify } from "../content/InternalUtils.js";
import { createEntityClass, createSchemaAccess } from "./MetadataStubs.js";

describe("collectInParallel", () => {
  it("returns an empty array for no items", async () => {
    expect(await collectInParallel([], async () => [1])).to.deep.equal([]);
  });

  it("concatenates the per-item arrays preserving input order", async () => {
    const result = await collectInParallel([1, 2, 3], async (n) => [n, n * 10]);
    expect(result).to.deep.equal([1, 10, 2, 20, 3, 30]);
  });

  it("preserves input order even when tasks complete out of order", async () => {
    // item 3 resolves first, item 1 last
    const gates = [new ResolvablePromise<void>(), new ResolvablePromise<void>(), new ResolvablePromise<void>()];
    const resultPromise = collectInParallel([0, 1, 2], async (i) => {
      await gates[i];
      return [i + 1, (i + 1) * 10];
    });
    // resolve out of order: 3, 2, 1
    await gates[2].resolve();
    await gates[1].resolve();
    await gates[0].resolve();
    expect(await resultPromise).to.deep.equal([1, 10, 2, 20, 3, 30]);
  });

  it("runs the callback for every item in parallel", async () => {
    const started: number[] = [];
    const res = collectInParallel([1, 2, 3], async (n) => {
      started.push(n);
      return [n];
    });
    expect(started).to.deep.equal([1, 2, 3]);
    await res;
  });
});

describe("stableStringify", () => {
  it("handles primitives", () => {
    expect(stableStringify(42)).to.equal("42");
    expect(stableStringify("hello")).to.equal('"hello"');
    expect(stableStringify(true)).to.equal("true");
    expect(stableStringify(null)).to.equal("null");
    expect(stableStringify(undefined)).to.equal(undefined);
  });

  it("sorts object keys", () => {
    expect(stableStringify({ b: 1, a: 2 })).to.equal('{"a":2,"b":1}');
  });

  it("produces same output regardless of insertion order", () => {
    const a = stableStringify({ x: 1, y: 2, z: 3 });
    const b = stableStringify({ z: 3, x: 1, y: 2 });
    expect(a).to.equal(b);
  });

  it("handles arrays preserving element order", () => {
    expect(stableStringify([3, 1, 2])).to.equal("[3,1,2]");
  });

  it("sorts keys recursively in nested objects", () => {
    expect(stableStringify({ b: { d: 1, c: 2 }, a: 3 })).to.equal('{"a":3,"b":{"c":2,"d":1}}');
  });

  it("handles objects nested inside arrays", () => {
    expect(stableStringify([{ b: 1, a: 2 }])).to.equal('[{"a":2,"b":1}]');
  });
});

describe("getClassLabel", () => {
  it("returns the class label when set", async () => {
    const cls = createEntityClass({ fullName: "TestSchema.TestClass", label: "My Class" });
    const imodelAccess = createSchemaAccess([cls]);
    expect(await getClassLabel(imodelAccess, "TestSchema.TestClass")).to.equal("My Class");
  });

  it("falls back to class name when label is not set", async () => {
    const cls = createEntityClass({ fullName: "TestSchema.TestClass" });
    const imodelAccess = createSchemaAccess([cls]);
    expect(await getClassLabel(imodelAccess, "TestSchema.TestClass")).to.equal("TestClass");
  });
});
