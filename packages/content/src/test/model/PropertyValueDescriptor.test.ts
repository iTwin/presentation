/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { createValueDescriptorFromProperty } from "../../content/model/PropertyValueDescriptor.js";
import { createPrimitiveProperty } from "../MetadataStubs.js";

import type { EC } from "@itwin/presentation-shared";

function createEnumerationProperty(props: {
  name: string;
  type: "String" | "Number";
  array?: boolean;
  enumeration?: Partial<EC.Enumeration>;
  /** When true, the property's `enumeration` promise resolves to `undefined` (unresolved reference). */
  missing?: boolean;
}): EC.Property {
  const enumeration = {
    fullName: "TestSchema.TestEnum",
    isStrict: true,
    type: props.type,
    enumerators: [],
    ...props.enumeration,
  } as unknown as EC.Enumeration;
  return {
    name: props.name,
    class: {} as EC.Class,
    kindOfQuantity: Promise.resolve(undefined),
    isArray: () => props.array ?? false,
    isStruct: () => false,
    isPrimitive: () => false,
    isEnumeration: () => true,
    isNavigation: () => false,
    enumeration: Promise.resolve(props.missing ? undefined : enumeration),
    getCustomAttributes: async () => ({}) as EC.CustomAttributeSet,
  } as unknown as EC.Property;
}

function createStructProperty(props: { name: string; members: EC.Property[]; array?: boolean }): EC.Property {
  return {
    name: props.name,
    class: {} as EC.Class,
    kindOfQuantity: Promise.resolve(undefined),
    isArray: () => props.array ?? false,
    isStruct: () => true,
    isPrimitive: () => false,
    isEnumeration: () => false,
    isNavigation: () => false,
    structClass: { getProperties: async () => props.members } as unknown as EC.StructClass,
    getCustomAttributes: async () => ({}) as EC.CustomAttributeSet,
  } as unknown as EC.Property;
}

function createNavigationProperty(props: {
  name: string;
  direction: "Forward" | "Backward";
  sourceClassName?: EC.FullClassNameDotNotation;
  targetClassName?: EC.FullClassNameDotNotation;
}): EC.Property {
  const constraint = (className: EC.FullClassNameDotNotation | undefined): EC.RelationshipConstraint =>
    ({
      abstractConstraint: Promise.resolve(
        className ? ({ fullName: className } as unknown as EC.EntityClass) : undefined,
      ),
    }) as unknown as EC.RelationshipConstraint;
  return {
    name: props.name,
    class: {} as EC.Class,
    kindOfQuantity: Promise.resolve(undefined),
    isArray: () => false,
    isStruct: () => false,
    isPrimitive: () => false,
    isEnumeration: () => false,
    isNavigation: () => true,
    direction: props.direction,
    relationshipClass: Promise.resolve({
      source: constraint(props.sourceClassName),
      target: constraint(props.targetClassName),
    } as unknown as EC.RelationshipClass),
    getCustomAttributes: async () => ({}) as EC.CustomAttributeSet,
  } as unknown as EC.Property;
}

