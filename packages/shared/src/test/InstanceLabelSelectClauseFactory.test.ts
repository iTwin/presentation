/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { parseInstanceLabel } from "../shared/InstanceLabelSelectClauseFactory.js";

import type { ConcatenatedValue } from "../shared/ConcatenatedValue.js";

describe("parseInstanceLabel", () => {
  it("parses empty value", () => {
    expect(parseInstanceLabel("")).toBe("");
  });

  it("parses plain string", () => {
    expect(parseInstanceLabel("test")).toBe("test");
  });

  it("parses complex value of one part", () => {
    const labelPart: ConcatenatedValue = [{ type: "Boolean", value: true }];
    expect(parseInstanceLabel(JSON.stringify(labelPart))).toEqual(labelPart);
  });

  it("parses complex value of multiple parts", () => {
    const labelParts: ConcatenatedValue = [
      { type: "Integer", value: 123 },
      { type: "String", value: "http://bentley.com", extendedType: "Url" },
    ];
    expect(parseInstanceLabel(JSON.stringify(labelParts))).toEqual(labelParts);
  });

  it("parses string label that looks like JSON object but is not", () => {
    expect(parseInstanceLabel("{x}")).toBe("{x}");
  });

  it("parses string label that looks like JSON array but is not", () => {
    expect(parseInstanceLabel("[y]")).toBe("[y]");
  });
});
