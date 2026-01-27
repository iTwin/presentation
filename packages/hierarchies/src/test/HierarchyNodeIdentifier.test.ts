/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { HierarchyNodeIdentifier } from "../hierarchies/HierarchyNodeIdentifier.js";
import { createTestGenericNodeKey } from "./Utils.js";

import type { InstanceKey } from "@itwin/presentation-shared";
import type { GenericNodeKey } from "../hierarchies/HierarchyNodeKey.js";

describe("HierarchyNodeIdentifier", () => {
  const instanceNodeIdentifier: InstanceKey = {
    className: "s.a",
    id: "0x1",
  };
  const genericNodeIdentifier: GenericNodeKey = {
    type: "generic",
    id: "x",
    source: "s",
  };
  describe("isInstanceNodeIdentifier", () => {
    it("returns correct result for different types of identifiers", () => {
      expect(HierarchyNodeIdentifier.isInstanceNodeIdentifier(instanceNodeIdentifier)).to.be.true;
      expect(HierarchyNodeIdentifier.isInstanceNodeIdentifier(genericNodeIdentifier)).to.be.false;
    });
  });
  describe("isGenericNodeIdentifier", () => {
    it("returns correct result for different types of identifiers", () => {
      expect(HierarchyNodeIdentifier.isGenericNodeIdentifier(instanceNodeIdentifier)).to.be.false;
      expect(HierarchyNodeIdentifier.isGenericNodeIdentifier(genericNodeIdentifier)).to.be.true;
    });
  });

  describe("equal", () => {
    it("compares generic node identifiers", () => {
      expect(HierarchyNodeIdentifier.equal(genericNodeIdentifier, createTestGenericNodeKey({ id: "y", source: "s" }))).to.be.false;
      expect(HierarchyNodeIdentifier.equal(genericNodeIdentifier, createTestGenericNodeKey({ id: "x", source: "s2" }))).to.be.false;
      expect(HierarchyNodeIdentifier.equal(genericNodeIdentifier, createTestGenericNodeKey({ id: "x" }))).to.be.false;
      expect(HierarchyNodeIdentifier.equal(genericNodeIdentifier, createTestGenericNodeKey({ id: "x", source: "s" }))).to.be.true;
    });

    it("compares instance node identifiers", () => {
      expect(HierarchyNodeIdentifier.equal(instanceNodeIdentifier, { className: "s.b", id: "0x1" })).to.be.false;
      expect(HierarchyNodeIdentifier.equal(instanceNodeIdentifier, { className: "s.a", id: "0x2" })).to.be.false;
      expect(HierarchyNodeIdentifier.equal(instanceNodeIdentifier, { className: "s.a", id: "0x1" })).to.be.true;
    });

    it("compares instance and generic node identifiers", () => {
      expect(HierarchyNodeIdentifier.equal(instanceNodeIdentifier, genericNodeIdentifier)).to.be.false;
    });
  });
});
