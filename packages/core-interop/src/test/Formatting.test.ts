/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { FormatterSpec, Format as QuantityFormat, UnitSystemKey } from "@itwin/core-quantity";
import {
  DelayedPromiseWithProps,
  Format,
  KindOfQuantity,
  LazyLoadedFormat,
  LazyLoadedSchemaItem,
  OverrideFormat,
  Schema,
  SchemaContext,
  SchemaItem,
  SchemaItemFormatProps,
  SchemaItemKey,
  SchemaItemType,
  SchemaKey,
  SchemaUnitProvider,
  Unit,
  UnitSystem,
} from "@itwin/ecschema-metadata";
import { IPrimitiveValueFormatter, parseFullClassName, TypedPrimitiveValue } from "@itwin/presentation-shared";
import { createValueFormatter } from "../core-interop/Formatting.js";

describe("createValueFormatter", () => {
  const schemaContext = {
    getSchema: vi.fn(),
  };
  const defaultFormatter = vi.fn(async () => "DEFAULT");
  let formatter: IPrimitiveValueFormatter;

  function initFormatter(unitSystem?: UnitSystemKey) {
    formatter = createValueFormatter({
      schemaContext: schemaContext as unknown as SchemaContext,
      unitSystem,
      baseFormatter: defaultFormatter,
    });
  }

  beforeEach(() => {
    defaultFormatter.mockClear();
    initFormatter();
  });

  it("returns default formatter result when property doesn't have a KoQ", async () => {
    const prop: TypedPrimitiveValue = {
      type: "Double",
      value: 1.23,
    };
    expect(await formatter(prop)).toBe("DEFAULT");
    expect(defaultFormatter).toHaveBeenCalledOnce();
    expect(defaultFormatter).toHaveBeenCalledWith(prop);
  });

  it("throws when property references non-existing schema in KoQ", async () => {
    schemaContext.getSchema.mockResolvedValue(undefined);
    const prop: TypedPrimitiveValue = {
      type: "Double",
      value: 1.23,
      koqName: "X.Y",
    };
    await expect(formatter(prop)).rejects.toThrow("Invalid schema");
  });

  it("throws when property references non-existing KoQ", async () => {
    schemaContext.getSchema.mockResolvedValue({
      name: "X",
      getItem: async () => undefined,
    });
    const prop: TypedPrimitiveValue = {
      type: "Double",
      value: 1.23,
      koqName: "X.Y",
    };
    await expect(formatter(prop)).rejects.toThrow("Invalid kind of quantity");
  });

  it("returns default formatter result when KoQ doesn't specify persistence unit", async () => {
    schemaContext.getSchema.mockResolvedValue({
      name: "X",
      getItem: async (name: string) => {
        if (name === "Y") {
          return {
            persistenceUnit: undefined,
          } as unknown as KindOfQuantity;
        }
        return undefined;
      },
    });
    const prop: TypedPrimitiveValue = {
      type: "Double",
      value: 1.23,
      koqName: "X.Y",
    };
    expect(await formatter(prop)).toBe("DEFAULT");
    expect(defaultFormatter).toHaveBeenCalledOnce();
    expect(defaultFormatter).toHaveBeenCalledWith(prop);
  });

  it("returns default formatter result when KoQ doesn't specify presentation format", async () => {
    schemaContext.getSchema.mockResolvedValue({
      name: "X",
      getItem: async (name: string) => {
        if (name === "Y") {
          return {
            persistenceUnit: createLazyLoaded({
              key: new SchemaItemKey("persistence_unit", new SchemaKey("units_schema")),
              unitSystem: createLazyLoaded({
                key: new SchemaItemKey("metric", new SchemaKey("units_schema")),
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
    const prop: TypedPrimitiveValue = {
      type: "Double",
      value: 1.23,
      koqName: "X.Y",
    };
    expect(await formatter(prop)).toBe("DEFAULT");
    expect(defaultFormatter).toHaveBeenCalledOnce();
    expect(defaultFormatter).toHaveBeenCalledWith(prop);
  });

  it("returns koq formatter result when presentation format is found in koq formats list", async () => {
    initFormatter("metric");
    const persistenceUnit = createUnit("schema.persistence_unit", "metric");
    const presentationUnit = createUnit("schema.presentation_unit", "metric");
    const presentationFormatProps = {} as SchemaItemFormatProps;
    schemaContext.getSchema.mockResolvedValue({
      name: "schema",
      getItem: async (name: string) => {
        if (name === "koq") {
          return {
            schemaItemType: SchemaItemType.KindOfQuantity,
            persistenceUnit: createLazyLoaded(persistenceUnit),
            presentationFormats: [
              {
                units: [[createLazyLoaded(presentationUnit), "presentation unit"]],
                toJSON: () => presentationFormatProps,
              } as unknown as LazyLoadedFormat,
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

    const koqFormatterStub = vi.fn().mockReturnValue("KOQ FORMAT");
    const quantityFormat = {} as unknown as QuantityFormat;
    const createQuantityFormatStub = vi.spyOn(QuantityFormat, "createFromJSON").mockResolvedValue(quantityFormat);
    const createFormatSpecStub = vi.spyOn(FormatterSpec, "create").mockResolvedValue({
      applyFormatting: koqFormatterStub,
    } as unknown as FormatterSpec);

    expect(
      await formatter({
        type: "Double",
        value: 1.23,
        koqName: "schema.koq",
      }),
    ).toBe("KOQ FORMAT");
    expect(createQuantityFormatStub).toHaveBeenCalledOnce();
    expect(createQuantityFormatStub.mock.calls[0][0]).toBe("");
    expect(createQuantityFormatStub.mock.calls[0][1]).toBeInstanceOf(SchemaUnitProvider);
    expect(createQuantityFormatStub.mock.calls[0][2]).toBe(presentationFormatProps);
    expect(createFormatSpecStub).toHaveBeenCalledOnce();
    expect(createFormatSpecStub.mock.calls[0][0]).toBe("");
    expect(createFormatSpecStub.mock.calls[0][1]).toBe(quantityFormat);
    expect(createFormatSpecStub.mock.calls[0][2]).toBeInstanceOf(SchemaUnitProvider);
    expect(createFormatSpecStub.mock.calls[0][3]!.name).toBe(persistenceUnit.fullName);
    expect(koqFormatterStub).toHaveBeenCalledOnce();
    expect(koqFormatterStub).toHaveBeenCalledWith(1.23);
  });

  it("returns koq formatter result when presentation override format is found in koq formats list", async () => {
    initFormatter("metric");
    const persistenceUnit = createUnit("schema.persistence_unit", "metric");
    const presentationUnit = createUnit("schema.presentation_unit", "metric");
    // eslint-disable-next-line @itwin/no-internal
    const overrideFormat = new OverrideFormat({ fullName: "schema.base_format", toJSON: () => ({}) } as Format, undefined, [
      [createLazyLoaded(presentationUnit), "presentation unit"],
    ]);
    schemaContext.getSchema.mockResolvedValue({
      name: "schema",
      getItem: async (name: string) => {
        if (name === "koq") {
          return {
            schemaItemType: SchemaItemType.KindOfQuantity,
            persistenceUnit: createLazyLoaded(persistenceUnit),
            presentationFormats: [overrideFormat],
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

    const koqFormatterStub = vi.fn().mockReturnValue("KOQ FORMAT");
    const quantityFormat = {} as unknown as QuantityFormat;
    const createQuantityFormatStub = vi.spyOn(QuantityFormat, "createFromJSON").mockResolvedValue(quantityFormat);
    const createFormatSpecStub = vi.spyOn(FormatterSpec, "create").mockResolvedValue({
      applyFormatting: koqFormatterStub,
    } as unknown as FormatterSpec);

    expect(
      await formatter({
        type: "Double",
        value: 1.23,
        koqName: "schema.koq",
      }),
    ).toBe("KOQ FORMAT");
    expect(createQuantityFormatStub).toHaveBeenCalledOnce();
    expect(createQuantityFormatStub.mock.calls[0][0]).toBe("");
    expect(createQuantityFormatStub.mock.calls[0][1]).toBeInstanceOf(SchemaUnitProvider);
    expect(createQuantityFormatStub.mock.calls[0][2].composite?.units[0].name).toBe(presentationUnit.fullName);
    expect(createFormatSpecStub).toHaveBeenCalledOnce();
    expect(createFormatSpecStub.mock.calls[0][0]).toBe("");
    expect(createFormatSpecStub.mock.calls[0][1]).toBe(quantityFormat);
    expect(createFormatSpecStub.mock.calls[0][2]).toBeInstanceOf(SchemaUnitProvider);
    expect(createFormatSpecStub.mock.calls[0][3]?.name).toBe(persistenceUnit.fullName);
    expect(koqFormatterStub).toHaveBeenCalledOnce();
    expect(koqFormatterStub).toHaveBeenCalledWith(1.23);
  });

  it("returns koq formatter result when persistence unit system matches requested unit system", async () => {
    initFormatter("imperial");

    const persistenceUnit = createUnit("schema.persistence_unit", "imperial");
    schemaContext.getSchema.mockResolvedValue({
      name: "schema",
      getItem: async (name: string) => {
        if (name === "koq") {
          return {
            schemaItemType: SchemaItemType.KindOfQuantity,
            persistenceUnit: createLazyLoaded(persistenceUnit),
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

    const koqFormatterStub = vi.fn().mockReturnValue("KOQ FORMAT");
    const quantityFormat = {} as unknown as QuantityFormat;
    const createQuantityFormatStub = vi.spyOn(QuantityFormat, "createFromJSON").mockResolvedValue(quantityFormat);
    const createFormatSpecStub = vi.spyOn(FormatterSpec, "create").mockResolvedValue({
      applyFormatting: koqFormatterStub,
    } as unknown as FormatterSpec);

    expect(
      await formatter({
        type: "Double",
        value: 1.23,
        koqName: "schema.koq",
      }),
    ).toBe("KOQ FORMAT");
    expect(createQuantityFormatStub).toHaveBeenCalledOnce();
    expect(createQuantityFormatStub.mock.calls[0][0]).toBe("");
    expect(createQuantityFormatStub.mock.calls[0][1]).toBeInstanceOf(SchemaUnitProvider);
    expect((createQuantityFormatStub.mock.calls[0][2] as SchemaItemFormatProps).composite!.units[0].name).toBe(persistenceUnit.fullName);
    expect(createFormatSpecStub).toHaveBeenCalledOnce();
    expect(createFormatSpecStub.mock.calls[0][0]).toBe("");
    expect(createFormatSpecStub.mock.calls[0][1]).toBe(quantityFormat);
    expect(createFormatSpecStub.mock.calls[0][2]).toBeInstanceOf(SchemaUnitProvider);
    expect(createFormatSpecStub.mock.calls[0][3]!.name).toBe(persistenceUnit.fullName);
    expect(koqFormatterStub).toHaveBeenCalledOnce();
    expect(koqFormatterStub).toHaveBeenCalledWith(1.23);
  });

  it("returns koq formatter result when default presentation unit is of requested unit system", async () => {
    initFormatter("usCustomary");

    const persistenceUnit = createUnit("schema.persistence_unit", "imperial");
    const defaultPresentationUnit = createUnit("schema.presentation_unit", "usCustomary");
    const defaultPresentationFormatProps = {} as SchemaItemFormatProps;
    schemaContext.getSchema.mockResolvedValue({
      name: "schema",
      getItem: async (name: string) => {
        if (name === "koq") {
          return {
            schemaItemType: SchemaItemType.KindOfQuantity,
            persistenceUnit: createLazyLoaded(persistenceUnit),
            presentationFormats: [],
            defaultPresentationFormat: {
              units: [[createLazyLoaded(defaultPresentationUnit), "presentation unit"]],
              toJSON: () => defaultPresentationFormatProps,
            } as unknown as LazyLoadedFormat,
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

    const koqFormatterStub = vi.fn().mockReturnValue("KOQ FORMAT");
    const quantityFormat = {} as unknown as QuantityFormat;
    const createQuantityFormatStub = vi.spyOn(QuantityFormat, "createFromJSON").mockResolvedValue(quantityFormat);
    const createFormatSpecStub = vi.spyOn(FormatterSpec, "create").mockResolvedValue({
      applyFormatting: koqFormatterStub,
    } as unknown as FormatterSpec);

    expect(
      await formatter({
        type: "Double",
        value: 1.23,
        koqName: "schema.koq",
      }),
    ).toBe("KOQ FORMAT");
    expect(createQuantityFormatStub).toHaveBeenCalledOnce();
    expect(createQuantityFormatStub.mock.calls[0][0]).toBe("");
    expect(createQuantityFormatStub.mock.calls[0][1]).toBeInstanceOf(SchemaUnitProvider);
    expect(createQuantityFormatStub.mock.calls[0][2]).toBe(defaultPresentationFormatProps);
    expect(createFormatSpecStub).toHaveBeenCalledOnce();
    expect(createFormatSpecStub.mock.calls[0][0]).toBe("");
    expect(createFormatSpecStub.mock.calls[0][1]).toBe(quantityFormat);
    expect(createFormatSpecStub.mock.calls[0][2]).toBeInstanceOf(SchemaUnitProvider);
    expect(createFormatSpecStub.mock.calls[0][3]!.name).toBe(persistenceUnit.fullName);
    expect(koqFormatterStub).toHaveBeenCalledOnce();
    expect(koqFormatterStub).toHaveBeenCalledWith(1.23);
  });

  it("returns koq formatter result when koq uses override format as default presentation format", async () => {
    initFormatter("usSurvey");

    const persistenceUnit = createUnit("schema.persistence_unit", "metric");
    const presentationUnit = createUnit("schema.presentation_unit", "usSurvey");
    // eslint-disable-next-line @itwin/no-internal
    const overrideFormat = new OverrideFormat({ fullName: "schema.base_format", toJSON: () => ({}) } as Format, undefined, [
      [createLazyLoaded(presentationUnit), "presentation unit"],
    ]);
    schemaContext.getSchema.mockResolvedValue({
      name: "schema",
      getItem: async (name: string) => {
        if (name === "koq") {
          return {
            schemaItemType: SchemaItemType.KindOfQuantity,
            persistenceUnit: createLazyLoaded(persistenceUnit),
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

    const koqFormatterStub = vi.fn().mockReturnValue("KOQ FORMAT");
    const quantityFormat = {} as unknown as QuantityFormat;
    const createQuantityFormatStub = vi.spyOn(QuantityFormat, "createFromJSON").mockResolvedValue(quantityFormat);
    const createFormatSpecStub = vi.spyOn(FormatterSpec, "create").mockResolvedValue({
      applyFormatting: koqFormatterStub,
    } as unknown as FormatterSpec);

    expect(
      await formatter({
        type: "Double",
        value: 1.23,
        koqName: "schema.koq",
      }),
    ).toBe("KOQ FORMAT");
    expect(createQuantityFormatStub).toHaveBeenCalledOnce();
    expect(createQuantityFormatStub.mock.calls[0][0]).toBe("");
    expect(createQuantityFormatStub.mock.calls[0][1]).toBeInstanceOf(SchemaUnitProvider);
    expect(createQuantityFormatStub.mock.calls[0][2].composite?.units[0].name).toBe(presentationUnit.fullName);
    expect(createFormatSpecStub).toHaveBeenCalledOnce();
    expect(createFormatSpecStub.mock.calls[0][0]).toBe("");
    expect(createFormatSpecStub.mock.calls[0][1]).toBe(quantityFormat);
    expect(createFormatSpecStub.mock.calls[0][2]).toBeInstanceOf(SchemaUnitProvider);
    expect(createFormatSpecStub.mock.calls[0][3]?.name).toBe(persistenceUnit.fullName);
    expect(koqFormatterStub).toHaveBeenCalledOnce();
    expect(koqFormatterStub).toHaveBeenCalledWith(1.23);
  });
});

function createUnit(fullName: string, unitSystem: UnitSystemKey) {
  const { schemaName, className } = parseFullClassName(fullName);
  return {
    schemaItemType: SchemaItemType.Unit,
    key: new SchemaItemKey(className, new SchemaKey(schemaName)),
    schema: {} as Schema,
    fullName,
    unitSystem: createLazyLoaded({
      key: new SchemaItemKey(unitSystem, new SchemaKey("units_schema")),
      name: unitSystem,
    } as UnitSystem),
  } as unknown as Unit;
}

function createLazyLoaded<T extends SchemaItem>(item: T): LazyLoadedSchemaItem<T> {
  // eslint-disable-next-line @itwin/no-internal
  return new DelayedPromiseWithProps(item.key, async () => Promise.resolve(item)) as LazyLoadedSchemaItem<T>;
}
