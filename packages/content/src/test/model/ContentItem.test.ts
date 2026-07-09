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
  return { sources: [], fields: fieldMap, categories: {}, selectors: {} };
}

function createTestPropertyField(id: string): PropertyField {
  return {
    kind: "property",
    id,
    selectorId: id,
    label: id,
    type: { kind: "primitive", type: "String" },
    sourceClassName: "BisCore.Element",
    propertyName: id,
    pathFromTarget: [],
    valueClassNames: ["BisCore.Element"],
  };
}

describe("createContentItem", () => {
  it("returns value by field reference via getValue", () => {
    const field = createTestPropertyField("BisCore.Element.CodeValue");
    const descriptor = createTestDescriptor([field]);
    const contentValues: ContentValues = {
      primaryKey: { className: "BisCore.Element", id: "0x1" },
      values: { "BisCore.Element.CodeValue": "MyCode" },
    };

    const item = createContentItem({ descriptor, contentValues });

    expect(item.getValue(field)).to.equal("MyCode");
  });

  it("returns undefined for non-applicable field", () => {
    const field = createTestPropertyField("BisCore.Element.CodeValue");
    const otherField = createTestPropertyField("ProcessPhysical.Pump.FlowRate");
    const descriptor = createTestDescriptor([field, otherField]);
    const contentValues: ContentValues = {
      primaryKey: { className: "BisCore.Element", id: "0x1" },
      values: { "BisCore.Element.CodeValue": "MyCode" },
    };

    const item = createContentItem({ descriptor, contentValues });

    expect(item.getValue(otherField)).to.be.undefined;
  });
});
