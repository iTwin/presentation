/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { Component } from "react";
import sinon from "sinon";
import * as moq from "typemoq";
import { Primitives, PrimitiveValue } from "@itwin/appui-abstract";
import { using } from "@itwin/core-bentley";
import { ITwinLocalization } from "@itwin/core-i18n";
import { combineFieldNames, LabelCompositeValue, LabelDefinition } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { AsyncTasksTracker, createLabelRecord, findField, getDisplayName, initializeLocalization } from "../../presentation-components/common/Utils";
import { createTestPropertyInfo } from "../_helpers/Common";
import { createTestContentDescriptor, createTestNestedContentField, createTestPropertiesContentField, createTestSimpleContentField } from "../_helpers/Content";
import { createTestLabelCompositeValue, createTestLabelDefinition } from "../_helpers/LabelDefinition";

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
      expect(getDisplayName(TestComponent)).to.eq(displayName);
    });

    it("returns name property value, if set", () => {
      const displayName = "Test Display Name";
      Object.defineProperty(TestComponent, "name", { value: displayName });
      expect(getDisplayName(TestComponent)).to.eq(displayName);
    });

    it("returns 'Component' if neither displayName nor name properties are set", () => {
      expect(getDisplayName(TestComponent)).to.eq("Component");
    });
  });

  describe("findField", () => {
    it("returns undefined for invalid name", () => {
      const descriptor = createTestContentDescriptor({ fields: [] });
      const result = findField(descriptor, "doesn't exist");
      expect(result).to.be.undefined;
    });

    it("returns undefined for invalid name when there are nested fields", () => {
      const nestedField = createTestPropertiesContentField({
        properties: [{ property: createTestPropertyInfo() }],
      });
      const nestingField = createTestNestedContentField({ nestedFields: [nestedField] });
      const descriptor = createTestContentDescriptor({ fields: [nestingField] });
      const result = findField(descriptor, combineFieldNames(nestedField.name, "doesn't exist"));
      expect(result).to.be.undefined;
    });

    it("finds field in Descriptor.fields list", () => {
      const descriptor = createTestContentDescriptor({
        fields: [createTestSimpleContentField()],
      });
      const field = descriptor.fields[0];
      const result = findField(descriptor, field.name);
      expect(result).to.eq(field);
    });

    it("finds nested field", () => {
      const nestedField = createTestPropertiesContentField({
        properties: [{ property: createTestPropertyInfo() }],
      });
      const nestingField = createTestNestedContentField({ nestedFields: [nestedField] });
      const descriptor = createTestContentDescriptor({ fields: [nestingField] });
      const result = findField(descriptor, combineFieldNames(nestedField.name, nestingField.name));
      expect(result!.name).to.eq(nestedField.name);
    });
  });

  describe("initializeLocalization", () => {
    const i18nMock = moq.Mock.ofType<ITwinLocalization>();

    beforeEach(() => {
      i18nMock.setup(async (x) => x.registerNamespace(moq.It.isAny())).returns(async () => Promise.resolve());
      sinon.stub(Presentation, "localization").get(() => i18nMock.object);
    });

    afterEach(() => {
      Presentation.terminate();
      sinon.restore();
    });

    it("registers and unregisters namespace", async () => {
      const terminate = await initializeLocalization();
      i18nMock.verify(async (x) => x.registerNamespace(moq.It.isAny()), moq.Times.once());
      terminate();
      i18nMock.verify((x) => x.unregisterNamespace(moq.It.isAny()), moq.Times.once()); // eslint-disable-line @itwin/no-internal
    });
  });

  describe("createLabelRecord", () => {
    const validateCompositeValue = (actual: Primitives.Composite, expected: LabelCompositeValue) => {
      expect(actual.separator).to.be.eq(expected.separator);
      expect(actual.parts.length).to.be.eq(expected.values.length);
      for (let i = 0; i < actual.parts.length; i++) {
        expect(actual.parts[i].displayValue).to.be.eq(expected.values[i].displayValue);
        expect(actual.parts[i].rawValue).to.be.eq(expected.values[i].rawValue);
        expect(actual.parts[i].typeName).to.be.eq(expected.values[i].typeName);
      }
    };

    it("creates PropertyRecord for label with simple value", () => {
      const definition = createTestLabelDefinition();
      const record = createLabelRecord(definition, "test");
      const primitiveValue = record.value as PrimitiveValue;
      expect(primitiveValue.value).to.be.eq(definition.rawValue);
      expect(primitiveValue.displayValue).to.be.eq(definition.displayValue);
      expect(record.property.typename).to.be.eq(definition.typeName);
    });

    it("creates PropertyRecord for label with composite value", () => {
      const definition = createTestLabelDefinition({ rawValue: createTestLabelCompositeValue(), typeName: LabelDefinition.COMPOSITE_DEFINITION_TYPENAME });
      const record = createLabelRecord(definition, "test");
      const primitiveValue = record.value as PrimitiveValue;
      validateCompositeValue(primitiveValue.value as Primitives.Composite, definition.rawValue as LabelCompositeValue);
      expect(primitiveValue.displayValue).to.be.eq(definition.displayValue);
      expect(record.property.typename).to.be.eq(definition.typeName);
    });
  });
});

describe("AsyncTasksTracker", () => {
  it("tracks async task while it's disposed", () => {
    const tracker = new AsyncTasksTracker();
    expect(tracker.pendingAsyncs.size).to.eq(0);
    const res = tracker.trackAsyncTask();
    expect(tracker.pendingAsyncs.size).to.eq(1);
    res.dispose();
    expect(tracker.pendingAsyncs.size).to.eq(0);
  });

  it("supports nesting", () => {
    const tracker = new AsyncTasksTracker();
    using(tracker.trackAsyncTask(), (_r1) => {
      expect(tracker.pendingAsyncs.size).to.eq(1);
      using(tracker.trackAsyncTask(), (_r2) => {
        expect(tracker.pendingAsyncs.size).to.eq(2);
      });
      expect(tracker.pendingAsyncs.size).to.eq(1);
    });
    expect(tracker.pendingAsyncs.size).to.eq(0);
  });
});
