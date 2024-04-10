/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { normalizeFullClassName, parseFullClassName, trimWhitespace } from "../shared/Utils";

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
