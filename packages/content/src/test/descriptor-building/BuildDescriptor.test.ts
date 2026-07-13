/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { buildContentDescriptor } from "../../content/descriptor-building/BuildDescriptor.js";
import { CategoryDefinition } from "../../content/model/Category.js";
import { PropertyField } from "../../content/model/Field.js";
import { createEntityClass, createPrimitiveProperty, createSchemaAccess } from "../MetadataStubs.js";

import type { EC, RelationshipPath } from "@itwin/presentation-shared";
import type { ContentSource } from "../../content/ContentTarget.js";
import type { DescriptorTransformer } from "../../content/extensions/DescriptorTransformer.js";
import type { ExternalFieldsProvider } from "../../content/extensions/ExternalFieldsProvider.js";
import type { IModelFieldsProvider } from "../../content/extensions/IModelFieldsProvider.js";

function createSource(
  primaryClass: EC.FullClassName,
  resolvedPrimaryClasses: EC.FullClassName[] = [primaryClass],
): ContentSource {
  return { target: { primaryClass }, resolvedPrimaryClasses, resolvedDeclarations: [] };
}

describe("buildContentDescriptor", () => {
  it("carries the sources and enumerates direct property fields", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.A",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClassName: "TestSchema.A" })],
      }),
    ]);
    const sources = [createSource("TestSchema.A")];

    const descriptor = await buildContentDescriptor({ imodelAccess, sources });

    expect(descriptor.sources).to.equal(sources);
    expect(Object.keys(descriptor.fields)).to.deep.equal(["TestSchema.A.Prop"]);
  });

  it("merges the same direct property across sources, unioning value classes", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.Door",
        properties: [createPrimitiveProperty({ name: "UserLabel", declaringClassName: "BisCore.Element" })],
      }),
      createEntityClass({
        fullName: "TestSchema.Window",
        properties: [createPrimitiveProperty({ name: "UserLabel", declaringClassName: "BisCore.Element" })],
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
      createEntityClass({
        fullName: "TestSchema.Pump",
        properties: [
          createPrimitiveProperty({ name: "Name", declaringClassName: "BisCore.Element" }),
          createPrimitiveProperty({ name: "FlowRate", declaringClassName: "TestSchema.Pump" }),
        ],
      }),
      createEntityClass({
        fullName: "TestSchema.Valve",
        properties: [
          createPrimitiveProperty({ name: "Name", declaringClassName: "BisCore.Element" }),
          createPrimitiveProperty({ name: "Diameter", declaringClassName: "TestSchema.Valve" }),
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
      createEntityClass({
        fullName: "TestSchema.A",
        properties: [createPrimitiveProperty({ name: "Direct", declaringClassName: "TestSchema.A" })],
      }),
      createEntityClass({
        fullName: "TestSchema.B",
        properties: [createPrimitiveProperty({ name: "Related", declaringClassName: "TestSchema.B" })],
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

  it("appends provider calculated fields with matching value selectors", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.A",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClassName: "TestSchema.A" })],
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

    const descriptor = await buildContentDescriptor({
      imodelAccess,
      sources: [createSource("TestSchema.A")],
      config: { imodelFieldsProviders: [fieldsProvider] },
    });

    expect(Object.keys(descriptor.fields).sort()).to.deep.equal(["TestSchema.A.Prop", "calc_v1:sum"]);
    expect(descriptor.fields["calc_v1:sum"].kind).to.equal("calculated");
    // Both the property field and the calculated field back a selector.
    expect(Object.keys(descriptor.selectors).sort()).to.deep.equal(["TestSchema.A.Prop", "calc_v1:sum"]);
    expect(descriptor.selectors["calc_v1:sum"].kind).to.equal("calculated");
  });

  it("appends external fields without selectors and keeps external input columns", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.A",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClassName: "TestSchema.A" })],
      }),
    ]);
    const externalProvider: ExternalFieldsProvider<"code"> = {
      id: "ext_v1",
      fields: [{ id: "status", label: "Status", type: { kind: "primitive", type: "String" } }],
      inputs: { code: { propertyClassName: "TestSchema.A", propertyName: "Prop" } },
      async getValues() {
        return [];
      },
    };

    const descriptor = await buildContentDescriptor({
      imodelAccess,
      sources: [createSource("TestSchema.A")],
      config: { externalFieldsProviders: [externalProvider] },
    });

    expect(Object.keys(descriptor.fields).sort()).to.deep.equal(["TestSchema.A.Prop", "ext_v1:status"]);
    expect(descriptor.fields["ext_v1:status"].kind).to.equal("external");
    // External fields have no selector; the input reuses the property field's column selector.
    expect(Object.keys(descriptor.selectors)).to.deep.equal(["TestSchema.A.Prop"]);
  });

  it("applies descriptor transformer metadata changes", async () => {
    const imodelAccess = createSchemaAccess([
      createEntityClass({
        fullName: "TestSchema.A",
        properties: [createPrimitiveProperty({ name: "Prop", declaringClassName: "TestSchema.A" })],
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
        properties: [createPrimitiveProperty({ name: "Prop", declaringClassName: "TestSchema.A" })],
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
      createEntityClass({
        fullName: "TestSchema.A",
        properties: [createPrimitiveProperty({ name: "Keep", declaringClassName: "TestSchema.A" })],
      }),
      createEntityClass({
        fullName: "TestSchema.B",
        properties: [createPrimitiveProperty({ name: "Rel", declaringClassName: "TestSchema.B" })],
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

    const descriptor = await buildContentDescriptor({
      imodelAccess,
      sources: [source],
      config: { imodelFieldsProviders: [provider], descriptorTransformers: [transformer] },
    });

    // The related field (and thus its selector and auto category) is gone; the direct field remains.
    expect(Object.keys(descriptor.fields)).to.deep.equal(["TestSchema.A.Keep"]);
    expect(Object.keys(descriptor.selectors)).to.deep.equal(["TestSchema.A.Keep"]);
    expect(descriptor.categories).to.deep.equal({});
  });
});
