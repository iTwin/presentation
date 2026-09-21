/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { assert } from "@itwin/core-bentley";
import {
  buildContentDefinition,
  preparePropertyReaders,
} from "../../content/definition-building/BuildContentDefinition.js";
import { computePropertySelectorId } from "../../content/definition-building/ValueSelector.js";
import { defineExternalFieldsProvider } from "../../content/extensions/ExternalFieldsProvider.js";
import { CategoryDefinition } from "../../content/model/Category.js";
import { PropertyField } from "../../content/model/Field.js";
import { collectPathCardinalities } from "../../content/PathCardinality.js";
import {
  createEntityClass,
  createPrimitiveProperty,
  createRelationshipClass,
  createSchemaAccess,
} from "../MetadataStubs.js";

import type { EC, RelationshipPath } from "@itwin/presentation-shared";
import type { ContentSource } from "../../content/ContentTarget.js";
import type { DescriptorTransformer } from "../../content/extensions/DescriptorTransformer.js";
import type { ExternalFieldsProvider } from "../../content/extensions/ExternalFieldsProvider.js";
import type { IModelFieldsProvider } from "../../content/extensions/IModelFieldsProvider.js";

function createSource(
  primaryClass: EC.FullClassNameDotNotation,
  resolvedPrimaryClasses: EC.FullClassNameDotNotation[] = [primaryClass],
): ContentSource {
  return { target: { primaryClass }, resolvedPrimaryClasses, resolvedDeclarations: [], resolvedExternalInputs: [] };
}

