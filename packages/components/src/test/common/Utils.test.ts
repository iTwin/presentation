/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Component } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { Primitives, PrimitiveValue } from "@itwin/appui-abstract";
import { combineFieldNames, LabelCompositeValue } from "@itwin/presentation-common";
import { AsyncTasksTracker, createLabelRecord, deserializeUniqueValues, findField, getDisplayName } from "../../presentation-components/common/Utils.js";
import { createTestPropertyInfo } from "../_helpers/Common.js";
import {
  createTestContentDescriptor,
  createTestNestedContentField,
  createTestPropertiesContentField,
  createTestSimpleContentField,
} from "../_helpers/Content.js";
import { createTestLabelCompositeValue, createTestLabelDefinition } from "../_helpers/LabelDefinition.js";

class TestComponent extends Component {}

describe("Utils", () => {
  describe("getDisplayName", () => {
    beforeEach(() => {
      (TestComponent as any).displayName = undefined;
      Object.defineProperty(TestComponent, "name", { value: undefined });
    });

    it("returns displayName property value, if set", () => {
      const displayName = "Test Display Name";
      (TestComponent as any).displayName = displayName;
      expect(getDisplayName(TestComponent)).toBe(displayName);
    });

    it("returns name property value, if set", () => {
      const displayName = "Test Display Name";
      Object.defineProperty(TestComponent, "name", { value: displayName });
      expect(getDisplayName(TestComponent)).toBe(displayName);
    });

    it("returns 'Component' if neither displayName nor name properties are set", () => {
      expect(getDisplayName(TestComponent)).toBe("Component");
    });
  });

  describe("findField", () => {
    it("returns undefined for invalid name", () => {
      const descriptor = createTestContentDescriptor({ fields: [] });
      const result = findField(descriptor, "doesn't exist");
      expect(result).toBeUndefined();
    });

    it("returns undefined for invalid name when there are nested fields", () => {
      const nestedField = createTestPropertiesContentField({
        properties: [{ property: createTestPropertyInfo() }],
      });
      const nestingField = createTestNestedContentField({ nestedFields: [nestedField] });
      const descriptor = createTestContentDescriptor({ fields: [nestingField] });
      const result = findField(descriptor, combineFieldNames(nestedField.name, "doesn't exist"));
      expect(result).toBeUndefined();
    });

    it("returns undefined for field of invalid type", () => {
      const invalidParentField = createTestPropertiesContentField({ name: "parent field", properties: [] });
      const descriptor = createTestContentDescriptor({ fields: [invalidParentField] });
      const result = findField(descriptor, combineFieldNames("child field", invalidParentField.name));
      expect(result).toBeUndefined();
    });

    it("finds field in Descriptor.fields list", () => {
      const descriptor = createTestContentDescriptor({
        fields: [createTestSimpleContentField()],
      });
      const field = descriptor.fields[0];
      const result = findField(descriptor, field.name);
      expect(result).toBe(field);
    });

    it("finds nested field", () => {
      const nestedField = createTestPropertiesContentField({
        properties: [{ property: createTestPropertyInfo() }],
      });
      const nestingField = createTestNestedContentField({ nestedFields: [nestedField] });
      const descriptor = createTestContentDescriptor({ fields: [nestingField] });
      const result = findField(descriptor, combineFieldNames(nestedField.name, nestingField.name));
      expect(result!.name).toBe(nestedField.name);
    });

    it("finds array item field", () => {
      const itemsField = createTestPropertiesContentField({ name: "items field", properties: [] });
      const arrayField = createTestPropertiesContentField({ itemsField, properties: [] });
      const descriptor = createTestContentDescriptor({ fields: [arrayField] });
      const result = findField(descriptor, combineFieldNames(itemsField.name, arrayField.name));
      expect(result!.name).toBe(itemsField.name);
    });

    it("finds struct member field", () => {
      const memberField = createTestPropertiesContentField({ name: "member field", properties: [] });
      const structField = createTestPropertiesContentField({ memberFields: [memberField], properties: [] });
      const descriptor = createTestContentDescriptor({ fields: [structField] });
      const result = findField(descriptor, combineFieldNames(memberField.name, structField.name));
      expect(result!.name).toBe(memberField.name);
    });
  });

  describe("createLabelRecord", () => {
    const validateCompositeValue = (actual: Primitives.Composite, expected: LabelCompositeValue) => {
      expect(actual.separator).toBe(expected.separator);
      expect(actual.parts.length).toBe(expected.values.length);
      for (let i = 0; i < actual.parts.length; i++) {
        expect(actual.parts[i].displayValue).toBe(expected.values[i].displayValue);
        expect(actual.parts[i].rawValue).toBe(expected.values[i].rawValue);
        expect(actual.parts[i].typeName).toBe(expected.values[i].typeName);
      }
    };

    it("creates PropertyRecord for label with simple value", () => {
      const definition = createTestLabelDefinition();
      const record = createLabelRecord(definition, "test");
      const primitiveValue = record.value as PrimitiveValue;
      expect(primitiveValue.value).toBe(definition.rawValue);
      expect(primitiveValue.displayValue).toBe(definition.displayValue);
      expect(record.property.typename).toBe(definition.typeName);
    });

    it("creates PropertyRecord for label with composite value", () => {
      const definition = createTestLabelDefinition({ rawValue: createTestLabelCompositeValue(), typeName: "composite" });
      const record = createLabelRecord(definition, "test");
      const primitiveValue = record.value as PrimitiveValue;
      validateCompositeValue(primitiveValue.value as Primitives.Composite, definition.rawValue as LabelCompositeValue);
      expect(primitiveValue.displayValue).toBe(definition.displayValue);
      expect(record.property.typename).toBe(definition.typeName);
    });
  });
});

describe("AsyncTasksTracker", () => {
  it("tracks async task while it's disposed", () => {
    const tracker = new AsyncTasksTracker();
    expect(tracker.pendingAsyncs.size).toBe(0);
    {
      using _res = tracker.trackAsyncTask();
      expect(tracker.pendingAsyncs.size).toBe(1);
    }
    expect(tracker.pendingAsyncs.size).toBe(0);
  });

  it("supports nesting", () => {
    const tracker = new AsyncTasksTracker();
    {
      using _r1 = tracker.trackAsyncTask();
      expect(tracker.pendingAsyncs.size).toBe(1);
      {
        using _r2 = tracker.trackAsyncTask();
        expect(tracker.pendingAsyncs.size).toBe(2);
      }
      expect(tracker.pendingAsyncs.size).toBe(1);
    }
    expect(tracker.pendingAsyncs.size).toBe(0);
  });
});

describe("deserializeUniqueValues", () => {
  it("returns undefined for non serialized numeric string values", () => {
    const deserialized = deserializeUniqueValues("50", "50");
    expect(deserialized).toBeUndefined();
  });

  it("returns undefined for non serialized string values", () => {
    const deserialized = deserializeUniqueValues("some value", "some value");
    expect(deserialized).toBeUndefined();
  });

  it("returns undefined if display value count does not match raw values count", () => {
    const deserialized = deserializeUniqueValues(`[1, 2]`, `{"1": [1], "2": [2]}`);
    expect(deserialized).toHaveLength(2);
    expect(deserializeUniqueValues(`[1, 2]`, `{"1": [1]}`)).toBeUndefined();
  });
});
