/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { HierarchyNodeIdentifier } from "../hierarchies/HierarchyNodeIdentifier.js";
import { createTestGenericNodeKey, createTestInstanceKey } from "./Utils.js";

import type { GenericNodeKey, IModelInstanceKey } from "../hierarchies/HierarchyNodeKey.js";

describe("HierarchyNodeIdentifier", () => {
  const instanceNodeIdentifier: IModelInstanceKey = { className: "s.a", id: "0x1" };
  const genericNodeIdentifier: GenericNodeKey = { type: "generic", id: "x", source: "s" };

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
      expect(HierarchyNodeIdentifier.equal(genericNodeIdentifier, createTestGenericNodeKey({ id: "y", source: "s" })))
        .to.be.false;
      expect(HierarchyNodeIdentifier.equal(genericNodeIdentifier, createTestGenericNodeKey({ id: "x", source: "s2" })))
        .to.be.false;
      expect(HierarchyNodeIdentifier.equal(genericNodeIdentifier, createTestGenericNodeKey({ id: "x" }))).to.be.false;
      expect(HierarchyNodeIdentifier.equal(genericNodeIdentifier, createTestGenericNodeKey({ id: "x", source: "s" })))
        .to.be.true;
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

  describe("compare", () => {
    it("returns 0 for equal generic node identifiers", () => {
      expect(
        HierarchyNodeIdentifier.compare(genericNodeIdentifier, createTestGenericNodeKey({ id: "x", source: "s" })),
      ).to.eq(0);
    });

    it("returns 0 for equal instance node identifiers", () => {
      expect(HierarchyNodeIdentifier.compare(instanceNodeIdentifier, { className: "s.a", id: "0x1" })).to.eq(0);
    });

    it("returns negative when generic is compared to instance", () => {
      expect(HierarchyNodeIdentifier.compare(genericNodeIdentifier, instanceNodeIdentifier)).to.be.lessThan(0);
    });

    it("returns positive when instance is compared to generic", () => {
      expect(HierarchyNodeIdentifier.compare(instanceNodeIdentifier, genericNodeIdentifier)).to.be.greaterThan(0);
    });

    it("compares generic identifiers by source first", () => {
      expect(
        HierarchyNodeIdentifier.compare(
          createTestGenericNodeKey({ id: "a", source: "a" }),
          createTestGenericNodeKey({ id: "a", source: "b" }),
        ),
      ).to.be.lessThan(0);
      expect(
        HierarchyNodeIdentifier.compare(
          createTestGenericNodeKey({ id: "a", source: "b" }),
          createTestGenericNodeKey({ id: "a", source: "a" }),
        ),
      ).to.be.greaterThan(0);
    });

    it("compares generic identifiers by id when sources are equal", () => {
      expect(
        HierarchyNodeIdentifier.compare(
          createTestGenericNodeKey({ id: "a", source: "s" }),
          createTestGenericNodeKey({ id: "b", source: "s" }),
        ),
      ).to.be.lessThan(0);
      expect(
        HierarchyNodeIdentifier.compare(
          createTestGenericNodeKey({ id: "b", source: "s" }),
          createTestGenericNodeKey({ id: "a", source: "s" }),
        ),
      ).to.be.greaterThan(0);
    });

    it("compares generic identifiers with undefined source", () => {
      expect(
        HierarchyNodeIdentifier.compare(createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "a" })),
      ).to.eq(0);
      expect(
        HierarchyNodeIdentifier.compare(
          createTestGenericNodeKey({ id: "a", source: "s" }),
          createTestGenericNodeKey({ id: "a" }),
        ),
      ).to.not.eq(0);
    });

    it("compares instance identifiers by imodelKey first", () => {
      expect(
        HierarchyNodeIdentifier.compare(
          createTestInstanceKey({ className: "s.a", id: "0x1", imodelKey: "a" }),
          createTestInstanceKey({ className: "s.a", id: "0x1", imodelKey: "b" }),
        ),
      ).to.be.lessThan(0);
      expect(
        HierarchyNodeIdentifier.compare(
          createTestInstanceKey({ className: "s.a", id: "0x1", imodelKey: "b" }),
          createTestInstanceKey({ className: "s.a", id: "0x1", imodelKey: "a" }),
        ),
      ).to.be.greaterThan(0);
    });

    it("compares instance identifiers by className when imodelKeys are equal", () => {
      expect(
        HierarchyNodeIdentifier.compare({ className: "s.a", id: "0x1" }, { className: "s.b", id: "0x1" }),
      ).to.be.lessThan(0);
      expect(
        HierarchyNodeIdentifier.compare({ className: "s.b", id: "0x1" }, { className: "s.a", id: "0x1" }),
      ).to.be.greaterThan(0);
    });

    it("compares instance identifiers by id when classNames are equal", () => {
      expect(
        HierarchyNodeIdentifier.compare({ className: "s.a", id: "0x1" }, { className: "s.a", id: "0x2" }),
      ).to.be.lessThan(0);
      expect(
        HierarchyNodeIdentifier.compare({ className: "s.a", id: "0x2" }, { className: "s.a", id: "0x1" }),
      ).to.be.greaterThan(0);
    });

    it("compares instance identifiers case-insensitively by className", () => {
      expect(HierarchyNodeIdentifier.compare({ className: "S.A", id: "0x1" }, { className: "s.a", id: "0x1" })).to.eq(
        0,
      );
    });
  });
});
