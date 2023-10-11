/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { FormatProps, FormatterSpec, Format as QuantityFormat, UnitsProvider, UnitSystemKey } from "@itwin/core-quantity";
import {
  Format,
  InvertedUnit,
  KindOfQuantity,
  OverrideFormat,
  SchemaContext,
  SchemaKey,
  SchemaMatchType,
  SchemaUnitProvider,
  Unit,
} from "@itwin/ecschema-metadata";
import { createDefaultValueFormatter, IPrimitiveValueFormatter, parseFullClassName, TypedPrimitiveValue } from "@itwin/presentation-hierarchy-builder";

/**
 * Creates a formatter that knows how to format values of properties with assigned kind of quantity. In case the property
 * does not have an assigned kind of quantity, the default formatter is used.
 *
 * @beta
 */
export function createValueFormatter(schemaContext: SchemaContext, unitSystem?: UnitSystemKey): IPrimitiveValueFormatter {
  const baseFormatter = createDefaultValueFormatter();
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
  const koq = await schema.getItem<KindOfQuantity>(koqName);
  if (!koq) {
    throw new Error(`Invalid kind of quantity "${koqName}" specified in KoQ full name "${fullName}" - it does not exist in schema "${schemaName}"`);
  }
  return koq;
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
  // istanbul ignore if
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
      const unit = format.units && format.units[0][0];
      // istanbul ignore if
      if (!unit) {
        continue;
      }
      const currentUnitSystem = await unit.unitSystem;
      if (currentUnitSystem && currentUnitSystem.name.toUpperCase() === system) {
        return format;
      }
    }
  }
  return undefined;
}

function getFormatProps(format: Format | OverrideFormat): FormatProps {
  return format instanceof OverrideFormat ? format.getFormatProps() : format.toJSON();
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
