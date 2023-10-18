/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { HierarchyNode, HierarchyNodeIdentifier } from "../hierarchy-builder/HierarchyNode";
import { InstanceKey } from "../hierarchy-builder/values/Values";

describe("HierarchyNode", () => {
  const customNode: HierarchyNode = {
    key: "x",
    label: "custom node",
  };
  const instancesNode: HierarchyNode = {
    key: { type: "instances", instanceKeys: [] },
    label: "instances node",
  };
  const classGroupingNode: HierarchyNode = {
    key: { type: "class-grouping", class: { label: "c", name: "c" } },
    label: "class grouping node",
  };
  const labelGroupingNode: HierarchyNode = {
    key: { type: "label-grouping", label: "c" },
    label: "label grouping node",
  };

  describe("isCustom", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isCustom(customNode)).to.be.true;
      expect(HierarchyNode.isCustom(instancesNode)).to.be.false;
      expect(HierarchyNode.isCustom(classGroupingNode)).to.be.false;
      expect(HierarchyNode.isCustom(labelGroupingNode)).to.be.false;
    });
  });

  describe("isStandard", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isStandard(customNode)).to.be.false;
      expect(HierarchyNode.isStandard(instancesNode)).to.be.true;
      expect(HierarchyNode.isStandard(classGroupingNode)).to.be.true;
      expect(HierarchyNode.isStandard(labelGroupingNode)).to.be.true;
    });
  });

  describe("isInstancesNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isInstancesNode(customNode)).to.be.false;
      expect(HierarchyNode.isInstancesNode(instancesNode)).to.be.true;
      expect(HierarchyNode.isInstancesNode(classGroupingNode)).to.be.false;
      expect(HierarchyNode.isInstancesNode(labelGroupingNode)).to.be.false;
    });
  });

  describe("isClassGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isClassGroupingNode(customNode)).to.be.false;
      expect(HierarchyNode.isClassGroupingNode(instancesNode)).to.be.false;
      expect(HierarchyNode.isClassGroupingNode(classGroupingNode)).to.be.true;
      expect(HierarchyNode.isClassGroupingNode(labelGroupingNode)).to.be.false;
    });
  });

  describe("isLabelGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isLabelGroupingNode(customNode)).to.be.false;
      expect(HierarchyNode.isLabelGroupingNode(instancesNode)).to.be.false;
      expect(HierarchyNode.isLabelGroupingNode(classGroupingNode)).to.be.false;
      expect(HierarchyNode.isLabelGroupingNode(labelGroupingNode)).to.be.true;
    });
  });
});

describe("HierarchyNodeIdentifier", () => {
  const instanceNodeIdentifier: InstanceKey = {
    className: "a",
    id: "0x1",
  };
  const customNodeIdentifier = {
    key: "x",
  };

  describe("isInstanceNodeIdentifier", () => {
    it("returns correct result for different types of identifiers", () => {
      expect(HierarchyNodeIdentifier.isInstanceNodeIdentifier(instanceNodeIdentifier)).to.be.true;
      expect(HierarchyNodeIdentifier.isInstanceNodeIdentifier(customNodeIdentifier)).to.be.false;
    });
  });

  describe("isCustomNodeIdentifier", () => {
    it("returns correct result for different types of identifiers", () => {
      expect(HierarchyNodeIdentifier.isCustomNodeIdentifier(instanceNodeIdentifier)).to.be.false;
      expect(HierarchyNodeIdentifier.isCustomNodeIdentifier(customNodeIdentifier)).to.be.true;
    });
  });

  describe("equal", () => {
    it("compares custom node identifiers", () => {
      expect(HierarchyNodeIdentifier.equal(customNodeIdentifier, { key: "y" })).to.be.false;
      expect(HierarchyNodeIdentifier.equal(customNodeIdentifier, { key: "x" })).to.be.true;
    });

    it("compares instance node identifiers", () => {
      expect(HierarchyNodeIdentifier.equal(instanceNodeIdentifier, { className: "b", id: "0x1" })).to.be.false;
      expect(HierarchyNodeIdentifier.equal(instanceNodeIdentifier, { className: "a", id: "0x2" })).to.be.false;
      expect(HierarchyNodeIdentifier.equal(instanceNodeIdentifier, { className: "a", id: "0x1" })).to.be.true;
    });

    it("compares instance and custom node identifiers", () => {
      expect(HierarchyNodeIdentifier.equal(instanceNodeIdentifier, customNodeIdentifier)).to.be.false;
    });
  });
});