describe("createValueDescriptorFromProperty", () => {
  describe("primitive properties", () => {
    it("maps a string property", async () => {
      const result = await createValueDescriptorFromProperty(
        createPrimitiveProperty({ name: "Code", primitiveType: "String" }),
      );
      expect(result).to.deep.equal({ kind: "primitive", type: "String" });
    });

    it("maps a boolean property", async () => {
      const result = await createValueDescriptorFromProperty(
        createPrimitiveProperty({ name: "IsPrivate", primitiveType: "Boolean" }),
      );
      expect(result).to.deep.equal({ kind: "primitive", type: "Boolean" });
    });

    it("attaches kind of quantity to a numeric property", async () => {
      const result = await createValueDescriptorFromProperty(
        createPrimitiveProperty({ name: "Length", primitiveType: "Double", koq: "Units.LENGTH" }),
      );
      expect(result).to.deep.equal({ kind: "primitive", type: "Double", kindOfQuantity: "Units.LENGTH" });
    });

    it("attaches kind of quantity to an integer property", async () => {
      const result = await createValueDescriptorFromProperty(
        createPrimitiveProperty({ name: "Count", primitiveType: "Integer", koq: "Units.MONETARY" }),
      );
      expect(result).to.deep.equal({ kind: "primitive", type: "Integer", kindOfQuantity: "Units.MONETARY" });
    });

    it("omits kind of quantity when a numeric property has none", async () => {
      const result = await createValueDescriptorFromProperty(
        createPrimitiveProperty({ name: "Count", primitiveType: "Integer" }),
      );
      expect(result).to.deep.equal({ kind: "primitive", type: "Integer" });
    });

    it("returns undefined for Binary", async () => {
      const result = await createValueDescriptorFromProperty(
        createPrimitiveProperty({ name: "Data", primitiveType: "Binary" }),
      );
      expect(result).to.be.undefined;
    });

    it("returns undefined for IGeometry", async () => {
      const result = await createValueDescriptorFromProperty(
        createPrimitiveProperty({ name: "Geometry", primitiveType: "IGeometry" }),
      );
      expect(result).to.be.undefined;
    });
  });

  describe("enumeration properties", () => {
    it("maps a string-backed enumeration to a string primitive", async () => {
      const result = await createValueDescriptorFromProperty(
        createEnumerationProperty({ name: "Status", type: "String" }),
      );
      expect(result).to.deep.equal({
        kind: "primitive",
        type: "String",
        enumeration: { name: "TestSchema.TestEnum", isStrict: true, enumerators: [] },
      });
    });

    it("maps a number-backed enumeration to an integer primitive, preserving enumerators", async () => {
      const result = await createValueDescriptorFromProperty(
        createEnumerationProperty({
          name: "Level",
          type: "Number",
          enumeration: {
            fullName: "TestSchema.TestEnum",
            isStrict: true,
            enumerators: [
              { name: "Low", value: 1, label: "Low Level" },
              { name: "High", value: 2 },
            ],
          } as unknown as Partial<EC.Enumeration>,
        }),
      );
      expect(result).to.deep.equal({
        kind: "primitive",
        type: "Integer",
        enumeration: {
          name: "TestSchema.TestEnum",
          isStrict: true,
          enumerators: [
            { value: 1, label: "Low Level" },
            { value: 2, label: "High" },
          ],
        },
      });
    });

    it("falls back to a plain string primitive when the enumeration cannot be resolved", async () => {
      const result = await createValueDescriptorFromProperty(
        createEnumerationProperty({ name: "Status", type: "String", missing: true }),
      );
      expect(result).to.deep.equal({ kind: "primitive", type: "String" });
    });

    it("preserves enumerator metadata, falling back to the enumerator name for a missing label", async () => {
      const result = await createValueDescriptorFromProperty(
        createEnumerationProperty({
          name: "Status",
          type: "String",
          enumeration: {
            fullName: "MySchema.StatusEnum",
            isStrict: false,
            enumerators: [
              { name: "Active", value: "A", label: "Is Active", description: "Currently active" },
              { name: "Inactive", value: "I" },
            ],
          } as unknown as Partial<EC.Enumeration>,
        }),
      );
      expect(result).to.deep.equal({
        kind: "primitive",
        type: "String",
        enumeration: {
          name: "MySchema.StatusEnum",
          isStrict: false,
          enumerators: [
            { value: "A", label: "Is Active", description: "Currently active" },
            { value: "I", label: "Inactive" },
          ],
        },
      });
    });
  });

  describe("struct properties", () => {
    it("maps struct members, skipping unsupported ones", async () => {
      const result = await createValueDescriptorFromProperty(
        createStructProperty({
          name: "Origin",
          members: [
            createPrimitiveProperty({ name: "X", primitiveType: "Double" }),
            createPrimitiveProperty({ name: "Label", primitiveType: "String", label: "Display Label" }),
            createPrimitiveProperty({ name: "Blob", primitiveType: "Binary" }),
          ],
        }),
      );
      expect(result).to.deep.equal({
        kind: "struct",
        members: [
          { name: "X", label: "X", type: { kind: "primitive", type: "Double" } },
          { name: "Label", label: "Display Label", type: { kind: "primitive", type: "String" } },
        ],
      });
    });
  });

  describe("navigation properties", () => {
    it("uses the target constraint for a forward navigation", async () => {
      const result = await createValueDescriptorFromProperty(
        createNavigationProperty({
          name: "Model",
          direction: "Forward",
          sourceClassName: "BisCore.Element",
          targetClassName: "BisCore.Model",
        }),
      );
      expect(result).to.deep.equal({ kind: "navigation", targetClassName: "BisCore.Model" });
    });

    it("uses the source constraint for a backward navigation", async () => {
      const result = await createValueDescriptorFromProperty(
        createNavigationProperty({
          name: "Parent",
          direction: "Backward",
          sourceClassName: "BisCore.Element",
          targetClassName: "BisCore.Model",
        }),
      );
      expect(result).to.deep.equal({ kind: "navigation", targetClassName: "BisCore.Element" });
    });

    it("returns undefined when the constraint class cannot be resolved", async () => {
      const result = await createValueDescriptorFromProperty(
        createNavigationProperty({ name: "Model", direction: "Forward" }),
      );
      expect(result).to.be.undefined;
    });
  });

  describe("array properties", () => {
    it("wraps a primitive element type", async () => {
      const result = await createValueDescriptorFromProperty(
        createPrimitiveProperty({ name: "Tags", primitiveType: "String", array: true }),
      );
      expect(result).to.deep.equal({ kind: "array", elementType: { kind: "primitive", type: "String" } });
    });

    it("wraps an enumeration element type", async () => {
      const result = await createValueDescriptorFromProperty(
        createEnumerationProperty({ name: "Levels", type: "Number", array: true }),
      );
      expect(result).to.deep.equal({
        kind: "array",
        elementType: {
          kind: "primitive",
          type: "Integer",
          enumeration: { name: "TestSchema.TestEnum", isStrict: true, enumerators: [] },
        },
      });
    });

    it("wraps a struct element type", async () => {
      const result = await createValueDescriptorFromProperty(
        createStructProperty({
          name: "Points",
          array: true,
          members: [createPrimitiveProperty({ name: "X", primitiveType: "Double" })],
        }),
      );
      expect(result).to.deep.equal({
        kind: "array",
        elementType: {
          kind: "struct",
          members: [{ name: "X", label: "X", type: { kind: "primitive", type: "Double" } }],
        },
      });
    });

    it("returns undefined when the element type is unsupported", async () => {
      const result = await createValueDescriptorFromProperty(
        createPrimitiveProperty({ name: "Blobs", primitiveType: "Binary", array: true }),
      );
      expect(result).to.be.undefined;
    });
  });

  it("returns undefined for a property that is none of the known kinds", async () => {
    const property = {
      name: "Unknown",
      class: {} as EC.Class,
      kindOfQuantity: Promise.resolve(undefined),
      isArray: () => false,
      isStruct: () => false,
      isPrimitive: () => false,
      isEnumeration: () => false,
      isNavigation: () => false,
      getCustomAttributes: async () => ({}) as EC.CustomAttributeSet,
    } as unknown as EC.Property;
    const result = await createValueDescriptorFromProperty(property);
    expect(result).to.be.undefined;
  });
});
