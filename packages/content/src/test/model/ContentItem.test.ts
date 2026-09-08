/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createContentItem } from "../../content/model/ContentItem.js";
import { serializeRelationshipPath } from "../../content/model/Utils.js";

import type { InstanceKey, RelationshipPath } from "@itwin/presentation-shared";
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

function createTestPropertyField(id: string, overrides?: Partial<PropertyField>): PropertyField {
  return {
    kind: "property",
    id,
    selectorId: id,
    label: id,
    type: { kind: "primitive", type: "String" },
    propertyClassName: "BisCore.Element",
    propertyName: id,
    pathFromTarget: [],
    valueClassNames: ["BisCore.Element"],
    primaryClassNames: ["BisCore.Element"],
    pathCardinality: "one",
    ...overrides,
  };
}

const testPath: RelationshipPath = [
  {
    sourceClassName: "BisCore.Element",
    targetClassName: "BisCore.ElementAspect",
    relationshipName: "BisCore.ElementOwnsMultiAspects",
  },
];
const testPathKey = serializeRelationshipPath({ path: testPath });

describe("createContentItem", () => {
  it("returns value by field reference via getValue", () => {
    const field = createTestPropertyField("BisCore.Element.CodeValue");
    const descriptor = createTestDescriptor([field]);
    const contentValues: ContentValues = {
      primaryKey: { className: "BisCore.Element", id: "0x1" },
      values: { "BisCore.Element.CodeValue": "MyCode" },
      relatedInstances: {},
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
      relatedInstances: {},
    };

    const item = createContentItem({ descriptor, contentValues });

    expect(item.getValue(otherField)).to.be.undefined;
  });

  describe("getRelatedInstances", () => {
    it("aligns entries across multiple fields on the same many-cardinality path", () => {
      const nameField = createTestPropertyField("BisCore.ElementAspect.Name(path)", {
        propertyName: "Name",
        propertyClassName: "BisCore.ElementAspect",
        pathFromTarget: testPath,
        pathCardinality: "many",
        valueClassNames: ["BisCore.ElementAspect"],
      });
      const statusField = createTestPropertyField("BisCore.ElementAspect.Status(path)", {
        propertyName: "Status",
        propertyClassName: "BisCore.ElementAspect",
        pathFromTarget: testPath,
        pathCardinality: "many",
        valueClassNames: ["BisCore.ElementAspect"],
      });
      const descriptor = createTestDescriptor([nameField, statusField]);
      const aspect1: InstanceKey = { className: "BisCore.ElementAspect", id: "0x10" };
      const aspect2: InstanceKey = { className: "BisCore.ElementAspect", id: "0x11" };
      const contentValues: ContentValues = {
        primaryKey: { className: "BisCore.Element", id: "0x1" },
        values: { [nameField.id]: ["First", "Second"], [statusField.id]: ["Active", "Inactive"] },
        relatedInstances: { [testPathKey]: [{ key: aspect1 }, { key: aspect2 }] },
      };

      const item = createContentItem({ descriptor, contentValues });
      const entries = item.getRelatedInstances({ pathFromTarget: testPath });

      expect(entries).to.have.lengthOf(2);
      expect(entries[0].key).to.deep.equal(aspect1);
      expect(entries[0].getValue(nameField)).to.equal("First");
      expect(entries[0].getValue(statusField)).to.equal("Active");
      expect(entries[1].key).to.deep.equal(aspect2);
      expect(entries[1].getValue(nameField)).to.equal("Second");
      expect(entries[1].getValue(statusField)).to.equal("Inactive");
    });

    it("returns undefined for a null property hole on one instance", () => {
      const nameField = createTestPropertyField("BisCore.ElementAspect.Name(path)", {
        propertyName: "Name",
        propertyClassName: "BisCore.ElementAspect",
        pathFromTarget: testPath,
        pathCardinality: "many",
      });
      const descriptor = createTestDescriptor([nameField]);
      const contentValues: ContentValues = {
        primaryKey: { className: "BisCore.Element", id: "0x1" },
        values: { [nameField.id]: ["First", undefined] },
        relatedInstances: {
          [testPathKey]: [
            { key: { className: "BisCore.ElementAspect", id: "0x10" } },
            { key: { className: "BisCore.ElementAspect", id: "0x11" } },
          ],
        },
      };

      const item = createContentItem({ descriptor, contentValues });
      const entries = item.getRelatedInstances({ pathFromTarget: testPath });

      expect(entries[0].getValue(nameField)).to.equal("First");
      expect(entries[1].getValue(nameField)).to.be.undefined;
    });

    it("inlines the value for a single-instance ('one') path", () => {
      const nameField = createTestPropertyField("BisCore.UniqueAspect.Name(path)", {
        propertyName: "Name",
        propertyClassName: "BisCore.UniqueAspect",
        pathFromTarget: testPath,
        pathCardinality: "one",
      });
      const descriptor = createTestDescriptor([nameField]);
      const aspectKey: InstanceKey = { className: "BisCore.UniqueAspect", id: "0x20" };
      const contentValues: ContentValues = {
        primaryKey: { className: "BisCore.Element", id: "0x1" },
        values: { [nameField.id]: "OnlyOne" },
        relatedInstances: { [testPathKey]: [{ key: aspectKey }] },
      };

      const item = createContentItem({ descriptor, contentValues });
      const entries = item.getRelatedInstances({ pathFromTarget: testPath });

      expect(entries).to.have.lengthOf(1);
      expect(entries[0].getValue(nameField)).to.equal("OnlyOne");
    });

    it("exposes the relationship instance key for a relationship-class field", () => {
      const relField = createTestPropertyField("BisCore.ElementOwnsMultiAspects.Priority(path)", {
        propertyName: "Priority",
        propertyClassName: "BisCore.ElementOwnsMultiAspects",
        pathFromTarget: testPath,
        pathCardinality: "many",
      });
      const descriptor = createTestDescriptor([relField]);
      const aspectKey: InstanceKey = { className: "BisCore.ElementAspect", id: "0x10" };
      const relationshipKey: InstanceKey = { className: "BisCore.ElementOwnsMultiAspects", id: "0x99" };
      const contentValues: ContentValues = {
        primaryKey: { className: "BisCore.Element", id: "0x1" },
        values: { [relField.id]: [5] },
        relatedInstances: { [testPathKey]: [{ key: aspectKey, relationshipKey }] },
      };

      const item = createContentItem({ descriptor, contentValues });
      const entries = item.getRelatedInstances({ pathFromTarget: testPath });

      expect(entries[0].relationshipKey).to.deep.equal(relationshipKey);
      expect(entries[0].getValue(relField)).to.equal(5);
    });

    it("does not unwrap a genuine EC array property", () => {
      const arrayField = createTestPropertyField("BisCore.ElementAspect.Tags(path)", {
        propertyName: "Tags",
        propertyClassName: "BisCore.ElementAspect",
        pathFromTarget: testPath,
        pathCardinality: "one",
        type: { kind: "array", elementType: { kind: "primitive", type: "String" } },
      });
      const descriptor = createTestDescriptor([arrayField]);
      const contentValues: ContentValues = {
        primaryKey: { className: "BisCore.Element", id: "0x1" },
        values: { [arrayField.id]: ["tag1", "tag2"] },
        relatedInstances: { [testPathKey]: [{ key: { className: "BisCore.ElementAspect", id: "0x10" } }] },
      };

      const item = createContentItem({ descriptor, contentValues });
      const entries = item.getRelatedInstances({ pathFromTarget: testPath });

      expect(entries[0].getValue(arrayField)).to.deep.equal(["tag1", "tag2"]);
    });

    it("returns undefined when a many-cardinality field's stored value isn't array-shaped", () => {
      const nameField = createTestPropertyField("BisCore.ElementAspect.Name(path)", {
        propertyName: "Name",
        propertyClassName: "BisCore.ElementAspect",
        pathFromTarget: testPath,
        pathCardinality: "many",
      });
      const descriptor = createTestDescriptor([nameField]);
      const contentValues: ContentValues = {
        primaryKey: { className: "BisCore.Element", id: "0x1" },
        values: { [nameField.id]: "NotAnArray" },
        relatedInstances: { [testPathKey]: [{ key: { className: "BisCore.ElementAspect", id: "0x10" } }] },
      };

      const item = createContentItem({ descriptor, contentValues });
      const entries = item.getRelatedInstances({ pathFromTarget: testPath });

      expect(entries[0].getValue(nameField)).to.be.undefined;
    });

    it("returns an empty array for an unknown path", () => {
      const otherPath: RelationshipPath = [
        {
          sourceClassName: "BisCore.Element",
          targetClassName: "BisCore.ElementUniqueAspect",
          relationshipName: "BisCore.ElementOwnsUniqueAspect",
        },
      ];
      const nameField = createTestPropertyField("BisCore.ElementAspect.Name(path)", {
        propertyName: "Name",
        propertyClassName: "BisCore.ElementAspect",
        pathFromTarget: testPath,
        pathCardinality: "many",
      });
      const descriptor = createTestDescriptor([nameField]);
      const contentValues: ContentValues = {
        primaryKey: { className: "BisCore.Element", id: "0x1" },
        values: { [nameField.id]: ["First"] },
        relatedInstances: { [testPathKey]: [{ key: { className: "BisCore.ElementAspect", id: "0x10" } }] },
      };

      const item = createContentItem({ descriptor, contentValues });

      expect(item.getRelatedInstances({ pathFromTarget: otherPath })).to.have.lengthOf(0);
    });

    it("returns undefined for a field not on the path", () => {
      const otherPath: RelationshipPath = [
        {
          sourceClassName: "BisCore.Element",
          targetClassName: "BisCore.ElementUniqueAspect",
          relationshipName: "BisCore.ElementOwnsUniqueAspect",
        },
      ];
      const nameField = createTestPropertyField("BisCore.ElementAspect.Name(path)", {
        propertyName: "Name",
        propertyClassName: "BisCore.ElementAspect",
        pathFromTarget: testPath,
        pathCardinality: "many",
      });
      const unrelatedField = createTestPropertyField("BisCore.ElementUniqueAspect.Note", {
        propertyName: "Note",
        propertyClassName: "BisCore.ElementUniqueAspect",
        pathFromTarget: otherPath,
        pathCardinality: "one",
      });
      const descriptor = createTestDescriptor([nameField, unrelatedField]);
      const contentValues: ContentValues = {
        primaryKey: { className: "BisCore.Element", id: "0x1" },
        values: { [nameField.id]: ["First"] },
        relatedInstances: { [testPathKey]: [{ key: { className: "BisCore.ElementAspect", id: "0x10" } }] },
      };

      const item = createContentItem({ descriptor, contentValues });
      const entries = item.getRelatedInstances({ pathFromTarget: testPath });

      expect(entries[0].getValue(unrelatedField)).to.be.undefined;
    });

    it("resolves to the same entries via a field and its equivalent path", () => {
      const nameField = createTestPropertyField("BisCore.ElementAspect.Name(path)", {
        propertyName: "Name",
        propertyClassName: "BisCore.ElementAspect",
        pathFromTarget: testPath,
        pathCardinality: "many",
      });
      const descriptor = createTestDescriptor([nameField]);
      const aspectKey: InstanceKey = { className: "BisCore.ElementAspect", id: "0x10" };
      const contentValues: ContentValues = {
        primaryKey: { className: "BisCore.Element", id: "0x1" },
        values: { [nameField.id]: ["First"] },
        relatedInstances: { [testPathKey]: [{ key: aspectKey }] },
      };

      const item = createContentItem({ descriptor, contentValues });
      const byField = item.getRelatedInstances(nameField);
      const byPath = item.getRelatedInstances({ pathFromTarget: testPath });

      expect(byField).to.have.lengthOf(1);
      expect(byPath).to.have.lengthOf(1);
      expect(byField[0].key).to.deep.equal(byPath[0].key);
      expect(byField[0].getValue(nameField)).to.equal(byPath[0].getValue(nameField));
    });
  });
});
