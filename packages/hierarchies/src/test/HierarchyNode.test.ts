/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { GroupingHierarchyNode, HierarchyNode } from "../hierarchies/HierarchyNode.js";
import { createTestGenericNodeKey } from "./Utils.js";

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
      expect(HierarchyNode.isGeneric(genericNode)).toBe(true);
      expect(HierarchyNode.isGeneric(instancesNode)).toBe(false);
      expect(HierarchyNode.isGeneric(classGroupingNode)).toBe(false);
      expect(HierarchyNode.isGeneric(labelGroupingNode)).toBe(false);
      expect(HierarchyNode.isGeneric(propertyOtherValuesGroupingNode)).toBe(false);
      expect(HierarchyNode.isGeneric(propertyValueGroupingNode)).toBe(false);
      expect(HierarchyNode.isGeneric(propertyValueRangeGroupingNode)).toBe(false);
    });
  });

  describe("isIModelNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isIModelNode(genericNode)).toBe(false);
      expect(HierarchyNode.isIModelNode(instancesNode)).toBe(true);
      expect(HierarchyNode.isIModelNode(classGroupingNode)).toBe(true);
      expect(HierarchyNode.isIModelNode(labelGroupingNode)).toBe(true);
      expect(HierarchyNode.isIModelNode(propertyOtherValuesGroupingNode)).toBe(true);
      expect(HierarchyNode.isIModelNode(propertyValueGroupingNode)).toBe(true);
      expect(HierarchyNode.isIModelNode(propertyValueRangeGroupingNode)).toBe(true);
    });
  });

  describe("isInstancesNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isInstancesNode(genericNode)).toBe(false);
      expect(HierarchyNode.isInstancesNode(instancesNode)).toBe(true);
      expect(HierarchyNode.isInstancesNode(classGroupingNode)).toBe(false);
      expect(HierarchyNode.isInstancesNode(labelGroupingNode)).toBe(false);
      expect(HierarchyNode.isInstancesNode(propertyOtherValuesGroupingNode)).toBe(false);
      expect(HierarchyNode.isInstancesNode(propertyValueGroupingNode)).toBe(false);
      expect(HierarchyNode.isInstancesNode(propertyValueRangeGroupingNode)).toBe(false);
    });
  });

  describe("isGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isGroupingNode(genericNode)).toBe(false);
      expect(HierarchyNode.isGroupingNode(instancesNode)).toBe(false);
      expect(HierarchyNode.isGroupingNode(classGroupingNode)).toBe(true);
      expect(HierarchyNode.isGroupingNode(labelGroupingNode)).toBe(true);
      expect(HierarchyNode.isGroupingNode(propertyOtherValuesGroupingNode)).toBe(true);
      expect(HierarchyNode.isGroupingNode(propertyValueGroupingNode)).toBe(true);
      expect(HierarchyNode.isGroupingNode(propertyValueRangeGroupingNode)).toBe(true);
    });
  });

  describe("isClassGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isClassGroupingNode(genericNode)).toBe(false);
      expect(HierarchyNode.isClassGroupingNode(instancesNode)).toBe(false);
      expect(HierarchyNode.isClassGroupingNode(classGroupingNode)).toBe(true);
      expect(HierarchyNode.isClassGroupingNode(labelGroupingNode)).toBe(false);
      expect(HierarchyNode.isClassGroupingNode(propertyOtherValuesGroupingNode)).toBe(false);
      expect(HierarchyNode.isClassGroupingNode(propertyValueGroupingNode)).toBe(false);
      expect(HierarchyNode.isClassGroupingNode(propertyValueRangeGroupingNode)).toBe(false);
    });
  });

  describe("isLabelGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isLabelGroupingNode(genericNode)).toBe(false);
      expect(HierarchyNode.isLabelGroupingNode(instancesNode)).toBe(false);
      expect(HierarchyNode.isLabelGroupingNode(classGroupingNode)).toBe(false);
      expect(HierarchyNode.isLabelGroupingNode(labelGroupingNode)).toBe(true);
      expect(HierarchyNode.isLabelGroupingNode(propertyOtherValuesGroupingNode)).toBe(false);
      expect(HierarchyNode.isLabelGroupingNode(propertyValueGroupingNode)).toBe(false);
      expect(HierarchyNode.isLabelGroupingNode(propertyValueRangeGroupingNode)).toBe(false);
    });
  });

  describe("isPropertyOtherValuesGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isPropertyOtherValuesGroupingNode(genericNode)).toBe(false);
      expect(HierarchyNode.isPropertyOtherValuesGroupingNode(instancesNode)).toBe(false);
      expect(HierarchyNode.isPropertyOtherValuesGroupingNode(classGroupingNode)).toBe(false);
      expect(HierarchyNode.isPropertyOtherValuesGroupingNode(labelGroupingNode)).toBe(false);
      expect(HierarchyNode.isPropertyOtherValuesGroupingNode(propertyOtherValuesGroupingNode)).toBe(true);
      expect(HierarchyNode.isPropertyOtherValuesGroupingNode(propertyValueGroupingNode)).toBe(false);
      expect(HierarchyNode.isPropertyOtherValuesGroupingNode(propertyValueRangeGroupingNode)).toBe(false);
    });
  });

  describe("isPropertyValueGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isPropertyValueGroupingNode(genericNode)).toBe(false);
      expect(HierarchyNode.isPropertyValueGroupingNode(instancesNode)).toBe(false);
      expect(HierarchyNode.isPropertyValueGroupingNode(classGroupingNode)).toBe(false);
      expect(HierarchyNode.isPropertyValueGroupingNode(labelGroupingNode)).toBe(false);
      expect(HierarchyNode.isPropertyValueGroupingNode(propertyOtherValuesGroupingNode)).toBe(false);
      expect(HierarchyNode.isPropertyValueGroupingNode(propertyValueGroupingNode)).toBe(true);
      expect(HierarchyNode.isPropertyValueGroupingNode(propertyValueRangeGroupingNode)).toBe(false);
    });
  });

  describe("isPropertyValueRangeGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isPropertyValueRangeGroupingNode(genericNode)).toBe(false);
      expect(HierarchyNode.isPropertyValueRangeGroupingNode(instancesNode)).toBe(false);
      expect(HierarchyNode.isPropertyValueRangeGroupingNode(classGroupingNode)).toBe(false);
      expect(HierarchyNode.isPropertyValueRangeGroupingNode(labelGroupingNode)).toBe(false);
      expect(HierarchyNode.isPropertyValueRangeGroupingNode(propertyOtherValuesGroupingNode)).toBe(false);
      expect(HierarchyNode.isPropertyValueRangeGroupingNode(propertyValueGroupingNode)).toBe(false);
      expect(HierarchyNode.isPropertyValueRangeGroupingNode(propertyValueRangeGroupingNode)).toBe(true);
    });
  });

  describe("isPropertyGroupingNode", () => {
    it("returns correct result for different types of nodes", () => {
      expect(HierarchyNode.isPropertyGroupingNode(genericNode)).toBe(false);
      expect(HierarchyNode.isPropertyGroupingNode(instancesNode)).toBe(false);
      expect(HierarchyNode.isPropertyGroupingNode(classGroupingNode)).toBe(false);
      expect(HierarchyNode.isPropertyGroupingNode(labelGroupingNode)).toBe(false);
      expect(HierarchyNode.isPropertyGroupingNode(propertyOtherValuesGroupingNode)).toBe(true);
      expect(HierarchyNode.isPropertyGroupingNode(propertyValueGroupingNode)).toBe(true);
      expect(HierarchyNode.isPropertyGroupingNode(propertyValueRangeGroupingNode)).toBe(true);
    });
  });
});
