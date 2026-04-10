/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { InstanceKey, TypedPrimitiveValue } from "../shared/Values.js";

describe("InstanceKey", () => {
  describe("equals", () => {
    it("compares two keys", () => {
      expect(InstanceKey.equals({ className: "a", id: "1" }, { className: "a", id: "1" })).toBe(true);
      expect(InstanceKey.equals({ className: "a", id: "1" }, { className: "b", id: "2" })).toBe(false);
      expect(InstanceKey.equals({ className: "a", id: "1" }, { className: "b", id: "1" })).toBe(false);
      expect(InstanceKey.equals({ className: "a", id: "1" }, { className: "a", id: "2" })).toBe(false);
    });
  });

  describe("compare", () => {
    it("compares two keys", () => {
      expect(InstanceKey.compare({ className: "a", id: "1" }, { className: "a", id: "1" })).toBe(0);
      expect(InstanceKey.compare({ className: "a", id: "1" }, { className: "b", id: "2" })).toBeLessThan(0);
      expect(InstanceKey.compare({ className: "a", id: "1" }, { className: "b", id: "1" })).toBeLessThan(0);
      expect(InstanceKey.compare({ className: "a", id: "1" }, { className: "a", id: "2" })).toBeLessThan(0);
    });
  });
});

describe("TypedPrimitiveValue", () => {
  describe("create", () => {
    it("returns correct result when primitiveType is compatible with primitiveValue", () => {
      expect(TypedPrimitiveValue.create(1, "Long")).toEqual({ value: 1, type: "Long", extendedType: undefined });
      expect(TypedPrimitiveValue.create(1, "Integer")).toEqual({ value: 1, type: "Integer", extendedType: undefined });
      expect(TypedPrimitiveValue.create(1, "Double")).toEqual({
        value: 1,
        type: "Double",
        extendedType: undefined,
        koqName: undefined,
      });
      expect(TypedPrimitiveValue.create("0x11", "Id")).toEqual({ value: "0x11", type: "Id", extendedType: undefined });
      expect(TypedPrimitiveValue.create(true, "Boolean")).toEqual({
        value: true,
        type: "Boolean",
        extendedType: undefined,
      });
      expect(TypedPrimitiveValue.create("someValue", "String")).toEqual({
        value: "someValue",
        type: "String",
        extendedType: undefined,
      });
      expect(TypedPrimitiveValue.create("someValue", "DateTime")).toEqual({
        value: "someValue",
        type: "DateTime",
        extendedType: undefined,
      });
      expect(TypedPrimitiveValue.create(1, "DateTime")).toEqual({
        value: 1,
        type: "DateTime",
        extendedType: undefined,
      });
      const date = new Date();
      expect(TypedPrimitiveValue.create(date, "DateTime")).toEqual({
        value: date,
        type: "DateTime",
        extendedType: undefined,
      });
      expect(TypedPrimitiveValue.create({ x: 1, y: 2 }, "Point2d")).toEqual({
        value: { x: 1, y: 2 },
        type: "Point2d",
        extendedType: undefined,
      });
      expect(TypedPrimitiveValue.create({ x: 1, y: 2, z: 3 }, "Point3d")).toEqual({
        value: { x: 1, y: 2, z: 3 },
        type: "Point3d",
        extendedType: undefined,
      });
    });

    it("throws an error when primitiveType isn't compatible with primitiveValue", () => {
      expect(() => TypedPrimitiveValue.create("someValue", "Long")).toThrow();
      expect(() => TypedPrimitiveValue.create("someValue", "Integer")).toThrow();
      expect(() => TypedPrimitiveValue.create("someValue", "Double")).toThrow();
      expect(() => TypedPrimitiveValue.create("someValue", "Id")).toThrow();
      expect(() => TypedPrimitiveValue.create("someValue", "Boolean")).toThrow();
      expect(() => TypedPrimitiveValue.create(1, "String")).toThrow();
      expect(() => TypedPrimitiveValue.create(true, "DateTime")).toThrow();
      expect(() => TypedPrimitiveValue.create("someValue", "Point2d")).toThrow();
      expect(() => TypedPrimitiveValue.create("someValue", "Point3d")).toThrow();
    });
  });
});
