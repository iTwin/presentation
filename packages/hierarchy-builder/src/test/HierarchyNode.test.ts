/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { HierarchyNode, HierarchyNodeIdentifier, HierarchyNodeKey } from "../hierarchy-builder/HierarchyNode";
import { InstanceKey } from "../hierarchy-builder/values/Values";

describe("HierarchyNodeKey", () => {
  describe("equals", () => {
    it("returns false if key types are different", () => {
      expect(HierarchyNodeKey.equals("x", { type: "instances", instanceKeys: [] })).to.be.false;
    });

    it("returns correct results for custom node keys", () => {
      expect(HierarchyNodeKey.equals("x", "x")).to.be.true;
      expect(HierarchyNodeKey.equals("x", "y")).to.be.false;
    });

    it("returns false for standard nodes if types are different", () => {
      expect(HierarchyNodeKey.equals({ type: "class-grouping", class: { name: "x" } }, { type: "instances", instanceKeys: [] })).to.be.false;
    });

    it("returns correct results for instance node keys", () => {
      expect(HierarchyNodeKey.equals({ type: "instances", instanceKeys: [] }, { type: "instances", instanceKeys: [] })).to.be.true;
      expect(
        HierarchyNodeKey.equals(
          { type: "instances", instanceKeys: [{ className: "a", id: "0" }] },
          { type: "instances", instanceKeys: [{ className: "a", id: "0" }] },
        ),
      ).to.be.true;
      expect(HierarchyNodeKey.equals({ type: "instances", instanceKeys: [] }, { type: "instances", instanceKeys: [{ className: "a", id: "0" }] })).to.be.false;
      expect(HierarchyNodeKey.equals({ type: "instances", instanceKeys: [{ className: "a", id: "0" }] }, { type: "instances", instanceKeys: [] })).to.be.false;
      expect(
        HierarchyNodeKey.equals(
          { type: "instances", instanceKeys: [{ className: "a", id: "0" }] },
          { type: "instances", instanceKeys: [{ className: "b", id: "1" }] },
        ),
      ).to.be.false;
    });

    it("returns correct results for class grouping node keys", () => {
      expect(HierarchyNodeKey.equals({ type: "class-grouping", class: { name: "x" } }, { type: "class-grouping", class: { name: "x" } })).to.be.true;
      expect(HierarchyNodeKey.equals({ type: "class-grouping", class: { name: "x" } }, { type: "class-grouping", class: { name: "y" } })).to.be.false;
    });

    it("returns correct results for label grouping node keys", () => {
      expect(HierarchyNodeKey.equals({ type: "label-grouping", label: "a" }, { type: "label-grouping", label: "a" })).to.be.true;
      expect(HierarchyNodeKey.equals({ type: "label-grouping", label: "a" }, { type: "label-grouping", label: "b" })).to.be.false;
    });

    it("returns correct results for other property grouping node keys", () => {
      expect(
        HierarchyNodeKey.equals(
          { type: "other-property-grouping", groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name" } },
          { type: "other-property-grouping", groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name" } },
        ),
      ).to.be.true;
      expect(
        HierarchyNodeKey.equals(
          { type: "other-property-grouping", groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name" } },
          { type: "other-property-grouping", groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "other name" } },
        ),
      ).to.be.false;
      expect(
        HierarchyNodeKey.equals(
          { type: "other-property-grouping", groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name" } },
          { type: "other-property-grouping", groupingInfo: { fullClassName: "Schema.Other", propertyName: "property name" } },
        ),
      ).to.be.false;
    });

    it("returns correct results for formatted property grouping node keys", () => {
      expect(
        HierarchyNodeKey.equals(
          {
            type: "formatted-property-grouping",
            groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name", formattedPropertyValue: "value" },
          },
          {
            type: "formatted-property-grouping",
            groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name", formattedPropertyValue: "value" },
          },
        ),
      ).to.be.true;
      expect(
        HierarchyNodeKey.equals(
          {
            type: "formatted-property-grouping",
            groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name", formattedPropertyValue: "value" },
          },
          {
            type: "formatted-property-grouping",
            groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name", formattedPropertyValue: "value2" },
          },
        ),
      ).to.be.false;
      expect(
        HierarchyNodeKey.equals(
          {
            type: "formatted-property-grouping",
            groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name", formattedPropertyValue: "value" },
          },
          {
            type: "formatted-property-grouping",
            groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "other name", formattedPropertyValue: "value" },
          },
        ),
      ).to.be.false;
      expect(
        HierarchyNodeKey.equals(
          {
            type: "formatted-property-grouping",
            groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name", formattedPropertyValue: "value" },
          },
          {
            type: "formatted-property-grouping",
            groupingInfo: { fullClassName: "Schema.Other", propertyName: "property name", formattedPropertyValue: "value" },
          },
        ),
      ).to.be.false;
    });

    it("returns correct results for ranged property grouping node keys", () => {
      expect(
        HierarchyNodeKey.equals(
          {
            type: "ranged-property-grouping",
            groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name", fromValue: 1, toValue: 2 },
          },
          {
            type: "ranged-property-grouping",
            groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name", fromValue: 1, toValue: 2 },
          },
        ),
      ).to.be.true;
      expect(
        HierarchyNodeKey.equals(
          {
            type: "ranged-property-grouping",
            groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name", fromValue: 1, toValue: 2 },
          },
          {
            type: "ranged-property-grouping",
            groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name", fromValue: 1, toValue: 3 },
          },
        ),
      ).to.be.false;
      expect(
        HierarchyNodeKey.equals(
          {
            type: "ranged-property-grouping",
            groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name", fromValue: 1, toValue: 3 },
          },
          {
            type: "ranged-property-grouping",
            groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name", fromValue: 2, toValue: 3 },
          },
        ),
      ).to.be.false;
      expect(
        HierarchyNodeKey.equals(
          {
            type: "ranged-property-grouping",
            groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name", fromValue: 1, toValue: 2 },
          },
          {
            type: "ranged-property-grouping",
            groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "other name", fromValue: 1, toValue: 2 },
          },
        ),
      ).to.be.false;
      expect(
        HierarchyNodeKey.equals(
          {
            type: "ranged-property-grouping",
            groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name", fromValue: 1, toValue: 2 },
          },
          {
            type: "ranged-property-grouping",
            groupingInfo: { fullClassName: "Schema.Other", propertyName: "property name", fromValue: 1, toValue: 2 },
          },
        ),
      ).to.be.false;
    });
  });
});

describe("HierarchyNode", () => {
  const customNode: HierarchyNode = {
    key: "x",
    label: "custom node",
    parentKeys: [],
    children: false,
  };
  const instancesNode: HierarchyNode = {
    key: { type: "instances", instanceKeys: [] },
    label: "instances node",
    parentKeys: [],
    children: false,
  };
  const classGroupingNode: HierarchyNode = {
    key: { type: "class-grouping", class: { label: "c", name: "c" } },
    label: "class grouping node",
    parentKeys: [],
    children: false,
  };
  const labelGroupingNode: HierarchyNode = {
    key: { type: "label-grouping", label: "c" },
    label: "label grouping node",
    parentKeys: [],
    children: false,
  };
  const otherPropertyGroupingNode: HierarchyNode = {
    key: { type: "other-property-grouping", groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name" } },
    label: "other property grouping node",
    parentKeys: [],
    children: false,
  };
  const formattedPropertyGroupingNode: HierarchyNode = {
    key: {
      type: "formatted-property-grouping",
      groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name", formattedPropertyValue: "value" },
    },
    label: "formatted property grouping node",
    parentKeys: [],
    children: false,
  };
  const rangedPropertyGroupingNode: HierarchyNode = {
    key: { type: "ranged-property-grouping", groupingInfo: { fullClassName: "Schema.ClassName", propertyName: "property name", fromValue: 1, toValue: 2 } },
    label: "ranged property grouping node",
    parentKeys: [],
    children: false,
  };

  describe("isCustom", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isCustom(customNode)).to.be.true;
      expect(HierarchyNode.isCustom(instancesNode)).to.be.false;
      expect(HierarchyNode.isCustom(classGroupingNode)).to.be.false;
      expect(HierarchyNode.isCustom(labelGroupingNode)).to.be.false;
      expect(HierarchyNode.isCustom(otherPropertyGroupingNode)).to.be.false;
      expect(HierarchyNode.isCustom(formattedPropertyGroupingNode)).to.be.false;
      expect(HierarchyNode.isCustom(rangedPropertyGroupingNode)).to.be.false;
    });
  });

  describe("isStandard", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isStandard(customNode)).to.be.false;
      expect(HierarchyNode.isStandard(instancesNode)).to.be.true;
      expect(HierarchyNode.isStandard(classGroupingNode)).to.be.true;
      expect(HierarchyNode.isStandard(labelGroupingNode)).to.be.true;
      expect(HierarchyNode.isStandard(otherPropertyGroupingNode)).to.be.true;
      expect(HierarchyNode.isStandard(formattedPropertyGroupingNode)).to.be.true;
      expect(HierarchyNode.isStandard(rangedPropertyGroupingNode)).to.be.true;
    });
  });

  describe("isInstancesNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isInstancesNode(customNode)).to.be.false;
      expect(HierarchyNode.isInstancesNode(instancesNode)).to.be.true;
      expect(HierarchyNode.isInstancesNode(classGroupingNode)).to.be.false;
      expect(HierarchyNode.isInstancesNode(labelGroupingNode)).to.be.false;
      expect(HierarchyNode.isInstancesNode(otherPropertyGroupingNode)).to.be.false;
      expect(HierarchyNode.isInstancesNode(formattedPropertyGroupingNode)).to.be.false;
      expect(HierarchyNode.isInstancesNode(rangedPropertyGroupingNode)).to.be.false;
    });
  });

  describe("isGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isGroupingNode(customNode)).to.be.false;
      expect(HierarchyNode.isGroupingNode(instancesNode)).to.be.false;
      expect(HierarchyNode.isGroupingNode(classGroupingNode)).to.be.true;
      expect(HierarchyNode.isGroupingNode(labelGroupingNode)).to.be.true;
      expect(HierarchyNode.isGroupingNode(otherPropertyGroupingNode)).to.be.true;
      expect(HierarchyNode.isGroupingNode(formattedPropertyGroupingNode)).to.be.true;
      expect(HierarchyNode.isGroupingNode(rangedPropertyGroupingNode)).to.be.true;
    });
  });

  describe("isClassGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isClassGroupingNode(customNode)).to.be.false;
      expect(HierarchyNode.isClassGroupingNode(instancesNode)).to.be.false;
      expect(HierarchyNode.isClassGroupingNode(classGroupingNode)).to.be.true;
      expect(HierarchyNode.isClassGroupingNode(labelGroupingNode)).to.be.false;
      expect(HierarchyNode.isClassGroupingNode(otherPropertyGroupingNode)).to.be.false;
      expect(HierarchyNode.isClassGroupingNode(formattedPropertyGroupingNode)).to.be.false;
      expect(HierarchyNode.isClassGroupingNode(rangedPropertyGroupingNode)).to.be.false;
    });
  });

  describe("isLabelGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isLabelGroupingNode(customNode)).to.be.false;
      expect(HierarchyNode.isLabelGroupingNode(instancesNode)).to.be.false;
      expect(HierarchyNode.isLabelGroupingNode(classGroupingNode)).to.be.false;
      expect(HierarchyNode.isLabelGroupingNode(labelGroupingNode)).to.be.true;
      expect(HierarchyNode.isLabelGroupingNode(otherPropertyGroupingNode)).to.be.false;
      expect(HierarchyNode.isLabelGroupingNode(formattedPropertyGroupingNode)).to.be.false;
      expect(HierarchyNode.isLabelGroupingNode(rangedPropertyGroupingNode)).to.be.false;
    });
  });

  describe("isOtherPropertyGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isOtherPropertyGroupingNode(customNode)).to.be.false;
      expect(HierarchyNode.isOtherPropertyGroupingNode(instancesNode)).to.be.false;
      expect(HierarchyNode.isOtherPropertyGroupingNode(classGroupingNode)).to.be.false;
      expect(HierarchyNode.isOtherPropertyGroupingNode(labelGroupingNode)).to.be.false;
      expect(HierarchyNode.isOtherPropertyGroupingNode(otherPropertyGroupingNode)).to.be.true;
      expect(HierarchyNode.isOtherPropertyGroupingNode(formattedPropertyGroupingNode)).to.be.false;
      expect(HierarchyNode.isOtherPropertyGroupingNode(rangedPropertyGroupingNode)).to.be.false;
    });
  });

  describe("isFormattedPropertyGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isFormattedPropertyGroupingNode(customNode)).to.be.false;
      expect(HierarchyNode.isFormattedPropertyGroupingNode(instancesNode)).to.be.false;
      expect(HierarchyNode.isFormattedPropertyGroupingNode(classGroupingNode)).to.be.false;
      expect(HierarchyNode.isFormattedPropertyGroupingNode(labelGroupingNode)).to.be.false;
      expect(HierarchyNode.isFormattedPropertyGroupingNode(otherPropertyGroupingNode)).to.be.false;
      expect(HierarchyNode.isFormattedPropertyGroupingNode(formattedPropertyGroupingNode)).to.be.true;
      expect(HierarchyNode.isFormattedPropertyGroupingNode(rangedPropertyGroupingNode)).to.be.false;
    });
  });

  describe("isRangedPropertyGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isRangedPropertyGroupingNode(customNode)).to.be.false;
      expect(HierarchyNode.isRangedPropertyGroupingNode(instancesNode)).to.be.false;
      expect(HierarchyNode.isRangedPropertyGroupingNode(classGroupingNode)).to.be.false;
      expect(HierarchyNode.isRangedPropertyGroupingNode(labelGroupingNode)).to.be.false;
      expect(HierarchyNode.isRangedPropertyGroupingNode(otherPropertyGroupingNode)).to.be.false;
      expect(HierarchyNode.isRangedPropertyGroupingNode(formattedPropertyGroupingNode)).to.be.false;
      expect(HierarchyNode.isRangedPropertyGroupingNode(rangedPropertyGroupingNode)).to.be.true;
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
