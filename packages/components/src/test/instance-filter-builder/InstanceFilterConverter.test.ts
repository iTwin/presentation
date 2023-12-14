/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import * as moq from "typemoq";
import { PropertyValue, PropertyValueFormat, StandardTypeNames } from "@itwin/appui-abstract";
import { PropertyFilterRuleGroupOperator, PropertyFilterRuleOperator } from "@itwin/components-react";
import { BeEvent } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { ClassInfo, RelationshipPath, PropertyValueFormat as TypeValueFormat, Value } from "@itwin/presentation-common";
import { ECClassInfo, getIModelMetadataProvider } from "../../presentation-components/instance-filter-builder/ECMetadataProvider";
import {
  PresentationInstanceFilter,
  PresentationInstanceFilterCondition,
  PresentationInstanceFilterConditionGroup,
} from "../../presentation-components/instance-filter-builder/PresentationFilterBuilder";
import { createTestECClassInfo, createTestPropertyInfo } from "../_helpers/Common";
import { createTestNestedContentField, createTestPropertiesContentField } from "../_helpers/Content";

describe("PresentationInstanceFilter.toInstanceFilterDefinition", () => {
  describe("converts single condition with", () => {
    const testImodel = {} as IModelConnection;
    const property = createTestPropertyInfo();
    const field = createTestPropertiesContentField({ properties: [{ property }] });
    const value: PropertyValue = { valueFormat: PropertyValueFormat.Primitive, value: 1 };
    const propertyAccessor = `this.${property.name}`;

    describe("operator", () => {
      it("'IsNull'", async () => {
        const filter: PresentationInstanceFilterCondition = {
          field,
          operator: PropertyFilterRuleOperator.IsNull,
        };
        const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} = NULL`);
      });

      it("'IsNotNull'", async () => {
        const filter: PresentationInstanceFilterCondition = {
          field,
          operator: PropertyFilterRuleOperator.IsNotNull,
        };
        const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} <> NULL`);
      });

      it("'IsTrue'", async () => {
        const filter: PresentationInstanceFilterCondition = {
          field,
          operator: PropertyFilterRuleOperator.IsTrue,
        };
        const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} = TRUE`);
      });

      it("'IsFalse'", async () => {
        const filter: PresentationInstanceFilterCondition = {
          field,
          operator: PropertyFilterRuleOperator.IsFalse,
        };
        const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} = FALSE`);
      });

      it("'='", async () => {
        const filter: PresentationInstanceFilterCondition = {
          field,
          operator: PropertyFilterRuleOperator.IsEqual,
          value,
        };
        const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} = 1`);
      });

      it("'!='", async () => {
        const filter: PresentationInstanceFilterCondition = {
          field,
          operator: PropertyFilterRuleOperator.IsNotEqual,
          value,
        };
        const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} <> 1`);
      });

      it("'>'", async () => {
        const filter: PresentationInstanceFilterCondition = {
          field,
          operator: PropertyFilterRuleOperator.Greater,
          value,
        };
        const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} > 1`);
      });

      it("'>='", async () => {
        const filter: PresentationInstanceFilterCondition = {
          field,
          operator: PropertyFilterRuleOperator.GreaterOrEqual,
          value,
        };
        const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} >= 1`);
      });

      it("'<'", async () => {
        const filter: PresentationInstanceFilterCondition = {
          field,
          operator: PropertyFilterRuleOperator.Less,
          value,
        };
        const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} < 1`);
      });

      it("'<='", async () => {
        const filter: PresentationInstanceFilterCondition = {
          field,
          operator: PropertyFilterRuleOperator.LessOrEqual,
          value,
        };
        const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} <= 1`);
      });

      it("'Like'", async () => {
        const filter: PresentationInstanceFilterCondition = {
          field,
          operator: PropertyFilterRuleOperator.Like,
          value: { valueFormat: PropertyValueFormat.Primitive, value: `someString`, displayValue: "someString" },
        };
        const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} ~ "%someString%"`);
      });
    });

    it("quoted string value", async () => {
      const filter: PresentationInstanceFilterCondition = {
        field,
        operator: PropertyFilterRuleOperator.IsEqual,
        value: { ...value, value: `string "with" quotation marks` },
      };
      const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
      expect(expression).to.be.eq(`${propertyAccessor} = "string ""with"" quotation marks"`);
    });

    it("instance key value", async () => {
      const propertyInfo = createTestPropertyInfo({ type: "long" });
      const filter: PresentationInstanceFilterCondition = {
        field: createTestPropertiesContentField({
          properties: [{ property: propertyInfo }],
          type: { valueFormat: TypeValueFormat.Primitive, typeName: "navigation" },
        }),
        operator: PropertyFilterRuleOperator.IsEqual,
        value: { ...value, value: { className: "TestSchema:TestClass", id: "0x1" } },
      };
      const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
      expect(expression).to.be.eq(`${propertyAccessor}.Id = 0x1`);
    });

    it("double value", async () => {
      const propertyInfo = createTestPropertyInfo({ type: "double" });
      const filter: PresentationInstanceFilterCondition = {
        field: createTestPropertiesContentField({
          properties: [{ property: propertyInfo }],
          type: { valueFormat: TypeValueFormat.Primitive, typeName: "double" },
        }),
        operator: PropertyFilterRuleOperator.IsEqual,
        value: { ...value, value: 1.5 },
      };
      const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
      expect(expression).to.be.eq(`CompareDoubles(${propertyAccessor}, 1.5) = 0`);
    });

    it("dateTime value", async () => {
      const propertyInfo = createTestPropertyInfo({ type: "dateTime" });
      const filter: PresentationInstanceFilterCondition = {
        field: createTestPropertiesContentField({
          properties: [{ property: propertyInfo }],
          type: { valueFormat: TypeValueFormat.Primitive, typeName: "dateTime" },
        }),
        operator: PropertyFilterRuleOperator.IsEqual,
        value: { ...value, value: "2021-10-12T08:45:41" },
      };
      const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
      expect(expression).to.be.eq(`CompareDateTimes(${propertyAccessor}, "2021-10-12T08:45:41") = 0`);
    });

    it("point2d value", async () => {
      const propertyInfo = createTestPropertyInfo({ type: StandardTypeNames.Point2d });
      const filter: PresentationInstanceFilterCondition = {
        field: createTestPropertiesContentField({
          properties: [{ property: propertyInfo }],
          type: { valueFormat: TypeValueFormat.Primitive, typeName: StandardTypeNames.Point2d },
        }),
        operator: PropertyFilterRuleOperator.IsEqual,
        value: { ...value, value: { x: 10, y: 20 } },
      };
      const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
      expect(expression).to.be.eq(`(CompareDoubles(${propertyAccessor}.x, 10) = 0) AND (CompareDoubles(${propertyAccessor}.y, 20) = 0)`);
    });

    it("point3d value", async () => {
      const propertyInfo = createTestPropertyInfo({ type: StandardTypeNames.Point3d });
      const filter: PresentationInstanceFilterCondition = {
        field: createTestPropertiesContentField({
          properties: [{ property: propertyInfo }],
          type: { valueFormat: TypeValueFormat.Primitive, typeName: StandardTypeNames.Point3d },
        }),
        operator: PropertyFilterRuleOperator.IsEqual,
        value: { ...value, value: { x: 10, y: 20, z: 5 } },
      };
      const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
      expect(expression).to.be.eq(
        `(CompareDoubles(${propertyAccessor}.x, 10) = 0) AND (CompareDoubles(${propertyAccessor}.y, 20) = 0) AND (CompareDoubles(${propertyAccessor}.z, 5) = 0)`,
      );
    });

    it("point3d value with `IsNotEqual` operator", async () => {
      const propertyInfo = createTestPropertyInfo({ type: StandardTypeNames.Point3d });
      const filter: PresentationInstanceFilterCondition = {
        field: createTestPropertiesContentField({
          properties: [{ property: propertyInfo }],
          type: { valueFormat: TypeValueFormat.Primitive, typeName: StandardTypeNames.Point3d },
        }),
        operator: PropertyFilterRuleOperator.IsNotEqual,
        value: { ...value, value: { x: 10, y: 20, z: 5 } },
      };
      const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
      expect(expression).to.be.eq(
        `(CompareDoubles(${propertyAccessor}.x, 10) <> 0) OR (CompareDoubles(${propertyAccessor}.y, 20) <> 0) OR (CompareDoubles(${propertyAccessor}.z, 5) <> 0)`,
      );
    });
  });

  describe("converts condition group with", () => {
    const testImodel = {} as IModelConnection;
    const property = createTestPropertyInfo();
    const field = createTestPropertiesContentField({ properties: [{ property }] });
    const propertyAccessor = `this.${property.name}`;

    it("'AND' operator", async () => {
      const filter: PresentationInstanceFilterConditionGroup = {
        operator: PropertyFilterRuleGroupOperator.And,
        conditions: [
          {
            field,
            operator: PropertyFilterRuleOperator.IsNull,
          },
          {
            field,
            operator: PropertyFilterRuleOperator.IsNotNull,
          },
        ],
      };
      const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
      expect(expression).to.be.eq(`(${propertyAccessor} = NULL AND ${propertyAccessor} <> NULL)`);
    });

    it("'OR' operator", async () => {
      const filter: PresentationInstanceFilterConditionGroup = {
        operator: PropertyFilterRuleGroupOperator.Or,
        conditions: [
          {
            field,
            operator: PropertyFilterRuleOperator.IsNull,
          },
          {
            field,
            operator: PropertyFilterRuleOperator.IsNotNull,
          },
        ],
      };
      const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
      expect(expression).to.be.eq(`(${propertyAccessor} = NULL OR ${propertyAccessor} <> NULL)`);
    });

    it("nested condition group", async () => {
      const filter: PresentationInstanceFilterConditionGroup = {
        operator: PropertyFilterRuleGroupOperator.Or,
        conditions: [
          {
            field,
            operator: PropertyFilterRuleOperator.IsNull,
          },
          {
            operator: PropertyFilterRuleGroupOperator.And,
            conditions: [
              {
                field,
                operator: PropertyFilterRuleOperator.IsNull,
              },
              {
                field,
                operator: PropertyFilterRuleOperator.IsNotNull,
              },
            ],
          },
        ],
      };
      const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
      expect(expression).to.be.eq(`(${propertyAccessor} = NULL OR (${propertyAccessor} = NULL AND ${propertyAccessor} <> NULL))`);
    });
  });

  describe("handles related properties", () => {
    function createAlias(className: string, index?: number) {
      return `rel_${className}_${index ?? 0}`;
    }

    const testImodel = {} as IModelConnection;
    const classAInfo: ClassInfo = { id: "0x1", name: "TestSchema:A", label: "A Class" };
    const classBInfo: ClassInfo = { id: "0x2", name: "TestSchema:B", label: "B Class" };
    const classCInfo: ClassInfo = { id: "0x3", name: "TestSchema:C", label: "C Class" };
    const classAToBInfo: ClassInfo = { id: "0x4", name: "TestSchema:AToB", label: "A To B" };
    const classBToCInfo: ClassInfo = { id: "0x5", name: "TestSchema:BToC", label: "B TO C" };
    const classAToCInfo: ClassInfo = { id: "0x5", name: "TestSchema:AToC", label: "A TO C" };
    const pathBToA: RelationshipPath = [
      {
        sourceClassInfo: classBInfo,
        targetClassInfo: classAInfo,
        relationshipInfo: classAToBInfo,
        isForwardRelationship: false,
        isPolymorphicRelationship: true,
        isPolymorphicTargetClass: true,
      },
    ];
    const pathCToB: RelationshipPath = [
      {
        sourceClassInfo: classCInfo,
        targetClassInfo: classBInfo,
        relationshipInfo: classBToCInfo,
        isForwardRelationship: false,
        isPolymorphicRelationship: true,
        isPolymorphicTargetClass: true,
      },
    ];
    const pathCToA: RelationshipPath = [
      {
        sourceClassInfo: classCInfo,
        targetClassInfo: classAInfo,
        relationshipInfo: classAToCInfo,
        isForwardRelationship: false,
        isPolymorphicRelationship: true,
        isPolymorphicTargetClass: true,
      },
    ];
    const propertyInfo = createTestPropertyInfo({ classInfo: classCInfo });
    const classC1PropertiesField = createTestPropertiesContentField({ name: "C1", properties: [{ property: propertyInfo }] });
    const classC2PropertiesField = createTestPropertiesContentField({ name: "C2", properties: [{ property: propertyInfo }] });
    const classC1NestedField = createTestNestedContentField({ nestedFields: [classC1PropertiesField], pathToPrimaryClass: pathCToB });
    // field A to B
    createTestNestedContentField({ nestedFields: [classC1NestedField], pathToPrimaryClass: pathBToA });

    // field A to C
    createTestNestedContentField({ nestedFields: [classC2PropertiesField], pathToPrimaryClass: pathCToA });

    it("in single condition", async () => {
      const filter: PresentationInstanceFilterCondition = {
        field: classC1PropertiesField,
        operator: PropertyFilterRuleOperator.IsNull,
      };
      const { expression, relatedInstances } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
      expect(expression).to.be.eq(`${createAlias("C")}.${propertyInfo.name} = NULL`);
      expect(relatedInstances)
        .to.be.lengthOf(1)
        .and.containSubset([
          {
            pathFromSelectToPropertyClass: [
              {
                sourceClassName: classAInfo.name,
                targetClassName: classBInfo.name,
                relationshipName: classAToBInfo.name,
                isForwardRelationship: true,
              },
              {
                sourceClassName: classBInfo.name,
                targetClassName: classCInfo.name,
                relationshipName: classBToCInfo.name,
                isForwardRelationship: true,
              },
            ],
            alias: createAlias("C"),
          },
        ]);
    });

    it("in multiple conditions", async () => {
      const filter: PresentationInstanceFilterConditionGroup = {
        operator: PropertyFilterRuleGroupOperator.And,
        conditions: [
          {
            field: classC1PropertiesField,
            operator: PropertyFilterRuleOperator.IsNull,
          },
          {
            field: classC1PropertiesField,
            operator: PropertyFilterRuleOperator.IsNotNull,
          },
        ],
      };
      const { expression, relatedInstances } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
      expect(expression).to.be.eq(`(${createAlias("C")}.${propertyInfo.name} = NULL AND ${createAlias("C")}.${propertyInfo.name} <> NULL)`);
      expect(relatedInstances)
        .to.be.lengthOf(1)
        .and.containSubset([
          {
            pathFromSelectToPropertyClass: [
              {
                sourceClassName: classAInfo.name,
                targetClassName: classBInfo.name,
                relationshipName: classAToBInfo.name,
                isForwardRelationship: true,
              },
              {
                sourceClassName: classBInfo.name,
                targetClassName: classCInfo.name,
                relationshipName: classBToCInfo.name,
                isForwardRelationship: true,
              },
            ],
            alias: createAlias("C"),
          },
        ]);
    });

    it("in deeply nested condition field", async () => {
      const filter: PresentationInstanceFilterCondition = {
        field: classC1PropertiesField,
        operator: PropertyFilterRuleOperator.IsNull,
      };
      const { expression, relatedInstances } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
      expect(expression).to.be.eq(`${createAlias("C")}.${propertyInfo.name} = NULL`);
      expect(relatedInstances)
        .to.be.lengthOf(1)
        .and.containSubset([
          {
            pathFromSelectToPropertyClass: [
              {
                sourceClassName: classAInfo.name,
                targetClassName: classBInfo.name,
                relationshipName: classAToBInfo.name,
                isForwardRelationship: true,
              },
              {
                sourceClassName: classBInfo.name,
                targetClassName: classCInfo.name,
                relationshipName: classBToCInfo.name,
                isForwardRelationship: true,
              },
            ],
            alias: createAlias("C"),
          },
        ]);
    });

    it("from same class with different paths", async () => {
      const filter: PresentationInstanceFilterConditionGroup = {
        operator: PropertyFilterRuleGroupOperator.And,
        conditions: [
          {
            field: classC1PropertiesField,
            operator: PropertyFilterRuleOperator.IsNull,
          },
          {
            field: classC2PropertiesField,
            operator: PropertyFilterRuleOperator.IsNotNull,
          },
        ],
      };
      const { expression, relatedInstances } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
      expect(expression).to.be.eq(`(${createAlias("C", 0)}.${propertyInfo.name} = NULL AND ${createAlias("C", 1)}.${propertyInfo.name} <> NULL)`);
      expect(relatedInstances)
        .to.be.lengthOf(2)
        .and.containSubset([
          {
            pathFromSelectToPropertyClass: [
              {
                sourceClassName: classAInfo.name,
                targetClassName: classBInfo.name,
                relationshipName: classAToBInfo.name,
                isForwardRelationship: true,
              },
              {
                sourceClassName: classBInfo.name,
                targetClassName: classCInfo.name,
                relationshipName: classBToCInfo.name,
                isForwardRelationship: true,
              },
            ],
            alias: createAlias("C", 0),
          },
          {
            pathFromSelectToPropertyClass: [
              {
                sourceClassName: classAInfo.name,
                targetClassName: classCInfo.name,
                relationshipName: classAToCInfo.name,
                isForwardRelationship: true,
              },
            ],
            alias: createAlias("C", 1),
          },
        ]);
    });
  });

  describe("returns base properties class", () => {
    const onClose = new BeEvent<() => void>();
    const imodelMock = moq.Mock.ofType<IModelConnection>();

    const classAInfo: ClassInfo = { id: "0x1", name: "TestSchema:A", label: "A Class" };
    const classBInfo: ClassInfo = { id: "0x2", name: "TestSchema:B", label: "B Class" };
    const classCInfo: ClassInfo = { id: "0x3", name: "TestSchema:C", label: "C Class" };

    beforeEach(() => {
      imodelMock.setup((x) => x.key).returns(() => "test_imodel");
      imodelMock.setup((x) => x.onClose).returns(() => onClose);

      // stub metadataProvider for test imodel
      const metadataProvider = getIModelMetadataProvider(imodelMock.object);
      sinon.stub(metadataProvider, "getECClassInfo").callsFake(async (id) => {
        switch (id) {
          case classAInfo.id:
            return new ECClassInfo(classAInfo.id, classAInfo.name, classAInfo.label, new Set(), new Set([classBInfo.id, classCInfo.id]));
          case classBInfo.id:
            return new ECClassInfo(classBInfo.id, classBInfo.name, classBInfo.label, new Set([classAInfo.id]), new Set([classCInfo.id]));
          case classCInfo.id:
            return new ECClassInfo(classCInfo.id, classCInfo.name, classCInfo.label, new Set([classAInfo.id, classBInfo.id]), new Set());
        }
        return undefined;
      });
    });

    afterEach(() => {
      sinon.resetBehavior();
      onClose.raiseEvent();
      imodelMock.reset();
    });

    it("when one property is used", async () => {
      const filter: PresentationInstanceFilterCondition = {
        field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classAInfo, name: "PropA" }) }] }),
        operator: PropertyFilterRuleOperator.IsNull,
      };

      const { selectClassName } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, imodelMock.object);
      expect(selectClassName).to.be.eq(classAInfo.name);
    });

    it("when all properties from same class", async () => {
      const filter: PresentationInstanceFilterConditionGroup = {
        operator: PropertyFilterRuleGroupOperator.And,
        conditions: [
          {
            field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classAInfo, name: "PropA1" }) }] }),
            operator: PropertyFilterRuleOperator.IsNull,
          },
          {
            field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classAInfo, name: "PropA2" }) }] }),
            operator: PropertyFilterRuleOperator.IsNull,
          },
        ],
      };

      const { selectClassName } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, imodelMock.object);
      expect(selectClassName).to.be.eq(classAInfo.name);
    });

    it("when second condition property is derived from first condition property", async () => {
      const filter: PresentationInstanceFilterConditionGroup = {
        operator: PropertyFilterRuleGroupOperator.And,
        conditions: [
          {
            field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classAInfo, name: "PropA" }) }] }),
            operator: PropertyFilterRuleOperator.IsNull,
          },
          {
            field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classBInfo, name: "PropB" }) }] }),
            operator: PropertyFilterRuleOperator.IsNull,
          },
        ],
      };

      const { selectClassName } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, imodelMock.object);
      expect(selectClassName).to.be.eq(classBInfo.name);
    });

    it("when first condition property is derived from second condition property", async () => {
      const filter: PresentationInstanceFilterConditionGroup = {
        operator: PropertyFilterRuleGroupOperator.And,
        conditions: [
          {
            field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classBInfo, name: "PropB" }) }] }),
            operator: PropertyFilterRuleOperator.IsNull,
          },
          {
            field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classAInfo, name: "PropA" }) }] }),
            operator: PropertyFilterRuleOperator.IsNull,
          },
        ],
      };

      const { selectClassName } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, imodelMock.object);
      expect(selectClassName).to.be.eq(classBInfo.name);
    });

    it("when properties from different derived classes are used", async () => {
      const filter: PresentationInstanceFilterConditionGroup = {
        operator: PropertyFilterRuleGroupOperator.And,
        conditions: [
          {
            field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classAInfo, name: "PropA" }) }] }),
            operator: PropertyFilterRuleOperator.IsNull,
          },
          {
            field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classCInfo, name: "PropC" }) }] }),
            operator: PropertyFilterRuleOperator.IsNull,
          },
          {
            field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classBInfo, name: "PropB" }) }] }),
            operator: PropertyFilterRuleOperator.IsNull,
          },
        ],
      };

      const { selectClassName } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, imodelMock.object);
      expect(selectClassName).to.be.eq(classCInfo.name);
    });
  });

  describe("handles unique values", () => {
    const testImodel = {} as IModelConnection;
    const property = createTestPropertyInfo();
    const field = createTestPropertiesContentField({ properties: [{ property }] });
    const propertyAccessor = `this.${property.name}`;
    const groupedRawValues = [
      [0.001, 0.00099],
      [0.002, 0.00199],
    ];
    const displayValue = ["0.001", "0.002"];

    const createFilter = (operator: PropertyFilterRuleOperator, customValue?: Value, customDisplayValue?: string): PresentationInstanceFilterCondition => {
      return {
        field,
        operator,
        value: {
          valueFormat: PropertyValueFormat.Primitive,
          value: customValue ?? JSON.stringify(groupedRawValues),
          displayValue: customDisplayValue ?? JSON.stringify(displayValue),
        },
      };
    };

    it("converts values when operator is `IsEqual`", async () => {
      const filter = createFilter(PropertyFilterRuleOperator.IsEqual);

      const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
      expect(expression).to.be.eq(
        `(${propertyAccessor} = ${groupedRawValues[0][0]} OR ${propertyAccessor} = ${groupedRawValues[0][1]} OR ${propertyAccessor} = ${groupedRawValues[1][0]} OR ${propertyAccessor} = ${groupedRawValues[1][1]})`,
      );
    });

    it("converts values when operator is `IsNotEqual`", async () => {
      const filter = createFilter(PropertyFilterRuleOperator.IsNotEqual);

      const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
      expect(expression).to.be.eq(
        `(${propertyAccessor} <> ${groupedRawValues[0][0]} AND ${propertyAccessor} <> ${groupedRawValues[0][1]} AND ${propertyAccessor} <> ${groupedRawValues[1][0]} AND ${propertyAccessor} <> ${groupedRawValues[1][1]})`,
      );
    });

    it("converts values when `deserializeDisplayValueGroupArray` returns `undefined`", async () => {
      const filter = createFilter(PropertyFilterRuleOperator.IsEqual, "a", "a");

      const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);
      expect(expression).to.be.eq(`${propertyAccessor} = "a"`);
    });
  });

  describe("handles passed `filteredClasses`", () => {
    const testImodel = {} as IModelConnection;
    const classInfo1 = createTestECClassInfo({ id: "0x1" });
    const classInfo2 = createTestECClassInfo({ id: "0x2" });

    const filter: PresentationInstanceFilterCondition = {
      field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classInfo1 }) }] }),
      operator: PropertyFilterRuleOperator.IsNull,
    };

    it(`returns expression with no classes in it when filteredClasses is undefined`, async () => {
      const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel);

      expect(expression).to.be.eq("this.PropertyName = NULL");
    });

    it("returns expression with no classes in it when filteredClasses is an empty array", async () => {
      const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel, []);

      expect(expression).to.be.eq("this.PropertyName = NULL");
    });

    it("returns expression appended with additional check for classes when one classInfo is passed in", async () => {
      const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel, [classInfo1]);

      expect(expression).to.be.eq(`this.PropertyName = NULL AND (this.IsOfClass(${classInfo1.id}))`);
    });

    it("returns expression appended with additional check for classes when array of multiple classInfo's is passed in", async () => {
      const { expression } = await PresentationInstanceFilter.toInstanceFilterDefinition(filter, testImodel, [classInfo1, classInfo2]);

      expect(expression).to.be.eq(`this.PropertyName = NULL AND (this.IsOfClass(${classInfo1.id}) OR this.IsOfClass(${classInfo2.id}))`);
    });
  });
});
