/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { InstanceKey, TypedPrimitiveValue } from "../../hierarchy-builder/values/Values";

describe("InstanceKey", () => {
  describe("equals", () => {
    it("compares two keys", () => {
      expect(InstanceKey.equals({ className: "a", id: "1" }, { className: "a", id: "1" })).to.be.true;
      expect(InstanceKey.equals({ className: "a", id: "1" }, { className: "b", id: "2" })).to.be.false;
      expect(InstanceKey.equals({ className: "a", id: "1" }, { className: "b", id: "1" })).to.be.false;
      expect(InstanceKey.equals({ className: "a", id: "1" }, { className: "a", id: "2" })).to.be.false;
    });
  });
});

describe("TypedPrimitiveValue", () => {
  describe("create", () => {
    it("returns correct result when primitiveType is compatible with primitiveValue", () => {
      expect(TypedPrimitiveValue.create(1, "Long")).to.deep.eq({ value: 1, type: "Long", extendedType: undefined });
      expect(TypedPrimitiveValue.create(1, "Integer")).to.deep.eq({ value: 1, type: "Integer", extendedType: undefined });
      expect(TypedPrimitiveValue.create(1, "Double")).to.deep.eq({ value: 1, type: "Double", extendedType: undefined, koqName: undefined });
      expect(TypedPrimitiveValue.create("0x11", "Id")).to.deep.eq({ value: "0x11", type: "Id", extendedType: undefined });
      expect(TypedPrimitiveValue.create(true, "Boolean")).to.deep.eq({ value: true, type: "Boolean", extendedType: undefined });
      expect(TypedPrimitiveValue.create("someValue", "String")).to.deep.eq({ value: "someValue", type: "String", extendedType: undefined });
      expect(TypedPrimitiveValue.create("someValue", "DateTime")).to.deep.eq({ value: "someValue", type: "DateTime", extendedType: undefined });
      expect(TypedPrimitiveValue.create(1, "DateTime")).to.deep.eq({ value: 1, type: "DateTime", extendedType: undefined });
      const date = new Date();
      expect(TypedPrimitiveValue.create(date, "DateTime")).to.deep.eq({ value: date, type: "DateTime", extendedType: undefined });
      expect(
        TypedPrimitiveValue.create(
          {
            x: 1,
            y: 2,
          },
          "Point2d",
        ),
      ).to.deep.eq({
        value: {
          x: 1,
          y: 2,
        },
        type: "Point2d",
        extendedType: undefined,
      });
      expect(
        TypedPrimitiveValue.create(
          {
            x: 1,
            y: 2,
            z: 3,
          },
          "Point3d",
        ),
      ).to.deep.eq({
        value: {
          x: 1,
          y: 2,
          z: 3,
        },
        type: "Point3d",
        extendedType: undefined,
      });
    });

    it("throws an error when primitiveType isn't compatible with primitiveValue", () => {
      expect(() => TypedPrimitiveValue.create("someValue", "Long")).to.throw(`primitiveType: 'Long' isn't compatible with value: '"someValue"`);
      expect(() => TypedPrimitiveValue.create("someValue", "Integer")).to.throw(`primitiveType: 'Integer' isn't compatible with value: '"someValue"`);
      expect(() => TypedPrimitiveValue.create("someValue", "Double")).to.throw(`primitiveType: 'Double' isn't compatible with value: '"someValue"`);
      expect(() => TypedPrimitiveValue.create("someValue", "Id")).to.throw(`primitiveType: 'Id' isn't compatible with value: '"someValue"`);
      expect(() => TypedPrimitiveValue.create("someValue", "Boolean")).to.throw(`primitiveType: 'Boolean' isn't compatible with value: '"someValue"`);
      expect(() => TypedPrimitiveValue.create(1, "String")).to.throw(`primitiveType: 'String' isn't compatible with value: '1`);
      expect(() => TypedPrimitiveValue.create(true, "DateTime")).to.throw(`primitiveType: 'DateTime' isn't compatible with value: 'true`);
      expect(() => TypedPrimitiveValue.create("someValue", "Point2d")).to.throw(`primitiveType: 'Point2d' isn't compatible with value: '"someValue"`);
      expect(() => TypedPrimitiveValue.create("someValue", "Point3d")).to.throw(`primitiveType: 'Point3d' isn't compatible with value: '"someValue"`);
    });
  });
});
