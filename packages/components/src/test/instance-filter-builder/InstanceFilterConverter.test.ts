/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { PropertyValue, PropertyValueFormat, StandardTypeNames } from "@itwin/appui-abstract";
import { PropertyFilterRuleGroupOperator, PropertyFilterRuleOperator } from "@itwin/components-react";
import { BeEvent } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { ClassInfo, RelationshipPath, PropertyValueFormat as TypeValueFormat, Value } from "@itwin/presentation-common";
import { createTestECClassInfo, createTestPropertyInfo } from "../_helpers/Common.js";
import { createTestNestedContentField, createTestPropertiesContentField } from "../_helpers/Content.js";
import { serializeUniqueValues, UniqueValue } from "../../presentation-components/common/Utils.js";
import { ECClassInfo, getIModelMetadataProvider } from "../../presentation-components/instance-filter-builder/ECMetadataProvider.js";
import {
  createInstanceFilterDefinition,
  PresentationInstanceFilterInfo,
} from "../../presentation-components/instance-filter-builder/PresentationFilterBuilder.js";
import { PresentationInstanceFilterCondition } from "../../presentation-components/instance-filter-builder/PresentationInstanceFilter.js";

describe("createInstanceFilterDefinition", () => {
  describe("converts single condition with", () => {
    const testImodel = {} as IModelConnection;
    const property = createTestPropertyInfo();
    const field = createTestPropertiesContentField({ properties: [{ property }] });
    const value: PropertyValue = { valueFormat: PropertyValueFormat.Primitive, value: 1 };
    const propertyAccessor = `this.${property.name}`;

    describe("operator", () => {
      it("'IsNull'", async () => {
        const info: PresentationInstanceFilterInfo = {
          filter: {
            field,
            operator: "is-null",
          },
          usedClasses: [],
        };
        const { expression } = await createInstanceFilterDefinition(info, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} = NULL`);
      });

      it("'IsNotNull'", async () => {
        const info: PresentationInstanceFilterInfo = {
          filter: {
            field,
            operator: "is-not-null",
          },
          usedClasses: [],
        };
        const { expression } = await createInstanceFilterDefinition(info, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} <> NULL`);
      });

      it("'IsTrue'", async () => {
        const info: PresentationInstanceFilterInfo = {
          filter: {
            field,
            operator: "is-true",
          },
          usedClasses: [],
        };
        const { expression } = await createInstanceFilterDefinition(info, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} = TRUE`);
      });

      it("'IsFalse'", async () => {
        const info: PresentationInstanceFilterInfo = {
          filter: {
            field,
            operator: "is-false",
          },
          usedClasses: [],
        };
        const { expression } = await createInstanceFilterDefinition(info, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} = FALSE`);
      });

      it("'='", async () => {
        const info: PresentationInstanceFilterInfo = {
          filter: {
            field,
            operator: "is-equal",
            value,
          },
          usedClasses: [],
        };
        const { expression } = await createInstanceFilterDefinition(info, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} = 1`);
      });

      it("'!='", async () => {
        const info: PresentationInstanceFilterInfo = {
          filter: {
            field,
            operator: "is-not-equal",
            value,
          },
          usedClasses: [],
        };
        const { expression } = await createInstanceFilterDefinition(info, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} <> 1`);
      });

      it("'>'", async () => {
        const info: PresentationInstanceFilterInfo = {
          filter: {
            field,
            operator: "greater",
            value,
          },
          usedClasses: [],
        };
        const { expression } = await createInstanceFilterDefinition(info, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} > 1`);
      });

      it("'>='", async () => {
        const info: PresentationInstanceFilterInfo = {
          filter: {
            field,
            operator: "greater-or-equal",
            value,
          },
          usedClasses: [],
        };
        const { expression } = await createInstanceFilterDefinition(info, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} >= 1`);
      });

      it("'<'", async () => {
        const info: PresentationInstanceFilterInfo = {
          filter: {
            field,
            operator: "less",
            value,
          },
          usedClasses: [],
        };
        const { expression } = await createInstanceFilterDefinition(info, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} < 1`);
      });

      it("'<='", async () => {
        const info: PresentationInstanceFilterInfo = {
          filter: {
            field,
            operator: "less-or-equal",
            value,
          },
          usedClasses: [],
        };
        const { expression } = await createInstanceFilterDefinition(info, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} <= 1`);
      });

      it("'Like'", async () => {
        const info: PresentationInstanceFilterInfo = {
          filter: {
            field,
            operator: "like",
            value: { valueFormat: PropertyValueFormat.Primitive, value: `someString`, displayValue: "someString" },
          },
          usedClasses: [],
        };
        const { expression } = await createInstanceFilterDefinition(info, testImodel);
        expect(expression).to.be.eq(`${propertyAccessor} ~ "%someString%"`);
      });
    });

    it("quoted string value", async () => {
      const info: PresentationInstanceFilterInfo = {
        filter: {
          field,
          operator: "is-equal",
          value: { ...value, value: `string "with" quotation marks` },
        },
        usedClasses: [],
      };
      const { expression } = await createInstanceFilterDefinition(info, testImodel);
      expect(expression).to.be.eq(`${propertyAccessor} = "string ""with"" quotation marks"`);
    });

    it("instance key value", async () => {
      const propertyInfo = createTestPropertyInfo({ type: "long" });
      const info: PresentationInstanceFilterInfo = {
        filter: {
          field: createTestPropertiesContentField({
            properties: [{ property: propertyInfo }],
            type: { valueFormat: TypeValueFormat.Primitive, typeName: "navigation" },
          }),
          operator: "is-equal",
          value: { ...value, value: { className: "TestSchema:TestClass", id: "0x1" } },
        },
        usedClasses: [],
      };
      const { expression } = await createInstanceFilterDefinition(info, testImodel);
      expect(expression).to.be.eq(`${propertyAccessor}.Id = 0x1`);
    });

    it("double value", async () => {
      const propertyInfo = createTestPropertyInfo({ type: "double" });
      const info: PresentationInstanceFilterInfo = {
        filter: {
          field: createTestPropertiesContentField({
            properties: [{ property: propertyInfo }],
            type: { valueFormat: TypeValueFormat.Primitive, typeName: "double" },
          }),
          operator: "is-equal",
          value: { ...value, value: 1.5 },
        },
        usedClasses: [],
      };
      const { expression } = await createInstanceFilterDefinition(info, testImodel);
      expect(expression).to.be.eq(`CompareDoubles(${propertyAccessor}, 1.5) = 0`);
    });

    it("dateTime value", async () => {
      const propertyInfo = createTestPropertyInfo({ type: "dateTime" });
      const info: PresentationInstanceFilterInfo = {
        filter: {
          field: createTestPropertiesContentField({
            properties: [{ property: propertyInfo }],
            type: { valueFormat: TypeValueFormat.Primitive, typeName: "dateTime" },
          }),
          operator: "is-equal",
          value: { ...value, value: "2021-10-12T08:45:41" },
        },
        usedClasses: [],
      };
      const { expression } = await createInstanceFilterDefinition(info, testImodel);
      expect(expression).to.be.eq(`CompareDateTimes(${propertyAccessor}, "2021-10-12T08:45:41") = 0`);
    });

    it("point2d value", async () => {
      const propertyInfo = createTestPropertyInfo({ type: StandardTypeNames.Point2d });
      const info: PresentationInstanceFilterInfo = {
        filter: {
          field: createTestPropertiesContentField({
            properties: [{ property: propertyInfo }],
            type: { valueFormat: TypeValueFormat.Primitive, typeName: StandardTypeNames.Point2d },
          }),
          operator: "is-equal",
          value: { ...value, value: { x: 10, y: 20 } },
        },
        usedClasses: [],
      };
      const { expression } = await createInstanceFilterDefinition(info, testImodel);
      expect(expression).to.be.eq(`(CompareDoubles(${propertyAccessor}.x, 10) = 0) AND (CompareDoubles(${propertyAccessor}.y, 20) = 0)`);
    });

    it("point3d value", async () => {
      const propertyInfo = createTestPropertyInfo({ type: StandardTypeNames.Point3d });
      const info: PresentationInstanceFilterInfo = {
        filter: {
          field: createTestPropertiesContentField({
            properties: [{ property: propertyInfo }],
            type: { valueFormat: TypeValueFormat.Primitive, typeName: StandardTypeNames.Point3d },
          }),
          operator: "is-equal",
          value: { ...value, value: { x: 10, y: 20, z: 5 } },
        },
        usedClasses: [],
      };
      const { expression } = await createInstanceFilterDefinition(info, testImodel);
      expect(expression).to.be.eq(
        `(CompareDoubles(${propertyAccessor}.x, 10) = 0) AND (CompareDoubles(${propertyAccessor}.y, 20) = 0) AND (CompareDoubles(${propertyAccessor}.z, 5) = 0)`,
      );
    });

    it("point3d value with `IsNotEqual` operator", async () => {
      const propertyInfo = createTestPropertyInfo({ type: StandardTypeNames.Point3d });
      const info: PresentationInstanceFilterInfo = {
        filter: {
          field: createTestPropertiesContentField({
            properties: [{ property: propertyInfo }],
            type: { valueFormat: TypeValueFormat.Primitive, typeName: StandardTypeNames.Point3d },
          }),
          operator: "is-not-equal",
          value: { ...value, value: { x: 10, y: 20, z: 5 } },
        },
        usedClasses: [],
      };
      const { expression } = await createInstanceFilterDefinition(info, testImodel);
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
      const info: PresentationInstanceFilterInfo = {
        filter: {
          operator: PropertyFilterRuleGroupOperator.And,
          conditions: [
            {
              field,
              operator: "is-null",
            },
            {
              field,
              operator: "is-not-null",
            },
          ],
        },
        usedClasses: [],
      };
      const { expression } = await createInstanceFilterDefinition(info, testImodel);
      expect(expression).to.be.eq(`(${propertyAccessor} = NULL AND ${propertyAccessor} <> NULL)`);
    });

    it("'OR' operator", async () => {
      const info: PresentationInstanceFilterInfo = {
        filter: {
          operator: PropertyFilterRuleGroupOperator.Or,
          conditions: [
            {
              field,
              operator: "is-null",
            },
            {
              field,
              operator: "is-not-null",
            },
          ],
        },
        usedClasses: [],
      };
      const { expression } = await createInstanceFilterDefinition(info, testImodel);
      expect(expression).to.be.eq(`(${propertyAccessor} = NULL OR ${propertyAccessor} <> NULL)`);
    });

    it("nested condition group", async () => {
      const info: PresentationInstanceFilterInfo = {
        filter: {
          operator: PropertyFilterRuleGroupOperator.Or,
          conditions: [
            {
              field,
              operator: "is-null",
            },
            {
              operator: PropertyFilterRuleGroupOperator.And,
              conditions: [
                {
                  field,
                  operator: "is-null",
                },
                {
                  field,
                  operator: "is-not-null",
                },
              ],
            },
          ],
        },
        usedClasses: [],
      };
      const { expression } = await createInstanceFilterDefinition(info, testImodel);
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
      const info: PresentationInstanceFilterInfo = {
        filter: {
          field: classC1PropertiesField,
          operator: "is-null",
        },
        usedClasses: [],
      };
      const { expression, relatedInstances } = await createInstanceFilterDefinition(info, testImodel);
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
      const info: PresentationInstanceFilterInfo = {
        filter: {
          operator: PropertyFilterRuleGroupOperator.And,
          conditions: [
            {
              field: classC1PropertiesField,
              operator: "is-null",
            },
            {
              field: classC1PropertiesField,
              operator: "is-not-null",
            },
          ],
        },
        usedClasses: [],
      };
      const { expression, relatedInstances } = await createInstanceFilterDefinition(info, testImodel);
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
      const info: PresentationInstanceFilterInfo = {
        filter: {
          field: classC1PropertiesField,
          operator: "is-null",
        },
        usedClasses: [],
      };
      const { expression, relatedInstances } = await createInstanceFilterDefinition(info, testImodel);
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
      const info: PresentationInstanceFilterInfo = {
        filter: {
          operator: PropertyFilterRuleGroupOperator.And,
          conditions: [
            {
              field: classC1PropertiesField,
              operator: "is-null",
            },
            {
              field: classC2PropertiesField,
              operator: "is-not-null",
            },
          ],
        },
        usedClasses: [],
      };
      const { expression, relatedInstances } = await createInstanceFilterDefinition(info, testImodel);
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
    const imodel = {
      key: "test_imodel",
      onClose,
    } as IModelConnection;

    const classAInfo: ClassInfo = { id: "0x1", name: "TestSchema:A", label: "A Class" };
    const classBInfo: ClassInfo = { id: "0x2", name: "TestSchema:B", label: "B Class" };
    const classCInfo: ClassInfo = { id: "0x3", name: "TestSchema:C", label: "C Class" };

    beforeEach(() => {
      // stub metadataProvider for test imodel
      const metadataProvider = getIModelMetadataProvider(imodel);
      sinon.stub(metadataProvider, "getECClassInfo").callsFake(async (name) => {
        switch (name) {
          case classAInfo.name:
            return new ECClassInfo(classAInfo.id, classAInfo.name, classAInfo.label, new Set(), new Set([classBInfo.id, classCInfo.id]));
          case classBInfo.name:
            return new ECClassInfo(classBInfo.id, classBInfo.name, classBInfo.label, new Set([classAInfo.id]), new Set([classCInfo.id]));
          case classCInfo.name:
            return new ECClassInfo(classCInfo.id, classCInfo.name, classCInfo.label, new Set([classAInfo.id, classBInfo.id]), new Set());
        }
        return undefined;
      });
    });

    afterEach(() => {
      sinon.resetBehavior();
      onClose.raiseEvent();
    });

    it("when one property is used", async () => {
      const info: PresentationInstanceFilterInfo = {
        filter: {
          field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classAInfo, name: "PropA" }) }] }),
          operator: "is-null",
        },
        usedClasses: [],
      };

      const { selectClassName } = await createInstanceFilterDefinition(info, imodel);
      expect(selectClassName).to.be.eq(classAInfo.name);
    });

    it("when all properties from same class", async () => {
      const info: PresentationInstanceFilterInfo = {
        filter: {
          operator: PropertyFilterRuleGroupOperator.And,
          conditions: [
            {
              field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classAInfo, name: "PropA1" }) }] }),
              operator: "is-null",
            },
            {
              field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classAInfo, name: "PropA2" }) }] }),
              operator: "is-null",
            },
          ],
        },
        usedClasses: [],
      };

      const { selectClassName } = await createInstanceFilterDefinition(info, imodel);
      expect(selectClassName).to.be.eq(classAInfo.name);
    });

    it("when second condition property is derived from first condition property", async () => {
      const info: PresentationInstanceFilterInfo = {
        filter: {
          operator: PropertyFilterRuleGroupOperator.And,
          conditions: [
            {
              field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classAInfo, name: "PropA" }) }] }),
              operator: "is-null",
            },
            {
              field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classBInfo, name: "PropB" }) }] }),
              operator: "is-null",
            },
          ],
        },
        usedClasses: [],
      };

      const { selectClassName } = await createInstanceFilterDefinition(info, imodel);
      expect(selectClassName).to.be.eq(classBInfo.name);
    });

    it("when first condition property is derived from second condition property", async () => {
      const info: PresentationInstanceFilterInfo = {
        filter: {
          operator: PropertyFilterRuleGroupOperator.And,
          conditions: [
            {
              field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classBInfo, name: "PropB" }) }] }),
              operator: "is-null",
            },
            {
              field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classAInfo, name: "PropA" }) }] }),
              operator: "is-null",
            },
          ],
        },
        usedClasses: [],
      };

      const { selectClassName } = await createInstanceFilterDefinition(info, imodel);
      expect(selectClassName).to.be.eq(classBInfo.name);
    });

    it("when properties from different derived classes are used", async () => {
      const info: PresentationInstanceFilterInfo = {
        filter: {
          operator: PropertyFilterRuleGroupOperator.And,
          conditions: [
            {
              field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classAInfo, name: "PropA" }) }] }),
              operator: "is-null",
            },
            {
              field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classCInfo, name: "PropC" }) }] }),
              operator: "is-null",
            },
            {
              field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classBInfo, name: "PropB" }) }] }),
              operator: "is-null",
            },
          ],
        },
        usedClasses: [],
      };

      const { selectClassName } = await createInstanceFilterDefinition(info, imodel);
      expect(selectClassName).to.be.eq(classCInfo.name);
    });
  });

  describe("handles unique values", () => {
    const testImodel = {} as IModelConnection;
    const property = createTestPropertyInfo();
    const field = createTestPropertiesContentField({ properties: [{ property }] });
    const propertyAccessor = `this.${property.name}`;
    const uniqueValues: UniqueValue[] = [
      {
        displayValue: "0.001",
        groupedRawValues: [0.001, 0.00099],
      },
      {
        displayValue: "0.002",
        groupedRawValues: [0.002, 0.00199],
      },
    ];

    const createFilter = (operator: `${PropertyFilterRuleOperator}`, customValue?: Value, customDisplayValue?: string): PresentationInstanceFilterCondition => {
      const serializedValue = serializeUniqueValues(uniqueValues);

      return {
        field,
        operator,
        value: {
          valueFormat: PropertyValueFormat.Primitive,
          value: customValue ?? serializedValue.groupedRawValues,
          displayValue: customDisplayValue ?? serializedValue.displayValues,
        },
      };
    };

    it("converts values when operator is `IsEqual`", async () => {
      const info: PresentationInstanceFilterInfo = {
        filter: createFilter("is-equal"),
        usedClasses: [],
      };

      const { expression } = await createInstanceFilterDefinition(info, testImodel);
      expect(expression).to.be.eq(
        `(${propertyAccessor} = ${uniqueValues[0].groupedRawValues[0] as number} OR ${propertyAccessor} = ${uniqueValues[0].groupedRawValues[1] as number} OR ${propertyAccessor} = ${uniqueValues[1].groupedRawValues[0] as number} OR ${propertyAccessor} = ${uniqueValues[1].groupedRawValues[1] as number})`,
      );
    });

    it("converts values when operator is `IsNotEqual`", async () => {
      const info: PresentationInstanceFilterInfo = {
        filter: createFilter("is-not-equal"),
        usedClasses: [],
      };

      const { expression } = await createInstanceFilterDefinition(info, testImodel);
      expect(expression).to.be.eq(
        `(${propertyAccessor} <> ${uniqueValues[0].groupedRawValues[0] as number} AND ${propertyAccessor} <> ${uniqueValues[0].groupedRawValues[1] as number} AND ${propertyAccessor} <> ${uniqueValues[1].groupedRawValues[0] as number} AND ${propertyAccessor} <> ${uniqueValues[1].groupedRawValues[1] as number})`,
      );
    });

    it("converts values when `deserializeUniqueValues` returns `undefined`", async () => {
      const info: PresentationInstanceFilterInfo = {
        filter: createFilter("is-equal", "a", "a"),
        usedClasses: [],
      };

      const { expression } = await createInstanceFilterDefinition(info, testImodel);
      expect(expression).to.be.eq(`${propertyAccessor} = "a"`);
    });
  });

  describe("handles passed `usedClasses`", () => {
    const testImodel = {} as IModelConnection;
    const classInfo1 = createTestECClassInfo({ id: "0x1" });
    const classInfo2 = createTestECClassInfo({ id: "0x2" });

    const filter: PresentationInstanceFilterCondition = {
      field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ classInfo: classInfo1 }) }] }),
      operator: "is-null",
    };

    it("returns empty expression if there are node filter and classes", async () => {
      const info: PresentationInstanceFilterInfo = {
        filter: undefined,
        usedClasses: [],
      };
      const { expression } = await createInstanceFilterDefinition(info, testImodel);

      expect(expression).to.be.eq("");
    });

    it("returns expression with no classes in it when filteredClasses is an empty array", async () => {
      const info: PresentationInstanceFilterInfo = {
        filter,
        usedClasses: [],
      };
      const { expression } = await createInstanceFilterDefinition(info, testImodel);

      expect(expression).to.be.eq("this.PropertyName = NULL");
    });

    it("returns expression appended with additional check for classes when one classInfo is passed in", async () => {
      const info: PresentationInstanceFilterInfo = {
        filter,
        usedClasses: [classInfo1],
      };

      const { expression } = await createInstanceFilterDefinition(info, testImodel);

      expect(expression).to.be.eq(`(this.PropertyName = NULL) AND (this.IsOfClass(${classInfo1.id}))`);
    });

    it("returns expression with classes check only", async () => {
      const info: PresentationInstanceFilterInfo = {
        filter: undefined,
        usedClasses: [classInfo1],
      };

      const { expression } = await createInstanceFilterDefinition(info, testImodel);

      expect(expression).to.be.eq(`(this.IsOfClass(${classInfo1.id}))`);
    });

    it("returns expression appended with additional check for classes when array of multiple classInfo's is passed in", async () => {
      const info: PresentationInstanceFilterInfo = {
        filter,
        usedClasses: [classInfo1, classInfo2],
      };

      const { expression } = await createInstanceFilterDefinition(info, testImodel);

      expect(expression).to.be.eq(`(this.PropertyName = NULL) AND (this.IsOfClass(${classInfo1.id}) OR this.IsOfClass(${classInfo2.id}))`);
    });

    it("returns appropriate expression with conditionGroup and usedClasses", async () => {
      const info: PresentationInstanceFilterInfo = {
        filter: {
          operator: PropertyFilterRuleGroupOperator.Or,
          conditions: [
            {
              field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "Prop1" }) }] }),
              operator: "is-null",
            },
            {
              field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo({ name: "Prop2" }) }] }),
              operator: "is-null",
            },
          ],
        },
        usedClasses: [classInfo1, classInfo2],
      };

      const { expression } = await createInstanceFilterDefinition(info, testImodel);

      expect(expression).to.be.eq(`(this.Prop1 = NULL OR this.Prop2 = NULL) AND (this.IsOfClass(${classInfo1.id}) OR this.IsOfClass(${classInfo2.id}))`);
    });
  });
});
