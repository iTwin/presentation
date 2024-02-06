/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { Id64 } from "@itwin/core-bentley";
import {
  GenericInstanceFilter,
  GenericInstanceFilterRule,
  GenericInstanceFilterRuleGroup,
  PropertyFilterRuleBinaryOperator,
  PropertyFilterRuleOperator,
  PropertyFilterRuleUnaryOperator,
  PropertyFilterValue,
} from "../hierarchy-builder/GenericInstanceFilter";
import { InstanceKey, Point2d } from "../hierarchy-builder/values/Values";

describe("GenericInstanceFilter", () => {
  describe("isFilterRuleGroup", () => {
    it("returns correct result", () => {
      const rule: GenericInstanceFilterRule = {
        propertyName: "x",
        operator: "Equal",
        value: 1.23,
      };
      const group: GenericInstanceFilterRuleGroup = {
        operator: "And",
        rules: [],
      };
      expect(GenericInstanceFilter.isFilterRuleGroup(rule)).to.be.false;
      expect(GenericInstanceFilter.isFilterRuleGroup(group)).to.be.true;
    });
  });
});

describe("PropertyFilterValue", () => {
  const instanceKey: InstanceKey = {
    className: "x",
    id: Id64.invalid,
  };
  const primitiveValue = 1.23;
  const pointValue: Point2d = { x: 1.23, y: 4.56 };
  const dateValue = new Date();

  describe("isInstanceKey", () => {
    it("returns correct result", () => {
      expect(PropertyFilterValue.isInstanceKey(instanceKey)).to.be.true;
      expect(PropertyFilterValue.isInstanceKey(primitiveValue)).to.be.false;
      expect(PropertyFilterValue.isInstanceKey(pointValue)).to.be.false;
      expect(PropertyFilterValue.isInstanceKey(dateValue)).to.be.false;
    });
  });

  describe("isPrimitive", () => {
    it("returns correct result", () => {
      expect(PropertyFilterValue.isPrimitive(instanceKey)).to.be.false;
      expect(PropertyFilterValue.isPrimitive(primitiveValue)).to.be.true;
      expect(PropertyFilterValue.isPrimitive(pointValue)).to.be.true;
      expect(PropertyFilterValue.isPrimitive(dateValue)).to.be.true;
    });
  });
});

describe("PropertyFilterRuleOperator", () => {
  const unaryOperators: PropertyFilterRuleUnaryOperator[] = ["False", "NotNull", "Null", "True"];
  const binaryOperators: PropertyFilterRuleBinaryOperator[] = ["Equal", "Greater", "GreaterOrEqual", "Less", "LessOrEqual", "Like", "NotEqual"];

  describe("isUnary", () => {
    it("returns correct result", () => {
      unaryOperators.forEach((op) => expect(PropertyFilterRuleOperator.isUnary(op)).to.be.true);
      binaryOperators.forEach((op) => expect(PropertyFilterRuleOperator.isUnary(op)).to.be.false);
    });
  });

  describe("isBinary", () => {
    it("returns correct result", () => {
      unaryOperators.forEach((op) => expect(PropertyFilterRuleOperator.isBinary(op)).to.be.false);
      binaryOperators.forEach((op) => expect(PropertyFilterRuleOperator.isBinary(op)).to.be.true);
    });
  });
});
