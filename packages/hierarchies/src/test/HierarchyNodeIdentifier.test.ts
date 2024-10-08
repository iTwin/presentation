/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { HierarchyNodeIdentifier } from "../hierarchies/HierarchyNodeIdentifier";
import { GenericNodeKey } from "../hierarchies/HierarchyNodeKey";
import { createTestGenericNodeKey } from "./Utils";
import { InstanceKey } from "@itwin/presentation-shared";

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
      expect(HierarchyNodeIdentifier.equal(instanceNodeIdentifier, { className: "b", id: "0x1" })).to.be.false;
      expect(HierarchyNodeIdentifier.equal(instanceNodeIdentifier, { className: "a", id: "0x2" })).to.be.false;
      expect(HierarchyNodeIdentifier.equal(instanceNodeIdentifier, { className: "a", id: "0x1" })).to.be.true;
    });

    it("compares instance and generic node identifiers", () => {
      expect(HierarchyNodeIdentifier.equal(instanceNodeIdentifier, genericNodeIdentifier)).to.be.false;
    });
  });

  describe("compare", () => {
    const hierarchyNodeIdentifierVariants: HierarchyNodeIdentifier[] = [
      createTestGenericNodeKey({ id: "1" }),
      createTestGenericNodeKey({ id: "2" }),
      createTestGenericNodeKey({ id: "1", source: "source1" }),
      createTestGenericNodeKey({ id: "1", source: "source2" }),
      { className: "1", id: "1" },
      { className: "1", id: "1", imodelKey: "key1" },
      { className: "1", id: "1", imodelKey: "key2" },
      { className: "1", id: "2" },
      { className: "2", id: "1" },
    ];

    it("returns correct results for all possible hierarchy node identifier pairs", () => {
      hierarchyNodeIdentifierVariants.forEach((lhs, lhsIndex) => {
        hierarchyNodeIdentifierVariants.forEach((rhs, rhsIndex) => {
          const lhsToRhs = HierarchyNodeIdentifier.compare(lhs, rhs);
          const rhsToLhs = HierarchyNodeIdentifier.compare(rhs, lhs);
          if (lhsIndex === rhsIndex) {
            expect(lhsToRhs).to.eq(0);
            expect(rhsToLhs).to.eq(0);
          } else {
            expect(lhsToRhs).to.not.eq(0);
            expect(rhsToLhs).to.not.eq(0);
            expect(rhsToLhs).to.eq(-1 * lhsToRhs);
          }
        });
      });
    });
  });
});
