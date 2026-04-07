/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { InstanceKey } from "@itwin/presentation-shared";
import { HierarchyNodeIdentifier } from "../hierarchies/HierarchyNodeIdentifier.js";
import { GenericNodeKey } from "../hierarchies/HierarchyNodeKey.js";
import { createTestGenericNodeKey } from "./Utils.js";

describe("HierarchyNodeIdentifier", () => {
  const instanceNodeIdentifier: InstanceKey = {
    className: "a",
    id: "0x1",
  };
  const genericNodeIdentifier: GenericNodeKey = {
    type: "generic",
    id: "x",
    source: "s",
  };
  describe("isInstanceNodeIdentifier", () => {
    it("returns correct result for different types of identifiers", () => {
      expect(HierarchyNodeIdentifier.isInstanceNodeIdentifier(instanceNodeIdentifier)).toBe(true);
      expect(HierarchyNodeIdentifier.isInstanceNodeIdentifier(genericNodeIdentifier)).toBe(false);
    });
  });
  describe("isGenericNodeIdentifier", () => {
    it("returns correct result for different types of identifiers", () => {
      expect(HierarchyNodeIdentifier.isGenericNodeIdentifier(instanceNodeIdentifier)).toBe(false);
      expect(HierarchyNodeIdentifier.isGenericNodeIdentifier(genericNodeIdentifier)).toBe(true);
    });
  });

  describe("equal", () => {
    it("compares generic node identifiers", () => {
      expect(HierarchyNodeIdentifier.equal(genericNodeIdentifier, createTestGenericNodeKey({ id: "y", source: "s" }))).toBe(false);
      expect(HierarchyNodeIdentifier.equal(genericNodeIdentifier, createTestGenericNodeKey({ id: "x", source: "s2" }))).toBe(false);
      expect(HierarchyNodeIdentifier.equal(genericNodeIdentifier, createTestGenericNodeKey({ id: "x" }))).toBe(false);
      expect(HierarchyNodeIdentifier.equal(genericNodeIdentifier, createTestGenericNodeKey({ id: "x", source: "s" }))).toBe(true);
    });

    it("compares instance node identifiers", () => {
      expect(HierarchyNodeIdentifier.equal(instanceNodeIdentifier, { className: "b", id: "0x1" })).toBe(false);
      expect(HierarchyNodeIdentifier.equal(instanceNodeIdentifier, { className: "a", id: "0x2" })).toBe(false);
      expect(HierarchyNodeIdentifier.equal(instanceNodeIdentifier, { className: "a", id: "0x1" })).toBe(true);
    });

    it("compares instance and generic node identifiers", () => {
      expect(HierarchyNodeIdentifier.equal(instanceNodeIdentifier, genericNodeIdentifier)).toBe(false);
    });
  });
});
