/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { BeDuration } from "@itwin/core-bentley";
import { ConcatenatedValue, ConcatenatedValuePart } from "../shared/ConcatenatedValue";
import { TypedPrimitiveValue } from "../shared/Values";

describe("ConcatenatedValuePart", () => {
  describe("isString", () => {
    it("returns correct result for different types of parts", () => {
      expect(ConcatenatedValuePart.isString("str")).to.be.true;
      expect(ConcatenatedValuePart.isString({ type: "Integer", value: 123 })).to.be.false;
      expect(ConcatenatedValuePart.isString({ className: "s.c", propertyName: "p", value: "test" })).to.be.false;
      expect(ConcatenatedValuePart.isString(["str"] satisfies ConcatenatedValue)).to.be.false;
    });
  });

  describe("isPrimitive", () => {
    it("returns correct result for different types of parts", () => {
      expect(ConcatenatedValuePart.isPrimitive("str")).to.be.false;
      expect(ConcatenatedValuePart.isPrimitive({ type: "Integer", value: 123 })).to.be.true;
      expect(ConcatenatedValuePart.isPrimitive({ className: "s.c", propertyName: "p", value: "test" })).to.be.false;
      expect(ConcatenatedValuePart.isPrimitive([{ type: "Integer", value: 123 }] satisfies ConcatenatedValue)).to.be.false;
    });
  });

  describe("isProperty", () => {
    it("returns correct result for different types of parts", () => {
      expect(ConcatenatedValuePart.isProperty("str")).to.be.false;
      expect(ConcatenatedValuePart.isProperty({ type: "Integer", value: 123 })).to.be.false;
      expect(ConcatenatedValuePart.isProperty({ className: "s.c", propertyName: "p", value: "test" })).to.be.true;
      expect(ConcatenatedValuePart.isProperty([{ className: "s.c", propertyName: "p", value: "test" }] satisfies ConcatenatedValue)).to.be.false;
    });
  });

  describe("isConcatenatedValue", () => {
    it("returns correct result for different types of parts", () => {
      expect(ConcatenatedValuePart.isConcatenatedValue("str")).to.be.false;
      expect(ConcatenatedValuePart.isConcatenatedValue({ type: "Integer", value: 123 })).to.be.false;
      expect(ConcatenatedValuePart.isConcatenatedValue({ className: "s.c", propertyName: "p", value: "test" })).to.be.false;
      expect(
        ConcatenatedValuePart.isConcatenatedValue([
          "str",
          { type: "Integer", value: 123 },
          { className: "s.c", propertyName: "p", value: "test" },
        ] satisfies ConcatenatedValue),
      ).to.be.true;
    });
  });
});

describe("ConcatenatedValue", () => {
  describe("serialize", () => {
    it("serializes one part", async () => {
      expect(
        await ConcatenatedValue.serialize({
          parts: [{ type: "Integer", value: 123 }],
          partFormatter: async (part) => {
            return ((part as TypedPrimitiveValue).value as number).toString();
          },
        }),
      ).to.eq("123");
    });

    it("serializes all parts in order", async () => {
      const parts: ConcatenatedValuePart[] = [
        "str1",
        { type: "Integer", value: 123 },
        { className: "s.c", propertyName: "p", value: "test" },
        ["str2", { type: "Integer", value: 123 }, { className: "s.c", propertyName: "p", value: "test" }],
      ];
      expect(
        await ConcatenatedValue.serialize({
          parts,
          partFormatter: async (part) => {
            let partIndex = parts.indexOf(part);
            if (partIndex === -1) {
              partIndex = (parts[3] as ConcatenatedValue).indexOf(part) + 3;
            }
            if (partIndex % 2 === 1) {
              // sleep for a bit to ensure we get parts in correct order even if they resolve in different order
              await BeDuration.wait(10);
            }
            return `_${partIndex.toString()}_`;
          },
        }),
      ).to.eq("_0__1__2__3__4__5_");
    });

    it("joins parts with given separator", async () => {
      expect(
        await ConcatenatedValue.serialize({
          parts: ["x", "y", ["z"]],
          partFormatter: async (part) => part as string,
          separator: "-",
        }),
      ).to.eq("x-y-z");
    });
  });
});
