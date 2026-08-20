/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { FormatterSpec, Format as QuantityFormat } from "@itwin/core-quantity";
import { createDefaultValueFormatter, normalizeFullClassName, parseFullClassName } from "@itwin/presentation-shared";
import { createBatchedSchemaViewGetter } from "./Metadata.js";

import type { FormatsProvider, UnitsProvider, UnitSystemKey } from "@itwin/core-quantity";
import type { SchemaView } from "@itwin/ecschema-metadata";
import type { IPrimitiveValueFormatter, TypedPrimitiveValue } from "@itwin/presentation-shared";

/**
 * Subset of `SchemaView` used to look up a kind of quantity's persistence unit.
 * @public
 */
type PersistenceUnitSchemaView = Pick<SchemaView, "findKindOfQuantity">;

/**
 * Props for `createValueFormatter` function.
 * @public
 */
interface CreateValueFormatterProps {
  /**
   * Supplies `FormatProps` for a property's kind of quantity, by its full name. On the frontend, `IModelApp.formatsProvider`
   * satisfies this. `getFormat` returning `undefined` means no format is registered for the kind of quantity - `baseFormatter`
   * is used in that case.
   */
  formatsProvider: Pick<FormatsProvider, "getFormat">;

  /**
   * Resolves units and is used to build format specs. On the frontend, `IModelApp.quantityFormatter` implements this
   * interface directly.
   */
  unitsProvider: UnitsProvider;

  /**
   * Supplies [SchemaView](https://www.itwinjs.org/reference/ecschema-metadata/context/schemaview/) instances used to look up
   * a kind of quantity's persistence unit. `IModelDb` and `IModelConnection` satisfy this shape directly.
   */
  imodel: { getSchemaView(props?: { schemas?: string[] }): Promise<PersistenceUnitSchemaView> };

  /**
   * An optional unit system override, forwarded to `formatsProvider.getFormat`. If not provided, `formatsProvider` formats
   * using whatever unit system it's configured with.
   */
  unitSystem?: UnitSystemKey;

  /**
   * Base primitive value formatter used whenever a property's value can't be formatted using unit information - e.g. the
   * property doesn't have a kind of quantity, no format is registered for it, or its kind of quantity doesn't specify a usable
   * persistence unit. Defaults to the result of `createDefaultValueFormatter` from `@itwin/presentation-shared` package.
   */
  baseFormatter?: IPrimitiveValueFormatter;
}

/**
 * Creates an instance of `IPrimitiveValueFormatter` that knows how to format values of properties with assigned kind of quantity. In
 * case the property does not have an assigned kind of quantity, the base formatter is used.
 *
 * Usage example:
 *
 * ```ts
 * import { IModelApp, IModelConnection } from "@itwin/core-frontend";
 * import { createValueFormatter } from "@itwin/presentation-core-interop";
 *
 * const imodel: IModelConnection = getIModel();
 * const formatter = createValueFormatter({
 *   formatsProvider: IModelApp.formatsProvider,
 *   unitsProvider: IModelApp.quantityFormatter,
 *   imodel,
 *   unitSystem: "metric",
 * });
 * const formattedValue = await formatter({ type: "Double", value: 1.234, koqName: "MySchema.LengthKindOfQuantity" });
 * ```
 *
 * On the backend, where there's no `IModelApp`, construct equivalent `formatsProvider` / `unitsProvider` instances
 * from the active iModel using `SchemaFormatsProvider` and `SchemaUnitProvider` from `@itwin/ecschema-metadata`,
 * ideally caching them per iModel.
 *
 * @public
 */
export function createValueFormatter(props: CreateValueFormatterProps): IPrimitiveValueFormatter {
  const { formatsProvider, unitsProvider, imodel, unitSystem } = props;
  /* v8 ignore next -- @preserve */
  const baseFormatter = props.baseFormatter ?? createDefaultValueFormatter();
  const getSchemaView = createBatchedSchemaViewGetter(imodel);
  return async function (value: TypedPrimitiveValue): Promise<string> {
    if (value.type === "Double" && !!value.koqName) {
      const spec = await getFormatterSpec({
        formatsProvider,
        unitsProvider,
        getSchemaView,
        koqName: value.koqName,
        unitSystem,
      });
      if (spec) {
        return spec.applyFormatting(value.value);
      }
    }
    return baseFormatter(value);
  };
}

async function getFormatterSpec(props: {
  formatsProvider: Pick<FormatsProvider, "getFormat">;
  unitsProvider: UnitsProvider;
  getSchemaView: (schemaName: string) => Promise<PersistenceUnitSchemaView>;
  koqName: string;
  unitSystem?: UnitSystemKey;
}): Promise<FormatterSpec | undefined> {
  const { formatsProvider, unitsProvider, getSchemaView, koqName, unitSystem } = props;
  const formatProps = await formatsProvider.getFormat(koqName, unitSystem);
  if (!formatProps) {
    return undefined;
  }
  const persistenceUnitName = await getPersistenceUnitName(getSchemaView, koqName);
  if (!persistenceUnitName) {
    return undefined;
  }
  const persistenceUnit = await unitsProvider.findUnitByName(persistenceUnitName);
  const format = await QuantityFormat.createFromJSON("", unitsProvider, formatProps);
  return FormatterSpec.create("", format, unitsProvider, persistenceUnit);
}

async function getPersistenceUnitName(
  getSchemaView: (schemaName: string) => Promise<PersistenceUnitSchemaView>,
  koqName: string,
): Promise<string | undefined> {
  const { schemaName } = parseFullClassName(koqName);
  const schemaView = await getSchemaView(schemaName);
  const koq = schemaView.findKindOfQuantity(koqName);
  if (!koq) {
    return undefined;
  }
  try {
    // Legacy ECDb profiles (pre EC3.2 Units/Formats migration) return persistence units in a format this doesn't understand.
    return normalizeFullClassName(koq.persistenceUnit);
  } catch {
    return undefined;
  }
}
