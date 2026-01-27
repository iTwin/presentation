/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { FormatterSpec, Format as QuantityFormat } from "@itwin/core-quantity";
import { OverrideFormat, SchemaKey, SchemaMatchType, SchemaUnitProvider } from "@itwin/ecschema-metadata";
import { createDefaultValueFormatter, parseFullClassName } from "@itwin/presentation-shared";

import type { FormatProps, UnitsProvider, UnitSystemKey } from "@itwin/core-quantity";
import type { Format, InvertedUnit, KindOfQuantity, LazyLoadedFormat, SchemaContext, Unit } from "@itwin/ecschema-metadata";
import type { IPrimitiveValueFormatter, TypedPrimitiveValue } from "@itwin/presentation-shared";

/**
 * Props for `createValueFormatter` function.
 * @public
 */
interface CreateValueFormatterProps {
  /**
   * An instance of [SchemaContext](https://www.itwinjs.org/reference/ecschema-metadata/context/schemacontext/) for
   * getting units information. Generally, retrieved directly from `IModelDb` or `IModelConnection` using the `schemaContext` accessor.
   */
  schemaContext: SchemaContext;

  /**
   * An optional unit system to use for formatting property values. If not provided, default presentation units are used. If a property
   * doesn't have a default presentation unit, then persistence unit is used. Finally, if a property doesn't have a unit assigned at all,
   * `baseFormatter` is used to format the property value.
   */
  unitSystem?: UnitSystemKey;

  /**
   * Base primitive value formatter for cases when a property doesn't have any units' information. Defaults to the result of `createDefaultValueFormatter`
   * from `@itwin/presentation-shared` package.
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
 * import { IModelConnection } from "@itwin/core-frontend";
 * import { createValueFormatter } from "@itwin/presentation-core-interop";
 *
 * const imodel: IModelConnection = getIModel();
 * const formatter = createValueFormatter({ schemaContext: imodel.schemaContext, unitSystem: "metric" });
 * const formattedValue = await formatter({ type: "Double", value: 1.234, koqName: "MySchema.LengthKindOfQuantity" });
 * ```
 *
 * @public
 */
export function createValueFormatter(props: CreateValueFormatterProps): IPrimitiveValueFormatter {
  const { schemaContext, unitSystem } = props;
  const baseFormatter = props.baseFormatter ?? /* c8 ignore next */ createDefaultValueFormatter();
  const unitsProvider = new SchemaUnitProvider(schemaContext);
  return async function (value: TypedPrimitiveValue): Promise<string> {
    if (value.type === "Double" && !!value.koqName) {
      const koq = await getKindOfQuantity(schemaContext, value.koqName);
      const spec = await getFormatterSpec(unitsProvider, koq, unitSystem);
      if (spec) {
        return spec.applyFormatting(value.value);
      }
    }
    return baseFormatter(value);
  };
}

async function getKindOfQuantity(schemas: SchemaContext, fullName: string) {
  const { schemaName, className: koqName } = parseFullClassName(fullName);
  const schema = await schemas.getSchema(new SchemaKey(schemaName), SchemaMatchType.Latest);
  if (!schema) {
    throw new Error(`Invalid schema "${schemaName}" specified in KoQ full name "${fullName}"`);
  }
  // TODO: replace with `schema.getItem(koqName, KindOfQuantity)` when itwinjs-core 4.x is dropped
  const koq = await schema.getItem(koqName);
  if (!koq) {
    throw new Error(`Invalid kind of quantity "${koqName}" specified in KoQ full name "${fullName}" - it does not exist in schema "${schemaName}"`);
  }
  return koq as KindOfQuantity;
}

async function getFormatterSpec(unitsProvider: UnitsProvider, koq: KindOfQuantity, unitSystem?: UnitSystemKey) {
  const formattingProps = await getFormattingProps(koq, unitSystem);
  if (!formattingProps) {
    return undefined;
  }
  const { formatProps, persistenceUnitName } = formattingProps;
  const persistenceUnit = await unitsProvider.findUnitByName(persistenceUnitName);
  const format = await QuantityFormat.createFromJSON("", unitsProvider, formatProps);
  return FormatterSpec.create("", format, unitsProvider, persistenceUnit);
}

interface FormattingProps {
  formatProps: FormatProps;
  persistenceUnitName: string;
}

async function getFormattingProps(koq: KindOfQuantity, unitSystem?: UnitSystemKey): Promise<FormattingProps | undefined> {
  const persistenceUnit = await koq.persistenceUnit;
  /* c8 ignore next 3 */
  if (!persistenceUnit) {
    return undefined;
  }
  const formatProps = await getKoqFormatProps(koq, persistenceUnit, unitSystem);
  if (!formatProps) {
    return undefined;
  }
  return { formatProps, persistenceUnitName: persistenceUnit.fullName };
}

async function getKoqFormatProps(koq: KindOfQuantity, persistenceUnit: Unit | InvertedUnit, unitSystem?: UnitSystemKey) {
  const unitSystems = getUnitSystemGroupNames(unitSystem);
  // use one of KOQ presentation format that matches requested unit system
  const presentationFormat = await getKoqPresentationFormat(koq, unitSystems);
  if (presentationFormat) {
    return getFormatProps(presentationFormat);
  }

  // use persistence unit format if it matches requested unit system and matching presentation format was not found
  const persistenceUnitSystem = await persistenceUnit.unitSystem;
  if (persistenceUnitSystem && unitSystems.includes(persistenceUnitSystem.name.toUpperCase())) {
    return getPersistenceUnitFormatProps(persistenceUnit);
  }

  // use default presentation format if persistence unit does not match requested unit system
  if (koq.defaultPresentationFormat) {
    return getFormatProps(koq.defaultPresentationFormat);
  }

  return undefined;
}

async function getKoqPresentationFormat(koq: KindOfQuantity, unitSystems: string[]) {
  const presentationFormats = koq.presentationFormats;
  for (const system of unitSystems) {
    for (const format of presentationFormats) {
      const units = format instanceof OverrideFormat ? format.units : (await format).units;
      const lazyUnit = units && units[0][0];
      const currentUnitSystem = lazyUnit && (await lazyUnit).unitSystem;
      if (currentUnitSystem && currentUnitSystem.name.toUpperCase() === system) {
        return format;
      }
    }
  }
  return undefined;
}

async function getFormatProps(format: LazyLoadedFormat | OverrideFormat | Format): Promise<FormatProps> {
  return format instanceof OverrideFormat ? format.getFormatProps() : (await format).toJSON();
}

function getPersistenceUnitFormatProps(persistenceUnit: Unit | InvertedUnit): FormatProps {
  // Same as Format "DefaultRealU" in Formats ecschema
  return {
    formatTraits: ["keepSingleZero", "keepDecimalPoint", "showUnitLabel"],
    precision: 6,
    type: "Decimal",
    uomSeparator: " ",
    decimalSeparator: ".",
    composite: {
      units: [
        {
          name: persistenceUnit.fullName,
          label: persistenceUnit.label,
        },
      ],
    },
  };
}

function getUnitSystemGroupNames(unitSystem?: UnitSystemKey) {
  switch (unitSystem) {
    case "imperial":
      return ["IMPERIAL", "USCUSTOM", "INTERNATIONAL", "FINANCE"];
    case "metric":
      return ["SI", "METRIC", "INTERNATIONAL", "FINANCE"];
    case "usCustomary":
      return ["USCUSTOM", "INTERNATIONAL", "FINANCE"];
    case "usSurvey":
      return ["USSURVEY", "USCUSTOM", "INTERNATIONAL", "FINANCE"];
  }
  return [];
}
