/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { HierarchyNodeKey, PropertyValueGroupingNodeKey, PropertyValueRangeGroupingNodeKey } from "../hierarchies/HierarchyNodeKey";
import { createTestGenericNodeKey } from "./Utils";

describe("HierarchyNodeKey", () => {
  describe("equals", () => {
    it("returns false if key types are different", () => {
      expect(HierarchyNodeKey.equals(createTestGenericNodeKey({ id: "x" }), { type: "instances", instanceKeys: [] })).to.be.false;
    });

    it("returns correct results for generic node keys", () => {
      expect(HierarchyNodeKey.equals(createTestGenericNodeKey({ id: "x" }), createTestGenericNodeKey({ id: "x" }))).to.be.true;
      expect(HierarchyNodeKey.equals(createTestGenericNodeKey({ id: "x", source: undefined }), createTestGenericNodeKey({ id: "x", source: undefined }))).to.be
        .true;
      expect(HierarchyNodeKey.equals(createTestGenericNodeKey({ id: "x", source: "s" }), createTestGenericNodeKey({ id: "x", source: "s" }))).to.be.true;
      expect(HierarchyNodeKey.equals(createTestGenericNodeKey({ id: "x" }), createTestGenericNodeKey({ id: "y" }))).to.be.false;
      expect(HierarchyNodeKey.equals(createTestGenericNodeKey({ id: "x", source: "s1" }), createTestGenericNodeKey({ id: "x", source: "s2" }))).to.be.false;
      expect(HierarchyNodeKey.equals(createTestGenericNodeKey({ id: "x", source: "s" }), createTestGenericNodeKey({ id: "x", source: undefined }))).to.be.false;
      expect(HierarchyNodeKey.equals(createTestGenericNodeKey({ id: "x", source: undefined }), createTestGenericNodeKey({ id: "x", source: "s" }))).to.be.false;
    });

    it("returns false for standard nodes if types are different", () => {
      expect(HierarchyNodeKey.equals({ type: "class-grouping", className: "x" }, { type: "instances", instanceKeys: [] })).to.be.false;
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
      expect(HierarchyNodeKey.equals({ type: "class-grouping", className: "x" }, { type: "class-grouping", className: "x" })).to.be.true;
      expect(HierarchyNodeKey.equals({ type: "class-grouping", className: "x" }, { type: "class-grouping", className: "y" })).to.be.false;
    });

    it("returns correct results for label grouping node keys", () => {
      expect(HierarchyNodeKey.equals({ type: "label-grouping", label: "a" }, { type: "label-grouping", label: "a" })).to.be.true;
      expect(HierarchyNodeKey.equals({ type: "label-grouping", label: "a" }, { type: "label-grouping", label: "b" })).to.be.false;
      expect(HierarchyNodeKey.equals({ type: "label-grouping", label: "a", groupId: "b" }, { type: "label-grouping", label: "a", groupId: "b" })).to.be.true;
      expect(HierarchyNodeKey.equals({ type: "label-grouping", label: "a", groupId: "b" }, { type: "label-grouping", label: "a", groupId: "c" })).to.be.false;
    });

    it("returns correct results for property other values grouping node keys", () => {
      expect(
        HierarchyNodeKey.equals(
          { type: "property-grouping:other", properties: [{ className: "x", propertyName: "y" }] },
          { type: "property-grouping:other", properties: [{ className: "x", propertyName: "y" }] },
        ),
      ).to.be.true;
      expect(
        HierarchyNodeKey.equals(
          { type: "property-grouping:other", properties: [] },
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
        createTestGenericNodeKey({ id: "x" }),
        { type: "instances", instanceKeys: [{ className: "a.b", id: "0x1", imodelKey: "test-imodel" }] },
        { type: "class-grouping", className: "x" },
        { type: "label-grouping", label: "a" },
        { type: "property-grouping:other", properties: [] },
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
      it("returns correct results for generic node keys", () => {
        expect(HierarchyNodeKey.compare(createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "a" }))).to.be.eq(0);
        expect(HierarchyNodeKey.compare(createTestGenericNodeKey({ id: "a", source: "s" }), createTestGenericNodeKey({ id: "a", source: "s" }))).to.be.eq(0);

        expect(HierarchyNodeKey.compare(createTestGenericNodeKey({ id: "a" }), createTestGenericNodeKey({ id: "b" }))).to.be.eq(-1);
        expect(HierarchyNodeKey.compare(createTestGenericNodeKey({ id: "a", source: undefined }), createTestGenericNodeKey({ id: "a", source: "s" }))).to.be.eq(
          -1,
        );
        expect(HierarchyNodeKey.compare(createTestGenericNodeKey({ id: "a", source: "s1" }), createTestGenericNodeKey({ id: "a", source: "s2" }))).to.be.eq(-1);

        expect(HierarchyNodeKey.compare(createTestGenericNodeKey({ id: "b" }), createTestGenericNodeKey({ id: "a" }))).to.be.eq(1);
        expect(HierarchyNodeKey.compare(createTestGenericNodeKey({ id: "a", source: "s" }), createTestGenericNodeKey({ id: "a", source: undefined }))).to.be.eq(
          1,
        );
        expect(HierarchyNodeKey.compare(createTestGenericNodeKey({ id: "a", source: "s2" }), createTestGenericNodeKey({ id: "a", source: "s1" }))).to.be.eq(1);
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
        expect(
          HierarchyNodeKey.compare(
            { type: "instances", instanceKeys: [{ className: "a", id: "0" }] },
            { type: "instances", instanceKeys: [{ className: "a", id: "0", imodelKey: "y" }] },
          ),
        ).to.be.eq(-1);
        expect(
          HierarchyNodeKey.compare(
            { type: "instances", instanceKeys: [{ className: "a", id: "0", imodelKey: "x" }] },
            { type: "instances", instanceKeys: [{ className: "a", id: "0", imodelKey: "y" }] },
          ),
        ).to.be.eq(-1);
        expect(
          HierarchyNodeKey.compare(
            { type: "instances", instanceKeys: [{ className: "a", id: "1", imodelKey: "y" }] },
            { type: "instances", instanceKeys: [{ className: "a", id: "0" }] },
          ),
        ).to.be.eq(1);
        expect(
          HierarchyNodeKey.compare(
            { type: "instances", instanceKeys: [{ className: "a", id: "1", imodelKey: "y" }] },
            { type: "instances", instanceKeys: [{ className: "a", id: "0", imodelKey: "x" }] },
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
        expect(HierarchyNodeKey.compare({ type: "class-grouping", className: "a" }, { type: "class-grouping", className: "a" })).to.be.eq(0);
        expect(HierarchyNodeKey.compare({ type: "class-grouping", className: "a" }, { type: "class-grouping", className: "b" })).to.be.eq(-1);
        expect(HierarchyNodeKey.compare({ type: "class-grouping", className: "b" }, { type: "class-grouping", className: "a" })).to.be.eq(1);
      });

      it("returns correct results for property other values grouping node keys", () => {
        expect(HierarchyNodeKey.compare({ type: "property-grouping:other", properties: [] }, { type: "property-grouping:other", properties: [] })).to.be.eq(0);
        expect(
          HierarchyNodeKey.compare(
            { type: "property-grouping:other", properties: [{ className: "a", propertyName: "a" }] },
            { type: "property-grouping:other", properties: [{ className: "b", propertyName: "b" }] },
          ),
        ).to.be.eq(-1);
        expect(
          HierarchyNodeKey.compare(
            { type: "property-grouping:other", properties: [{ className: "x", propertyName: "a" }] },
            { type: "property-grouping:other", properties: [{ className: "x", propertyName: "b" }] },
          ),
        ).to.be.eq(-1);
        expect(
          HierarchyNodeKey.compare(
            { type: "property-grouping:other", properties: [{ className: "a", propertyName: "a" }] },
            {
              type: "property-grouping:other",
              properties: [
                { className: "a", propertyName: "a" },
                { className: "b", propertyName: "b" },
              ],
            },
          ),
        ).to.be.eq(-1);
        expect(
          HierarchyNodeKey.compare(
            { type: "property-grouping:other", properties: [{ className: "b", propertyName: "b" }] },
            { type: "property-grouping:other", properties: [{ className: "a", propertyName: "a" }] },
          ),
        ).to.be.eq(1);
        expect(
          HierarchyNodeKey.compare(
            {
              type: "property-grouping:other",
              properties: [
                { className: "a", propertyName: "a" },
                { className: "b", propertyName: "b" },
              ],
            },
            { type: "property-grouping:other", properties: [{ className: "a", propertyName: "a" }] },
          ),
        ).to.be.eq(1);
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
