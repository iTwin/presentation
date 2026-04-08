/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { LabelDefinition } from "@itwin/presentation-common";
import { StyleHelper } from "../../presentation-components/common/StyleHelper.js";
import { createTestECInstancesNodeKey } from "../_helpers/Hierarchy.js";

import type { Node } from "@itwin/presentation-common";

describe("StyleHelper", () => {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const createNodeBase = (): Node => ({
    label: LabelDefinition.fromLabelString("Test Label"),
    key: createTestECInstancesNodeKey(),
  });

  describe("isBold", () => {
    it("returns true when fontStyle property contains 'Bold'", () => {
      const node = { ...createNodeBase(), fontStyle: "*** Bold***" };
      expect(StyleHelper.isBold(node)).toBe(true);
    });

    it("returns false when fontStyle property doesn't contain 'Bold'", () => {
      const node = { ...createNodeBase(), fontStyle: "Test" };
      expect(StyleHelper.isBold(node)).toBe(false);
    });
  });

  describe("isItalic", () => {
    it("returns true when fontStyle property contains 'Italic'", () => {
      const node = { ...createNodeBase(), fontStyle: "*** Italic***" };
      expect(StyleHelper.isItalic(node)).toBe(true);
    });

    it("returns false when fontStyle property doesn't contain 'Italic'", () => {
      const node = { ...createNodeBase(), fontStyle: "Test" };
      expect(StyleHelper.isItalic(node)).toBe(false);
    });
  });

  describe("getColor", () => {
    describe("from RGB", () => {
      it("returns valid color", () => {
        const node = { ...createNodeBase(), backColor: "rgb(1, 1,1 )" };
        expect(StyleHelper.getBackColor(node)).toBe(0x010101);
      });
    });

    describe("from hex", () => {
      it("returns valid color", () => {
        const node = { ...createNodeBase(), backColor: "#010101" };
        expect(StyleHelper.getBackColor(node)).toBe(0x010101);
      });
    });

    describe("from color name", () => {
      it("returns valid color", () => {
        const colorName = "DarkRed";
        const color = StyleHelper.availableColors[colorName];
        const node = { ...createNodeBase(), backColor: colorName };
        expect(StyleHelper.getBackColor(node)).toBe(color >>> 8);
      });

      it("throws on invalid color", () => {
        const node = { ...createNodeBase(), backColor: "does not exist" };
        expect(() => StyleHelper.getBackColor(node)).toThrow();
      });
    });
  });
});
