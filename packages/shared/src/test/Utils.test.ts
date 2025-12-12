/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { executionAsyncId } from "node:async_hooks";
import * as sinon from "sinon";
import {
  compareFullClassNames,
  createMainThreadReleaseOnTimePassedHandler,
  normalizeFullClassName,
  parseFullClassName,
  trimWhitespace,
} from "../shared/Utils.js";

describe("parseFullClassName", () => {
  it("parses valid full class names", () => {
    expect(parseFullClassName("schema:class")).to.deep.eq({ schemaName: "schema", className: "class" });
    expect(parseFullClassName("schema.class")).to.deep.eq({ schemaName: "schema", className: "class" });
  });

  it("throws on invalid full class name", () => {
    expect(() => parseFullClassName("invalid")).to.throw();
  });
});

describe("normalizeFullClassName", () => {
  it("normalizes full class names", () => {
    expect(normalizeFullClassName("schema:class")).to.eq("schema.class");
    expect(normalizeFullClassName("schema.class")).to.eq("schema.class");
  });

  it("throws on invalid full class name", () => {
    expect(() => normalizeFullClassName("invalid")).to.throw();
  });
});

describe("compareFullClassNames", () => {
  it("detects differences", () => {
    const differentSchemaCompare = compareFullClassNames("schema.class", "schema2.class");
    const differentSchemaCompareInverted = compareFullClassNames("schema2.class", "schema.class");
    expect(differentSchemaCompare).to.not.eq(0);
    expect(differentSchemaCompareInverted).to.not.eq(0);
    expect(differentSchemaCompareInverted).to.eq(differentSchemaCompare * -1);

    const differentClassCompare = compareFullClassNames("schema.class", "schema.class2");
    const differentClassCompareInverted = compareFullClassNames("schema.class2", "schema.class");
    expect(differentClassCompare).to.not.eq(0);
    expect(differentClassCompareInverted).to.not.eq(0);
    expect(differentClassCompareInverted).to.eq(differentClassCompare * -1);
  });

  it("compares full class names in a case-insensitive way", () => {
    expect(compareFullClassNames("schema:class", "SCHEMA:CLASS")).to.eq(0);
    expect(compareFullClassNames("Schema.Class", "schema.class")).to.eq(0);
  });

  it("compares full class names, ignoring the separator", () => {
    expect(compareFullClassNames("schema:class", "schema.class")).to.eq(0);
    expect(compareFullClassNames("schema.class", "schema:class")).to.eq(0);
  });
});

describe("trimWhitespace", () => {
  it("trims whitespace from a string", () => {
    expect(trimWhitespace("  hello  ")).to.eq("hello");
    expect(trimWhitespace("  world")).to.eq("world");
    expect(trimWhitespace("foo  ")).to.eq("foo");
    expect(trimWhitespace("foo  bar")).to.eq("foo bar");
    expect(trimWhitespace("foo  \nbar")).to.eq("foo bar");
    expect(trimWhitespace("foo\nbar")).to.eq("foo bar");
  });

  it("trims whitespace after opening parenthesis", () => {
    expect(trimWhitespace("(foo")).to.eq("(foo");
    expect(trimWhitespace("(\nfoo")).to.eq("(foo");
    expect(trimWhitespace("( \n  foo")).to.eq("(foo");
  });

  it("trims whitespace before closing parenthesis", () => {
    expect(trimWhitespace("foo)")).to.eq("foo)");
    expect(trimWhitespace("foo\n)")).to.eq("foo)");
    expect(trimWhitespace("foo \n  )")).to.eq("foo)");
  });

  it("trims whitespace before comma", () => {
    expect(trimWhitespace("foo,")).to.eq("foo,");
    expect(trimWhitespace("foo\n,")).to.eq("foo,");
    expect(trimWhitespace("foo \n  ,")).to.eq("foo,");
  });
});

describe("createMainThreadReleaseOnTimePassedHandler", () => {
  let nowStub: sinon.SinonStub;

  beforeEach(() => {
    nowStub = sinon.stub(Date, "now");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("creates a handler that released main thread after specified time", async () => {
    nowStub.onCall(0).returns(0); // starting position - called when creating the handler
    nowStub.onCall(1).returns(10); // called on first handler invocation
    nowStub.onCall(2).returns(15); // called when first handler invocation resolves the `setTimeout` promise
    nowStub.onCall(3).returns(24); // called on second handler invocation - not enough to release the main thread
    nowStub.onCall(4).returns(25); // called on third handler invocation
    nowStub.onCall(5).returns(25); // called when third handler invocation resolves the `setTimeout` promise

    const mainAsyncId = executionAsyncId();
    let currAsyncId = mainAsyncId;

    const handler = createMainThreadReleaseOnTimePassedHandler(10);
    expect(nowStub.callCount).to.eq(1);

    let result = handler();
    expect(nowStub.callCount).to.eq(2);
    expect(result).to.be.instanceOf(Promise);
    await result;
    expect(nowStub.callCount).to.eq(3);
    currAsyncId = executionAsyncId();
    expect(currAsyncId).to.not.eq(mainAsyncId);

    result = handler();
    expect(nowStub.callCount).to.eq(4);
    expect(result).to.be.undefined;

    result = handler();
    expect(nowStub.callCount).to.eq(5);
    expect(result).to.be.instanceOf(Promise);
    await result;
    expect(nowStub.callCount).to.eq(6);
    currAsyncId = executionAsyncId();
    expect(currAsyncId).to.not.eq(mainAsyncId);
  });

  it("does not create a promise if main thread release is not needed", async () => {
    nowStub.returns(0);

    const handler = createMainThreadReleaseOnTimePassedHandler(undefined); // default to `40`
    expect(handler()).to.be.undefined;

    nowStub.returns(1);
    expect(handler()).to.be.undefined;

    nowStub.returns(39);
    expect(handler()).to.be.undefined;

    nowStub.returns(40);
    const result = handler();
    expect(result).to.be.instanceOf(Promise);
    await result;
  });
});
