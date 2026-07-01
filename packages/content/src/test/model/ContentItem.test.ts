/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createContentItem } from "../../content/model/ContentItem.js";

import type { ContentDescriptor } from "../../content/model/ContentDescriptor.js";
import type { ContentValues } from "../../content/model/ContentItem.js";
import type { Field, PropertyField } from "../../content/model/Field.js";

function createTestDescriptor(fields: Field[]): ContentDescriptor {
  const fieldMap: Record<string, Field> = {};
  for (const f of fields) {
    fieldMap[f.id] = f;
  }
  return { sources: [], fields: fieldMap, categories: {} };
}

function createTestPropertyField(id: string): PropertyField {
  return {
    kind: "property",
    id,
    label: id,
    type: { kind: "primitive", type: "String" },
    sourceClassName: "BisCore.Element",
    propertyName: id,
    pathFromTarget: [],
  };
}

describe("createContentItem", () => {
  it("returns value by field reference via getValue", () => {
    const field = createTestPropertyField("BisCore.Element.CodeValue");
    const descriptor = createTestDescriptor([field]);
    const values: ContentValues = {
      primaryKey: { className: "BisCore.Element", id: "0x1" },
      values: { "BisCore.Element.CodeValue": "MyCode" },
    };

    const item = createContentItem(descriptor, values);

    expect(item.getValue(field)).to.equal("MyCode");
  });

  it("returns undefined for non-applicable field", () => {
    const field = createTestPropertyField("BisCore.Element.CodeValue");
    const otherField = createTestPropertyField("ProcessPhysical.Pump.FlowRate");
    const descriptor = createTestDescriptor([field, otherField]);
    const values: ContentValues = {
      primaryKey: { className: "BisCore.Element", id: "0x1" },
      values: { "BisCore.Element.CodeValue": "MyCode" },
    };

    const item = createContentItem(descriptor, values);

    expect(item.getValue(otherField)).to.be.undefined;
  });

  it("is immutable", () => {
    const field = createTestPropertyField("BisCore.Element.CodeValue");
    const descriptor = createTestDescriptor([field]);
    const values: ContentValues = {
      primaryKey: { className: "BisCore.Element", id: "0x1" },
      values: { "BisCore.Element.CodeValue": "Test" },
    };

    const item = createContentItem(descriptor, values);

    expect(Object.isFrozen(item)).to.be.true;
    expect(Object.isFrozen(item.primaryKey)).to.be.true;
    expect(Object.isFrozen(item.values)).to.be.true;

    // Mutating the source objects should not affect the item.
    values.primaryKey.className = "Changed.Class";
    values.values[field.id] = "Changed";

    expect(item.primaryKey.className).to.equal("BisCore.Element");
    expect(item.getValue(field)).to.equal("Test");
  });
});
