/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { BeDuration } from "@itwin/core-bentley";
import { ConcatenatedValue, ConcatenatedValuePart } from "../../hierarchy-builder/values/ConcatenatedValue";
import { TypedPrimitiveValue } from "../../hierarchy-builder/values/Values";

describe("ConcatenatedValuePart", () => {
  describe("isString", () => {
    it("returns correct result for different types of parts", () => {
      expect(ConcatenatedValuePart.isString("str")).to.be.true;
      expect(ConcatenatedValuePart.isString({ type: "Integer", value: 123 })).to.be.false;
      expect(ConcatenatedValuePart.isString({ className: "s.c", propertyName: "p", value: "test" })).to.be.false;
    });
  });

  describe("isPrimitive", () => {
    it("returns correct result for different types of parts", () => {
      expect(ConcatenatedValuePart.isPrimitive("str")).to.be.false;
      expect(ConcatenatedValuePart.isPrimitive({ type: "Integer", value: 123 })).to.be.true;
      expect(ConcatenatedValuePart.isPrimitive({ className: "s.c", propertyName: "p", value: "test" })).to.be.false;
    });
  });

  describe("isProperty", () => {
    it("returns correct result for different types of parts", () => {
      expect(ConcatenatedValuePart.isProperty("str")).to.be.false;
      expect(ConcatenatedValuePart.isProperty({ type: "Integer", value: 123 })).to.be.false;
      expect(ConcatenatedValuePart.isProperty({ className: "s.c", propertyName: "p", value: "test" })).to.be.true;
    });
  });
});

describe("ConcatenatedValue", () => {
  describe("serialize", () => {
    it("serializes one part", async () => {
      expect(
        await ConcatenatedValue.serialize({ type: "Integer", value: 123 }, async (part) => {
          return (part as TypedPrimitiveValue).value.toString();
        }),
      ).to.eq("123");
    });

    it("serializes all parts in order", async () => {
      const parts: ConcatenatedValuePart[] = ["str", { type: "Integer", value: 123 }, { className: "s.c", propertyName: "p", value: "test" }];
      expect(
        await ConcatenatedValue.serialize(parts, async (part) => {
          const partIndex = parts.indexOf(part);
          if (partIndex === 1) {
            // sleep for a bit to ensure we get parts in correct order even if they resolve in different order
            await BeDuration.wait(10);
          }
          return `_${partIndex.toString()}_`;
        }),
      ).to.eq("_0__1__2_");
    });
  });
});