describe("buildContentDefinition", () => {
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

  it("rejects a prepared property selector whose property does not exist", async () => {
    await expect(
      preparePropertyReaders({
        imodelAccess: createSchemaAccess([createEntityClass({ fullName: "TestSchema.A" })]),
        selectors: {
          missing: {
            kind: "property",
            id: "missing",
            propertyClassName: "TestSchema.A",
            propertyName: "Missing",
            pathFromTarget: [],
          },
        },
        fields: {},
      }),
    ).rejects.toThrow('Property "TestSchema.A.Missing" was not found.');
  });

  it.each(["Binary", "IGeometry"] as const)(
    "rejects a prepared property selector with unsupported %s type",
    async (primitiveType) => {
      await expect(
        preparePropertyReaders({
          imodelAccess: createSchemaAccess([
            createEntityClass({
              fullName: "TestSchema.A",
              properties: [createPrimitiveProperty({ name: "Unsupported", primitiveType })],
            }),
          ]),
          selectors: {
            unsupported: {
              kind: "property",
              id: "unsupported",
              propertyClassName: "TestSchema.A",
              propertyName: "Unsupported",
              pathFromTarget: [],
            },
          },
          fields: {},
        }),
      ).rejects.toThrow('Property "TestSchema.A.Unsupported" has an unsupported value type.');
    },
  );

  it("carries the sources and enumerates direct property fields", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.A",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClass: "TestSchema.A" })],
      }),
    ]);
    const sources = [createSource("TestSchema.A")];

    const { descriptor } = await buildContentDefinition({ imodelAccess, sources });

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

    const { descriptor } = await buildContentDefinition({ imodelAccess, sources });

    expect(Object.keys(descriptor.fields)).to.deep.equal(["BisCore.Element.UserLabel"]);
    const field = descriptor.fields["BisCore.Element.UserLabel"] as PropertyField;
    expect(field.valueClassNames).to.deep.equal(["TestSchema.Door", "TestSchema.Window"]);
  });

  it("returns no fields when the primary class has no properties", async () => {
    const imodelAccess = createSchemaAccess([createEntityClass({ fullName: "TestSchema.Empty" })]);
    const { descriptor } = await buildContentDefinition({ imodelAccess, sources: [createSource("TestSchema.Empty")] });
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

    const { descriptor } = await buildContentDefinition({
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
      resolvedExternalInputs: [],
    };

    const { descriptor } = await buildContentDefinition({
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
        resolvedExternalInputs: [],
      };
    }

    function createRelatedPropertiesSchemaAccess(cardinality: "one" | "many") {
      return createSchemaAccess([
        createRelationshipClass({ fullName: "TestSchema.AtoB", cardinality }),
        createEntityClass({ fullName: "TestSchema.A" }),
        createEntityClass({
          fullName: "TestSchema.B",
          properties: [
            createPrimitiveProperty({ name: "Related", declaringClass: "TestSchema.B" }),
            createPrimitiveProperty({ name: "Other", declaringClass: "TestSchema.B" }),
          ],
        }),
      ]);
    }

    function createRelatedPropertiesProvider(
      cardinalityHint?: "one" | "many",
      propertyName = "Related",
    ): IModelFieldsProvider {
      return {
        id: "p1_v1",
        async getContribution() {
          return {
            relatedProperties: [
              {
                path,
                cardinalityHint,
                properties: [{ stepIndex: 0, target: { select: { include: [propertyName] } } }],
              },
            ],
          };
        },
      };
    }

    function createExternalProvider(id: ExternalFieldsProvider["id"], cardinalityHint?: "one" | "many") {
      return defineExternalFieldsProvider({
        id,
        fields: [{ id: "value", label: "Value", type: { kind: "primitive", type: "String" } }],
        inputs: { related: { propertyClassName: "TestSchema.B", propertyName: "Related", path, cardinalityHint } },
        async getValues() {
          return [];
        },
      });
    }

    it.each([
      ["one", "many"],
      ["many", "one"],
    ] as const)(
      "preserves %s and %s field contracts from different iModel providers",
      async (firstHint, secondHint) => {
        const first = createRelatedPropertiesProvider(firstHint);
        const second: IModelFieldsProvider = { ...createRelatedPropertiesProvider(secondHint, "Other"), id: "p2_v1" };
        const source = createContentSource(first);
        source.resolvedDeclarations.push(...createContentSource(second).resolvedDeclarations);

        const definition = await buildContentDefinition({
          imodelAccess: createRelatedPropertiesSchemaAccess("many"),
          sources: [source],
          config: { imodelFieldsProviders: [first, second] },
        });
        expect(definition.descriptor.fields[relatedFieldId]).to.include({ pathCardinality: firstHint });
        expect(
          definition.descriptor.fields[
            PropertyField.computeId({ propertyClassName: "TestSchema.B", propertyName: "Other", pathFromTarget: path })
          ],
        ).to.include({ pathCardinality: secondHint });
        expect([...collectPathCardinalities(definition.descriptor).values()]).to.deep.equal(["many"]);
      },
    );

    it("ignores cardinality hints from declarations that contribute no fields", async () => {
      const provider: IModelFieldsProvider = {
        id: "p1_v1",
        async getContribution() {
          return {
            relatedProperties: [
              { path, cardinalityHint: "one" },
              { path, cardinalityHint: "many", properties: [] },
            ],
          };
        },
      };
      const source = createContentSource(provider);
      source.resolvedDeclarations.push({ ...source.resolvedDeclarations[0], declarationIndex: 1 });

      const definition = await buildContentDefinition({
        imodelAccess: createRelatedPropertiesSchemaAccess("many"),
        sources: [source],
        config: { imodelFieldsProviders: [provider] },
      });
      expect(definition.descriptor.fields[relatedFieldId]).to.include({ pathCardinality: "one" });
    });

    it.each([
      ["one", "many"],
      ["many", "one"],
    ] as const)("preserves %s and %s inputs from different external providers", async (firstHint, secondHint) => {
      const definition = await buildContentDefinition({
        imodelAccess: createRelatedPropertiesSchemaAccess("many"),
        sources: [createSource("TestSchema.A")],
        config: {
          externalFieldsProviders: [
            createExternalProvider("ext1_v1", firstHint),
            createExternalProvider("ext2_v1", secondHint),
          ],
        },
      });
      expect(definition.externalProviders.map((provider) => provider.inputs[0].cardinality)).to.deep.equal([
        firstHint,
        secondHint,
      ]);
      expect(definition.externalInputs).to.deep.equal([
        { propertyClassName: "TestSchema.B", propertyName: "Related", pathFromTarget: path, cardinality: firstHint },
        { propertyClassName: "TestSchema.B", propertyName: "Related", pathFromTarget: path, cardinality: secondHint },
      ]);
      expect([...collectPathCardinalities(definition.descriptor, definition.externalInputs).values()]).to.deep.equal([
        "many",
      ]);
    });

    it("preserves different input contracts for the same selector within an external provider", async () => {
      const provider = defineExternalFieldsProvider({
        ...createExternalProvider("ext1_v1"),
        inputs: {
          first: { propertyClassName: "TestSchema.B", propertyName: "Related", path, cardinalityHint: "one" },
          second: { propertyClassName: "TestSchema.B", propertyName: "Related", path, cardinalityHint: "many" },
        },
        async getValues() {
          return [];
        },
      });
      const definition = await buildContentDefinition({
        imodelAccess: createRelatedPropertiesSchemaAccess("many"),
        sources: [createSource("TestSchema.A")],
        config: { externalFieldsProviders: [provider] },
      });
      expect(definition.externalProviders[0].inputs.map((input) => input.cardinality)).to.deep.equal(["one", "many"]);
      expect(Object.keys(definition.selectors)).to.have.length(1);
    });

    it.each([
      ["one", "many"],
      ["many", "one"],
    ] as const)("preserves an iModel %s field alongside an external %s input", async (fieldHint, inputHint) => {
      const provider = createRelatedPropertiesProvider(fieldHint);
      const definition = await buildContentDefinition({
        imodelAccess: createRelatedPropertiesSchemaAccess("many"),
        sources: [createContentSource(provider)],
        config: {
          imodelFieldsProviders: [provider],
          externalFieldsProviders: [createExternalProvider("ext1_v1", inputHint)],
        },
      });
      expect(definition.descriptor.fields[relatedFieldId]).to.include({ pathCardinality: fieldHint });
      expect(definition.externalProviders[0].inputs[0].cardinality).to.equal(inputHint);
      expect([...collectPathCardinalities(definition.descriptor, definition.externalInputs).values()]).to.deep.equal([
        "many",
      ]);
    });

    it.each([
      ["one", "many"],
      ["many", "one"],
    ] as const)(
      "keeps an external %s hint independent of an unhinted field on a schema-%s path",
      async (hint, schemaCardinality) => {
        const provider = createRelatedPropertiesProvider();
        const definition = await buildContentDefinition({
          imodelAccess: createRelatedPropertiesSchemaAccess(schemaCardinality),
          sources: [createContentSource(provider)],
          config: {
            imodelFieldsProviders: [provider],
            externalFieldsProviders: [createExternalProvider("ext1_v1", hint)],
          },
        });

        const field = definition.descriptor.fields[relatedFieldId];
        assert(field.kind === "property");
        expect(field.pathCardinality).to.equal(schemaCardinality);
        expect(definition.externalProviders[0].inputs[0].cardinality).to.equal(hint);
      },
    );

    it("infers unhinted fields independently of another iModel provider's hint", async () => {
      const first = createRelatedPropertiesProvider("one");
      const second: IModelFieldsProvider = { ...createRelatedPropertiesProvider(undefined, "Other"), id: "p2_v1" };
      const source = createContentSource(first);
      source.resolvedDeclarations.push(...createContentSource(second).resolvedDeclarations);
      const definition = await buildContentDefinition({
        imodelAccess: createRelatedPropertiesSchemaAccess("many"),
        sources: [source],
        config: { imodelFieldsProviders: [first, second] },
      });

      const field = definition.descriptor.fields[relatedFieldId];
      assert(field.kind === "property");
      expect(field.pathCardinality).to.equal("one");
      expect(
        definition.descriptor.fields[
          PropertyField.computeId({ propertyClassName: "TestSchema.B", propertyName: "Other", pathFromTarget: path })
        ],
      ).to.include({ pathCardinality: "many" });
    });

    it("infers input-only cardinality without hints from declarations contributing no fields", async () => {
      const provider: IModelFieldsProvider = {
        id: "p1_v1",
        async getContribution() {
          return { relatedProperties: [{ path, cardinalityHint: "one", properties: [] }] };
        },
      };
      const definition = await buildContentDefinition({
        imodelAccess: createRelatedPropertiesSchemaAccess("many"),
        sources: [createContentSource(provider)],
        config: { imodelFieldsProviders: [provider], externalFieldsProviders: [createExternalProvider("ext1_v1")] },
      });

      expect(Object.values(definition.descriptor.fields).filter((field) => field.kind === "property")).to.have.length(
        0,
      );
      expect(definition.externalInputs[0].cardinality).to.equal("many");
      expect(definition.externalProviders[0].inputs[0].cardinality).to.equal("many");
    });

    it("classifies from schema multiplicity when the declaration gives no hint", async () => {
      const provider = createRelatedPropertiesProvider();
      const { descriptor } = await buildContentDefinition({
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
      const { descriptor } = await buildContentDefinition({
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
      const { descriptor } = await buildContentDefinition({ imodelAccess, sources: [createSource("TestSchema.A")] });
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
    expect(definition.calculatedFieldIdsBySource.get(descriptor.sources[0])).to.deep.equal(new Set(["calc_v1:sum"]));
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

  it("keeps external input values available for classes removed from output field scopes", async () => {
    const property = createPrimitiveProperty({ name: "Code", declaringClass: "TestSchema.Base" });
    const base = createEntityClass({ fullName: "TestSchema.Base", properties: [property] });
    const a = createEntityClass({ fullName: "TestSchema.A", baseClass: base, properties: [property] });
    const b = createEntityClass({ fullName: "TestSchema.B", baseClass: base, properties: [property] });
    base.getDerivedClassNames = () => [a.fullName, b.fullName];
    const externalProvider = defineExternalFieldsProvider({
      id: "ext_v1",
      fields: [{ id: "status", label: "Status", type: { kind: "primitive", type: "String" } }],
      inputs: { code: { propertyClassName: base.fullName, propertyName: "Code" } },
      async getValues() {
        return [];
      },
    });
    const definition = await buildContentDefinition({
      imodelAccess: createSchemaAccess([base, a, b]),
      sources: [createSource(base.fullName, [a.fullName, b.fullName])],
      config: {
        externalFieldsProviders: [externalProvider],
        descriptorTransformers: [
          {
            async transform({ descriptor }) {
              descriptor.forkField("TestSchema.Base.Code", [a.fullName]);
              descriptor.removeField("TestSchema.Base.Code");
            },
          },
        ],
      },
    });

    const fields = Object.values(definition.descriptor.fields).filter((field) => field.kind === "property");
    expect(fields).to.have.lengthOf(1);
    expect(fields[0].valueClassNames).to.deep.equal([a.fullName]);
    expect(Object.keys(definition.selectors)).to.deep.equal(["TestSchema.Base.Code"]);
    const read = definition.propertyReaders["TestSchema.Base.Code"];
    expect(read(a.fullName, "a")).to.equal("a");
    expect(read(b.fullName, "b")).to.equal("b");
  });

  it("keeps only external providers with fields remaining in the descriptor", async () => {
    const removedProvider = defineExternalFieldsProvider({
      id: "removed_v1",
      fields: [{ id: "status", label: "Removed", type: { kind: "primitive", type: "String" } }],
      async getValues() {
        return [];
      },
    });
    const retainedProvider = defineExternalFieldsProvider({
      id: "retained_v1",
      fields: [{ id: "status", label: "Retained", type: { kind: "primitive", type: "String" } }],
      async getValues() {
        return [];
      },
    });
    const transformer: DescriptorTransformer = {
      async transform({ descriptor }) {
        descriptor.removeField("removed_v1:status");
      },
    };

    const definition = await buildContentDefinition({
      imodelAccess: createSchemaAccess([createEntityClass({ fullName: "TestSchema.A" })]),
      sources: [createSource("TestSchema.A")],
      config: { externalFieldsProviders: [removedProvider, retainedProvider], descriptorTransformers: [transformer] },
    });

    expect(definition.externalProviders).to.deep.equal([
      { provider: retainedProvider, inputs: [], outputs: [{ localId: "status", fieldId: "retained_v1:status" }] },
    ]);
  });

  it("keeps external input selectors and readers after all output fields are removed", async () => {
    const externalProvider = defineExternalFieldsProvider({
      id: "ext_v1",
      fields: [{ id: "status", label: "Status", type: { kind: "primitive", type: "String" } }],
      inputs: { code: { propertyClassName: "TestSchema.A", propertyName: "Code" } },
      async getValues() {
        return [];
      },
    });
    const definition = await buildContentDefinition({
      imodelAccess: createSchemaAccess([
        createEntityClass({
          fullName: "TestSchema.A",
          properties: [createPrimitiveProperty({ name: "Code", declaringClass: "TestSchema.A" })],
        }),
      ]),
      sources: [createSource("TestSchema.A")],
      config: {
        externalFieldsProviders: [externalProvider],
        descriptorTransformers: [
          {
            async transform({ descriptor }) {
              descriptor.removeField("ext_v1:status");
              descriptor.removeField("TestSchema.A.Code");
            },
          },
        ],
      },
    });

    expect(definition.descriptor.fields).to.deep.equal({});
    expect(definition.externalProviders).to.deep.equal([]);
    expect(Object.keys(definition.selectors)).to.deep.equal(["TestSchema.A.Code"]);
    expect(definition.propertyReaders["TestSchema.A.Code"]("TestSchema.A", "code")).to.equal("code");
  });

  it("validates related input properties even when no paths or output fields remain", async () => {
    const externalProvider = defineExternalFieldsProvider({
      id: "ext_v1",
      fields: [{ id: "status", label: "Status", type: { kind: "primitive", type: "String" } }],
      inputs: {
        missing: {
          propertyClassName: "TestSchema.B",
          propertyName: "Missing",
          path: [
            { sourceClassName: "TestSchema.A", relationshipName: "TestSchema.Rel", targetClassName: "TestSchema.B" },
          ],
          cardinalityHint: "one",
        },
      },
      async getValues() {
        return [];
      },
    });
    const source = createSource("TestSchema.A");
    source.resolvedExternalInputs = [{ providerId: externalProvider.id, inputKey: "missing", paths: [] }];

    await expect(
      buildContentDefinition({
        imodelAccess: createSchemaAccess([
          createEntityClass({ fullName: "TestSchema.A" }),
          createEntityClass({ fullName: "TestSchema.B" }),
        ]),
        sources: [source],
        config: {
          externalFieldsProviders: [externalProvider],
          descriptorTransformers: [
            {
              async transform({ descriptor }) {
                descriptor.removeField("ext_v1:status");
              },
            },
          ],
        },
      }),
    ).rejects.toThrow('Property "TestSchema.B.Missing" was not found.');
  });

  it("infers a many-valued unhinted external input from schema multiplicity", async () => {
    const path: RelationshipPath = [
      { sourceClassName: "TestSchema.A", targetClassName: "TestSchema.B", relationshipName: "TestSchema.AtoB" },
    ];
    const imodelAccess = createSchemaAccess([
      createRelationshipClass({ fullName: "TestSchema.AtoB", cardinality: "many" }),
      createEntityClass({ fullName: "TestSchema.A" }),
      createEntityClass({
        fullName: "TestSchema.B",
        properties: [createPrimitiveProperty({ name: "Name", declaringClass: "TestSchema.B" })],
      }),
    ]);
    const externalProvider = defineExternalFieldsProvider({
      id: "ext_v1",
      fields: [{ id: "status", label: "Status", type: { kind: "primitive", type: "String" } }],
      inputs: { name: { propertyClassName: "TestSchema.B", propertyName: "Name", path } },
      async getValues() {
        return [];
      },
    });

    const definition = await buildContentDefinition({
      imodelAccess,
      sources: [createSource("TestSchema.A")],
      config: { externalFieldsProviders: [externalProvider] },
    });

    expect(definition.externalInputs).to.deep.equal([
      { propertyClassName: "TestSchema.B", propertyName: "Name", pathFromTarget: path, cardinality: "many" },
    ]);
    expect(externalProvider.inputs).to.deep.equal({
      name: { propertyClassName: "TestSchema.B", propertyName: "Name", path },
    });
    expect(definition.externalProviders).to.deep.equal([
      {
        provider: externalProvider,
        inputs: [
          {
            key: "name",
            selectors: [
              {
                selectorId: "TestSchema.B.Name(TestSchema.A-[TestSchema.AtoB]->TestSchema.B)",
                pathKey: "TestSchema.A-[TestSchema.AtoB]->TestSchema.B",
              },
            ],
            cardinality: "many",
          },
        ],
        outputs: [{ localId: "status", fieldId: "ext_v1:status" }],
      },
    ]);
  });

  it.each([undefined, "one", "many"] as const)(
    "maps polymorphic input selectors without sharing their %s hint across providers",
    async (cardinalityHint) => {
      const path: RelationshipPath = [
        { sourceClassName: "TestSchema.A", targetClassName: "TestSchema.B", relationshipName: "TestSchema.Rel" },
      ];
      const concretePaths: RelationshipPath[] = [
        [{ ...path[0], targetClassName: "TestSchema.B1", relationshipName: "TestSchema.Rel1" }],
        [{ ...path[0], targetClassName: "TestSchema.B2", relationshipName: "TestSchema.Rel2" }],
      ];
      const source = createSource("TestSchema.A");
      source.resolvedExternalInputs = (["ext_v1", "unhinted_v1"] as const).map((providerId) => ({
        providerId,
        inputKey: "name",
        paths: concretePaths.map((concretePath) => ({ path: concretePath, targetClassNames: ["TestSchema.A"] })),
      }));
      const provider = defineExternalFieldsProvider({
        id: "ext_v1",
        fields: [{ id: "status", label: "Status", type: { kind: "primitive", type: "String" } }],
        inputs: { name: { propertyClassName: "TestSchema.B", propertyName: "Name", path, cardinalityHint } },
        async getValues() {
          return [];
        },
      });
      const unhintedProvider = defineExternalFieldsProvider({
        ...provider,
        id: "unhinted_v1",
        inputs: { name: { propertyClassName: "TestSchema.B", propertyName: "Name", path } },
        async getValues() {
          return [];
        },
      });
      const definition = await buildContentDefinition({
        sources: [source],
        imodelAccess: createSchemaAccess([
          createEntityClass({ fullName: "TestSchema.A" }),
          createEntityClass({
            fullName: "TestSchema.B",
            properties: [createPrimitiveProperty({ name: "Name", declaringClass: "TestSchema.B" })],
          }),
          createRelationshipClass({ fullName: "TestSchema.Rel", cardinality: "many" }),
          createRelationshipClass({ fullName: "TestSchema.Rel1", cardinality: "one" }),
          createRelationshipClass({ fullName: "TestSchema.Rel2", cardinality: "one" }),
        ]),
        config: { externalFieldsProviders: [provider, unhintedProvider] },
      });

      const selectorIds = concretePaths.map((pathFromTarget) =>
        computePropertySelectorId({ propertyClassName: "TestSchema.B", propertyName: "Name", pathFromTarget }),
      );
      expect(Object.keys(definition.selectors)).to.deep.equal(selectorIds);
      expect(definition.externalInputs.map((input) => input.pathFromTarget)).to.deep.equal([
        ...concretePaths,
        ...concretePaths,
      ]);
      expect(definition.externalProviders[0].inputs[0]).to.include({
        key: "name",
        cardinality: cardinalityHint === "one" ? "one" : "many",
      });
      expect(definition.externalProviders[1].inputs[0].cardinality).to.equal("many");
      expect(definition.externalProviders[0].inputs[0].selectors.map((selector) => selector.selectorId)).to.deep.equal(
        selectorIds,
      );
      expect(definition.externalProviders[1].inputs[0].selectors).to.deep.equal(
        definition.externalProviders[0].inputs[0].selectors,
      );
      expect(definition.externalInputs.map((input) => input.cardinality)).to.deep.equal([
        cardinalityHint ?? "one",
        cardinalityHint ?? "one",
        "one",
        "one",
      ]);
    },
  );

  it.each([undefined, "one", "many"] as const)(
    "keeps a related field's `one` hint independent of an external input hint of %s on the same path",
    async (cardinalityHint) => {
      const path: RelationshipPath = [
        { sourceClassName: "TestSchema.A", targetClassName: "TestSchema.B", relationshipName: "TestSchema.AtoB" },
      ];
      const provider: IModelFieldsProvider = {
        id: "p1_v1",
        async getContribution() {
          return { relatedProperties: [{ path, cardinalityHint: "one" }] };
        },
      };
      const source: ContentSource = {
        target: { primaryClass: "TestSchema.A" },
        resolvedPrimaryClasses: ["TestSchema.A"],
        resolvedDeclarations: [
          { providerId: provider.id, declarationIndex: 0, paths: [{ path, targetClassNames: ["TestSchema.A"] }] },
        ],
        resolvedExternalInputs: [],
      };
      const imodelAccess = createSchemaAccess([
        createRelationshipClass({ fullName: "TestSchema.AtoB", cardinality: "many" }),
        createEntityClass({ fullName: "TestSchema.A" }),
        createEntityClass({
          fullName: "TestSchema.B",
          properties: [
            createPrimitiveProperty({ name: "Name", declaringClass: "TestSchema.B" }),
            createPrimitiveProperty({ name: "Other", declaringClass: "TestSchema.B" }),
          ],
        }),
      ]);
      const externalProvider = defineExternalFieldsProvider({
        id: "ext_v1",
        fields: [{ id: "status", label: "Status", type: { kind: "primitive", type: "String" } }],
        inputs: { name: { propertyClassName: "TestSchema.B", propertyName: "Name", path, cardinalityHint } },
        async getValues() {
          return [];
        },
      });

      const definition = await buildContentDefinition({
        imodelAccess,
        sources: [source],
        config: { imodelFieldsProviders: [provider], externalFieldsProviders: [externalProvider] },
      });

      for (const propertyName of ["Name", "Other"]) {
        const fieldId = PropertyField.computeId({
          propertyClassName: "TestSchema.B",
          propertyName,
          pathFromTarget: path,
        });
        const field = definition.descriptor.fields[fieldId];
        assert(field.kind === "property");
        expect(field.pathCardinality).to.equal("one");
      }
      expect(definition.externalProviders[0].inputs[0]).to.include({
        key: "name",
        cardinality: cardinalityHint ?? "many",
      });
      expect([...collectPathCardinalities(definition.descriptor, definition.externalInputs).values()]).to.deep.equal([
        cardinalityHint ?? "many",
      ]);
    },
  );

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
        second: { propertyClassName: "TestSchema.A", propertyName: "Second", path: [] },
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
    expect(definition.externalInputs).to.deep.equal([
      { propertyClassName: "TestSchema.A", propertyName: "First", cardinality: "one" },
      { propertyClassName: "TestSchema.A", propertyName: "Second", pathFromTarget: [], cardinality: "one" },
    ]);
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

    const { descriptor } = await buildContentDefinition({
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

    await buildContentDefinition({
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
      resolvedExternalInputs: [],
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
