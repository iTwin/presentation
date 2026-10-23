/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ResolvablePromise } from "presentation-test-utilities";
import { describe, expect, it } from "vitest";
import {
  buildCategoryContext,
  collectInParallel,
  getClassLabel,
  isSchemaVersionAtLeast,
  isSchemaVersionBelow,
  mergeBindings,
  resolveEffectiveSourceClass,
  stableStringify,
  substituteExpressionAlias,
} from "../content/InternalUtils.js";
import { createEntityClass, createSchemaAccess } from "./MetadataStubs.js";

import type { ECSqlBinding } from "@itwin/presentation-shared";

describe("buildCategoryContext", () => {
  const includeAll = () => true;

  it("appends offset step spec classes after inherited ancestry without mutating either input", () => {
    const inheritedContext = Object.freeze([{ stepIndex: 0, kind: "targetClass" }] as const);
    const properties = Object.freeze([
      { stepIndex: 1, target: { select: "all" } },
      { stepIndex: 0, target: { select: "none" }, relationship: { select: "none" } },
      { stepIndex: 2 },
    ] as const);

    expect(
      buildCategoryContext({ inheritedContext, properties, stepIndexOffset: 1, include: includeAll }),
    ).to.deep.equal([
      { stepIndex: 0, kind: "targetClass" },
      { stepIndex: 1, kind: "relationshipClass" },
      { stepIndex: 1, kind: "targetClass" },
      { stepIndex: 2, kind: "targetClass" },
    ]);
  });

  it("keeps only classes accepted by the filter", () => {
    const properties = [
      { stepIndex: 0, target: { select: "all" }, relationship: { select: "all" } },
      { stepIndex: 1, target: { select: "all" } },
    ] as const;

    expect(
      buildCategoryContext({
        inheritedContext: [],
        properties,
        stepIndexOffset: 0,
        include: (entry) => entry.stepIndex === 0 && entry.kind === "targetClass",
      }),
    ).to.deep.equal([{ stepIndex: 0, kind: "targetClass" }]);
  });

  it.each([
    { name: "root", inheritedContext: [] },
    { name: "inherited", inheritedContext: [{ stepIndex: 0, kind: "targetClass" }] },
  ] as const)("preserves the $name context when no step specs are given", ({ inheritedContext }) => {
    expect(
      buildCategoryContext({ inheritedContext, properties: [], stepIndexOffset: 0, include: includeAll }),
    ).to.deep.equal(inheritedContext);
  });

  it("deduplicates classes named by repeated step specs", () => {
    const spec = { stepIndex: 0, target: { select: "none" }, relationship: { select: "all" } } as const;

    expect(
      buildCategoryContext({ inheritedContext: [], properties: [spec, spec], stepIndexOffset: 0, include: includeAll }),
    ).to.deep.equal([
      { stepIndex: 0, kind: "relationshipClass" },
      { stepIndex: 0, kind: "targetClass" },
    ]);
  });
});

describe("collectInParallel", () => {
  it("returns an empty array for no items", async () => {
    expect(await collectInParallel({ inputs: [], expand: async () => [1] })).to.deep.equal([]);
  });

  it("concatenates the per-item arrays preserving input order", async () => {
    const result = await collectInParallel({ inputs: [1, 2, 3], expand: async (n) => [n, n * 10] });
    expect(result).to.deep.equal([1, 10, 2, 20, 3, 30]);
  });

  it("preserves input order even when tasks complete out of order", async () => {
    // item 3 resolves first, item 1 last
    const gates = [new ResolvablePromise<void>(), new ResolvablePromise<void>(), new ResolvablePromise<void>()];
    const resultPromise = collectInParallel({
      inputs: [0, 1, 2],
      expand: async (i) => {
        await gates[i];
        return [i + 1, (i + 1) * 10];
      },
    });
    // resolve out of order: 3, 2, 1
    await gates[2].resolve();
    await gates[1].resolve();
    await gates[0].resolve();
    expect(await resultPromise).to.deep.equal([1, 10, 2, 20, 3, 30]);
  });

  it("runs the callback for every item in parallel", async () => {
    const started: number[] = [];
    const res = collectInParallel({
      inputs: [1, 2, 3],
      expand: async (n) => {
        started.push(n);
        return [n];
      },
    });
    expect(started).to.deep.equal([1, 2, 3]);
    await res;
  });
});

