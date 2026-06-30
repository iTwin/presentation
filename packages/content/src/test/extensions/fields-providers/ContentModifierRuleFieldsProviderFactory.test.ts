/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { createFieldsProviderFromContentModifierRule } from "../../../content/extensions/fields-providers/ContentModifierRuleFieldsProviderFactory.js";

import type { EC, ECClassHierarchyInspector, ECSchemaProvider } from "@itwin/presentation-shared";
import type { ContentTarget } from "../../../content/ContentTarget.js";
import type { PresentationRules } from "../../../content/extensions/fields-providers/ContentModifierRuleFieldsProviderFactory.PresentationRules.js";

function createStubSchema(name: string, version: EC.SchemaVersion = { read: 1, write: 0, minor: 0 }): EC.Schema {
  return {
    name,
    version,
    getClass: vi.fn().mockResolvedValue(undefined),
    getCustomAttributes: vi.fn().mockResolvedValue(new Map()),
  };
}

function createStubClass(props: { schemaName: string; className: string; label?: string }): EC.Class {
  return {
    schema: createStubSchema(props.schemaName),
    fullName: `${props.schemaName}.${props.className}`,
    name: props.className,
    label: props.label,
    baseClass: Promise.resolve(undefined),
    is: vi.fn().mockResolvedValue(false),
    getProperty: vi.fn().mockResolvedValue(undefined),
    getProperties: vi.fn().mockResolvedValue([]),
    isEntityClass: () => true,
    isRelationshipClass: () => false,
    isStructClass: () => false,
    isMixin: () => false,
    getDerivedClasses: vi.fn().mockResolvedValue([]),
    getCustomAttributes: vi.fn().mockResolvedValue(new Map()),
  } as unknown as EC.Class;
}

function createStubRelationshipClass(props: {
  schemaName: string;
  className: string;
  label?: string;
  targetClass?: EC.Class;
  sourceClass?: EC.Class;
}): EC.RelationshipClass {
  return {
    schema: createStubSchema(props.schemaName),
    fullName: `${props.schemaName}.${props.className}`,
    name: props.className,
    label: props.label,
    baseClass: Promise.resolve(undefined),
    is: vi.fn().mockResolvedValue(false),
    getProperty: vi.fn().mockResolvedValue(undefined),
    getProperties: vi.fn().mockResolvedValue([]),
    isEntityClass: () => false,
    isRelationshipClass: () => true,
    isStructClass: () => false,
    isMixin: () => false,
    getDerivedClasses: vi.fn().mockResolvedValue([]),
    getCustomAttributes: vi.fn().mockResolvedValue(new Map()),
    direction: "Forward",
    source: {
      polymorphic: true,
      multiplicity: { lowerLimit: 0, upperLimit: 1 },
      abstractConstraint: Promise.resolve(props.sourceClass),
    },
    target: {
      polymorphic: true,
      multiplicity: { lowerLimit: 0, upperLimit: 1 },
      abstractConstraint: Promise.resolve(props.targetClass),
    },
  } as unknown as EC.RelationshipClass;
}

function createIModelAccess(props?: {
  schemas?: Map<string, EC.Schema>;
  classes?: Map<string, EC.Class>;
  classDerivesFrom?: ECClassHierarchyInspector["classDerivesFrom"];
}): ECSchemaProvider & ECClassHierarchyInspector {
  const schemas = props?.schemas ?? new Map();
  return {
    getSchema: vi.fn(async (name: string) => schemas.get(name)),
    classDerivesFrom: props?.classDerivesFrom ?? vi.fn(async () => false),
  };
}

function createTarget(primaryClass: EC.FullClassName = "TestSchema.TestElement"): ContentTarget {
  return { primaryClass };
}

