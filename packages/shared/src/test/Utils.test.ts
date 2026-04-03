/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, MockInstance, vi } from "vitest";
import { createMainThreadReleaseOnTimePassedHandler, normalizeFullClassName, parseFullClassName, trimWhitespace } from "../shared/Utils.js";

describe("parseFullClassName", () => {
  it("parses valid full class names", () => {
    expect(parseFullClassName("schema:class")).toEqual({ schemaName: "schema", className: "class" });
    expect(parseFullClassName("schema.class")).toEqual({ schemaName: "schema", className: "class" });
  });

  it("throws on invalid full class name", () => {
    expect(() => parseFullClassName("invalid")).toThrow();
  });
});

describe("normalizeFullClassName", () => {
  it("normalizes full class names", () => {
    expect(normalizeFullClassName("schema:class")).toBe("schema.class");
    expect(normalizeFullClassName("schema.class")).toBe("schema.class");
  });

  it("throws on invalid full class name", () => {
    expect(() => normalizeFullClassName("invalid")).toThrow();
  });
});

describe("trimWhitespace", () => {
  it("trims whitespace from a string", () => {
    expect(trimWhitespace("  hello  ")).toBe("hello");
    expect(trimWhitespace("  world")).toBe("world");
    expect(trimWhitespace("foo  ")).toBe("foo");
    expect(trimWhitespace("foo  bar")).toBe("foo bar");
    expect(trimWhitespace("foo  \nbar")).toBe("foo bar");
    expect(trimWhitespace("foo\nbar")).toBe("foo bar");
    expect(trimWhitespace(undefined)).toBeUndefined();
  });

  it("trims whitespace after opening parenthesis", () => {
    expect(trimWhitespace("(foo")).toBe("(foo");
    expect(trimWhitespace("(\nfoo")).toBe("(foo");
    expect(trimWhitespace("( \n  foo")).toBe("(foo");
  });

  it("trims whitespace before closing parenthesis", () => {
    expect(trimWhitespace("foo)")).toBe("foo)");
    expect(trimWhitespace("foo\n)")).toBe("foo)");
    expect(trimWhitespace("foo \n  )")).toBe("foo)");
  });

  it("trims whitespace before comma", () => {
    expect(trimWhitespace("foo,")).toBe("foo,");
    expect(trimWhitespace("foo\n,")).toBe("foo,");
    expect(trimWhitespace("foo \n  ,")).toBe("foo,");
  });
});

describe("createMainThreadReleaseOnTimePassedHandler", () => {
  let nowStub: MockInstance;

  beforeEach(() => {
    nowStub = vi.spyOn(Date, "now");
  });

  it("creates a handler that released main thread after specified time", async () => {
    nowStub
      .mockReturnValueOnce(0) // starting position - called when creating the handler
      .mockReturnValueOnce(10) // called on first handler invocation
      .mockReturnValueOnce(15) // called when first handler invocation resolves the `setTimeout` promise
      .mockReturnValueOnce(24) // called on second handler invocation - not enough to release the main thread
      .mockReturnValueOnce(25) // called on third handler invocation
      .mockReturnValueOnce(25); // called when third handler invocation resolves the `setTimeout` promise

    const spy = vi.spyOn(global, "setTimeout");

    const handler = createMainThreadReleaseOnTimePassedHandler(10);
    expect(nowStub).toHaveBeenCalledTimes(1);

    let result = handler();
    expect(nowStub).toHaveBeenCalledTimes(2);
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(nowStub).toHaveBeenCalledTimes(3);
    expect(spy).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 0); // main thread should be released immediately after the handler is invoked and time has passed
    result = handler();
    expect(nowStub).toHaveBeenCalledTimes(4);
    expect(result).toBeUndefined();

    result = handler();
    expect(nowStub).toHaveBeenCalledTimes(5);
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(nowStub).toHaveBeenCalledTimes(6);
    expect(spy).toHaveBeenNthCalledWith(2, expect.any(Function), 0); // main thread should be released immediately after the handler is invoked and time has passed
  });

  it("does not create a promise if main thread release is not needed", async () => {
    nowStub.mockReturnValue(0);

    const handler = createMainThreadReleaseOnTimePassedHandler(undefined); // default to `40`
    expect(handler()).toBeUndefined();

    nowStub.mockReturnValue(1);
    expect(handler()).toBeUndefined();

    nowStub.mockReturnValue(39);
    expect(handler()).toBeUndefined();

    nowStub.mockReturnValue(40);
    const result = handler();
    expect(result).toBeInstanceOf(Promise);
    await result;
  });
});
