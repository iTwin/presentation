/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { ECSqlBinding } from "../shared/ECSqlCore.js";
import { TypedPrimitiveValue } from "../shared/Values.js";

describe("ECSqlBinding", () => {
  describe("create", () => {
    it("creates bindings for typed primitive values", () => {
      const date = new Date("2026-07-17T10:00:00.000Z");

      expect(ECSqlBinding.create(TypedPrimitiveValue.create(true, "Boolean"))).to.deep.equal({
        type: "boolean",
        value: true,
      });
      expect(ECSqlBinding.create(TypedPrimitiveValue.create(1, "Integer"))).to.deep.equal({ type: "int", value: 1 });
      expect(ECSqlBinding.create(TypedPrimitiveValue.create(2, "Long"))).to.deep.equal({ type: "long", value: 2 });
      expect(ECSqlBinding.create(TypedPrimitiveValue.create(3, "Double"))).to.deep.equal({ type: "double", value: 3 });
      expect(ECSqlBinding.create(TypedPrimitiveValue.create("0x1", "Id"))).to.deep.equal({ type: "id", value: "0x1" });
      expect(ECSqlBinding.create(TypedPrimitiveValue.create("test", "String"))).to.deep.equal({
        type: "string",
        value: "test",
      });
      expect(ECSqlBinding.create(TypedPrimitiveValue.create(date, "DateTime"))).to.deep.equal({
        type: "string",
        value: date.toISOString(),
      });
      expect(ECSqlBinding.create(TypedPrimitiveValue.create(1, "DateTime"))).to.deep.equal({
        type: "string",
        value: "1",
      });
      expect(ECSqlBinding.create(TypedPrimitiveValue.create({ x: 1, y: 2 }, "Point2d"))).to.deep.equal({
        type: "point2d",
        value: { x: 1, y: 2 },
      });
      expect(ECSqlBinding.create(TypedPrimitiveValue.create({ x: 1, y: 2, z: 3 }, "Point3d"))).to.deep.equal({
        type: "point3d",
        value: { x: 1, y: 2, z: 3 },
      });
    });
  });
});