describe("createFieldsProviderFromContentModifierRule", () => {
  describe("id generation", () => {
    it("generates a stable id from the rule content", () => {
      const rule: PresentationRules.ContentModifierRule = { calculatedProperties: [{ label: "X", value: "1+1" }] };
      const provider = createFieldsProviderFromContentModifierRule({ imodelAccess: createIModelAccess(), rule });
      expect(provider.id).toMatch(/^FieldsProviderFromContentModifierRule_[0-9a-f]{8}_v\d+$/);
    });

    it("generates different ids for different rules", () => {
      const imodelAccess = createIModelAccess();
      const provider1 = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: { calculatedProperties: [{ label: "A", value: "1" }] },
      });
      const provider2 = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: { calculatedProperties: [{ label: "B", value: "2" }] },
      });
      expect(provider1.id).not.toEqual(provider2.id);
    });

    it("generates the same id for the same rule", () => {
      const imodelAccess = createIModelAccess();
      const rule: PresentationRules.ContentModifierRule = { calculatedProperties: [{ label: "X", value: "1" }] };
      const provider1 = createFieldsProviderFromContentModifierRule({ imodelAccess, rule });
      const provider2 = createFieldsProviderFromContentModifierRule({ imodelAccess, rule });
      expect(provider1.id).toEqual(provider2.id);
    });
  });

  describe("priority", () => {
    it("uses the rule priority", () => {
      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess: createIModelAccess(),
        rule: { priority: 500 },
      });
      expect(provider.priority).toEqual(500);
    });

    it("is undefined when rule has no priority", () => {
      const provider = createFieldsProviderFromContentModifierRule({ imodelAccess: createIModelAccess(), rule: {} });
      expect(provider.priority).toBeUndefined();
    });
  });

  describe("requiredSchemas", () => {
    it("returns contribution when no requiredSchemas specified", async () => {
      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess: createIModelAccess(),
        rule: { calculatedProperties: [{ label: "X", value: "1" }] },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result).toBeDefined();
    });

    it("returns undefined when a required schema is missing", async () => {
      const imodelAccess = createIModelAccess({ schemas: new Map() });
      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: { requiredSchemas: [{ name: "MissingSchema" }] },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result).toBeUndefined();
    });

    describe("minVersion", () => {
      it("returns contribution when version equals minVersion", async () => {
        const schemas = new Map([["TestSchema", createStubSchema("TestSchema", { read: 1, write: 0, minor: 10 })]]);
        const imodelAccess = createIModelAccess({ schemas });
        const provider = createFieldsProviderFromContentModifierRule({
          imodelAccess,
          rule: {
            requiredSchemas: [{ name: "TestSchema", minVersion: "1.0.10" }],
            calculatedProperties: [{ label: "X", value: "1" }],
          },
        });
        const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
        expect(result).toBeDefined();
      });

      it("returns undefined when minor component is below minVersion", async () => {
        const schemas = new Map([["TestSchema", createStubSchema("TestSchema", { read: 1, write: 0, minor: 5 })]]);
        const imodelAccess = createIModelAccess({ schemas });
        const provider = createFieldsProviderFromContentModifierRule({
          imodelAccess,
          rule: { requiredSchemas: [{ name: "TestSchema", minVersion: "1.0.10" }] },
        });
        const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
        expect(result).toBeUndefined();
      });

      it("returns contribution when write component is above minVersion (taking precedence over lower minor)", async () => {
        const schemas = new Map([["TestSchema", createStubSchema("TestSchema", { read: 1, write: 2, minor: 0 })]]);
        const imodelAccess = createIModelAccess({ schemas });
        const provider = createFieldsProviderFromContentModifierRule({
          imodelAccess,
          rule: {
            requiredSchemas: [{ name: "TestSchema", minVersion: "1.1.99" }],
            calculatedProperties: [{ label: "X", value: "1" }],
          },
        });
        const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
        expect(result).toBeDefined();
      });

      it("returns undefined when write component is below minVersion (taking precedence over higher minor)", async () => {
        const schemas = new Map([["TestSchema", createStubSchema("TestSchema", { read: 1, write: 0, minor: 99 })]]);
        const imodelAccess = createIModelAccess({ schemas });
        const provider = createFieldsProviderFromContentModifierRule({
          imodelAccess,
          rule: { requiredSchemas: [{ name: "TestSchema", minVersion: "1.1.0" }] },
        });
        const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
        expect(result).toBeUndefined();
      });

      it("returns contribution when read component is above minVersion (write being equal)", async () => {
        const schemas = new Map([["TestSchema", createStubSchema("TestSchema", { read: 2, write: 0, minor: 0 })]]);
        const imodelAccess = createIModelAccess({ schemas });
        const provider = createFieldsProviderFromContentModifierRule({
          imodelAccess,
          rule: {
            requiredSchemas: [{ name: "TestSchema", minVersion: "1.0.99" }],
            calculatedProperties: [{ label: "X", value: "1" }],
          },
        });
        const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
        expect(result).toBeDefined();
      });

      it("returns undefined when read component is below minVersion (write being equal)", async () => {
        const schemas = new Map([["TestSchema", createStubSchema("TestSchema", { read: 0, write: 0, minor: 99 })]]);
        const imodelAccess = createIModelAccess({ schemas });
        const provider = createFieldsProviderFromContentModifierRule({
          imodelAccess,
          rule: { requiredSchemas: [{ name: "TestSchema", minVersion: "1.0.0" }] },
        });
        const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
        expect(result).toBeUndefined();
      });
    });

    describe("maxVersion", () => {
      it("returns contribution when version is below maxVersion", async () => {
        const schemas = new Map([["TestSchema", createStubSchema("TestSchema", { read: 1, write: 0, minor: 5 })]]);
        const imodelAccess = createIModelAccess({ schemas });
        const provider = createFieldsProviderFromContentModifierRule({
          imodelAccess,
          rule: {
            requiredSchemas: [{ name: "TestSchema", maxVersion: "1.0.10" }],
            calculatedProperties: [{ label: "X", value: "1" }],
          },
        });
        const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
        expect(result).toBeDefined();
      });

      it("returns undefined when version equals maxVersion (exclusive bound)", async () => {
        const schemas = new Map([["TestSchema", createStubSchema("TestSchema", { read: 1, write: 0, minor: 10 })]]);
        const imodelAccess = createIModelAccess({ schemas });
        const provider = createFieldsProviderFromContentModifierRule({
          imodelAccess,
          rule: { requiredSchemas: [{ name: "TestSchema", maxVersion: "1.0.10" }] },
        });
        const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
        expect(result).toBeUndefined();
      });

      it("returns undefined when minor component is above maxVersion", async () => {
        const schemas = new Map([["TestSchema", createStubSchema("TestSchema", { read: 1, write: 0, minor: 11 })]]);
        const imodelAccess = createIModelAccess({ schemas });
        const provider = createFieldsProviderFromContentModifierRule({
          imodelAccess,
          rule: { requiredSchemas: [{ name: "TestSchema", maxVersion: "1.0.10" }] },
        });
        const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
        expect(result).toBeUndefined();
      });

      it("returns contribution when write component is below maxVersion (taking precedence over higher minor)", async () => {
        const schemas = new Map([["TestSchema", createStubSchema("TestSchema", { read: 1, write: 0, minor: 99 })]]);
        const imodelAccess = createIModelAccess({ schemas });
        const provider = createFieldsProviderFromContentModifierRule({
          imodelAccess,
          rule: {
            requiredSchemas: [{ name: "TestSchema", maxVersion: "1.1.0" }],
            calculatedProperties: [{ label: "X", value: "1" }],
          },
        });
        const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
        expect(result).toBeDefined();
      });

      it("returns undefined when write component is above maxVersion (taking precedence over lower minor)", async () => {
        const schemas = new Map([["TestSchema", createStubSchema("TestSchema", { read: 1, write: 2, minor: 0 })]]);
        const imodelAccess = createIModelAccess({ schemas });
        const provider = createFieldsProviderFromContentModifierRule({
          imodelAccess,
          rule: { requiredSchemas: [{ name: "TestSchema", maxVersion: "1.1.99" }] },
        });
        const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
        expect(result).toBeUndefined();
      });

      it("returns contribution when read component is below maxVersion (write being equal)", async () => {
        const schemas = new Map([["TestSchema", createStubSchema("TestSchema", { read: 0, write: 0, minor: 99 })]]);
        const imodelAccess = createIModelAccess({ schemas });
        const provider = createFieldsProviderFromContentModifierRule({
          imodelAccess,
          rule: {
            requiredSchemas: [{ name: "TestSchema", maxVersion: "1.0.0" }],
            calculatedProperties: [{ label: "X", value: "1" }],
          },
        });
        const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
        expect(result).toBeDefined();
      });

      it("returns undefined when read component is above maxVersion (write being equal)", async () => {
        const schemas = new Map([["TestSchema", createStubSchema("TestSchema", { read: 2, write: 0, minor: 0 })]]);
        const imodelAccess = createIModelAccess({ schemas });
        const provider = createFieldsProviderFromContentModifierRule({
          imodelAccess,
          rule: { requiredSchemas: [{ name: "TestSchema", maxVersion: "1.0.99" }] },
        });
        const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
        expect(result).toBeUndefined();
      });
    });
  });

  describe("class matching", () => {
    it("matches all classes when rule.class is undefined", async () => {
      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess: createIModelAccess(),
        rule: { calculatedProperties: [{ label: "X", value: "1" }] },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result).toBeDefined();
    });

    it("returns undefined when classDerivesFrom returns false", async () => {
      const classDerivesFrom = vi.fn<ECClassHierarchyInspector["classDerivesFrom"]>().mockResolvedValue(false);
      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess: createIModelAccess({ classDerivesFrom }),
        rule: { class: { schemaName: "TestSchema", className: "BaseElement" } },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result).toBeUndefined();
      expect(classDerivesFrom).toHaveBeenCalledWith("TestSchema.TestElement", "TestSchema.BaseElement");
    });

    it("returns contribution when classDerivesFrom returns true", async () => {
      const classDerivesFrom = vi.fn<ECClassHierarchyInspector["classDerivesFrom"]>().mockResolvedValue(true);
      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess: createIModelAccess({ classDerivesFrom }),
        rule: {
          class: { schemaName: "TestSchema", className: "BaseElement" },
          calculatedProperties: [{ label: "X", value: "1" }],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result).toBeDefined();
      expect(classDerivesFrom).toHaveBeenCalledWith("TestSchema.TestElement", "TestSchema.BaseElement");
    });
  });

  describe("calculatedProperties", () => {
    it("maps calculated properties with default type (string)", async () => {
      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess: createIModelAccess(),
        rule: { calculatedProperties: [{ label: "Full Name", value: "this.FirstName || ' ' || this.LastName" }] },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result?.calculatedFields).toEqual([
        {
          id: "calc_0",
          label: "Full Name",
          expression: "this.FirstName || ' ' || this.LastName",
          type: { kind: "primitive", type: "String" },
          categoryId: undefined,
        },
      ]);
    });

    it("maps calculated property types correctly", async () => {
      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess: createIModelAccess(),
        rule: {
          calculatedProperties: [
            { label: "Description", value: "Blah", type: "string" },
            { label: "Count", value: "1", type: "int" },
            { label: "Total", value: "1.5", type: "double" },
            { label: "Id", value: "1", type: "long" },
            { label: "Flag", value: "true", type: "bool" },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result?.calculatedFields).toHaveLength(5);
      expect(result?.calculatedFields![0].type).toEqual({ kind: "primitive", type: "String" });
      expect(result?.calculatedFields![1].type).toEqual({ kind: "primitive", type: "Integer" });
      expect(result?.calculatedFields![2].type).toEqual({ kind: "primitive", type: "Double" });
      expect(result?.calculatedFields![3].type).toEqual({ kind: "primitive", type: "Long" });
      expect(result?.calculatedFields![4].type).toEqual({ kind: "primitive", type: "Boolean" });
    });

    it("maps categoryId from string", async () => {
      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess: createIModelAccess(),
        rule: { calculatedProperties: [{ label: "X", value: "1", categoryId: "my-cat" }] },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result?.calculatedFields![0].categoryId).toEqual("my-cat");
    });
  });

  describe("propertyCategories", () => {
    it("maps property categories", async () => {
      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess: createIModelAccess(),
        rule: {
          propertyCategories: [
            { id: "cat1", label: "Category 1", description: "Desc", parentId: "parent-cat" },
            { id: "cat2", label: "Category 2" },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result?.categories).toEqual({
        cat1: { id: "cat1", label: "Category 1", description: "Desc", parentId: "parent-cat" },
        cat2: { id: "cat2", label: "Category 2", description: undefined, parentId: undefined },
      });
    });
  });

  describe("relatedProperties", () => {
    function createIModelAccessWithRelationship(props: {
      relSchemaName: string;
      relClassName: string;
      relLabel?: string;
      targetSchemaName: string;
      targetClassName: string;
      targetLabel?: string;
    }) {
      const targetClass = createStubClass({
        schemaName: props.targetSchemaName,
        className: props.targetClassName,
        label: props.targetLabel,
      });
      const relClass = createStubRelationshipClass({
        schemaName: props.relSchemaName,
        className: props.relClassName,
        label: props.relLabel,
        targetClass,
      });

      const classes = new Map<string, EC.Class>([
        [`${props.relSchemaName}.${props.relClassName}`, relClass],
        [`${props.targetSchemaName}.${props.targetClassName}`, targetClass],
      ]);

      const getSchema = vi.fn(async (name: string) => {
        const schema: EC.Schema = {
          name,
          version: { read: 1, write: 0, minor: 0 },
          // Return the registered class, or synthesize a stub for any other requested class.
          getClass: vi.fn(
            async (className: string) =>
              classes.get(`${name}.${className}`) ?? createStubClass({ schemaName: name, className }),
          ),
          getCustomAttributes: vi.fn().mockResolvedValue(new Map()),
        };
        return schema;
      });

      return { getSchema, classDerivesFrom: vi.fn(async () => true) } as unknown as ECSchemaProvider &
        ECClassHierarchyInspector;
    }

    it("maps a single-step forward relationship without explicit target class", async () => {
      const imodelAccess = createIModelAccessWithRelationship({
        relSchemaName: "TestSchema",
        relClassName: "ElementOwnsChild",
        targetSchemaName: "TestSchema",
        targetClassName: "ChildElement",
      });

      const relSpec: PresentationRules.RelatedPropertiesSpecification = {
        propertiesSource: {
          relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
          direction: "Forward",
        },
        properties: "*",
      };

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: { relatedProperties: [relSpec] },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });

      expect(result?.relatedProperties).toHaveLength(1);
      const decl = result!.relatedProperties![0];
      expect(decl.path).toHaveLength(1);
      expect(decl.path[0].sourceClassName).toEqual("TestSchema.TestElement");
      expect(decl.path[0].targetClassName).toEqual("TestSchema.ChildElement");
      expect(decl.path[0].relationshipName).toEqual("TestSchema.ElementOwnsChild");
      expect(decl.path[0].relationshipReverse).toEqual(false);
    });

    it("maps backward relationship with relationshipReverse=true", async () => {
      const sourceClass = createStubClass({ schemaName: "TestSchema", className: "ParentElement", label: "Parent" });
      const relClass = createStubRelationshipClass({
        schemaName: "TestSchema",
        className: "ElementOwnsChild",
        sourceClass,
      });

      const classes = new Map<string, EC.Class>([
        ["TestSchema.ElementOwnsChild", relClass],
        ["TestSchema.ParentElement", sourceClass],
      ]);
      const getSchema = vi.fn(async (name: string) => ({
        name,
        version: { read: 1, write: 0, minor: 0 },
        getClass: vi.fn(async (className: string) => classes.get(`${name}.${className}`)),
        getCustomAttributes: vi.fn().mockResolvedValue(new Map()),
      }));
      const imodelAccess = { getSchema, classDerivesFrom: vi.fn(async () => true) } as unknown as ECSchemaProvider &
        ECClassHierarchyInspector;

      const relSpec: PresentationRules.RelatedPropertiesSpecification = {
        propertiesSource: {
          relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
          direction: "Backward",
        },
        properties: "*",
      };

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: { relatedProperties: [relSpec] },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result!.relatedProperties![0].path[0].relationshipReverse).toEqual(true);
    });

    it("uses explicit targetClass when provided", async () => {
      const imodelAccess = createIModelAccessWithRelationship({
        relSchemaName: "TestSchema",
        relClassName: "ElementOwnsChild",
        targetSchemaName: "TestSchema",
        targetClassName: "ChildElement",
      });

      const relSpec: PresentationRules.RelatedPropertiesSpecification = {
        propertiesSource: {
          relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
          direction: "Forward",
          targetClass: { schemaName: "TestSchema", className: "SpecificChild" },
        },
        properties: "*",
      };

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: { relatedProperties: [relSpec] },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result!.relatedProperties![0].path[0].targetClassName).toEqual("TestSchema.SpecificChild");
    });

    it("creates target category for related properties", async () => {
      const imodelAccess = createIModelAccessWithRelationship({
        relSchemaName: "TestSchema",
        relClassName: "ElementOwnsChild",
        targetSchemaName: "TestSchema",
        targetClassName: "ChildElement",
        targetLabel: "Child Element",
      });

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
                direction: "Forward",
              },
              properties: "*",
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      const categories = Object.values(result!.categories!);
      const targetCat = categories.find((c) => c.id.endsWith("/target"));
      expect(targetCat).toBeDefined();
      expect(targetCat!.label).toEqual("Child Element");
    });

    it("creates relationship category when forceCreateRelationshipCategory is set", async () => {
      const imodelAccess = createIModelAccessWithRelationship({
        relSchemaName: "TestSchema",
        relClassName: "ElementOwnsChild",
        relLabel: "Owns Child",
        targetSchemaName: "TestSchema",
        targetClassName: "ChildElement",
        targetLabel: "Child Element",
      });

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
                direction: "Forward",
              },
              properties: "*",
              forceCreateRelationshipCategory: true,
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      const categories = Object.values(result!.categories!);
      const relCat = categories.find((c) => c.id.endsWith("/rel"));
      expect(relCat).toBeDefined();
      expect(relCat!.label).toEqual("Owns Child");
      // Target category should be parented under relationship category
      const targetCat = categories.find((c) => c.id.endsWith("/target"));
      expect(targetCat!.parentId).toEqual(relCat!.id);
    });

    it("creates relationship category when relationshipProperties is specified", async () => {
      const imodelAccess = createIModelAccessWithRelationship({
        relSchemaName: "TestSchema",
        relClassName: "ElementOwnsChild",
        relLabel: "Owns Child",
        targetSchemaName: "TestSchema",
        targetClassName: "ChildElement",
      });

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
                direction: "Forward",
              },
              properties: "*",
              relationshipProperties: "*",
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      const categories = Object.values(result!.categories!);
      expect(categories.find((c) => c.id.endsWith("/rel"))).toBeDefined();
    });

    it("does not create relationship category for empty relationshipProperties", async () => {
      const imodelAccess = createIModelAccessWithRelationship({
        relSchemaName: "TestSchema",
        relClassName: "ElementOwnsChild",
        targetSchemaName: "TestSchema",
        targetClassName: "ChildElement",
      });

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
                direction: "Forward",
              },
              properties: "*",
              relationshipProperties: [],
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      const categories = Object.values(result!.categories!);
      expect(categories.find((c) => c.id.endsWith("/rel"))).toBeUndefined();
    });

    it("maps properties '_none_' to select 'none'", async () => {
      const imodelAccess = createIModelAccessWithRelationship({
        relSchemaName: "TestSchema",
        relClassName: "ElementOwnsChild",
        targetSchemaName: "TestSchema",
        targetClassName: "ChildElement",
      });

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
                direction: "Forward",
              },
              properties: "_none_",
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result!.relatedProperties![0].properties![0].target!.select).toEqual("none");
    });

    it("maps instance filter to the last step only", async () => {
      const childClass = createStubClass({ schemaName: "TestSchema", className: "ChildElement" });
      const grandChildClass = createStubClass({ schemaName: "TestSchema", className: "GrandChildElement" });
      const relClass1 = createStubRelationshipClass({
        schemaName: "TestSchema",
        className: "ElementOwnsChild",
        targetClass: childClass,
      });
      const relClass2 = createStubRelationshipClass({
        schemaName: "TestSchema",
        className: "ChildOwnsGrandChild",
        targetClass: grandChildClass,
      });
      const classes = new Map<string, EC.Class>([
        ["TestSchema.ElementOwnsChild", relClass1],
        ["TestSchema.ChildElement", childClass],
        ["TestSchema.ChildOwnsGrandChild", relClass2],
        ["TestSchema.GrandChildElement", grandChildClass],
      ]);
      const getSchema = vi.fn(async (name: string) => ({
        name,
        version: { read: 1, write: 0, minor: 0 },
        getClass: vi.fn(async (className: string) => classes.get(`${name}.${className}`)),
        getCustomAttributes: vi.fn().mockResolvedValue(new Map()),
      }));
      const imodelAccess = { getSchema, classDerivesFrom: vi.fn(async () => true) } as unknown as ECSchemaProvider &
        ECClassHierarchyInspector;

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: [
                { relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" }, direction: "Forward" },
                { relationship: { schemaName: "TestSchema", className: "ChildOwnsGrandChild" }, direction: "Forward" },
              ],
              instanceFilter: "this.IsActive = true",
              properties: "*",
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      const path = result!.relatedProperties![0].path;
      expect(path).toHaveLength(2);
      // The filter is applied only to the last step, not the intermediate one.
      expect(path[0].instanceFilter).toBeUndefined();
      expect(path[1].instanceFilter).toEqual({ expression: "this.IsActive = true" });
    });

    it("defaults properties when neither properties nor propertyNames is specified", async () => {
      const imodelAccess = createIModelAccessWithRelationship({
        relSchemaName: "TestSchema",
        relClassName: "ElementOwnsChild",
        targetSchemaName: "TestSchema",
        targetClassName: "ChildElement",
      });

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
                direction: "Forward",
              },
              // No `properties` and no `propertyNames`
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      const target = result!.relatedProperties![0].properties![0].target!;
      // When no properties are specified, no `select` customization is produced, but the target's
      // default category is still applied via `defaultOverrides`.
      expect(target.select).toBeUndefined();
      const targetCategory = Object.values(result!.categories!).find((c) => c.id.endsWith("/target"));
      expect(targetCategory).toBeDefined();
      expect(target.defaultOverrides!.categoryId).toEqual(targetCategory!.id);
    });

    it("maps plain '*' string in properties array", async () => {
      const imodelAccess = createIModelAccessWithRelationship({
        relSchemaName: "TestSchema",
        relClassName: "ElementOwnsChild",
        targetSchemaName: "TestSchema",
        targetClassName: "ChildElement",
      });

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
                direction: "Forward",
              },
              properties: ["PropA", "*"],
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      // "*" in the array means select all
      expect(result!.relatedProperties![0].properties![0].target!.select).toEqual("all");
    });

    it("maps deprecated propertyNames (comma-separated string)", async () => {
      const imodelAccess = createIModelAccessWithRelationship({
        relSchemaName: "TestSchema",
        relClassName: "ElementOwnsChild",
        targetSchemaName: "TestSchema",
        targetClassName: "ChildElement",
      });

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
                direction: "Forward",
              },
              propertyNames: "PropA, PropB",
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result!.relatedProperties![0].properties![0].target!.select).toEqual({ include: ["PropA", "PropB"] });
    });

    it("maps deprecated propertyNames '*'", async () => {
      const imodelAccess = createIModelAccessWithRelationship({
        relSchemaName: "TestSchema",
        relClassName: "ElementOwnsChild",
        targetSchemaName: "TestSchema",
        targetClassName: "ChildElement",
      });

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
                direction: "Forward",
              },
              propertyNames: "*",
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result!.relatedProperties![0].properties![0].target!.select).toEqual("all");
    });

    it("maps deprecated propertyNames as array", async () => {
      const imodelAccess = createIModelAccessWithRelationship({
        relSchemaName: "TestSchema",
        relClassName: "ElementOwnsChild",
        targetSchemaName: "TestSchema",
        targetClassName: "ChildElement",
      });

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
                direction: "Forward",
              },
              propertyNames: ["PropA", "PropB"],
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result!.relatedProperties![0].properties![0].target!.select).toEqual({ include: ["PropA", "PropB"] });
    });

    it("maps deprecated propertyNames '_none_'", async () => {
      const imodelAccess = createIModelAccessWithRelationship({
        relSchemaName: "TestSchema",
        relClassName: "ElementOwnsChild",
        targetSchemaName: "TestSchema",
        targetClassName: "ChildElement",
      });

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
                direction: "Forward",
              },
              propertyNames: "_none_",
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result!.relatedProperties![0].properties![0].target!.select).toEqual("none");
    });

    it("maps properties as array of PropertySpecification objects", async () => {
      const imodelAccess = createIModelAccessWithRelationship({
        relSchemaName: "TestSchema",
        relClassName: "ElementOwnsChild",
        targetSchemaName: "TestSchema",
        targetClassName: "ChildElement",
      });

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
                direction: "Forward",
              },
              properties: [
                { name: "Prop1", labelOverride: "Custom Label", isReadOnly: true },
                { name: "Prop2", isDisplayed: false },
                "Prop3",
              ],
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      const target = result!.relatedProperties![0].properties![0].target!;
      expect(target.select).toEqual({ include: ["Prop1", "Prop2", "Prop3"] });
      expect(target.overrides!.Prop1).toEqual({ label: "Custom Label", readOnly: true });
      expect(target.overrides!.Prop2).toEqual({ hidden: true });
    });

    it("maps properties with wildcard PropertySpecification", async () => {
      const imodelAccess = createIModelAccessWithRelationship({
        relSchemaName: "TestSchema",
        relClassName: "ElementOwnsChild",
        targetSchemaName: "TestSchema",
        targetClassName: "ChildElement",
      });

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
                direction: "Forward",
              },
              properties: [{ name: "*", isReadOnly: true }],
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      const target = result!.relatedProperties![0].properties![0].target!;
      expect(target.select).toEqual("all");
      expect(target.defaultOverrides!.readOnly).toEqual(true);
    });

    it("maps PropertySpecification objects without overrides", async () => {
      const imodelAccess = createIModelAccessWithRelationship({
        relSchemaName: "TestSchema",
        relClassName: "ElementOwnsChild",
        targetSchemaName: "TestSchema",
        targetClassName: "ChildElement",
      });

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
                direction: "Forward",
              },
              properties: [{ name: "Prop1" }],
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      const target = result!.relatedProperties![0].properties![0].target!;
      expect(target.select).toEqual({ include: ["Prop1"] });
      expect(target.overrides).toBeUndefined();
    });

    it("maps wildcard PropertySpecification without overrides", async () => {
      const imodelAccess = createIModelAccessWithRelationship({
        relSchemaName: "TestSchema",
        relClassName: "ElementOwnsChild",
        targetSchemaName: "TestSchema",
        targetClassName: "ChildElement",
      });

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
                direction: "Forward",
              },
              properties: [{ name: "*" }],
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      const target = result!.relatedProperties![0].properties![0].target!;
      expect(target.select).toEqual("all");
      expect(target.defaultOverrides!.readOnly).toBeUndefined();
      expect(target.defaultOverrides!.label).toBeUndefined();
      expect(target.defaultOverrides!.hidden).toBeUndefined();
    });

    it("maps properties with categoryId { type: 'Id' }", async () => {
      const imodelAccess = createIModelAccessWithRelationship({
        relSchemaName: "TestSchema",
        relClassName: "ElementOwnsChild",
        targetSchemaName: "TestSchema",
        targetClassName: "ChildElement",
      });

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
                direction: "Forward",
              },
              properties: [{ name: "Prop1", categoryId: { type: "Id", categoryId: "my-cat" } }],
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result!.relatedProperties![0].properties![0].target!.overrides!.Prop1.categoryId).toEqual("my-cat");
    });

    it("maps calculatedProperties with categoryId { type: 'None' }", async () => {
      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess: createIModelAccess(),
        rule: { calculatedProperties: [{ label: "X", value: "1", categoryId: { type: "None" } }] },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result?.calculatedFields![0].categoryId).toBeUndefined();
    });

    it("maps multi-step relationship path", async () => {
      const childClass = createStubClass({ schemaName: "TestSchema", className: "ChildElement" });
      const grandChildClass = createStubClass({ schemaName: "TestSchema", className: "GrandChildElement" });
      const relClass1 = createStubRelationshipClass({
        schemaName: "TestSchema",
        className: "ElementOwnsChild",
        targetClass: childClass,
      });
      const relClass2 = createStubRelationshipClass({
        schemaName: "TestSchema",
        className: "ChildOwnsGrandChild",
        targetClass: grandChildClass,
      });

      const classes = new Map<string, EC.Class>([
        ["TestSchema.ElementOwnsChild", relClass1],
        ["TestSchema.ChildElement", childClass],
        ["TestSchema.ChildOwnsGrandChild", relClass2],
        ["TestSchema.GrandChildElement", grandChildClass],
      ]);
      const getSchema = vi.fn(async (name: string) => ({
        name,
        version: { read: 1, write: 0, minor: 0 },
        getClass: vi.fn(async (className: string) => classes.get(`${name}.${className}`)),
        getCustomAttributes: vi.fn().mockResolvedValue(new Map()),
      }));
      const imodelAccess = { getSchema, classDerivesFrom: vi.fn(async () => true) } as unknown as ECSchemaProvider &
        ECClassHierarchyInspector;

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: [
                { relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" }, direction: "Forward" },
                { relationship: { schemaName: "TestSchema", className: "ChildOwnsGrandChild" }, direction: "Forward" },
              ],
              properties: "*",
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result!.relatedProperties![0].path).toHaveLength(2);
      expect(result!.relatedProperties![0].path[0].targetClassName).toEqual("TestSchema.ChildElement");
      expect(result!.relatedProperties![0].path[1].sourceClassName).toEqual("TestSchema.ChildElement");
      expect(result!.relatedProperties![0].path[1].targetClassName).toEqual("TestSchema.GrandChildElement");
    });

    it("flattens nested related properties", async () => {
      const childClass = createStubClass({ schemaName: "TestSchema", className: "ChildElement", label: "Child" });
      const grandChildClass = createStubClass({
        schemaName: "TestSchema",
        className: "GrandChildElement",
        label: "GrandChild",
      });
      const relClass1 = createStubRelationshipClass({
        schemaName: "TestSchema",
        className: "ElementOwnsChild",
        targetClass: childClass,
      });
      const relClass2 = createStubRelationshipClass({
        schemaName: "TestSchema",
        className: "ChildOwnsGrandChild",
        targetClass: grandChildClass,
      });

      const classes = new Map<string, EC.Class>([
        ["TestSchema.ElementOwnsChild", relClass1],
        ["TestSchema.ChildElement", childClass],
        ["TestSchema.ChildOwnsGrandChild", relClass2],
        ["TestSchema.GrandChildElement", grandChildClass],
      ]);
      const getSchema = vi.fn(async (name: string) => ({
        name,
        version: { read: 1, write: 0, minor: 0 },
        getClass: vi.fn(async (className: string) => classes.get(`${name}.${className}`)),
        getCustomAttributes: vi.fn().mockResolvedValue(new Map()),
      }));
      const imodelAccess = { getSchema, classDerivesFrom: vi.fn(async () => true) } as unknown as ECSchemaProvider &
        ECClassHierarchyInspector;

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "ElementOwnsChild" },
                direction: "Forward",
              },
              properties: "*",
              nestedRelatedProperties: [
                {
                  propertiesSource: {
                    relationship: { schemaName: "TestSchema", className: "ChildOwnsGrandChild" },
                    direction: "Forward",
                  },
                  properties: "*",
                },
              ],
            },
          ],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      // Parent declaration + nested declaration
      expect(result!.relatedProperties).toHaveLength(2);
      // Nested declaration has concatenated path (parent + nested)
      expect(result!.relatedProperties![1].path).toHaveLength(2);
      expect(result!.relatedProperties![1].path[0].targetClassName).toEqual("TestSchema.ChildElement");
      expect(result!.relatedProperties![1].path[1].targetClassName).toEqual("TestSchema.GrandChildElement");
    });

    it("throws when propertiesSource class is not a relationship", async () => {
      const notARelClass = createStubClass({ schemaName: "TestSchema", className: "NotARel" });
      const classes = new Map<string, EC.Class>([["TestSchema.NotARel", notARelClass]]);
      const getSchema = vi.fn(async (name: string) => ({
        name,
        version: { read: 1, write: 0, minor: 0 },
        getClass: vi.fn(async (className: string) => classes.get(`${name}.${className}`)),
        getCustomAttributes: vi.fn().mockResolvedValue(new Map()),
      }));
      const imodelAccess = { getSchema, classDerivesFrom: vi.fn(async () => true) } as unknown as ECSchemaProvider &
        ECClassHierarchyInspector;

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "NotARel" },
                direction: "Forward",
              },
              properties: "*",
            },
          ],
        },
      });
      await expect(
        provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() }),
      ).rejects.toThrow(/not a relationship class/);
    });

    it("throws when constraint class cannot be determined", async () => {
      const relClass = createStubRelationshipClass({
        schemaName: "TestSchema",
        className: "BadRel",
        // No targetClass — abstractConstraint resolves to undefined
      });
      const classes = new Map<string, EC.Class>([["TestSchema.BadRel", relClass]]);
      const getSchema = vi.fn(async (name: string) => ({
        name,
        version: { read: 1, write: 0, minor: 0 },
        getClass: vi.fn(async (className: string) => classes.get(`${name}.${className}`)),
        getCustomAttributes: vi.fn().mockResolvedValue(new Map()),
      }));
      const imodelAccess = { getSchema, classDerivesFrom: vi.fn(async () => true) } as unknown as ECSchemaProvider &
        ECClassHierarchyInspector;

      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess,
        rule: {
          relatedProperties: [
            {
              propertiesSource: {
                relationship: { schemaName: "TestSchema", className: "BadRel" },
                direction: "Forward",
              },
              properties: "*",
            },
          ],
        },
      });
      await expect(
        provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() }),
      ).rejects.toThrow(/Cannot determine target class/);
    });

    it("maps propertyCategories parentId with { type: 'Id' }", async () => {
      const provider = createFieldsProviderFromContentModifierRule({
        imodelAccess: createIModelAccess(),
        rule: {
          propertyCategories: [{ id: "cat1", label: "Cat 1", parentId: { type: "Id", categoryId: "parent-id" } }],
        },
      });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result?.categories!.cat1.parentId).toEqual("parent-id");
    });
  });

  describe("empty rule", () => {
    it("returns no contribution when rule is empty", async () => {
      const provider = createFieldsProviderFromContentModifierRule({ imodelAccess: createIModelAccess(), rule: {} });
      const result = await provider.getContribution({ imodelAccess: {} as ECSchemaProvider, target: createTarget() });
      expect(result).toBeUndefined();
    });
  });
});
