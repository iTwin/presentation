/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createPropertyFields } from "../../content/definition-building/ClassPropertyFields.js";
import { PropertyField } from "../../content/model/Field.js";
import { createPrimitiveProperty } from "../MetadataStubs.js";

import type { Props, RelationshipPath } from "@itwin/presentation-shared";

const path: RelationshipPath = [
  { sourceClassName: "TestSchema.A", targetClassName: "TestSchema.B", relationshipName: "TestSchema.AtoB" },
];

/** Calls the function and returns just the produced fields (dropping category facts). */
function collectFields(props: Omit<Props<typeof createPropertyFields>, "anchor">): PropertyField[] {
  return createPropertyFields({ ...props, anchor: "none" }).map(({ field }) => field);
}

describe("createPropertyFields", () => {
  it("enumerates all selected properties with the given path and value classes", () => {
    const fields = collectFields({
      properties: [createPrimitiveProperty({ name: "Prop", primitiveType: "String", declaringClass: "TestSchema.B" })],
      relationshipInfo: { pathFromTarget: path, pathCardinality: "one", primaryClassNames: ["TestSchema.A"] },
      valueClassNames: ["TestSchema.B"],
      spec: { select: "all" },
    });

    expect(fields).to.deep.equal([
      {
        kind: "property",
        id: PropertyField.computeId({ propertyClassName: "TestSchema.B", propertyName: "Prop", pathFromTarget: path }),
        label: "Prop",
        type: { kind: "primitive", type: "String" },
        propertyClassName: "TestSchema.B",
        propertyName: "Prop",
        pathFromTarget: path,
        valueClassNames: ["TestSchema.B"],
        primaryClassNames: ["TestSchema.A"],
        pathCardinality: "one",
      },
    ]);
  });

  it("reports a many-valued path without changing the property's value shape", () => {
    const [field] = collectFields({
      properties: [createPrimitiveProperty({ name: "Prop", primitiveType: "String", declaringClass: "TestSchema.B" })],
      relationshipInfo: { pathFromTarget: path, pathCardinality: "many", primaryClassNames: ["TestSchema.A"] },
      valueClassNames: ["TestSchema.B"],
      spec: { select: "all" },
    });

    expect(field.pathCardinality).to.equal("many");
    expect(field.type).to.deep.equal({ kind: "primitive", type: "String" });
  });

  it.each([
    ["targetClass", "target"],
    ["relationshipClass", "relationship"],
  ] as const)("reports the related property's class kind for %s fields", (anchor, propertyClassKind) => {
    const [field] = createPropertyFields({
      properties: [createPrimitiveProperty({ name: "Prop", primitiveType: "String", declaringClass: "TestSchema.B" })],
      relationshipInfo: { pathFromTarget: path, pathCardinality: "one", primaryClassNames: ["TestSchema.A"] },
      valueClassNames: ["TestSchema.B"],
      spec: { select: "all" },
      anchor,
    }).map(({ field: result }) => result);

    expect(field.propertyClassKind).to.equal(propertyClassKind);
  });

  it("resolves label from override, then property label, then property name", () => {
    const fields = collectFields({
      properties: [
        createPrimitiveProperty({ name: "alpha", declaringClass: "TestSchema.C" }),
        createPrimitiveProperty({ name: "beta", label: "Prop Beta", declaringClass: "TestSchema.C" }),
        createPrimitiveProperty({ name: "gamma", label: "Prop Gamma", declaringClass: "TestSchema.C" }),
      ],
      valueClassNames: ["TestSchema.C"],
      relationshipInfo: undefined,
      spec: { select: "all", overrides: { gamma: { label: "Override Gamma" } } },
    });

    expect(fields.map((f) => f.label)).to.deep.equal(["alpha", "Prop Beta", "Override Gamma"]);
  });

  it("skips properties whose value type is unsupported", () => {
    const fields = collectFields({
      properties: [
        createPrimitiveProperty({ name: "A", declaringClass: "TestSchema.C" }),
        createPrimitiveProperty({ name: "Geom", primitiveType: "IGeometry", declaringClass: "TestSchema.C" }),
      ],
      valueClassNames: ["TestSchema.C"],
      relationshipInfo: undefined,
      spec: { select: "all" },
    });

    expect(fields.map((f) => f.propertyName)).to.deep.equal(["A"]);
  });

  it("attributes a property to its declaring class", () => {
    const [field] = collectFields({
      properties: [createPrimitiveProperty({ name: "UserLabel", declaringClass: "BisCore.Element" })],
      valueClassNames: ["TestSchema.Derived"],
      relationshipInfo: undefined,
      spec: { select: "all" },
    });

    expect(field.propertyClassName).to.equal("BisCore.Element");
    expect(field.id).to.equal("BisCore.Element.UserLabel");
  });

  describe("select", () => {
    function selectNames(select: Props<typeof createPropertyFields>["spec"]["select"]) {
      const fields = collectFields({
        properties: [
          createPrimitiveProperty({ name: "A", declaringClass: "TestSchema.C" }),
          createPrimitiveProperty({ name: "B", declaringClass: "TestSchema.C" }),
          createPrimitiveProperty({ name: "C", declaringClass: "TestSchema.C" }),
        ],
        valueClassNames: ["TestSchema.C"],
        relationshipInfo: undefined,
        spec: { select },
      });
      return fields.map((f) => f.propertyName);
    }

    it("includes all with 'all'", () => {
      expect(selectNames("all")).to.deep.equal(["A", "B", "C"]);
    });

    it("includes none with 'none'", () => {
      expect(selectNames("none")).to.deep.equal([]);
    });

    it("includes only listed with 'include'", () => {
      expect(selectNames({ include: ["A", "C"] })).to.deep.equal(["A", "C"]);
    });

    it("includes all except listed with 'exclude'", () => {
      expect(selectNames({ exclude: ["B"] })).to.deep.equal(["A", "C"]);
    });
  });

  describe("overrides", () => {
    it("applies default overrides to every selected property", () => {
      const results = createPropertyFields({
        properties: [
          createPrimitiveProperty({ name: "A", declaringClass: "TestSchema.C" }),
          createPrimitiveProperty({ name: "B", declaringClass: "TestSchema.C" }),
        ],
        valueClassNames: ["TestSchema.C"],
        relationshipInfo: undefined,
        spec: { select: "all", defaultOverrides: { readOnly: true, categoryId: "cat", hidden: true } },
        anchor: "targetClass",
      });

      for (const { field, categorization } of results) {
        expect(field.readOnly).to.equal(true);
        expect(field.hidden).to.equal(true);
        expect(categorization.category).to.deep.equal({ source: "override", id: "cat" });
      }
    });

    it("lets per-property overrides take precedence over default overrides", () => {
      const results = createPropertyFields({
        properties: [
          createPrimitiveProperty({ name: "alpha", declaringClass: "TestSchema.C" }),
          createPrimitiveProperty({ name: "beta", declaringClass: "TestSchema.C" }),
        ],
        valueClassNames: ["TestSchema.C"],
        relationshipInfo: undefined,
        spec: {
          select: "all",
          defaultOverrides: { categoryId: "default", readOnly: true },
          overrides: { alpha: { categoryId: "custom", label: "Custom Alpha" } },
        },
        anchor: "targetClass",
      });

      const [alpha, beta] = results;
      expect(alpha.categorization.category).to.deep.equal({ source: "override", id: "custom" });
      expect(alpha.field.label).to.equal("Custom Alpha");
      expect(alpha.field.readOnly).to.equal(true);
      expect(beta.categorization.category).to.deep.equal({ source: "override", id: "default" });
      expect(beta.field.readOnly).to.equal(true);
    });

    it("omits categoryId/readOnly/hidden when no override provides them", () => {
      const [field] = collectFields({
        properties: [createPrimitiveProperty({ name: "A", declaringClass: "TestSchema.C" })],
        valueClassNames: ["TestSchema.C"],
        relationshipInfo: undefined,
        spec: { select: "all" },
      });

      expect(field).to.not.have.property("categoryId");
      expect(field).to.not.have.property("readOnly");
      expect(field).to.not.have.property("hidden");
    });
  });

  describe("category facts", () => {
    it("reports the EC schema property category", () => {
      const [{ categorization }] = createPropertyFields({
        properties: [
          createPrimitiveProperty({
            name: "A",
            declaringClass: "TestSchema.C",
            category: { fullName: "TestSchema.GeometryClass", label: "Geometry" },
          }),
        ],
        valueClassNames: ["TestSchema.C"],
        relationshipInfo: undefined,
        spec: { select: "all" },
        anchor: "none",
      });

      expect(categorization).to.deep.equal({
        anchor: "none",
        category: { source: "schema", id: "TestSchema.GeometryClass", label: "Geometry" },
      });
    });

    it("falls back to the schema category's name when it has no label", () => {
      const [{ categorization }] = createPropertyFields({
        properties: [
          createPrimitiveProperty({
            name: "A",
            declaringClass: "TestSchema.C",
            category: { fullName: "TestSchema.GeometryClass" },
          }),
        ],
        valueClassNames: ["TestSchema.C"],
        relationshipInfo: undefined,
        spec: { select: "all" },
        anchor: "targetClass",
      });

      expect(categorization).to.deep.equal({
        anchor: "targetClass",
        category: { source: "schema", id: "TestSchema.GeometryClass", label: "GeometryClass" },
      });
    });

    it("reports a spec override in place of the schema property category", () => {
      const [{ categorization }] = createPropertyFields({
        properties: [
          createPrimitiveProperty({
            name: "prop",
            declaringClass: "TestSchema.C",
            category: { fullName: "TestSchema.Geometry", label: "Geometry" },
          }),
        ],
        valueClassNames: ["TestSchema.C"],
        relationshipInfo: undefined,
        spec: { select: "all", overrides: { prop: { categoryId: "custom" } } },
        anchor: "none",
      });

      expect(categorization).to.deep.equal({ anchor: "none", category: { source: "override", id: "custom" } });
    });

    it("reports no schema category or override when the property has neither", () => {
      const [{ categorization }] = createPropertyFields({
        properties: [createPrimitiveProperty({ name: "A", declaringClass: "TestSchema.C" })],
        valueClassNames: ["TestSchema.C"],
        relationshipInfo: undefined,
        spec: { select: "all" },
        anchor: "relationshipClass",
      });

      expect(categorization).to.deep.equal({ anchor: "relationshipClass" });
    });
  });
});
