/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { FormatProps, FormatterSpec, Format as QuantityFormat, UnitSystemKey } from "@itwin/core-quantity";
import {
  Format,
  KindOfQuantity,
  OverrideFormat,
  Schema,
  SchemaContext,
  SchemaItemFormatProps,
  SchemaItemType,
  SchemaKey,
  SchemaUnitProvider,
  Unit,
  UnitSystem,
} from "@itwin/ecschema-metadata";
import * as hierarchyBuilder from "@itwin/presentation-hierarchy-builder";
import { createValueFormatter } from "../core-interop/Formatting";

describe("createValueFormatter", () => {
  const schemaContext = {
    getSchema: sinon.stub<[SchemaKey], Schema>(),
  };
  const defaultFormatter = sinon.fake(async () => Promise.resolve("DEFAULT"));
  let defaultFormatterFactory: sinon.SinonStub<[], hierarchyBuilder.IPrimitiveValueFormatter>;
  let formatter: hierarchyBuilder.IPrimitiveValueFormatter;

  function initFormatter(unitSystem?: UnitSystemKey) {
    formatter = createValueFormatter(schemaContext as unknown as SchemaContext, unitSystem);
  }

  beforeEach(() => {
    defaultFormatter.resetHistory();
    defaultFormatterFactory = sinon.stub(hierarchyBuilder, "createDefaultValueFormatter").returns(defaultFormatter);
    initFormatter();
  });

  afterEach(() => {
    defaultFormatterFactory.reset();
  });

  it("returns default formatter result when property doesn't have a KoQ", async () => {
    const prop: hierarchyBuilder.TypedPrimitiveValue = {
      type: "Double",
      value: 1.23,
    };
    expect(await formatter(prop)).to.eq("DEFAULT");
    expect(defaultFormatter).to.be.calledOnceWith(prop);
  });

  it("throws when property references non-existing schema in KoQ", async () => {
    schemaContext.getSchema.resolves(undefined);
    const prop: hierarchyBuilder.TypedPrimitiveValue = {
      type: "Double",
      value: 1.23,
      koqName: "X.Y",
    };
    await expect(formatter(prop)).to.eventually.be.rejectedWith("Invalid schema");
  });

  it("throws when property references non-existing KoQ", async () => {
    schemaContext.getSchema.resolves({
      name: "X",
      getItem: async () => undefined,
    });
    const prop: hierarchyBuilder.TypedPrimitiveValue = {
      type: "Double",
      value: 1.23,
      koqName: "X.Y",
    };
    await expect(formatter(prop)).to.eventually.be.rejectedWith("Invalid kind of quantity");
  });

  it("returns default formatter result when KoQ doesn't specify persistence unit", async () => {
    schemaContext.getSchema.resolves({
      name: "X",
      getItem: async (name: string) => {
        if (name === "Y") {
          return {
            persistenceUnit: Promise.resolve(undefined),
          } as unknown as KindOfQuantity;
        }
        return undefined;
      },
    });
    const prop: hierarchyBuilder.TypedPrimitiveValue = {
      type: "Double",
      value: 1.23,
      koqName: "X.Y",
    };
    expect(await formatter(prop)).to.eq("DEFAULT");
    expect(defaultFormatter).to.be.calledOnceWith(prop);
  });

  it("returns default formatter result when KoQ doesn't specify presentation format", async () => {
    schemaContext.getSchema.resolves({
      name: "X",
      getItem: async (name: string) => {
        if (name === "Y") {
          return {
            persistenceUnit: Promise.resolve({
              unitSystem: Promise.resolve({
                name: "metric",
              } as UnitSystem),
            } as Unit),
            presentationFormats: [],
            defaultPresentationFormat: undefined,
          } as unknown as KindOfQuantity;
        }
        return undefined;
      },
    });
    const prop: hierarchyBuilder.TypedPrimitiveValue = {
      type: "Double",
      value: 1.23,
      koqName: "X.Y",
    };
    expect(await formatter(prop)).to.eq("DEFAULT");
    expect(defaultFormatter).to.be.calledOnceWith(prop);
  });

  it("returns koq formatter result when presentation format is found in koq formats list", async () => {
    initFormatter("metric");
    const persistenceUnit = createUnit("schema.persistence_unit", "metric");
    const presentationUnit = createUnit("schema.presentation_unit", "metric");
    const presentationFormatProps = {} as SchemaItemFormatProps;
    schemaContext.getSchema.resolves({
      name: "schema",
      getItem: async (name: string) => {
        if (name === "koq") {
          return {
            schemaItemType: SchemaItemType.KindOfQuantity,
            persistenceUnit: Promise.resolve(persistenceUnit),
            presentationFormats: [
              {
                units: [[presentationUnit, "presentation unit"]],
                toJSON: () => presentationFormatProps,
              } as unknown as Format,
            ],
            defaultPresentationFormat: undefined,
          } as unknown as KindOfQuantity;
        }
        if (name === "persistence_unit") {
          return persistenceUnit;
        }
        if (name === "presentation_unit") {
          return presentationUnit;
        }
        return undefined;
      },
    });

    const koqFormatterStub = sinon.stub().returns("KOQ FORMAT");
    const quantityFormat = {} as unknown as QuantityFormat;
    const createQuantityFormatStub = sinon.stub(QuantityFormat, "createFromJSON").resolves(quantityFormat);
    const createFormatSpecStub = sinon.stub(FormatterSpec, "create").resolves({
      applyFormatting: koqFormatterStub,
    } as unknown as FormatterSpec);

    expect(
      await formatter({
        type: "Double",
        value: 1.23,
        koqName: "schema.koq",
      }),
    ).to.eq("KOQ FORMAT");
    expect(createQuantityFormatStub).to.be.calledOnceWithExactly(
      "",
      sinon.match((arg) => arg instanceof SchemaUnitProvider),
      presentationFormatProps,
    );
    expect(createFormatSpecStub).to.be.calledOnceWithExactly(
      "",
      quantityFormat,
      sinon.match((arg) => arg instanceof SchemaUnitProvider),
      sinon.match((arg) => arg.name === persistenceUnit.fullName),
    );
    expect(koqFormatterStub).to.be.calledOnceWithExactly(1.23);
  });

  it("returns koq formatter result when persistence unit system matches requested unit system", async () => {
    initFormatter("imperial");

    const persistenceUnit = createUnit("schema.persistence_unit", "imperial");
    schemaContext.getSchema.resolves({
      name: "schema",
      getItem: async (name: string) => {
        if (name === "koq") {
          return {
            schemaItemType: SchemaItemType.KindOfQuantity,
            persistenceUnit: Promise.resolve(persistenceUnit),
            presentationFormats: [],
            defaultPresentationFormat: undefined,
          } as unknown as KindOfQuantity;
        }
        if (name === "persistence_unit") {
          return persistenceUnit;
        }
        return undefined;
      },
    });

    const koqFormatterStub = sinon.stub().returns("KOQ FORMAT");
    const quantityFormat = {} as unknown as QuantityFormat;
    const createQuantityFormatStub = sinon.stub(QuantityFormat, "createFromJSON").resolves(quantityFormat);
    const createFormatSpecStub = sinon.stub(FormatterSpec, "create").resolves({
      applyFormatting: koqFormatterStub,
    } as unknown as FormatterSpec);

    expect(
      await formatter({
        type: "Double",
        value: 1.23,
        koqName: "schema.koq",
      }),
    ).to.eq("KOQ FORMAT");
    expect(createQuantityFormatStub).to.be.calledOnceWithExactly(
      "",
      sinon.match((arg) => arg instanceof SchemaUnitProvider),
      sinon.match((arg: SchemaItemFormatProps) => arg.composite!.units[0].name === persistenceUnit.fullName),
    );
    expect(createFormatSpecStub).to.be.calledOnceWithExactly(
      "",
      quantityFormat,
      sinon.match((arg) => arg instanceof SchemaUnitProvider),
      sinon.match((arg) => arg.name === persistenceUnit.fullName),
    );
    expect(koqFormatterStub).to.be.calledOnceWithExactly(1.23);
  });

  it("returns koq formatter result when default presentation unit is of requested unit system", async () => {
    initFormatter("usCustomary");

    const persistenceUnit = createUnit("schema.persistence_unit", "imperial");
    const defaultPresentationUnit = createUnit("schema.presentation_unit", "usCustomary");
    const defaultPresentationFormatProps = {} as SchemaItemFormatProps;
    schemaContext.getSchema.resolves({
      name: "schema",
      getItem: async (name: string) => {
        if (name === "koq") {
          return {
            schemaItemType: SchemaItemType.KindOfQuantity,
            persistenceUnit: Promise.resolve(persistenceUnit),
            presentationFormats: [],
            defaultPresentationFormat: {
              units: [[defaultPresentationUnit, "presentation unit"]],
              toJSON: () => defaultPresentationFormatProps,
            } as unknown as Format,
          } as unknown as KindOfQuantity;
        }
        if (name === "persistence_unit") {
          return persistenceUnit;
        }
        if (name === "presentation_unit") {
          return defaultPresentationUnit;
        }
        return undefined;
      },
    });

    const koqFormatterStub = sinon.stub().returns("KOQ FORMAT");
    const quantityFormat = {} as unknown as QuantityFormat;
    const createQuantityFormatStub = sinon.stub(QuantityFormat, "createFromJSON").resolves(quantityFormat);
    const createFormatSpecStub = sinon.stub(FormatterSpec, "create").resolves({
      applyFormatting: koqFormatterStub,
    } as unknown as FormatterSpec);

    expect(
      await formatter({
        type: "Double",
        value: 1.23,
        koqName: "schema.koq",
      }),
    ).to.eq("KOQ FORMAT");
    expect(createQuantityFormatStub).to.be.calledOnceWithExactly(
      "",
      sinon.match((arg) => arg instanceof SchemaUnitProvider),
      defaultPresentationFormatProps,
    );
    expect(createFormatSpecStub).to.be.calledOnceWithExactly(
      "",
      quantityFormat,
      sinon.match((arg) => arg instanceof SchemaUnitProvider),
      sinon.match((arg) => arg.name === persistenceUnit.fullName),
    );
    expect(koqFormatterStub).to.be.calledOnceWithExactly(1.23);
  });

  it("returns koq formatter result when koq uses override format", async () => {
    initFormatter("usSurvey");

    const persistenceUnit = createUnit("schema.persistence_unit", "metric");
    const presentationUnit = createUnit("schema.presentation_unit", "usSurvey");
    const overrideFormat = new OverrideFormat({ fullName: "schema.base_format", toJSON: () => ({}) } as Format, undefined, [
      [presentationUnit, "presentation unit"],
    ]);
    schemaContext.getSchema.resolves({
      name: "schema",
      getItem: async (name: string) => {
        if (name === "koq") {
          return {
            schemaItemType: SchemaItemType.KindOfQuantity,
            persistenceUnit: Promise.resolve(persistenceUnit),
            presentationFormats: [],
            defaultPresentationFormat: overrideFormat,
          } as unknown as KindOfQuantity;
        }
        if (name === "persistence_unit") {
          return persistenceUnit;
        }
        if (name === "presentation_unit") {
          return presentationUnit;
        }
        return undefined;
      },
    });

    const koqFormatterStub = sinon.stub().returns("KOQ FORMAT");
    const quantityFormat = {} as unknown as QuantityFormat;
    const createQuantityFormatStub = sinon.stub(QuantityFormat, "createFromJSON").resolves(quantityFormat);
    const createFormatSpecStub = sinon.stub(FormatterSpec, "create").resolves({
      applyFormatting: koqFormatterStub,
    } as unknown as FormatterSpec);

    expect(
      await formatter({
        type: "Double",
        value: 1.23,
        koqName: "schema.koq",
      }),
    ).to.eq("KOQ FORMAT");
    expect(createQuantityFormatStub).to.be.calledOnceWithExactly(
      "",
      sinon.match((arg) => arg instanceof SchemaUnitProvider),
      sinon.match((arg: FormatProps) => arg.composite?.units[0].name === presentationUnit.fullName),
    );
    expect(createFormatSpecStub).to.be.calledOnceWithExactly(
      "",
      quantityFormat,
      sinon.match((arg) => arg instanceof SchemaUnitProvider),
      sinon.match((arg) => arg.name === persistenceUnit.fullName),
    );
    expect(koqFormatterStub).to.be.calledOnceWithExactly(1.23);
  });
});

function createUnit(fullName: string, unitSystem: UnitSystemKey) {
  return {
    schemaItemType: SchemaItemType.Unit,
    fullName,
    unitSystem: Promise.resolve({
      name: unitSystem,
    } as UnitSystem),
  } as unknown as Unit;
}
