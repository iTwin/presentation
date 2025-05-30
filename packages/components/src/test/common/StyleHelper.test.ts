/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { LabelDefinition, Node } from "@itwin/presentation-common";
import { StyleHelper } from "../../presentation-components/common/StyleHelper.js";
import { createTestECInstancesNodeKey } from "../_helpers/Hierarchy.js";

describe("StyleHelper", () => {
  const createNodeBase = (): Node => ({
    label: LabelDefinition.fromLabelString("Test Label"),
    key: createTestECInstancesNodeKey(),
  });

  describe("isBold", () => {
    it("returns true when fontStyle property contains 'Bold'", () => {
      const node = { ...createNodeBase(), fontStyle: "*** Bold***" };
      expect(StyleHelper.isBold(node)).to.be.true;
    });

    it("returns false when fontStyle property doesn't contain 'Bold'", () => {
      const node = { ...createNodeBase(), fontStyle: "Test" };
      expect(StyleHelper.isBold(node)).to.be.false;
    });
  });

  describe("isItalic", () => {
    it("returns true when fontStyle property contains 'Italic'", () => {
      const node = { ...createNodeBase(), fontStyle: "*** Italic***" };
      expect(StyleHelper.isItalic(node)).to.be.true;
    });

    it("returns false when fontStyle property doesn't contain 'Italic'", () => {
      const node = { ...createNodeBase(), fontStyle: "Test" };
      expect(StyleHelper.isItalic(node)).to.be.false;
    });
  });

  describe("getColor", () => {
    describe("from RGB", () => {
      it("returns valid color", () => {
        const node = { ...createNodeBase(), backColor: "rgb(1, 1,1 )" };
        expect(StyleHelper.getBackColor(node)).to.eq(0x010101);
      });
    });

    describe("from hex", () => {
      it("returns valid color", () => {
        const node = { ...createNodeBase(), backColor: "#010101" };
        expect(StyleHelper.getBackColor(node)).to.eq(0x010101);
      });
    });

    describe("from color name", () => {
      it("returns valid color", () => {
        const colorName = "DarkRed";
        const color = StyleHelper.availableColors[colorName];
        const node = { ...createNodeBase(), backColor: colorName };
        expect(StyleHelper.getBackColor(node)).to.eq(color >>> 8);
      });

      it("throws on invalid color", () => {
        const node = { ...createNodeBase(), backColor: "does not exist" };
        expect(() => StyleHelper.getBackColor(node)).to.throw();
      });
    });
  });
});
