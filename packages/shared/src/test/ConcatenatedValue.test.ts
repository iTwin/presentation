/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { BeDuration } from "@itwin/core-bentley";
import { ConcatenatedValue, ConcatenatedValuePart } from "../shared/ConcatenatedValue.js";
import { TypedPrimitiveValue } from "../shared/Values.js";

describe("ConcatenatedValuePart", () => {
  describe("isString", () => {
    it("returns correct result for different types of parts", () => {
      expect(ConcatenatedValuePart.isString("str")).to.be.true;
      expect(ConcatenatedValuePart.isString({ type: "Integer", value: 123 })).to.be.false;
      expect(ConcatenatedValuePart.isString(["str"] satisfies ConcatenatedValue)).to.be.false;
    });
  });

  describe("isPrimitive", () => {
    it("returns correct result for different types of parts", () => {
      expect(ConcatenatedValuePart.isPrimitive("str")).to.be.false;
      expect(ConcatenatedValuePart.isPrimitive({ type: "Integer", value: 123 })).to.be.true;
      expect(ConcatenatedValuePart.isPrimitive([{ type: "Integer", value: 123 }] satisfies ConcatenatedValue)).to.be.false;
    });
  });

  describe("isConcatenatedValue", () => {
    it("returns correct result for different types of parts", () => {
      expect(ConcatenatedValuePart.isConcatenatedValue("str")).to.be.false;
      expect(ConcatenatedValuePart.isConcatenatedValue({ type: "Integer", value: 123 })).to.be.false;
      expect(ConcatenatedValuePart.isConcatenatedValue(["str", { type: "Integer", value: 123 }] satisfies ConcatenatedValue)).to.be.true;
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
      const parts: ConcatenatedValuePart[] = ["str1", { type: "Integer", value: 123 }, ["str2", { type: "Integer", value: 123 }]];
      expect(
        await ConcatenatedValue.serialize({
          parts,
          partFormatter: async (part) => {
            let partIndex = parts.indexOf(part);
            if (partIndex === -1) {
              partIndex = (parts[2] as ConcatenatedValue).indexOf(part) + 2;
            }
            if (partIndex % 2 === 1) {
              // sleep for a bit to ensure we get parts in correct order even if they resolve in different order
              await BeDuration.wait(10);
            }
            return `_${partIndex.toString()}_`;
          },
        }),
      ).to.eq("_0__1__2__3_");
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
