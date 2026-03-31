/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { insertPhysicalElement, insertPhysicalModelWithPartition, insertSpatialCategory } from "presentation-test-utilities";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrimitiveValue } from "@itwin/appui-abstract";
import { EditorContainer, UiComponents } from "@itwin/components-react";
import { BeEvent } from "@itwin/core-bentley";
import { IModelApp } from "@itwin/core-frontend";
import { FormatDefinition } from "@itwin/core-quantity";
import { FieldDescriptorType, KeySet } from "@itwin/presentation-common";
import { PresentationPropertyDataProvider, SchemaMetadataContextProvider } from "@itwin/presentation-components";
import { importSchema } from "../../IModelUtils.js";
import { initialize, terminate } from "../../IntegrationTests.js";
import { render, waitFor } from "../../RenderUtils.js";
import { buildTestIModel } from "../../TestIModelSetup.js";

describe("Property editors", () => {
  beforeAll(async () => {
    await initialize();
    await UiComponents.initialize(IModelApp.localization);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    UiComponents.terminate();
    await terminate();
  });

  afterEach(() => {
    IModelApp.resetFormatsProvider();
  });

  it("renders property values with koq's overridden through `IModelApp.formatsProvider`", async () => {
    const { imodel, schema, ...imodelKeys } = await buildTestIModel(
      "renders property values with koq's overridden through `IModelApp.formatsProvider`",
      async (builder, testName) => {
        const mySchema = await importSchema(
          testName,
          builder,
          `
          <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
          <ECSchemaReference name="Units" version="01.00.09" alias="u" />
          <ECSchemaReference name="Formats" version="01.00.00" alias="f" />
          <KindOfQuantity typeName="TestKOQ" displayLabel="Test KOQ" persistenceUnit="u:M" relativeError="0.001" presentationUnits="f:DefaultRealU(4)[u:M]" />
          <ECEntityClass typeName="MyPhysicalObject">
            <BaseClass>bis:PhysicalElement</BaseClass>
            <ECProperty propertyName="MyProperty" typeName="double" kindOfQuantity="TestKOQ" />
          </ECEntityClass>
        `,
        );
        const model = insertPhysicalModelWithPartition({ builder, codeValue: "TestPhysicalModel" });
        const category = insertSpatialCategory({ builder, codeValue: "TestSpatialCategory" });
        const element = insertPhysicalElement({
          builder,
          modelId: model.id,
          categoryId: category.id,
          classFullName: mySchema.items.MyPhysicalObject.fullName,
          userLabel: "My element",
          ["MyProperty"]: 1.234,
        });
        return { element, schema: mySchema };
      },
    );

    IModelApp.formatsProvider = {
      async getFormat(name: string): Promise<FormatDefinition | undefined> {
        if (name === schema.items.TestKOQ.fullName.replaceAll(".", ":")) {
          return {
            name: "TestFormat",
            label: "Test format override",
            composite: {
              includeZero: true,
              spacer: "",
              units: [{ label: "in", name: "Units.IN" }],
            },
            formatTraits: ["keepSingleZero", "showUnitLabel"],
            precision: 1,
            type: "Decimal",
          };
        }
        return undefined;
      },
      onFormatsChanged: new BeEvent(),
    };

    const provider = new PresentationPropertyDataProvider({ imodel });
    provider.keys = new KeySet([imodelKeys.element]);

    const descriptor = await provider.getContentDescriptor();
    const field = descriptor!.getFieldByDescriptor(
      {
        type: FieldDescriptorType.Properties,
        pathFromSelectToPropertyClass: [],
        properties: [
          {
            class: schema.items.MyPhysicalObject.fullName.replaceAll(".", ":"),
            name: "MyProperty",
          },
        ],
      },
      true,
    );
    expect(field).toBeDefined();

    const propertyData = await provider.getData();
    const propertyRecord = propertyData.records[field!.category.name].find((r) => r.property.name === field!.name);
    expect(propertyRecord).toBeDefined();
    expect(propertyRecord!.property.kindOfQuantityName).toBe(schema.items.TestKOQ.fullName.replaceAll(".", ":"));

    // ensure the display value is formatted with the overridden format
    expect((propertyRecord!.value as PrimitiveValue).displayValue).toBe("48.6 in");

    // render an editor for the property
    const commitSpy = vi.fn();
    const cancelSpy = vi.fn();
    const { getByPlaceholderText, findByRole, user } = render(
      <SchemaMetadataContextProvider imodel={imodel} schemaContextProvider={(x) => x.schemaContext}>
        <EditorContainer propertyRecord={propertyRecord!} onCommit={commitSpy} onCancel={cancelSpy} />
      </SchemaMetadataContextProvider>,
    );
    // ensure the input value is formatted
    await waitFor(() => getByPlaceholderText("in"));
    // ensure the input is editable
    const input = await findByRole("textbox");
    await user.clear(input);
    await user.type(input, "4.56");
    await user.keyboard("{Enter}");
    // ensure the commit callback is called with the new value
    await waitFor(() => {
      expect(commitSpy).toHaveBeenCalledOnce();
      expect(commitSpy.mock.calls[0][0].newValue.displayValue).toBe("4.6 in"); // what is displayed after formatting
      expect(commitSpy.mock.calls[0][0].newValue.value.toFixed(6)).toBe("0.115824"); // converted to persistence unit - meters
      expect(commitSpy.mock.calls[0][0].newValue.roundingError.toFixed(6)).toBe("0.000127");
    });
  });

  it("edits merged values", async () => {
    const { imodel, schema, ...imodelKeys } = await buildTestIModel(expect.getState().currentTestName!, async (builder, testName) => {
      const mySchema = await importSchema(
        testName,
        builder,
        `
          <ECSchemaReference name="BisCore" version="01.00.16" alias="bis" />
          <ECEntityClass typeName="MyPhysicalObject">
            <BaseClass>bis:PhysicalElement</BaseClass>
            <ECProperty propertyName="MyProperty" typeName="double" />
          </ECEntityClass>
        `,
      );
      const model = insertPhysicalModelWithPartition({ builder, codeValue: "TestPhysicalModel" });
      const category = insertSpatialCategory({ builder, codeValue: "TestSpatialCategory" });
      const element1 = insertPhysicalElement({
        builder,
        modelId: model.id,
        categoryId: category.id,
        classFullName: mySchema.items.MyPhysicalObject.fullName,
        userLabel: "My element 1",
        ["MyProperty"]: 1.23,
      });
      const element2 = insertPhysicalElement({
        builder,
        modelId: model.id,
        categoryId: category.id,
        classFullName: mySchema.items.MyPhysicalObject.fullName,
        userLabel: "My element 2",
      });
      return { element1, element2, schema: mySchema };
    });

    const provider = new PresentationPropertyDataProvider({ imodel });
    provider.keys = new KeySet([imodelKeys.element1, imodelKeys.element2]);

    const descriptor = await provider.getContentDescriptor();
    const field = descriptor!.getFieldByDescriptor(
      {
        type: FieldDescriptorType.Properties,
        pathFromSelectToPropertyClass: [],
        properties: [
          {
            class: schema.items.MyPhysicalObject.fullName.replaceAll(".", ":"),
            name: "MyProperty",
          },
        ],
      },
      true,
    );
    expect(field).toBeDefined();

    const propertyData = await provider.getData();
    const propertyRecord = propertyData.records[field!.category.name].find((r) => r.property.name === field!.name);
    expect(propertyRecord).toBeDefined();
    expect(propertyRecord!.isReadonly).not.toBe(true);
    expect(propertyRecord!.isDisabled).not.toBe(true);

    // render an editor for the property
    const commitSpy = vi.fn();
    const cancelSpy = vi.fn();
    const { findByRole, user } = render(<EditorContainer propertyRecord={propertyRecord!} onCommit={commitSpy} onCancel={cancelSpy} />);

    // ensure the input is editable
    const input = await findByRole("textbox");
    await user.clear(input);
    await user.type(input, "4.56");
    await user.keyboard("{Enter}");
    // ensure the commit callback is called with the new value
    await waitFor(() => {
      expect(commitSpy).toHaveBeenCalledOnce();
      expect(commitSpy.mock.calls[0][0].newValue.displayValue).toBe("4.56");
      expect(commitSpy.mock.calls[0][0].newValue.value).toBe(4.56);
      expect(commitSpy.mock.calls[0][0].newValue.roundingError).toBe(0.005);
    });
  });
});
