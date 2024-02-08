/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { PropertyDescription, PropertyValueFormat } from "@itwin/appui-abstract";
import { PropertyFilter, PropertyFilterRule, PropertyFilterRuleGroup } from "@itwin/components-react";
import { Field } from "@itwin/presentation-common";
import { serializeUniqueValues } from "../../presentation-components/common/Utils";
import { GenericInstanceFilter } from "../../presentation-components/instance-filter-builder/GenericInstanceFilter";
import { PresentationInstanceFilter } from "../../presentation-components/instance-filter-builder/PresentationInstanceFilter";
import { INSTANCE_FILTER_FIELD_SEPARATOR } from "../../presentation-components/instance-filter-builder/Utils";
import { createTestECClassInfo } from "../_helpers/Common";
import {
  createTestCategoryDescription,
  createTestContentDescriptor,
  createTestNestedContentField,
  createTestPropertiesContentField,
} from "../_helpers/Content";

describe("PresentationInstanceFilter", () => {
  const category = createTestCategoryDescription({ name: "root", label: "Root" });
  const propertyField1 = createTestPropertiesContentField({
    properties: [{ property: { classInfo: createTestECClassInfo({ name: "Schema:A" }), name: "A1", type: "string" } }],
    category,
    name: "propField1",
    label: "Prop1",
  });
  const propertyField2 = createTestPropertiesContentField({
    properties: [{ property: { classInfo: createTestECClassInfo({ name: "Schema:A" }), name: "A2", type: "string" } }],
    category,
    name: "propField2",
    label: "Prop2",
  });

  const relatedB = createTestPropertiesContentField({
    properties: [{ property: { classInfo: createTestECClassInfo({ name: "Schema:B" }), name: "relatedB", type: "string" } }],
    category,
    name: "relatedBPropField",
    label: "RelatedB",
  });

  const relatedC1 = createTestPropertiesContentField({
    properties: [{ property: { classInfo: createTestECClassInfo({ name: "Schema:C1" }), name: "relatedC1", type: "string" } }],
    category,
    name: "relatedC1PropField",
    label: "RelatedC1",
  });

  const relatedC2 = createTestPropertiesContentField({
    properties: [{ property: { classInfo: createTestECClassInfo({ name: "Schema:C2" }), name: "relatedC2", type: "string" } }],
    category,
    name: "relatedC2PropField",
    label: "RelatedC2",
  });

  const relatedE = createTestPropertiesContentField({
    properties: [{ property: { classInfo: createTestECClassInfo({ name: "Schema:E" }), name: "relatedE", type: "string" } }],
    category,
    name: "relatedEPropField",
    label: "RelatedE",
  });

  const fieldBToC1 = createTestNestedContentField({
    nestedFields: [relatedC1],
    category,
    name: "bToc1",
    label: "BToC1",
    pathToPrimaryClass: [
      {
        sourceClassInfo: createTestECClassInfo({ name: "Schema:C1" }),
        targetClassInfo: createTestECClassInfo({ name: "Schema:B" }),
        isForwardRelationship: false,
        relationshipInfo: createTestECClassInfo({ name: "Schema:BToC1" }),
      },
    ],
  });

  const fieldBToC2 = createTestNestedContentField({
    nestedFields: [relatedC2],
    category,
    name: "bToc2",
    label: "BToC2",
    pathToPrimaryClass: [
      {
        sourceClassInfo: createTestECClassInfo({ name: "Schema:C2" }),
        targetClassInfo: createTestECClassInfo({ name: "Schema:B" }),
        isForwardRelationship: false,
        relationshipInfo: createTestECClassInfo({ name: "Schema:BToC2" }),
      },
    ],
  });

  const fieldAToB = createTestNestedContentField({
    nestedFields: [fieldBToC1, fieldBToC2, relatedB],
    category,
    name: "aTob",
    label: "AToB",
    pathToPrimaryClass: [
      {
        sourceClassInfo: createTestECClassInfo({ name: "Schema:B" }),
        targetClassInfo: createTestECClassInfo({ name: "Schema:A" }),
        isForwardRelationship: false,
        relationshipInfo: createTestECClassInfo({ name: "Schema:AToB" }),
      },
    ],
  });

  const fieldDToE = createTestNestedContentField({
    nestedFields: [relatedE],
    category,
    name: "dToe",
    label: "DToE",
    pathToPrimaryClass: [
      {
        sourceClassInfo: createTestECClassInfo({ name: "Schema:E" }),
        targetClassInfo: createTestECClassInfo({ name: "Schema:D" }),
        isForwardRelationship: false,
        relationshipInfo: createTestECClassInfo({ name: "Schema:DToE" }),
      },
    ],
  });

  const fieldAToD = createTestNestedContentField({
    nestedFields: [fieldDToE],
    category,
    name: "aTod",
    label: "AToD",
    pathToPrimaryClass: [
      {
        sourceClassInfo: createTestECClassInfo({ name: "Schema:D" }),
        targetClassInfo: createTestECClassInfo({ name: "Schema:C1" }),
        isForwardRelationship: false,
        relationshipInfo: createTestECClassInfo({ name: "Schema:C1ToD" }),
      },
      {
        sourceClassInfo: createTestECClassInfo({ name: "Schema:C1" }),
        targetClassInfo: createTestECClassInfo({ name: "Schema:B1" }),
        isForwardRelationship: false,
        relationshipInfo: createTestECClassInfo({ name: "Schema:B1ToC1" }),
      },
      {
        sourceClassInfo: createTestECClassInfo({ name: "Schema:B1" }),
        targetClassInfo: createTestECClassInfo({ name: "Schema:A" }),
        isForwardRelationship: false,
        relationshipInfo: createTestECClassInfo({ name: "Schema:AToB1" }),
      },
    ],
  });

  fieldAToB.rebuildParentship();
  fieldAToD.rebuildParentship();

  const descriptor = createTestContentDescriptor({
    categories: [category],
    fields: [propertyField1, propertyField2, fieldAToD, fieldAToB],
  });

  describe("fromComponentsPropertyFilter", () => {
    it("finds properties fields for property description", () => {
      const filter: PropertyFilterRuleGroup = {
        operator: "and",
        rules: [
          {
            property: { name: getPropertyDescriptionName(propertyField1), displayLabel: "Prop1", typename: "string" },
            operator: "is-null",
          },
          {
            property: { name: getPropertyDescriptionName(propertyField2), displayLabel: "Prop2", typename: "string" },
            operator: "is-null",
          },
        ],
      };
      expect(PresentationInstanceFilter.fromComponentsPropertyFilter(descriptor, filter)).to.containSubset({
        operator: "and",
        conditions: [
          {
            operator: "is-null",
            field: propertyField1,
          },
          {
            operator: "is-null",
            field: propertyField2,
          },
        ],
      });
    });

    it("throws if rule properties field cannot be found", () => {
      const property: PropertyDescription = { name: `${INSTANCE_FILTER_FIELD_SEPARATOR}invalidFieldName`, displayLabel: "Prop", typename: "string" };
      expect(() => PresentationInstanceFilter.fromComponentsPropertyFilter(descriptor, { property, operator: "is-null" })).to.throw();
    });

    it("throws if group has rule with invalid property field", () => {
      const filter: PropertyFilterRuleGroup = {
        operator: "and",
        rules: [
          {
            property: { name: getPropertyDescriptionName(propertyField1), displayLabel: "Prop1", typename: "string" },
            operator: "is-null",
          },
          {
            property: { name: `${INSTANCE_FILTER_FIELD_SEPARATOR}invalidFieldName`, displayLabel: "Prop2", typename: "string" },
            operator: "is-null",
          },
        ],
      };
      expect(() => PresentationInstanceFilter.fromComponentsPropertyFilter(descriptor, filter)).to.throw();
    });

    it("throws if rule has non primitive value", () => {
      const filter: PropertyFilterRule = {
        property: { name: getPropertyDescriptionName(propertyField1), displayLabel: "Prop1", typename: "string" },
        operator: "is-equal",
        value: { valueFormat: PropertyValueFormat.Array, items: [], itemsTypeName: "number" },
      };
      expect(() => PresentationInstanceFilter.fromComponentsPropertyFilter(descriptor, filter)).to.throw();
    });
  });

  describe("toComponentsPropertyFilter", () => {
    it("property filter converts to presentation filter and vise versa correctly", () => {
      const filter: PropertyFilter = {
        operator: "and",
        rules: [
          {
            property: { name: getPropertyDescriptionName(propertyField1), displayLabel: "Prop1", typename: "string" },
            operator: "is-null",
            value: undefined,
          },
          {
            property: { name: getPropertyDescriptionName(propertyField2), displayLabel: "Prop2", typename: "string" },
            operator: "is-null",
            value: undefined,
          },
        ],
      };

      const presentationFilter = PresentationInstanceFilter.fromComponentsPropertyFilter(descriptor, filter);
      const result = PresentationInstanceFilter.toComponentsPropertyFilter(descriptor, presentationFilter);
      expect(result).to.be.deep.eq(filter);
    });

    it("converts presentation filter with nested conditions to property filter", () => {
      const presentationFilter: PresentationInstanceFilter = {
        operator: "and",
        conditions: [
          {
            operator: "and",
            conditions: [
              {
                field: propertyField1,
                operator: "is-null",
                value: undefined,
              },
            ],
          },
        ],
      };

      const propertyFilter: PropertyFilter = {
        operator: "and",
        rules: [
          {
            operator: "and",
            rules: [
              {
                property: { name: getPropertyDescriptionName(propertyField1), displayLabel: "Prop1", typename: "string" },
                operator: "is-null",
                value: undefined,
              },
            ],
          },
        ],
      };

      const result = PresentationInstanceFilter.toComponentsPropertyFilter(descriptor, presentationFilter);
      expect(result).to.be.deep.eq(propertyFilter);
    });

    it("converts presentation filter with nested fields to property filter", () => {
      const presentationFilter: PresentationInstanceFilter = {
        operator: "and",
        conditions: [
          {
            field: relatedC1,
            operator: "is-null",
            value: undefined,
          },
        ],
      };

      const propertyFilter: PropertyFilter = {
        operator: "and",
        rules: [
          {
            property: {
              name: `${getPropertyDescriptionName(fieldAToB)}$${fieldBToC1.name}$${relatedC1.name}`,
              displayLabel: "RelatedC1",
              typename: "string",
            },
            operator: "is-null",
            value: undefined,
          },
        ],
      };

      const result = PresentationInstanceFilter.toComponentsPropertyFilter(descriptor, presentationFilter);
      expect(result).to.be.deep.eq(propertyFilter);
    });

    it("throws if property used in filter is not found in descriptor", () => {
      const propertyField = createTestPropertiesContentField({
        properties: [{ property: { classInfo: createTestECClassInfo(), name: "prop", type: "string" } }],
        category,
        name: "propField",
        label: "Prop",
      });

      const presentationFilter: PresentationInstanceFilter = {
        operator: "and",
        conditions: [
          {
            field: propertyField,
            operator: "is-null",
            value: undefined,
          },
        ],
      };

      expect(() => PresentationInstanceFilter.toComponentsPropertyFilter(descriptor, presentationFilter)).to.throw();
    });
  });

  describe("toGenericInstanceFilter", () => {
    it("converts simple condition", () => {
      const filter: PresentationInstanceFilter = {
        operator: "is-equal",
        field: propertyField1,
        value: { valueFormat: PropertyValueFormat.Primitive, value: "val", displayValue: "Value" },
      };
      const actual = PresentationInstanceFilter.toGenericInstanceFilter(filter, [propertyField1.properties[0].property.classInfo]);
      const expectedFilter: GenericInstanceFilter = {
        rules: {
          operator: "is-equal",
          propertyName: propertyField1.properties[0].property.name,
          sourceAlias: "this",
          propertyTypeName: propertyField1.type.typeName,
          value: { displayValue: "Value", rawValue: "val" },
        },
        propertyClassNames: ["Schema:A"],
        relatedInstances: [],
        filteredClassNames: [propertyField1.properties[0].property.classInfo.name],
      };
      expect(actual).to.be.deep.eq(expectedFilter);
    });

    it("converts point3d condition", () => {
      const filter: PresentationInstanceFilter = {
        operator: "is-equal",
        field: propertyField1,
        value: { valueFormat: PropertyValueFormat.Primitive, value: { x: 1, y: 2, z: 3 }, displayValue: "X: 1 Y: 2 Z: 3" },
      };
      const actual = PresentationInstanceFilter.toGenericInstanceFilter(filter);
      const expectedFilter: GenericInstanceFilter = {
        rules: {
          operator: "is-equal",
          propertyName: propertyField1.properties[0].property.name,
          sourceAlias: "this",
          propertyTypeName: propertyField1.type.typeName,
          value: { displayValue: "X: 1 Y: 2 Z: 3", rawValue: { x: 1, y: 2, z: 3 } },
        },
        propertyClassNames: ["Schema:A"],
        relatedInstances: [],
        filteredClassNames: undefined,
      };
      expect(actual).to.be.deep.eq(expectedFilter);
    });

    it("converts unique value condition", () => {
      const { displayValues, groupedRawValues } = serializeUniqueValues([
        {
          displayValue: "1.5",
          groupedRawValues: [1.4, 1.5],
        },
        {
          displayValue: "2.5",
          groupedRawValues: [2.5],
        },
      ]);
      const filter: PresentationInstanceFilter = {
        operator: "is-equal",
        field: propertyField1,
        value: { valueFormat: PropertyValueFormat.Primitive, value: groupedRawValues, displayValue: displayValues },
      };
      const actual = PresentationInstanceFilter.toGenericInstanceFilter(filter);
      const expectedFilter: GenericInstanceFilter = {
        rules: {
          operator: "or",
          rules: [
            {
              operator: "is-equal",
              propertyName: propertyField1.properties[0].property.name,
              sourceAlias: "this",
              propertyTypeName: propertyField1.type.typeName,
              value: { displayValue: "1.5", rawValue: 1.4 },
            },
            {
              operator: "is-equal",
              propertyName: propertyField1.properties[0].property.name,
              sourceAlias: "this",
              propertyTypeName: propertyField1.type.typeName,
              value: { displayValue: "1.5", rawValue: 1.5 },
            },
            {
              operator: "is-equal",
              propertyName: propertyField1.properties[0].property.name,
              sourceAlias: "this",
              propertyTypeName: propertyField1.type.typeName,
              value: { displayValue: "2.5", rawValue: 2.5 },
            },
          ],
        },
        propertyClassNames: ["Schema:A"],
        relatedInstances: [],
        filteredClassNames: undefined,
      };
      expect(actual).to.be.deep.eq(expectedFilter);
    });

    it("converts condition group", () => {
      const filter: PresentationInstanceFilter = {
        operator: "or",
        conditions: [
          {
            operator: "is-equal",
            field: propertyField1,
            value: { valueFormat: PropertyValueFormat.Primitive, value: 123, displayValue: "123" },
          },
          {
            operator: "is-false",
            field: propertyField2,
          },
        ],
      };
      const actual = PresentationInstanceFilter.toGenericInstanceFilter(filter);
      const expectedFilter: GenericInstanceFilter = {
        rules: {
          operator: "or",
          rules: [
            {
              operator: "is-equal",
              propertyName: propertyField1.properties[0].property.name,
              sourceAlias: "this",
              propertyTypeName: propertyField1.type.typeName,
              value: { displayValue: "123", rawValue: 123 },
            },
            {
              operator: "is-false",
              propertyName: propertyField2.properties[0].property.name,
              sourceAlias: "this",
              propertyTypeName: propertyField2.type.typeName,
              value: undefined,
            },
          ],
        },
        propertyClassNames: ["Schema:A"],
        relatedInstances: [],
        filteredClassNames: undefined,
      };
      expect(actual).to.be.deep.eq(expectedFilter);
    });

    it("converts related property condition", () => {
      const filter: PresentationInstanceFilter = {
        operator: "is-equal",
        field: relatedC2,
        value: { valueFormat: PropertyValueFormat.Primitive, value: 123, displayValue: "123" },
      };
      const actual = PresentationInstanceFilter.toGenericInstanceFilter(filter);
      const expectedFilter: GenericInstanceFilter = {
        rules: {
          operator: "is-equal",
          propertyName: relatedC2.properties[0].property.name,
          sourceAlias: "rel_C2_0",
          propertyTypeName: relatedC2.type.typeName,
          value: { displayValue: "123", rawValue: 123 },
        },
        propertyClassNames: ["Schema:A"], // class that was used to access related property on C2
        relatedInstances: [
          {
            alias: "rel_C2_0",
            path: [
              {
                sourceClassName: "Schema:A",
                targetClassName: "Schema:B",
                relationshipClassName: "Schema:AToB",
                isForwardRelationship: true,
              },
              {
                sourceClassName: "Schema:B",
                targetClassName: "Schema:C2",
                relationshipClassName: "Schema:BToC2",
                isForwardRelationship: true,
              },
            ],
          },
        ],
        filteredClassNames: undefined,
      };
      expect(actual).to.be.deep.eq(expectedFilter);
    });

    it("converts deeply related property condition", () => {
      const filter: PresentationInstanceFilter = {
        operator: "is-equal",
        field: relatedE,
        value: { valueFormat: PropertyValueFormat.Primitive, value: 123, displayValue: "123" },
      };
      const actual = PresentationInstanceFilter.toGenericInstanceFilter(filter);
      const expectedFilter: GenericInstanceFilter = {
        rules: {
          operator: "is-equal",
          propertyName: relatedE.properties[0].property.name,
          sourceAlias: "rel_E_0",
          propertyTypeName: relatedE.type.typeName,
          value: { displayValue: "123", rawValue: 123 },
        },
        propertyClassNames: ["Schema:A"], // class that was used to access related property on C2
        relatedInstances: [
          {
            alias: "rel_E_0",
            path: [
              {
                sourceClassName: "Schema:A",
                targetClassName: "Schema:B1",
                relationshipClassName: "Schema:AToB1",
                isForwardRelationship: true,
              },
              {
                sourceClassName: "Schema:B1",
                targetClassName: "Schema:C1",
                relationshipClassName: "Schema:B1ToC1",
                isForwardRelationship: true,
              },
              {
                sourceClassName: "Schema:C1",
                targetClassName: "Schema:D",
                relationshipClassName: "Schema:C1ToD",
                isForwardRelationship: true,
              },
              {
                sourceClassName: "Schema:D",
                targetClassName: "Schema:E",
                relationshipClassName: "Schema:DToE",
                isForwardRelationship: true,
              },
            ],
          },
        ],
        filteredClassNames: undefined,
      };
      expect(actual).to.be.deep.eq(expectedFilter);
    });
  });

  describe("fromGenericInstanceFilter", () => {
    it("parses direct property rule", () => {
      const filter: GenericInstanceFilter = {
        rules: {
          operator: "is-equal",
          sourceAlias: "this",
          propertyName: propertyField1.properties[0].property.name,
          propertyTypeName: propertyField1.properties[0].property.type,
          value: { displayValue: "Value", rawValue: "val" },
        },
        propertyClassNames: ["Schema:A"],
        relatedInstances: [],
        filteredClassNames: undefined,
      };

      const actual = PresentationInstanceFilter.fromGenericInstanceFilter(descriptor, filter);
      const expected: PresentationInstanceFilter = {
        operator: "is-equal",
        field: propertyField1,
        value: { valueFormat: PropertyValueFormat.Primitive, displayValue: "Value", value: "val" },
      };
      expect(actual).to.be.deep.eq(expected);
    });

    it("parses multiple properties rules", () => {
      const filter: GenericInstanceFilter = {
        rules: {
          operator: "or",
          rules: [
            {
              operator: "is-equal",
              sourceAlias: "this",
              propertyName: propertyField1.properties[0].property.name,
              propertyTypeName: propertyField1.properties[0].property.type,
              value: { displayValue: "1", rawValue: 1 },
            },
            {
              operator: "is-equal",
              sourceAlias: "this",
              propertyName: propertyField2.properties[0].property.name,
              propertyTypeName: propertyField2.properties[0].property.type,
              value: { displayValue: "Value", rawValue: "val" },
            },
          ],
        },
        propertyClassNames: ["Schema:A"],
        relatedInstances: [],
        filteredClassNames: undefined,
      };

      const actual = PresentationInstanceFilter.fromGenericInstanceFilter(descriptor, filter);
      const expected: PresentationInstanceFilter = {
        operator: "or",
        conditions: [
          {
            operator: "is-equal",
            field: propertyField1,
            value: { valueFormat: PropertyValueFormat.Primitive, displayValue: "1", value: 1 },
          },
          {
            operator: "is-equal",
            field: propertyField2,
            value: { valueFormat: PropertyValueFormat.Primitive, displayValue: "Value", value: "val" },
          },
        ],
      };
      expect(actual).to.be.deep.eq(expected);
    });

    it("parses unique value rule", () => {
      const { displayValues, groupedRawValues } = serializeUniqueValues([
        {
          displayValue: "1.5",
          groupedRawValues: [1.4, 1.5],
        },
        {
          displayValue: "2.5",
          groupedRawValues: [2.5],
        },
      ]);

      const filter: GenericInstanceFilter = {
        rules: {
          operator: "and",
          rules: [
            {
              operator: "is-not-equal",
              sourceAlias: "this",
              propertyName: propertyField1.properties[0].property.name,
              propertyTypeName: propertyField1.properties[0].property.type,
              value: { displayValue: "1.5", rawValue: 1.4 },
            },
            {
              operator: "is-not-equal",
              sourceAlias: "this",
              propertyName: propertyField1.properties[0].property.name,
              propertyTypeName: propertyField1.properties[0].property.type,
              value: { displayValue: "1.5", rawValue: 1.5 },
            },
            {
              operator: "is-not-equal",
              sourceAlias: "this",
              propertyName: propertyField1.properties[0].property.name,
              propertyTypeName: propertyField1.properties[0].property.type,
              value: { displayValue: "2.5", rawValue: 2.5 },
            },
          ],
        },
        propertyClassNames: ["Schema:A"],
        relatedInstances: [],
        filteredClassNames: undefined,
      };

      const actual = PresentationInstanceFilter.fromGenericInstanceFilter(descriptor, filter);
      const expected: PresentationInstanceFilter = {
        operator: "is-not-equal",
        field: propertyField1,
        value: { valueFormat: PropertyValueFormat.Primitive, displayValue: displayValues, value: groupedRawValues },
      };
      expect(actual).to.be.deep.eq(expected);
    });

    it("parses related properties rules", () => {
      const filter: GenericInstanceFilter = {
        rules: {
          operator: "and",
          rules: [
            {
              operator: "is-equal",
              sourceAlias: `rel_B_0`,
              propertyName: relatedB.properties[0].property.name,
              propertyTypeName: relatedB.properties[0].property.type,
              value: { displayValue: "Value", rawValue: "val" },
            },
            {
              operator: "is-not-null",
              sourceAlias: "rel_B_0",
              propertyName: relatedB.properties[0].property.name,
              propertyTypeName: relatedB.properties[0].property.type,
            },
          ],
        },
        propertyClassNames: [relatedB.properties[0].property.classInfo.name],
        relatedInstances: [
          {
            alias: "rel_B_0",
            path: [
              {
                sourceClassName: "Schema:A",
                targetClassName: "Schema:B",
                relationshipClassName: "Schema:AToB",
                isForwardRelationship: true,
              },
            ],
          },
        ],
        filteredClassNames: undefined,
      };

      const actual = PresentationInstanceFilter.fromGenericInstanceFilter(descriptor, filter);
      const expected: PresentationInstanceFilter = {
        operator: "and",
        conditions: [
          {
            operator: "is-equal",
            field: relatedB,
            value: { valueFormat: PropertyValueFormat.Primitive, displayValue: "Value", value: "val" },
          },
          {
            operator: "is-not-null",
            field: relatedB,
            value: undefined,
          },
        ],
      };
      expect(actual).to.be.deep.eq(expected);
    });

    it("parses multiple related properties rules", () => {
      const filter: GenericInstanceFilter = {
        rules: {
          operator: "and",
          rules: [
            {
              operator: "is-equal",
              sourceAlias: `rel_C1_0`,
              propertyName: relatedC1.properties[0].property.name,
              propertyTypeName: relatedC1.properties[0].property.type,
              value: { displayValue: "Value", rawValue: "val" },
            },
            {
              operator: "is-not-null",
              sourceAlias: "rel_C2_0",
              propertyName: relatedC2.properties[0].property.name,
              propertyTypeName: relatedC2.properties[0].property.type,
            },
          ],
        },
        propertyClassNames: ["Schema:A"],
        relatedInstances: [
          {
            alias: "rel_C1_0",
            path: [
              {
                sourceClassName: "Schema:A",
                targetClassName: "Schema:B",
                relationshipClassName: "Schema:AToB",
                isForwardRelationship: true,
              },
              {
                sourceClassName: "Schema:B",
                targetClassName: "Schema:C1",
                relationshipClassName: "Schema:BToC1",
                isForwardRelationship: true,
              },
            ],
          },
          {
            alias: "rel_C2_0",
            path: [
              {
                sourceClassName: "Schema:A",
                targetClassName: "Schema:B",
                relationshipClassName: "Schema:AToB",
                isForwardRelationship: true,
              },
              {
                sourceClassName: "Schema:B",
                targetClassName: "Schema:C2",
                relationshipClassName: "Schema:BToC2",
                isForwardRelationship: true,
              },
            ],
          },
        ],
        filteredClassNames: undefined,
      };

      const actual = PresentationInstanceFilter.fromGenericInstanceFilter(descriptor, filter);
      const expected: PresentationInstanceFilter = {
        operator: "and",
        conditions: [
          {
            operator: "is-equal",
            field: relatedC1,
            value: { valueFormat: PropertyValueFormat.Primitive, displayValue: "Value", value: "val" },
          },
          {
            operator: "is-not-null",
            field: relatedC2,
            value: undefined,
          },
        ],
      };
      expect(actual).to.be.deep.eq(expected);
    });

    it("parses deeply related properties rules", () => {
      const filter: GenericInstanceFilter = {
        rules: {
          operator: "is-equal",
          sourceAlias: `rel_E_0`,
          propertyName: relatedE.properties[0].property.name,
          propertyTypeName: relatedE.properties[0].property.type,
          value: { displayValue: "Value", rawValue: "val" },
        },
        propertyClassNames: ["Schema:A"],
        relatedInstances: [
          {
            alias: "rel_E_0",
            path: [
              {
                sourceClassName: "Schema:A",
                targetClassName: "Schema:B1",
                relationshipClassName: "Schema:AToB1",
                isForwardRelationship: true,
              },
              {
                sourceClassName: "Schema:B1",
                targetClassName: "Schema:C1",
                relationshipClassName: "Schema:B1ToC1",
                isForwardRelationship: true,
              },
              {
                sourceClassName: "Schema:C1",
                targetClassName: "Schema:D",
                relationshipClassName: "Schema:C1ToD",
                isForwardRelationship: true,
              },
              {
                sourceClassName: "Schema:D",
                targetClassName: "Schema:E",
                relationshipClassName: "Schema:DToE",
                isForwardRelationship: true,
              },
            ],
          },
        ],
        filteredClassNames: undefined,
      };

      const actual = PresentationInstanceFilter.fromGenericInstanceFilter(descriptor, filter);
      const expected: PresentationInstanceFilter = {
        operator: "is-equal",
        field: relatedE,
        value: { valueFormat: PropertyValueFormat.Primitive, displayValue: "Value", value: "val" },
      };
      expect(actual).to.be.deep.eq(expected);
    });

    it("throws when direct property field is not found", () => {
      const filter: GenericInstanceFilter = {
        rules: {
          operator: "is-null",
          sourceAlias: "this",
          propertyName: "invalidProp",
          propertyTypeName: "string",
        },
        propertyClassNames: ["Schema:A"],
        relatedInstances: [],
      };

      expect(() => PresentationInstanceFilter.fromGenericInstanceFilter(descriptor, filter)).to.throw("Failed to find field for property - this.invalidProp");
    });

    it("throws when related property field is not found", () => {
      const filter: GenericInstanceFilter = {
        rules: {
          operator: "is-null",
          sourceAlias: "rel_B_0",
          propertyName: "invalidProp",
          propertyTypeName: "string",
        },
        propertyClassNames: ["Schema:A"],
        relatedInstances: [
          {
            alias: "rel_B_0",
            path: [
              {
                sourceClassName: "Schema:A",
                targetClassName: "Schema:B",
                relationshipClassName: "Schema:AToB",
                isForwardRelationship: true,
              },
            ],
          },
        ],
      };

      expect(() => PresentationInstanceFilter.fromGenericInstanceFilter(descriptor, filter)).to.throw(
        "Failed to find field for property - rel_B_0.invalidProp",
      );
    });

    it("throws when related nested field is not found", () => {
      const filter: GenericInstanceFilter = {
        rules: {
          operator: "is-null",
          sourceAlias: "rel_B_0",
          propertyName: relatedB.properties[0].property.name,
          propertyTypeName: relatedB.properties[0].property.type,
        },
        propertyClassNames: ["Schema:A"],
        relatedInstances: [
          {
            alias: "rel_B_0",
            path: [
              {
                sourceClassName: "Schema:A",
                targetClassName: "Schema:Invalid",
                relationshipClassName: "Schema:AToInvalid",
                isForwardRelationship: true,
              },
            ],
          },
        ],
      };

      expect(() => PresentationInstanceFilter.fromGenericInstanceFilter(descriptor, filter)).to.throw(
        `Failed to find field for property - rel_B_0.${relatedB.properties[0].property.name}`,
      );
    });

    it("throws when related instance info is not found", () => {
      const filter: GenericInstanceFilter = {
        rules: {
          operator: "is-null",
          sourceAlias: "rel_B_0",
          propertyName: "invalidProp",
          propertyTypeName: "string",
        },
        propertyClassNames: ["Schema:A"],
        relatedInstances: [],
      };

      expect(() => PresentationInstanceFilter.fromGenericInstanceFilter(descriptor, filter)).to.throw(
        "Failed to find field for property - rel_B_0.invalidProp",
      );
    });
  });
});

function getPropertyDescriptionName(field: Field) {
  return `root${INSTANCE_FILTER_FIELD_SEPARATOR}${field.name}`;
}
