/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import {
  buildContentDefinition,
  buildContentDescriptor,
  preparePropertyReaders,
} from "../../content/definition-building/BuildContentDefinition.js";
import { defineExternalFieldsProvider } from "../../content/extensions/ExternalFieldsProvider.js";
import { CategoryDefinition } from "../../content/model/Category.js";
import { PropertyField } from "../../content/model/Field.js";
import {
  createEntityClass,
  createPrimitiveProperty,
  createRelationshipClass,
  createSchemaAccess,
} from "../MetadataStubs.js";

import type { EC, RelationshipPath } from "@itwin/presentation-shared";
import type { ContentSource } from "../../content/ContentTarget.js";
import type { DescriptorTransformer } from "../../content/extensions/DescriptorTransformer.js";
import type { IModelFieldsProvider } from "../../content/extensions/IModelFieldsProvider.js";

function createSource(
  primaryClass: EC.FullClassNameDotNotation,
  resolvedPrimaryClasses: EC.FullClassNameDotNotation[] = [primaryClass],
): ContentSource {
  return { target: { primaryClass }, resolvedPrimaryClasses, resolvedDeclarations: [], externalInputPaths: [] };
}

describe("buildContentDescriptor", () => {
  it("keeps sibling properties separate while allowing inherited properties", async () => {
    const baseProperty = createPrimitiveProperty({ name: "Inherited", declaringClass: "TestSchema.Base" });
    const siblingProperty = createPrimitiveProperty({ name: "Prop", declaringClass: "TestSchema.D1" });
    const base = createEntityClass({ fullName: "TestSchema.Base", properties: [baseProperty] });
    const d1 = createEntityClass({
      fullName: "TestSchema.D1",
      properties: [baseProperty, siblingProperty],
      baseClass: base,
    });
    const d2 = createEntityClass({
      fullName: "TestSchema.D2",
      properties: [baseProperty, createPrimitiveProperty({ name: "Prop", declaringClass: "TestSchema.D2" })],
      baseClass: base,
    });
    base.getDerivedClassNames = () => [d1.fullName, d2.fullName];
    const imodelAccess = createSchemaAccess([base, d1, d2]);
    const readers = await preparePropertyReaders({
      imodelAccess,
      selectors: {
        "TestSchema.D1.Prop": {
          kind: "property",
          id: "TestSchema.D1.Prop",
          propertyClassName: "TestSchema.D1",
          propertyName: "Prop",
          pathFromTarget: [],
        },
        "TestSchema.Base.Inherited": {
          kind: "property",
          id: "TestSchema.Base.Inherited",
          propertyClassName: "TestSchema.Base",
          propertyName: "Inherited",
          pathFromTarget: [],
        },
      },
      fields: {},
    });

    expect(readers["TestSchema.D1.Prop"]("TestSchema.D2", "d2")).to.equal(undefined);
    expect(readers["TestSchema.D1.Prop"]("TestSchema.D1", "d1")).to.equal("d1");
    expect(readers["TestSchema.Base.Inherited"]("TestSchema.D1", "base")).to.equal("base");
  });

  it("carries the sources and enumerates direct property fields", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.A",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClass: "TestSchema.A" })],
      }),
    ]);
    const sources = [createSource("TestSchema.A")];

    const descriptor = await buildContentDescriptor({ imodelAccess, sources });

    expect(descriptor.sources).to.equal(sources);
    expect(Object.keys(descriptor.fields)).to.deep.equal(["TestSchema.A.Prop"]);
  });

  it("merges the same direct property across sources, unioning value classes", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({ fullName: "BisCore.Element" }),
      createEntityClass({
        fullName: "TestSchema.Door",
        properties: [createPrimitiveProperty({ name: "UserLabel", declaringClass: "BisCore.Element" })],
      }),
      createEntityClass({
        fullName: "TestSchema.Window",
        properties: [createPrimitiveProperty({ name: "UserLabel", declaringClass: "BisCore.Element" })],
      }),
    ]);
    const sources = [createSource("TestSchema.Door"), createSource("TestSchema.Window")];

    const descriptor = await buildContentDescriptor({ imodelAccess, sources });

    expect(Object.keys(descriptor.fields)).to.deep.equal(["BisCore.Element.UserLabel"]);
    const field = descriptor.fields["BisCore.Element.UserLabel"] as PropertyField;
    expect(field.valueClassNames).to.deep.equal(["TestSchema.Door", "TestSchema.Window"]);
  });

  it("returns no fields when the primary class has no properties", async () => {
    const imodelAccess = createSchemaAccess([createEntityClass({ fullName: "TestSchema.Empty" })]);
    const descriptor = await buildContentDescriptor({ imodelAccess, sources: [createSource("TestSchema.Empty")] });
    expect(descriptor.fields).to.deep.equal({});
  });

  it("unions fields across multiple targets, merging a shared inherited property", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({ fullName: "BisCore.Element" }),
      createEntityClass({
        fullName: "TestSchema.Pump",
        properties: [
          createPrimitiveProperty({ name: "Name", declaringClass: "BisCore.Element" }),
          createPrimitiveProperty({ name: "FlowRate", declaringClass: "TestSchema.Pump" }),
        ],
      }),
      createEntityClass({
        fullName: "TestSchema.Valve",
        properties: [
          createPrimitiveProperty({ name: "Name", declaringClass: "BisCore.Element" }),
          createPrimitiveProperty({ name: "Diameter", declaringClass: "TestSchema.Valve" }),
        ],
      }),
    ]);

    const descriptor = await buildContentDescriptor({
      imodelAccess,
      sources: [createSource("TestSchema.Pump"), createSource("TestSchema.Valve")],
    });

    expect(Object.keys(descriptor.fields).sort()).to.deep.equal([
      "BisCore.Element.Name",
      "TestSchema.Pump.FlowRate",
      "TestSchema.Valve.Diameter",
    ]);
    // The shared inherited property merges into one field spanning both targets' value classes.
    expect((descriptor.fields["BisCore.Element.Name"] as PropertyField).valueClassNames).to.deep.equal([
      "TestSchema.Pump",
      "TestSchema.Valve",
    ]);
    // Target-specific properties stay separate, scoped to their own class.
    expect((descriptor.fields["TestSchema.Pump.FlowRate"] as PropertyField).valueClassNames).to.deep.equal([
      "TestSchema.Pump",
    ]);
    expect((descriptor.fields["TestSchema.Valve.Diameter"] as PropertyField).valueClassNames).to.deep.equal([
      "TestSchema.Valve",
    ]);
  });

  it("enumerates related property fields from resolved declarations", async () => {
    const imodelAccess = createSchemaAccess([
      createRelationshipClass({ fullName: "TestSchema.AtoB" }),
      createEntityClass({
        fullName: "TestSchema.A",
        properties: [createPrimitiveProperty({ name: "Direct", declaringClass: "TestSchema.A" })],
      }),
      createEntityClass({
        fullName: "TestSchema.B",
        properties: [createPrimitiveProperty({ name: "Related", declaringClass: "TestSchema.B" })],
      }),
    ]);
    const path: RelationshipPath = [
      { sourceClassName: "TestSchema.A", targetClassName: "TestSchema.B", relationshipName: "TestSchema.AtoB" },
    ];
    const provider: IModelFieldsProvider = {
      id: "p1_v1",
      async getContribution() {
        return { relatedProperties: [{ path }] };
      },
    };
    const source: ContentSource = {
      target: { primaryClass: "TestSchema.A" },
      resolvedPrimaryClasses: ["TestSchema.A"],
      resolvedDeclarations: [
        { providerId: provider.id, declarationIndex: 0, paths: [{ path, targetClassNames: ["TestSchema.A"] }] },
      ],
      externalInputPaths: [],
    };

    const descriptor = await buildContentDescriptor({
      imodelAccess,
      sources: [source],
      config: { imodelFieldsProviders: [provider] },
    });

    expect(Object.keys(descriptor.fields)).to.deep.equal([
      "TestSchema.A.Direct",
      "TestSchema.B.Related(TestSchema.A-[TestSchema.AtoB]->TestSchema.B)",
    ]);
    const related = descriptor.fields[
      "TestSchema.B.Related(TestSchema.A-[TestSchema.AtoB]->TestSchema.B)"
    ] as PropertyField;
    expect(related.valueClassNames).to.deep.equal(["TestSchema.B"]);

    // The related field gets an auto-created path category labelled by its terminal class.
    const categoryId = CategoryDefinition.computeId({ path });
    expect(related.categoryId).to.equal(categoryId);
    expect(descriptor.categories[categoryId]).to.deep.equal({ id: categoryId, label: "B" });
  });

  describe("related path cardinality", () => {
    const path: RelationshipPath = [
      { sourceClassName: "TestSchema.A", targetClassName: "TestSchema.B", relationshipName: "TestSchema.AtoB" },
    ];
    const relatedFieldId = "TestSchema.B.Related(TestSchema.A-[TestSchema.AtoB]->TestSchema.B)";

    function createContentSource(provider: IModelFieldsProvider): ContentSource {
      return {
        target: { primaryClass: "TestSchema.A" },
        resolvedPrimaryClasses: ["TestSchema.A"],
        resolvedDeclarations: [
          { providerId: provider.id, declarationIndex: 0, paths: [{ path, targetClassNames: ["TestSchema.A"] }] },
        ],
        externalInputPaths: [],
      };
    }

    function createRelatedPropertiesSchemaAccess(cardinality: "one" | "many") {
      return createSchemaAccess([
        createRelationshipClass({ fullName: "TestSchema.AtoB", cardinality }),
        createEntityClass({ fullName: "TestSchema.A" }),
        createEntityClass({
          fullName: "TestSchema.B",
          properties: [createPrimitiveProperty({ name: "Related", declaringClass: "TestSchema.B" })],
        }),
      ]);
    }

    function createRelatedPropertiesProvider(cardinalityHint?: "one" | "many"): IModelFieldsProvider {
      return {
        id: "p1_v1",
        async getContribution() {
          return { relatedProperties: [{ path, ...(cardinalityHint ? { cardinalityHint } : undefined) }] };
        },
      };
    }

    it("classifies from schema multiplicity when the declaration gives no hint", async () => {
      const provider = createRelatedPropertiesProvider();
      const descriptor = await buildContentDescriptor({
        imodelAccess: createRelatedPropertiesSchemaAccess("many"),
        sources: [createContentSource(provider)],
        config: { imodelFieldsProviders: [provider] },
      });

      const related = descriptor.fields[relatedFieldId] as PropertyField;
      expect(related.pathCardinality).to.equal("many");
      // Cardinality never reshapes the value: an array `type` would mean a genuine EC array property.
      expect(related.type).to.deep.equal({ kind: "primitive", type: "String" });
    });

    it("carries a declaration's hint through to the enumerated field", async () => {
      const provider = createRelatedPropertiesProvider("one");
      const descriptor = await buildContentDescriptor({
        imodelAccess: createRelatedPropertiesSchemaAccess("many"),
        sources: [createContentSource(provider)],
        config: { imodelFieldsProviders: [provider] },
      });

      expect((descriptor.fields[relatedFieldId] as PropertyField).pathCardinality).to.equal("one");
    });

    it("reports a direct field as single-valued", async () => {
      const imodelAccess = createSchemaAccess([
        createEntityClass({
          fullName: "TestSchema.A",
          properties: [createPrimitiveProperty({ name: "Direct", declaringClass: "TestSchema.A" })],
        }),
      ]);
      const descriptor = await buildContentDescriptor({ imodelAccess, sources: [createSource("TestSchema.A")] });
      expect((descriptor.fields["TestSchema.A.Direct"] as PropertyField).pathCardinality).to.equal("one");
    });
  });

  it("appends provider calculated fields with matching value selectors", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.A",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClass: "TestSchema.A" })],
      }),
    ]);
    const fieldsProvider: IModelFieldsProvider = {
      id: "calc_v1",
      async getContribution() {
        return {
          calculatedFields: [
            { id: "sum", label: "Sum", expression: "this.Prop", type: { kind: "primitive", type: "Double" } },
          ],
        };
      },
    };

    const definition = await buildContentDefinition({
      imodelAccess,
      sources: [createSource("TestSchema.A")],
      config: { imodelFieldsProviders: [fieldsProvider] },
    });
    const { descriptor } = definition;

    expect(Object.keys(descriptor.fields).sort()).to.deep.equal(["TestSchema.A.Prop", "calc_v1:sum"]);
    expect(descriptor.fields["calc_v1:sum"].kind).to.equal("calculated");
    expect(Object.keys(definition.selectors).sort()).to.deep.equal(["TestSchema.A.Prop", "calc_v1:sum"]);
    expect(definition.selectors["calc_v1:sum"].kind).to.equal("calculated");
  });

  it("appends external fields without selectors and keeps external input columns", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.A",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClass: "TestSchema.A" })],
      }),
    ]);
    const externalProvider = defineExternalFieldsProvider({
      id: "ext_v1",
      fields: [{ id: "status", label: "Status", type: { kind: "primitive", type: "String" } }],
      inputs: { code: { propertyClassName: "TestSchema.A", propertyName: "Prop" } },
      async getValues() {
        return [];
      },
    });

    const definition = await buildContentDefinition({
      imodelAccess,
      sources: [createSource("TestSchema.A")],
      config: { externalFieldsProviders: [externalProvider] },
    });
    const { descriptor } = definition;

    expect(Object.keys(descriptor.fields).sort()).to.deep.equal(["TestSchema.A.Prop", "ext_v1:status"]);
    expect(descriptor.fields["ext_v1:status"].kind).to.equal("external");
    // External fields have no selector; the input reuses the property field's private requirement.
    expect(Object.keys(definition.selectors)).to.deep.equal(["TestSchema.A.Prop"]);
  });

  it("prepares input-only decoders with one schema lookup for properties from the same class", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.A",
        properties: [
          createPrimitiveProperty({ name: "First", declaringClass: "TestSchema.A" }),
          createPrimitiveProperty({ name: "Second", declaringClass: "TestSchema.A" }),
        ],
      }),
    ]);
    const getSchema = vi.spyOn(imodelAccess, "getSchema");
    const externalProvider = defineExternalFieldsProvider({
      id: "ext_v1",
      fields: [{ id: "status", label: "Status", type: { kind: "primitive", type: "String" } }],
      inputs: {
        first: { propertyClassName: "TestSchema.A", propertyName: "First" },
        second: { propertyClassName: "TestSchema.A", propertyName: "Second" },
      },
      async getValues() {
        return [];
      },
    });
    const transformer: DescriptorTransformer = {
      async transform({ descriptor }) {
        descriptor.removeField("TestSchema.A.First");
        descriptor.removeField("TestSchema.A.Second");
        getSchema.mockClear();
      },
    };

    const definition = await buildContentDefinition({
      imodelAccess,
      sources: [createSource("TestSchema.A")],
      config: { externalFieldsProviders: [externalProvider], descriptorTransformers: [transformer] },
    });

    expect(Object.keys(definition.descriptor.fields)).to.deep.equal(["ext_v1:status"]);
    expect(definition.propertyReaders["TestSchema.A.First"]("TestSchema.A", "first")).to.equal("first");
    expect(definition.propertyReaders["TestSchema.A.Second"]("TestSchema.A", "second")).to.equal("second");
    expect(getSchema).toHaveBeenCalledOnce();
  });

  it("rejects an input-only property that does not exist", async () => {
    const imodelAccess = createSchemaAccess([createEntityClass({ fullName: "TestSchema.A" })]);
    const externalProvider = defineExternalFieldsProvider({
      id: "ext_v1",
      fields: [{ id: "status", label: "Status", type: { kind: "primitive", type: "String" } }],
      inputs: { missing: { propertyClassName: "TestSchema.A", propertyName: "Missing" } },
      async getValues() {
        return [];
      },
    });

    await expect(
      buildContentDefinition({
        imodelAccess,
        sources: [createSource("TestSchema.A")],
        config: { externalFieldsProviders: [externalProvider] },
      }),
    ).rejects.toThrow('Property "TestSchema.A.Missing" was not found.');
  });

  it.each(["Binary", "IGeometry"] as const)(
    "rejects an input-only property with unsupported %s type",
    async (primitiveType) => {
      const imodelAccess = createSchemaAccess([
        createEntityClass({
          fullName: "TestSchema.A",
          properties: [createPrimitiveProperty({ name: "Unsupported", primitiveType })],
        }),
      ]);
      const externalProvider = defineExternalFieldsProvider({
        id: "ext_v1",
        fields: [{ id: "status", label: "Status", type: { kind: "primitive", type: "String" } }],
        inputs: { value: { propertyClassName: "TestSchema.A", propertyName: "Unsupported" } },
        async getValues() {
          return [];
        },
      });

      await expect(
        buildContentDefinition({
          imodelAccess,
          sources: [createSource("TestSchema.A")],
          config: { externalFieldsProviders: [externalProvider] },
        }),
      ).rejects.toThrow('Property "TestSchema.A.Unsupported" has an unsupported value type.');
    },
  );

  it("applies descriptor transformer metadata changes", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.A",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClass: "TestSchema.A" })],
      }),
    ]);
    const transformer: DescriptorTransformer = {
      async transform({ descriptor: view }) {
        const field = view.fields["TestSchema.A.Prop"];
        field.label = "Renamed";
        field.hidden = true;
      },
    };

    const descriptor = await buildContentDescriptor({
      imodelAccess,
      sources: [createSource("TestSchema.A")],
      config: { descriptorTransformers: [transformer] },
    });

    expect(descriptor.fields["TestSchema.A.Prop"].label).to.equal("Renamed");
    expect(descriptor.fields["TestSchema.A.Prop"].hidden).to.equal(true);
  });

  it("runs transformers in ascending priority order, defaulting an unset priority", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.A",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClass: "TestSchema.A" })],
      }),
    ]);
    const order: number[] = [];
    const high: DescriptorTransformer = {
      priority: 3,
      async transform() {
        order.push(3);
      },
    };
    // No explicit priority → defaults to DEFAULT_DESCRIPTOR_TRANSFORMER_PRIORITY (1000).
    const unset: DescriptorTransformer = {
      async transform() {
        order.push(1000);
      },
    };
    const low: DescriptorTransformer = {
      priority: 1,
      async transform() {
        order.push(1);
      },
    };

    await buildContentDescriptor({
      imodelAccess,
      sources: [createSource("TestSchema.A")],
      config: { descriptorTransformers: [high, unset, low] },
    });

    expect(order).to.deep.equal([1, 3, 1000]);
  });

  it("drops a removed field's selector and prunes its now-unreferenced category", async () => {
    const imodelAccess = createSchemaAccess([
      createRelationshipClass({ fullName: "TestSchema.AtoB" }),
      createEntityClass({
        fullName: "TestSchema.A",
        properties: [createPrimitiveProperty({ name: "Keep", declaringClass: "TestSchema.A" })],
      }),
      createEntityClass({
        fullName: "TestSchema.B",
        properties: [createPrimitiveProperty({ name: "Rel", declaringClass: "TestSchema.B" })],
      }),
    ]);
    const path: RelationshipPath = [
      { sourceClassName: "TestSchema.A", targetClassName: "TestSchema.B", relationshipName: "TestSchema.AtoB" },
    ];
    const provider: IModelFieldsProvider = {
      id: "p_v1",
      async getContribution() {
        return { relatedProperties: [{ path }] };
      },
    };
    const source: ContentSource = {
      target: { primaryClass: "TestSchema.A" },
      resolvedPrimaryClasses: ["TestSchema.A"],
      resolvedDeclarations: [
        { providerId: provider.id, declarationIndex: 0, paths: [{ path, targetClassNames: ["TestSchema.A"] }] },
      ],
      externalInputPaths: [],
    };
    const relatedId = PropertyField.computeId({
      propertyClassName: "TestSchema.B",
      propertyName: "Rel",
      pathFromTarget: path,
    });
    const transformer: DescriptorTransformer = {
      async transform({ descriptor: view }) {
        view.removeField(relatedId);
      },
    };

    const definition = await buildContentDefinition({
      imodelAccess,
      sources: [source],
      config: { imodelFieldsProviders: [provider], descriptorTransformers: [transformer] },
    });
    const { descriptor } = definition;

    // The related field (and thus its private requirement and auto category) is gone; the direct field remains.
    expect(Object.keys(descriptor.fields)).to.deep.equal(["TestSchema.A.Keep"]);
    expect(Object.keys(definition.selectors)).to.deep.equal(["TestSchema.A.Keep"]);
    expect(descriptor.categories).to.deep.equal({});
  });
});
