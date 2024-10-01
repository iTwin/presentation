/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { GroupingHierarchyNode, HierarchyNode } from "../hierarchies/HierarchyNode";
import { createTestGenericNodeKey } from "./Utils";

describe("HierarchyNode", () => {
  const genericNode: HierarchyNode = {
    key: createTestGenericNodeKey({ id: "x" }),
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

  describe("isGeneric", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isGeneric(genericNode)).to.be.true;
      expect(HierarchyNode.isGeneric(instancesNode)).to.be.false;
      expect(HierarchyNode.isGeneric(classGroupingNode)).to.be.false;
      expect(HierarchyNode.isGeneric(labelGroupingNode)).to.be.false;
      expect(HierarchyNode.isGeneric(propertyOtherValuesGroupingNode)).to.be.false;
      expect(HierarchyNode.isGeneric(propertyValueGroupingNode)).to.be.false;
      expect(HierarchyNode.isGeneric(propertyValueRangeGroupingNode)).to.be.false;
    });
  });

  describe("isIModelNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isIModelNode(genericNode)).to.be.false;
      expect(HierarchyNode.isIModelNode(instancesNode)).to.be.true;
      expect(HierarchyNode.isIModelNode(classGroupingNode)).to.be.true;
      expect(HierarchyNode.isIModelNode(labelGroupingNode)).to.be.true;
      expect(HierarchyNode.isIModelNode(propertyOtherValuesGroupingNode)).to.be.true;
      expect(HierarchyNode.isIModelNode(propertyValueGroupingNode)).to.be.true;
      expect(HierarchyNode.isIModelNode(propertyValueRangeGroupingNode)).to.be.true;
    });
  });

  describe("isInstancesNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isInstancesNode(genericNode)).to.be.false;
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
      expect(HierarchyNode.isGroupingNode(genericNode)).to.be.false;
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
      expect(HierarchyNode.isClassGroupingNode(genericNode)).to.be.false;
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
      expect(HierarchyNode.isLabelGroupingNode(genericNode)).to.be.false;
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
      expect(HierarchyNode.isPropertyOtherValuesGroupingNode(genericNode)).to.be.false;
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
      expect(HierarchyNode.isPropertyValueGroupingNode(genericNode)).to.be.false;
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
      expect(HierarchyNode.isPropertyValueRangeGroupingNode(genericNode)).to.be.false;
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
      expect(HierarchyNode.isPropertyGroupingNode(genericNode)).to.be.false;
      expect(HierarchyNode.isPropertyGroupingNode(instancesNode)).to.be.false;
      expect(HierarchyNode.isPropertyGroupingNode(classGroupingNode)).to.be.false;
      expect(HierarchyNode.isPropertyGroupingNode(labelGroupingNode)).to.be.false;
      expect(HierarchyNode.isPropertyGroupingNode(propertyOtherValuesGroupingNode)).to.be.true;
      expect(HierarchyNode.isPropertyGroupingNode(propertyValueGroupingNode)).to.be.true;
      expect(HierarchyNode.isPropertyGroupingNode(propertyValueRangeGroupingNode)).to.be.true;
    });
  });
});
