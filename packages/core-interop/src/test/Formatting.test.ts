/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { FormatterSpec, Format as QuantityFormat } from "@itwin/core-quantity";
import { createValueFormatter } from "../core-interop/Formatting.js";

import type { UnitsProvider, UnitSystemKey } from "@itwin/core-quantity";
import type { SchemaView } from "@itwin/ecschema-metadata";
import type { IPrimitiveValueFormatter, TypedPrimitiveValue } from "@itwin/presentation-shared";

describe("createValueFormatter", () => {
  const formatsProvider = { getFormat: vi.fn() };
  const findUnitByName = vi.fn();
  const unitsProvider = { findUnitByName } as unknown as UnitsProvider;
  const findKindOfQuantity = vi.fn();
  const getSchemaByAlias = vi.fn();
  const getSchemaView = vi.fn(
    async (): Promise<Pick<SchemaView, "findKindOfQuantity" | "getSchemaByAlias">> => ({
      findKindOfQuantity,
      getSchemaByAlias,
    }),
  );
  const imodel = { getSchemaView };
  const defaultFormatter = vi.fn(async () => "DEFAULT");
  let formatter: IPrimitiveValueFormatter;

  function initFormatter(unitSystem?: UnitSystemKey) {
    formatter = createValueFormatter({
      formatsProvider,
      unitsProvider,
      imodel,
      unitSystem,
      baseFormatter: defaultFormatter,
    });
  }

  beforeEach(() => {
    defaultFormatter.mockClear();
    formatsProvider.getFormat.mockReset();
    findUnitByName.mockReset();
    getSchemaView.mockClear();
    findKindOfQuantity.mockReset();
    getSchemaByAlias.mockReset().mockReturnValue(undefined);
    initFormatter();
  });

  it("returns default formatter result when property doesn't have a KoQ", async () => {
    const prop: TypedPrimitiveValue = { type: "Double", value: 1.23 };
    expect(await formatter(prop)).toBe("DEFAULT");
    expect(defaultFormatter).toHaveBeenCalledExactlyOnceWith(prop);
    expect(formatsProvider.getFormat).not.toHaveBeenCalled();
  });

  it("returns default formatter result for non-Double values", async () => {
    const prop: TypedPrimitiveValue = { type: "String", value: "abc" };
    expect(await formatter(prop)).toBe("DEFAULT");
    expect(defaultFormatter).toHaveBeenCalledExactlyOnceWith(prop);
    expect(formatsProvider.getFormat).not.toHaveBeenCalled();
  });

  it("returns default formatter result when no format is registered for the KoQ", async () => {
    formatsProvider.getFormat.mockResolvedValue(undefined);
    const prop: TypedPrimitiveValue = { type: "Double", value: 1.23, koqName: "schema.koq" };
    expect(await formatter(prop)).toBe("DEFAULT");
    expect(formatsProvider.getFormat).toHaveBeenCalledExactlyOnceWith("schema.koq", undefined);
    expect(defaultFormatter).toHaveBeenCalledExactlyOnceWith(prop);
  });

  it("returns default formatter result when KoQ is not found in SchemaView", async () => {
    formatsProvider.getFormat.mockResolvedValue({});
    findKindOfQuantity.mockReturnValue(undefined);
    const prop: TypedPrimitiveValue = { type: "Double", value: 1.23, koqName: "schema.koq" };
    expect(await formatter(prop)).toBe("DEFAULT");
    expect(defaultFormatter).toHaveBeenCalledExactlyOnceWith(prop);
  });

  it("returns default formatter result when KoQ's persistence unit can't be normalized (e.g. legacy FUS format)", async () => {
    formatsProvider.getFormat.mockResolvedValue({});
    findKindOfQuantity.mockReturnValue({ persistenceUnit: "not-a-valid-full-name" });
    const prop: TypedPrimitiveValue = { type: "Double", value: 1.23, koqName: "schema.koq" };
    expect(await formatter(prop)).toBe("DEFAULT");
    expect(defaultFormatter).toHaveBeenCalledExactlyOnceWith(prop);
  });

  it("formats value using resolved format and persistence unit", async () => {
    initFormatter("metric");
    const formatProps = {};
    formatsProvider.getFormat.mockResolvedValue(formatProps);
    findKindOfQuantity.mockReturnValue({ persistenceUnit: "Units:M" });

    const persistenceUnit = {};
    findUnitByName.mockResolvedValue(persistenceUnit);
    const koqFormatterStub = vi.fn().mockReturnValue("KOQ FORMAT");
    const quantityFormat = {} as unknown as QuantityFormat;
    const createQuantityFormatStub = vi.spyOn(QuantityFormat, "createFromJSON").mockResolvedValue(quantityFormat);
    const createFormatSpecStub = vi
      .spyOn(FormatterSpec, "create")
      .mockResolvedValue({ applyFormatting: koqFormatterStub } as unknown as FormatterSpec);

    expect(await formatter({ type: "Double", value: 1.23, koqName: "schema.koq" })).toBe("KOQ FORMAT");
    expect(formatsProvider.getFormat).toHaveBeenCalledExactlyOnceWith("schema.koq", "metric");
    expect(findUnitByName).toHaveBeenCalledExactlyOnceWith("Units.M");
    expect(createQuantityFormatStub).toHaveBeenCalledExactlyOnceWith("", unitsProvider, formatProps);
    expect(createFormatSpecStub).toHaveBeenCalledExactlyOnceWith("", quantityFormat, unitsProvider, persistenceUnit);
    expect(koqFormatterStub).toHaveBeenCalledExactlyOnceWith(1.23);
  });

  it("resolves an alias-qualified persistence unit via getSchemaByAlias", async () => {
    initFormatter("metric");
    const formatProps = {};
    formatsProvider.getFormat.mockResolvedValue(formatProps);
    findKindOfQuantity.mockReturnValue({ persistenceUnit: "myAlias:M" });
    getSchemaByAlias.mockImplementation((alias: string) => (alias === "myAlias" ? { name: "CustomUnits" } : undefined));

    const persistenceUnit = {};
    findUnitByName.mockResolvedValue(persistenceUnit);
    vi.spyOn(QuantityFormat, "createFromJSON").mockResolvedValue({} as unknown as QuantityFormat);
    vi.spyOn(FormatterSpec, "create").mockResolvedValue({ applyFormatting: vi.fn() } as unknown as FormatterSpec);

    await formatter({ type: "Double", value: 1.23, koqName: "schema.koq" });
    expect(getSchemaByAlias).toHaveBeenCalledExactlyOnceWith("myAlias");
    expect(findUnitByName).toHaveBeenCalledExactlyOnceWith("CustomUnits.M");
  });

  it("falls back to well-known aliases for the excluded Units/Formats schemas", async () => {
    initFormatter("metric");
    const formatProps = {};
    formatsProvider.getFormat.mockResolvedValue(formatProps);
    // `getSchemaByAlias` can never resolve `Units`/`Formats` - they're excluded from `SchemaView`.
    findKindOfQuantity.mockReturnValue({ persistenceUnit: "u:M" });

    const persistenceUnit = {};
    findUnitByName.mockResolvedValue(persistenceUnit);
    vi.spyOn(QuantityFormat, "createFromJSON").mockResolvedValue({} as unknown as QuantityFormat);
    vi.spyOn(FormatterSpec, "create").mockResolvedValue({ applyFormatting: vi.fn() } as unknown as FormatterSpec);

    await formatter({ type: "Double", value: 1.23, koqName: "schema.koq" });
    expect(findUnitByName).toHaveBeenCalledExactlyOnceWith("Units.M");
  });

  it("forwards unitSystem override to formatsProvider.getFormat", async () => {
    formatsProvider.getFormat.mockResolvedValue(undefined);
    await formatter({ type: "Double", value: 1.23, koqName: "schema.koq" });
    expect(formatsProvider.getFormat).toHaveBeenCalledExactlyOnceWith("schema.koq", undefined);

    initFormatter("imperial");
    formatsProvider.getFormat.mockResolvedValue(undefined);
    await formatter({ type: "Double", value: 1.23, koqName: "schema.koq" });
    expect(formatsProvider.getFormat).toHaveBeenCalledWith("schema.koq", "imperial");
  });

  it("batches same-frame getSchemaView requests for different KoQs", async () => {
    formatsProvider.getFormat.mockResolvedValue({});
    findKindOfQuantity.mockReturnValue(undefined);

    await Promise.all([
      formatter({ type: "Double", value: 1, koqName: "schemaA.koq1" }),
      formatter({ type: "Double", value: 2, koqName: "schemaA.koq2" }),
    ]);

    expect(getSchemaView).toHaveBeenCalledExactlyOnceWith({ schemas: ["schemaA"] });
  });
});
