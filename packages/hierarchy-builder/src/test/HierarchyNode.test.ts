/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import {
  GroupingHierarchyNode,
  HierarchyNode,
  HierarchyNodeIdentifier,
  HierarchyNodeKey,
  PropertyValueGroupingNodeKey,
  PropertyValueRangeGroupingNodeKey,
} from "../hierarchy-builder/HierarchyNode";
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
      expect(HierarchyNodeKey.equals({ type: "label-grouping", label: "a", groupId: "b" }, { type: "label-grouping", label: "a", groupId: "b" })).to.be.true;
      expect(HierarchyNodeKey.equals({ type: "label-grouping", label: "a", groupId: "b" }, { type: "label-grouping", label: "a", groupId: "c" })).to.be.false;
    });

    it("returns correct results for property other values grouping node keys", () => {
      expect(HierarchyNodeKey.equals({ type: "property-grouping:other" }, { type: "property-grouping:other" })).to.be.true;
      expect(
        HierarchyNodeKey.equals(
          { type: "property-grouping:other" },
          { type: "property-grouping:value", propertyClassName: "", propertyName: "", formattedPropertyValue: "" },
        ),
      ).to.be.false;
    });

    it("returns correct results for property value grouping node keys", () => {
      const baseValue: Omit<PropertyValueGroupingNodeKey, "groupedInstanceKeys"> = {
        type: "property-grouping:value",
        propertyClassName: "Schema.ClassName",
        propertyName: "property name",
        formattedPropertyValue: "value",
      };
      expect(HierarchyNodeKey.equals(baseValue, baseValue)).to.be.true;
      expect(
        HierarchyNodeKey.equals(baseValue, {
          ...baseValue,
          formattedPropertyValue: "value2",
        }),
      ).to.be.false;
      expect(
        HierarchyNodeKey.equals(baseValue, {
          ...baseValue,
          propertyName: "other name",
        }),
      ).to.be.false;
      expect(
        HierarchyNodeKey.equals(baseValue, {
          ...baseValue,
          propertyClassName: "Schema.Other",
        }),
      ).to.be.false;
    });

    it("returns correct results for property value range grouping node keys", () => {
      const baseValueRange: Omit<PropertyValueRangeGroupingNodeKey, "groupedInstanceKeys"> = {
        type: "property-grouping:range",
        propertyClassName: "Schema.ClassName",
        propertyName: "property name",
        fromValue: 1,
        toValue: 2,
      };
      expect(HierarchyNodeKey.equals(baseValueRange, baseValueRange)).to.be.true;
      expect(
        HierarchyNodeKey.equals(baseValueRange, {
          ...baseValueRange,
          toValue: 3,
        }),
      ).to.be.false;
      expect(
        HierarchyNodeKey.equals(baseValueRange, {
          ...baseValueRange,
          fromValue: 2,
        }),
      ).to.be.false;
      expect(HierarchyNodeKey.equals(baseValueRange, { ...baseValueRange, propertyName: "other name" })).to.be.false;
      expect(HierarchyNodeKey.equals(baseValueRange, { ...baseValueRange, propertyClassName: "Schema.Other" })).to.be.false;
    });
  });

  describe("compare", () => {
    describe("key types are different", () => {
      const hierarchyNodeKeyVariants: HierarchyNodeKey[] = [
        "x",
        { type: "instances", instanceKeys: [] },
        { type: "class-grouping", class: { name: "x" } },
        { type: "label-grouping", label: "a" },
        { type: "property-grouping:other" },
        {
          type: "property-grouping:value",
          propertyClassName: "",
          propertyName: "",
          formattedPropertyValue: "",
        },
        {
          type: "property-grouping:range",
          propertyClassName: "",
          propertyName: "",
          fromValue: 1,
          toValue: 2,
        },
      ];

      it("returns correct results for all possible hierarchy node key pairs", () => {
        hierarchyNodeKeyVariants.forEach((lhs, lhsIndex) => {
          hierarchyNodeKeyVariants.forEach((rhs, rhsIndex) => {
            const lhsToRhs = HierarchyNodeKey.compare(lhs, rhs);
            const rhsToLhs = HierarchyNodeKey.compare(rhs, lhs);
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

    describe("key types are the same", () => {
      it("returns correct results for custom node keys", () => {
        expect(HierarchyNodeKey.compare("a", "a")).to.be.eq(0);
        expect(HierarchyNodeKey.compare("a", "b")).to.be.eq(-1);
        expect(HierarchyNodeKey.compare("b", "a")).to.be.eq(1);
      });

      it("returns correct results for instance node keys", () => {
        expect(HierarchyNodeKey.compare({ type: "instances", instanceKeys: [] }, { type: "instances", instanceKeys: [] })).to.be.eq(0);
        expect(
          HierarchyNodeKey.compare(
            { type: "instances", instanceKeys: [{ className: "a", id: "0" }] },
            { type: "instances", instanceKeys: [{ className: "a", id: "0" }] },
          ),
        ).to.be.eq(0);
        expect(HierarchyNodeKey.compare({ type: "instances", instanceKeys: [] }, { type: "instances", instanceKeys: [{ className: "a", id: "0" }] })).to.be.eq(
          -1,
        );
        expect(HierarchyNodeKey.compare({ type: "instances", instanceKeys: [{ className: "a", id: "0" }] }, { type: "instances", instanceKeys: [] })).to.be.eq(
          1,
        );
        expect(
          HierarchyNodeKey.compare(
            { type: "instances", instanceKeys: [{ className: "a", id: "0" }] },
            { type: "instances", instanceKeys: [{ className: "b", id: "0" }] },
          ),
        ).to.be.eq(-1);
        expect(
          HierarchyNodeKey.compare(
            { type: "instances", instanceKeys: [{ className: "b", id: "0" }] },
            { type: "instances", instanceKeys: [{ className: "a", id: "0" }] },
          ),
        ).to.be.eq(1);
        expect(
          HierarchyNodeKey.compare(
            { type: "instances", instanceKeys: [{ className: "a", id: "0" }] },
            { type: "instances", instanceKeys: [{ className: "a", id: "1" }] },
          ),
        ).to.be.eq(-1);
        expect(
          HierarchyNodeKey.compare(
            { type: "instances", instanceKeys: [{ className: "a", id: "1" }] },
            { type: "instances", instanceKeys: [{ className: "a", id: "0" }] },
          ),
        ).to.be.eq(1);
      });

      it("returns correct results for label grouping node keys", () => {
        expect(HierarchyNodeKey.compare({ type: "label-grouping", label: "a" }, { type: "label-grouping", label: "a" })).to.be.eq(0);
        expect(HierarchyNodeKey.compare({ type: "label-grouping", label: "a", groupId: "a" }, { type: "label-grouping", label: "a", groupId: "a" })).to.be.eq(
          0,
        );
        expect(HierarchyNodeKey.compare({ type: "label-grouping", label: "a" }, { type: "label-grouping", label: "b" })).to.be.eq(-1);
        expect(HierarchyNodeKey.compare({ type: "label-grouping", label: "b" }, { type: "label-grouping", label: "a" })).to.be.eq(1);
        expect(HierarchyNodeKey.compare({ type: "label-grouping", label: "a" }, { type: "label-grouping", label: "a", groupId: "a" })).to.be.eq(-1);
        expect(HierarchyNodeKey.compare({ type: "label-grouping", label: "a", groupId: "a" }, { type: "label-grouping", label: "a" })).to.be.eq(1);
        expect(HierarchyNodeKey.compare({ type: "label-grouping", label: "a", groupId: "a" }, { type: "label-grouping", label: "a", groupId: "b" })).to.be.eq(
          -1,
        );
        expect(HierarchyNodeKey.compare({ type: "label-grouping", label: "a", groupId: "b" }, { type: "label-grouping", label: "a", groupId: "a" })).to.be.eq(
          1,
        );
      });

      it("returns correct results for class grouping node keys", () => {
        expect(HierarchyNodeKey.compare({ type: "class-grouping", class: { name: "a" } }, { type: "class-grouping", class: { name: "a" } })).to.be.eq(0);
        expect(HierarchyNodeKey.compare({ type: "class-grouping", class: { name: "a" } }, { type: "class-grouping", class: { name: "b" } })).to.be.eq(-1);
        expect(HierarchyNodeKey.compare({ type: "class-grouping", class: { name: "b" } }, { type: "class-grouping", class: { name: "a" } })).to.be.eq(1);
      });

      it("returns correct results for property other values grouping node keys", () => {
        expect(HierarchyNodeKey.compare({ type: "property-grouping:other" }, { type: "property-grouping:other" })).to.be.eq(0);
      });

      it("returns correct results for property value grouping node keys", () => {
        const baseValue: Omit<PropertyValueGroupingNodeKey, "groupedInstanceKeys"> = {
          type: "property-grouping:value",
          propertyClassName: "Schema.ClassName",
          propertyName: "property name",
          formattedPropertyValue: "value",
        };
        expect(HierarchyNodeKey.compare(baseValue, baseValue)).to.be.eq(0);
        expect(
          HierarchyNodeKey.compare(baseValue, {
            ...baseValue,
            formattedPropertyValue: "value2",
          }),
        ).to.be.eq(-1);
        expect(
          HierarchyNodeKey.compare(
            {
              ...baseValue,
              formattedPropertyValue: "value2",
            },
            baseValue,
          ),
        ).to.be.eq(1);
        expect(
          HierarchyNodeKey.compare(baseValue, {
            ...baseValue,
            propertyName: "property name2",
          }),
        ).to.be.eq(-1);
        expect(
          HierarchyNodeKey.compare(
            {
              ...baseValue,
              propertyName: "property name2",
            },
            baseValue,
          ),
        ).to.be.eq(1);
        expect(
          HierarchyNodeKey.compare(baseValue, {
            ...baseValue,
            propertyClassName: "Schema.ClassName2",
          }),
        ).to.be.eq(-1);
        expect(
          HierarchyNodeKey.compare(
            {
              ...baseValue,
              propertyClassName: "Schema.ClassName2",
            },
            baseValue,
          ),
        ).to.be.eq(1);
      });

      it("returns correct results for property value range grouping node keys", () => {
        const baseValueRange: Omit<PropertyValueRangeGroupingNodeKey, "groupedInstanceKeys"> = {
          type: "property-grouping:range",
          propertyClassName: "Schema.ClassName",
          propertyName: "property name",
          fromValue: 1,
          toValue: 2,
        };
        expect(HierarchyNodeKey.compare(baseValueRange, baseValueRange)).to.be.eq(0);
        expect(
          HierarchyNodeKey.compare(baseValueRange, {
            ...baseValueRange,
            toValue: 3,
          }),
        ).to.be.eq(-1);
        expect(
          HierarchyNodeKey.compare(
            {
              ...baseValueRange,
              toValue: 3,
            },
            baseValueRange,
          ),
        ).to.be.eq(1);
        expect(
          HierarchyNodeKey.compare(baseValueRange, {
            ...baseValueRange,
            fromValue: 2,
          }),
        ).to.be.eq(-1);
        expect(
          HierarchyNodeKey.compare(
            {
              ...baseValueRange,
              fromValue: 2,
            },
            baseValueRange,
          ),
        ).to.be.eq(1);
        expect(HierarchyNodeKey.compare(baseValueRange, { ...baseValueRange, propertyName: "property name2" })).to.be.eq(-1);
        expect(HierarchyNodeKey.compare({ ...baseValueRange, propertyName: "property name2" }, baseValueRange)).to.be.eq(1);
        expect(HierarchyNodeKey.compare(baseValueRange, { ...baseValueRange, propertyClassName: "Schema.ClassName2" })).to.be.eq(-1);
        expect(HierarchyNodeKey.compare({ ...baseValueRange, propertyClassName: "Schema.ClassName2" }, baseValueRange)).to.be.eq(1);
      });
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
  const classGroupingNode: GroupingHierarchyNode = {
    key: { type: "class-grouping", class: { label: "c", name: "c" } },
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
    key: { type: "property-grouping:other" },
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
