/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createClassPropertyFields } from "../../content/descriptor-building/ClassPropertyFields.js";
import { PropertyField } from "../../content/model/Field.js";
import { createEntityClass, createPrimitiveProperty, createSchemaAccess } from "../MetadataStubs.js";

import type { EC, RelationshipPath } from "@itwin/presentation-shared";

const path: RelationshipPath = [
  { sourceClassName: "TestSchema.A", targetClassName: "TestSchema.B", relationshipName: "TestSchema.AtoB" },
];

function createSingleClassIModelAccess(fullName: EC.FullClassName, properties: EC.Property[]) {
  return createSchemaAccess([createEntityClass({ fullName, properties })]);
}

describe("createClassPropertyFields", () => {
  it("enumerates all selected properties with the given path and value classes", async () => {
    const imodelAccess = createSingleClassIModelAccess("TestSchema.B", [
      createPrimitiveProperty({ name: "Prop", primitiveType: "String", declaringClassName: "TestSchema.B" }),
    ]);

    const fields = await createClassPropertyFields({
      imodelAccess,
      className: "TestSchema.B",
      pathFromTarget: path,
      valueClassNames: ["TestSchema.B"],
      spec: { select: "all" },
    });

    expect(fields).to.deep.equal([
      {
        kind: "property",
        id: PropertyField.computeId({ propertyClassName: "TestSchema.B", propertyName: "Prop", pathFromTarget: path }),
        selectorId: PropertyField.computeId({
          propertyClassName: "TestSchema.B",
          propertyName: "Prop",
          pathFromTarget: path,
        }),
        label: "Prop",
        type: { kind: "primitive", type: "String" },
        propertyClassName: "TestSchema.B",
        propertyName: "Prop",
        pathFromTarget: path,
        valueClassNames: ["TestSchema.B"],
      },
    ]);
  });

  it("resolves label from override, then property label, then property name", async () => {
    const imodelAccess = createSingleClassIModelAccess("TestSchema.C", [
      createPrimitiveProperty({ name: "alpha", declaringClassName: "TestSchema.C" }),
      createPrimitiveProperty({ name: "beta", label: "Prop Beta", declaringClassName: "TestSchema.C" }),
      createPrimitiveProperty({ name: "gamma", label: "Prop Gamma", declaringClassName: "TestSchema.C" }),
    ]);

    const fields = await createClassPropertyFields({
      imodelAccess,
      className: "TestSchema.C",
      pathFromTarget: [],
      valueClassNames: ["TestSchema.C"],
      spec: { select: "all", overrides: { gamma: { label: "Override Gamma" } } },
    });

    expect(fields.map((f) => f.label)).to.deep.equal(["alpha", "Prop Beta", "Override Gamma"]);
  });

  it("skips properties whose value type is unsupported", async () => {
    const imodelAccess = createSingleClassIModelAccess("TestSchema.C", [
      createPrimitiveProperty({ name: "A", declaringClassName: "TestSchema.C" }),
      createPrimitiveProperty({ name: "Geom", primitiveType: "IGeometry", declaringClassName: "TestSchema.C" }),
    ]);

    const fields = await createClassPropertyFields({
      imodelAccess,
      className: "TestSchema.C",
      pathFromTarget: [],
      valueClassNames: ["TestSchema.C"],
      spec: { select: "all" },
    });

    expect(fields.map((f) => f.propertyName)).to.deep.equal(["A"]);
  });

  it("attributes a property to its declaring class", async () => {
    const imodelAccess = createSingleClassIModelAccess("TestSchema.Derived", [
      createPrimitiveProperty({ name: "UserLabel", declaringClassName: "BisCore.Element" }),
    ]);

    const [field] = await createClassPropertyFields({
      imodelAccess,
      className: "TestSchema.Derived",
      pathFromTarget: [],
      valueClassNames: ["TestSchema.Derived"],
      spec: { select: "all" },
    });

    expect(field.propertyClassName).to.equal("BisCore.Element");
    expect(field.id).to.equal("BisCore.Element.UserLabel");
  });

  describe("select", () => {
    async function selectNames(select: NonNullable<Parameters<typeof createClassPropertyFields>[0]["spec"]>["select"]) {
      const fields = await createClassPropertyFields({
        imodelAccess: createSingleClassIModelAccess("TestSchema.C", [
          createPrimitiveProperty({ name: "A", declaringClassName: "TestSchema.C" }),
          createPrimitiveProperty({ name: "B", declaringClassName: "TestSchema.C" }),
          createPrimitiveProperty({ name: "C", declaringClassName: "TestSchema.C" }),
        ]),
        className: "TestSchema.C",
        pathFromTarget: [],
        valueClassNames: ["TestSchema.C"],
        spec: { select },
      });
      return fields.map((f) => f.propertyName);
    }

    it("includes all with 'all'", async () => {
      expect(await selectNames("all")).to.deep.equal(["A", "B", "C"]);
    });

    it("includes none with 'none'", async () => {
      expect(await selectNames("none")).to.deep.equal([]);
    });

    it("includes only listed with 'include'", async () => {
      expect(await selectNames({ include: ["A", "C"] })).to.deep.equal(["A", "C"]);
    });

    it("includes all except listed with 'exclude'", async () => {
      expect(await selectNames({ exclude: ["B"] })).to.deep.equal(["A", "C"]);
    });
  });

  describe("overrides", () => {
    it("applies default overrides to every selected property", async () => {
      const imodelAccess = createSingleClassIModelAccess("TestSchema.C", [
        createPrimitiveProperty({ name: "A", declaringClassName: "TestSchema.C" }),
        createPrimitiveProperty({ name: "B", declaringClassName: "TestSchema.C" }),
      ]);

      const fields = await createClassPropertyFields({
        imodelAccess,
        className: "TestSchema.C",
        pathFromTarget: [],
        valueClassNames: ["TestSchema.C"],
        spec: { select: "all", defaultOverrides: { readOnly: true, categoryId: "cat", hidden: true } },
      });

      for (const field of fields) {
        expect(field.readOnly).to.equal(true);
        expect(field.categoryId).to.equal("cat");
        expect(field.hidden).to.equal(true);
      }
    });

    it("lets per-property overrides take precedence over default overrides", async () => {
      const imodelAccess = createSingleClassIModelAccess("TestSchema.C", [
        createPrimitiveProperty({ name: "alpha", declaringClassName: "TestSchema.C" }),
        createPrimitiveProperty({ name: "beta", declaringClassName: "TestSchema.C" }),
      ]);

      const fields = await createClassPropertyFields({
        imodelAccess,
        className: "TestSchema.C",
        pathFromTarget: [],
        valueClassNames: ["TestSchema.C"],
        spec: {
          select: "all",
          defaultOverrides: { categoryId: "default", readOnly: true },
          overrides: { alpha: { categoryId: "custom", label: "Custom Alpha" } },
        },
      });

      const [alpha, beta] = fields;
      expect(alpha.categoryId).to.equal("custom");
      expect(alpha.label).to.equal("Custom Alpha");
      expect(alpha.readOnly).to.equal(true);
      expect(beta.categoryId).to.equal("default");
      expect(beta.readOnly).to.equal(true);
    });

    it("omits categoryId/readOnly/hidden when no override provides them", async () => {
      const imodelAccess = createSingleClassIModelAccess("TestSchema.C", [
        createPrimitiveProperty({ name: "A", declaringClassName: "TestSchema.C" }),
      ]);

      const [field] = await createClassPropertyFields({
        imodelAccess,
        className: "TestSchema.C",
        pathFromTarget: [],
        valueClassNames: ["TestSchema.C"],
        spec: { select: "all" },
      });

      expect(field).to.not.have.property("categoryId");
      expect(field).to.not.have.property("readOnly");
      expect(field).to.not.have.property("hidden");
    });
  });
});
