/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { GroupingHierarchyNode, HierarchyNode } from "../hierarchies/HierarchyNode";

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
  const classGroupingNode: GroupingHierarchyNode = {
    key: { type: "class-grouping", className: "c" },
    groupedInstanceKeys: [],
    label: "class grouping node",
    parentKeys: [],
    children: false,
  };
  const labelGroupingNode: GroupingHierarchyNode = {
    key: { type: "label-grouping", label: "c" },
    groupedInstanceKeys: [],
    label: "label grouping node",
    parentKeys: [],
    children: false,
  };
  const propertyOtherValuesGroupingNode: GroupingHierarchyNode = {
    key: { type: "property-grouping:other", properties: [] },
    groupedInstanceKeys: [],
    label: "other property grouping node",
    parentKeys: [],
    children: false,
  };
  const propertyValueGroupingNode: GroupingHierarchyNode = {
    key: {
      type: "property-grouping:value",
      propertyClassName: "Schema.ClassName",
      propertyName: "property name",
      formattedPropertyValue: "value",
    },
    groupedInstanceKeys: [],
    label: "formatted property grouping node",
    parentKeys: [],
    children: false,
  };
  const propertyValueRangeGroupingNode: GroupingHierarchyNode = {
    key: {
      type: "property-grouping:range",
      propertyClassName: "Schema.ClassName",
      propertyName: "property name",
      fromValue: 1,
      toValue: 2,
    },
    groupedInstanceKeys: [],
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
      expect(HierarchyNode.isCustom(propertyOtherValuesGroupingNode)).to.be.false;
      expect(HierarchyNode.isCustom(propertyValueGroupingNode)).to.be.false;
      expect(HierarchyNode.isCustom(propertyValueRangeGroupingNode)).to.be.false;
    });
  });

  describe("isStandard", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isStandard(customNode)).to.be.false;
      expect(HierarchyNode.isStandard(instancesNode)).to.be.true;
      expect(HierarchyNode.isStandard(classGroupingNode)).to.be.true;
      expect(HierarchyNode.isStandard(labelGroupingNode)).to.be.true;
      expect(HierarchyNode.isStandard(propertyOtherValuesGroupingNode)).to.be.true;
      expect(HierarchyNode.isStandard(propertyValueGroupingNode)).to.be.true;
      expect(HierarchyNode.isStandard(propertyValueRangeGroupingNode)).to.be.true;
    });
  });

  describe("isInstancesNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isInstancesNode(customNode)).to.be.false;
      expect(HierarchyNode.isInstancesNode(instancesNode)).to.be.true;
      expect(HierarchyNode.isInstancesNode(classGroupingNode)).to.be.false;
      expect(HierarchyNode.isInstancesNode(labelGroupingNode)).to.be.false;
      expect(HierarchyNode.isInstancesNode(propertyOtherValuesGroupingNode)).to.be.false;
      expect(HierarchyNode.isInstancesNode(propertyValueGroupingNode)).to.be.false;
      expect(HierarchyNode.isInstancesNode(propertyValueRangeGroupingNode)).to.be.false;
    });
  });

  describe("isGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isGroupingNode(customNode)).to.be.false;
      expect(HierarchyNode.isGroupingNode(instancesNode)).to.be.false;
      expect(HierarchyNode.isGroupingNode(classGroupingNode)).to.be.true;
      expect(HierarchyNode.isGroupingNode(labelGroupingNode)).to.be.true;
      expect(HierarchyNode.isGroupingNode(propertyOtherValuesGroupingNode)).to.be.true;
      expect(HierarchyNode.isGroupingNode(propertyValueGroupingNode)).to.be.true;
      expect(HierarchyNode.isGroupingNode(propertyValueRangeGroupingNode)).to.be.true;
    });
  });

  describe("isClassGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isClassGroupingNode(customNode)).to.be.false;
      expect(HierarchyNode.isClassGroupingNode(instancesNode)).to.be.false;
      expect(HierarchyNode.isClassGroupingNode(classGroupingNode)).to.be.true;
      expect(HierarchyNode.isClassGroupingNode(labelGroupingNode)).to.be.false;
      expect(HierarchyNode.isClassGroupingNode(propertyOtherValuesGroupingNode)).to.be.false;
      expect(HierarchyNode.isClassGroupingNode(propertyValueGroupingNode)).to.be.false;
      expect(HierarchyNode.isClassGroupingNode(propertyValueRangeGroupingNode)).to.be.false;
    });
  });

  describe("isLabelGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isLabelGroupingNode(customNode)).to.be.false;
      expect(HierarchyNode.isLabelGroupingNode(instancesNode)).to.be.false;
      expect(HierarchyNode.isLabelGroupingNode(classGroupingNode)).to.be.false;
      expect(HierarchyNode.isLabelGroupingNode(labelGroupingNode)).to.be.true;
      expect(HierarchyNode.isLabelGroupingNode(propertyOtherValuesGroupingNode)).to.be.false;
      expect(HierarchyNode.isLabelGroupingNode(propertyValueGroupingNode)).to.be.false;
      expect(HierarchyNode.isLabelGroupingNode(propertyValueRangeGroupingNode)).to.be.false;
    });
  });

  describe("isPropertyOtherValuesGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isPropertyOtherValuesGroupingNode(customNode)).to.be.false;
      expect(HierarchyNode.isPropertyOtherValuesGroupingNode(instancesNode)).to.be.false;
      expect(HierarchyNode.isPropertyOtherValuesGroupingNode(classGroupingNode)).to.be.false;
      expect(HierarchyNode.isPropertyOtherValuesGroupingNode(labelGroupingNode)).to.be.false;
      expect(HierarchyNode.isPropertyOtherValuesGroupingNode(propertyOtherValuesGroupingNode)).to.be.true;
      expect(HierarchyNode.isPropertyOtherValuesGroupingNode(propertyValueGroupingNode)).to.be.false;
      expect(HierarchyNode.isPropertyOtherValuesGroupingNode(propertyValueRangeGroupingNode)).to.be.false;
    });
  });

  describe("isPropertyValueGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isPropertyValueGroupingNode(customNode)).to.be.false;
      expect(HierarchyNode.isPropertyValueGroupingNode(instancesNode)).to.be.false;
      expect(HierarchyNode.isPropertyValueGroupingNode(classGroupingNode)).to.be.false;
      expect(HierarchyNode.isPropertyValueGroupingNode(labelGroupingNode)).to.be.false;
      expect(HierarchyNode.isPropertyValueGroupingNode(propertyOtherValuesGroupingNode)).to.be.false;
      expect(HierarchyNode.isPropertyValueGroupingNode(propertyValueGroupingNode)).to.be.true;
      expect(HierarchyNode.isPropertyValueGroupingNode(propertyValueRangeGroupingNode)).to.be.false;
    });
  });

  describe("isPropertyValueRangeGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isPropertyValueRangeGroupingNode(customNode)).to.be.false;
      expect(HierarchyNode.isPropertyValueRangeGroupingNode(instancesNode)).to.be.false;
      expect(HierarchyNode.isPropertyValueRangeGroupingNode(classGroupingNode)).to.be.false;
      expect(HierarchyNode.isPropertyValueRangeGroupingNode(labelGroupingNode)).to.be.false;
      expect(HierarchyNode.isPropertyValueRangeGroupingNode(propertyOtherValuesGroupingNode)).to.be.false;
      expect(HierarchyNode.isPropertyValueRangeGroupingNode(propertyValueGroupingNode)).to.be.false;
      expect(HierarchyNode.isPropertyValueRangeGroupingNode(propertyValueRangeGroupingNode)).to.be.true;
    });
  });

  describe("isPropertyGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isPropertyGroupingNode(customNode)).to.be.false;
      expect(HierarchyNode.isPropertyGroupingNode(instancesNode)).to.be.false;
      expect(HierarchyNode.isPropertyGroupingNode(classGroupingNode)).to.be.false;
      expect(HierarchyNode.isPropertyGroupingNode(labelGroupingNode)).to.be.false;
      expect(HierarchyNode.isPropertyGroupingNode(propertyOtherValuesGroupingNode)).to.be.true;
      expect(HierarchyNode.isPropertyGroupingNode(propertyValueGroupingNode)).to.be.true;
      expect(HierarchyNode.isPropertyGroupingNode(propertyValueRangeGroupingNode)).to.be.true;
    });
  });
});