describe("schema version comparison", () => {
  it("compares write, read, and minor versions in order", () => {
    expect(isSchemaVersionAtLeast({ read: 1, write: 0, minor: 15 }, "1.0.15")).to.be.true;
    expect(isSchemaVersionAtLeast({ read: 2, write: 0, minor: 0 }, "1.0.15")).to.be.true;
    expect(isSchemaVersionAtLeast({ read: 0, write: 1, minor: 0 }, "1.0.15")).to.be.true;
    expect(isSchemaVersionAtLeast({ read: 1, write: 0, minor: 14 }, "1.0.15")).to.be.false;
  });

  it("checks exclusive upper version bounds", () => {
    expect(isSchemaVersionBelow({ read: 1, write: 0, minor: 14 }, "1.0.15")).to.be.true;
    expect(isSchemaVersionBelow({ read: 1, write: 0, minor: 15 }, "1.0.15")).to.be.false;
    expect(isSchemaVersionBelow({ read: 2, write: 0, minor: 0 }, "1.0.15")).to.be.false;
    expect(isSchemaVersionBelow({ read: 0, write: 1, minor: 0 }, "1.0.15")).to.be.false;
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

  it("omits undefined object properties recursively", () => {
    expect(stableStringify({ bindings: { ids: { type: "idset", value: undefined } }, alias: undefined })).to.equal(
      '{"bindings":{"ids":{"type":"idset"}}}',
    );
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

  it("preserves nested ID sets without mutating their insertion order", () => {
    const ids: ReadonlySet<string> = new Set(["0x2", "0x1"]);
    expect(stableStringify({ bindings: { ids: { type: "idset", value: ids } } })).to.equal(
      '{"bindings":{"ids":{"type":"idset","value":["0x1","0x2"]}}}',
    );
    expect([...ids]).to.deep.equal(["0x2", "0x1"]);
  });

  it("distinguishes different ID sets", () => {
    expect(stableStringify(new Set(["0x1"]))).to.not.equal(stableStringify(new Set(["0x2"])));
    expect(stableStringify(new Set())).to.equal("[]");
    expect(stableStringify(new Set())).to.not.equal(stableStringify(new Set(["0x1"])));
  });

  it("serializes ID sets independently of insertion order", () => {
    expect(stableStringify(new Set(["0x2", "0x1"]))).to.equal(stableStringify(new Set(["0x1", "0x2"])));
  });
});

describe("substituteExpressionAlias", () => {
  it("normalizes bare references when aliases are identical", () => {
    expect(
      substituteExpressionAlias({ expression: "this.Code || [this].Label", fromAlias: "this", toAlias: "this" }),
    ).to.equal("[this].Code || [this].Label");
  });
});

describe("resolveEffectiveSourceClass", () => {
  const base = createEntityClass({ fullName: "TestSchema.Base" });
  const derived = createEntityClass({ fullName: "TestSchema.Derived", baseClass: base });
  const sibling = createEntityClass({ fullName: "TestSchema.Sibling", baseClass: base });
  const imodelAccess = createSchemaAccess([base, derived, sibling]);

  it("returns the requested class when it is the declared class or derives from it", async () => {
    expect(await resolveEffectiveSourceClass(imodelAccess, "TestSchema.Base", "TestSchema.Base")).to.equal(
      "TestSchema.Base",
    );
    expect(await resolveEffectiveSourceClass(imodelAccess, "TestSchema.Derived", "TestSchema.Base")).to.equal(
      "TestSchema.Derived",
    );
  });

  it("returns the declared class when it derives from the requested class", async () => {
    expect(await resolveEffectiveSourceClass(imodelAccess, "TestSchema.Base", "TestSchema.Derived")).to.equal(
      "TestSchema.Derived",
    );
  });

  it("returns undefined when neither class derives from the other", async () => {
    expect(await resolveEffectiveSourceClass(imodelAccess, "TestSchema.Derived", "TestSchema.Sibling")).to.be.undefined;
  });
});

describe("getClassLabel", () => {
  it("returns the class label when set", async () => {
    const cls = createEntityClass({ fullName: "TestSchema.TestClass", label: "My Class" });
    const imodelAccess = createSchemaAccess([cls]);
    expect(await getClassLabel({ imodelAccess, className: "TestSchema.TestClass" })).to.equal("My Class");
  });

  it("falls back to class name when label is not set", async () => {
    const cls = createEntityClass({ fullName: "TestSchema.TestClass" });
    const imodelAccess = createSchemaAccess([cls]);
    expect(await getClassLabel({ imodelAccess, className: "TestSchema.TestClass" })).to.equal("TestClass");
  });
});

describe("mergeBindings", () => {
  it("rejects conflicting ID sets without overwriting the existing binding", () => {
    const binding: ECSqlBinding = { type: "idset", value: new Set(["0x1"]) };
    const target = { ids: binding };

    expect(() => mergeBindings(target, { ids: { type: "idset", value: new Set(["0x2"]) } })).to.throw(
      'Duplicate ECSQL binding name "ids" with different values.',
    );
    expect(target.ids).to.equal(binding);
    expect(target.ids.value).to.deep.equal(new Set(["0x1"]));
  });

  it("accepts equivalent ID sets with different insertion orders", () => {
    const target: Record<string, ECSqlBinding> = { ids: { type: "idset", value: new Set(["0x2", "0x1"]) } };
    expect(() => mergeBindings(target, { ids: { type: "idset", value: new Set(["0x1", "0x2"]) } })).to.not.throw();
  });

  it("accepts matching ID sets and arrays", () => {
    const target: Record<string, ECSqlBinding> = { ids: { type: "idset", value: ["0x1", "0x2"] } };
    expect(() => mergeBindings(target, { ids: { type: "idset", value: new Set(["0x2", "0x1"]) } })).to.not.throw();
  });

  it("does nothing when source is undefined", () => {
    const target = { a: { type: "int" as const, value: 1 } };
    mergeBindings(target, undefined);
    expect(target).to.deep.equal({ a: { type: "int", value: 1 } });
  });

  it("adds new bindings to the target", () => {
    const target = { a: { type: "int" as const, value: 1 } };
    mergeBindings(target, { b: { type: "int", value: 2 } });
    expect(target).to.deep.equal({ a: { type: "int", value: 1 }, b: { type: "int", value: 2 } });
  });

  it("keeps an identical duplicate binding", () => {
    const target = { a: { type: "int" as const, value: 1 } };
    mergeBindings(target, { a: { type: "int", value: 1 } });
    expect(target).to.deep.equal({ a: { type: "int", value: 1 } });
  });

  it("treats bindings equal regardless of key order", () => {
    const target = { a: { type: "idset" as const, value: ["0x1", "0x2"] } };
    expect(() =>
      mergeBindings(target, { a: { value: ["0x1", "0x2"], type: "idset" } as (typeof target)["a"] }),
    ).to.not.throw();
  });

  it("throws when a name is reused with a different value", () => {
    const target = { a: { type: "int" as const, value: 1 } };
    expect(() => mergeBindings(target, { a: { type: "int", value: 2 } })).to.throw(
      'Duplicate ECSQL binding name "a" with different values.',
    );
  });
});
