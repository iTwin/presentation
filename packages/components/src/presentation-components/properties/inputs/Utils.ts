/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Format, Parser, ParserSpec, UnitsProvider } from "@itwin/core-quantity";

const FRACTIONAL_PRECISION = "1/16";

/**
 * Finds rounding error for entered value and converts it to persistence unit.
 * @internal
 */
export async function getPersistenceUnitRoundingError(numberStr: string, parser: ParserSpec, unitsProvider: UnitsProvider): Promise<number | undefined> {
  const tokens = Parser.parseQuantitySpecification(numberStr, parser.format);
  const enteredUnit = tokens.length > 0 && tokens[tokens.length - 1].isString ? (tokens[tokens.length - 1].value as string) : undefined;

  // find unit of entered value that will be used when determining precision
  const unitLabel = await getUnitLabel(parser.format, enteredUnit, unitsProvider);
  const precisionStr = getPrecision(numberStr, unitLabel);
  if (!precisionStr) {
    return undefined;
  }

  // convert precision to persistence unit
  const parseResult = parser.parseToQuantityValue(unitLabel && enteredUnit ? `${precisionStr}${enteredUnit}` : precisionStr);
  return parseResult.ok ? parseResult.value : undefined;
}

/** @internal */
export function getDecimalRoundingError(numStr: string) {
  const precision = getDecimalPrecision(numStr);
  return precision ? Number(precision) : undefined;
}

async function getUnitLabel(format: Format, enteredLabel: string | undefined, unitsProvider: UnitsProvider) {
  const defaultUnit = format.units ? format.units[0][0] : undefined;
  if (!enteredLabel) {
    return defaultUnit?.label;
  }

  // if entered value has unit find matching unit
  const matchingUnit = format.units ? format.units.find(([_, label]) => label === enteredLabel)?.[0] : undefined;
  if (matchingUnit) {
    return matchingUnit.label;
  }

  try {
    // if entered unit does not match any unit in format use units provider to find it
    const foundUnit = await unitsProvider.findUnit(enteredLabel, undefined, defaultUnit?.phenomenon, undefined);
    return foundUnit.label;
  } catch {}

  // if there was no unit matching entered label fallback to default unit
  return defaultUnit?.label;
}

function getPrecision(numberStr: string, unitLabel?: string) {
  if (numberStr.includes(getLocalizedDecimalSeparator()) || !unitLabel || !isFractionalUnit(unitLabel)) {
    return getDecimalPrecision(numberStr);
  }

  return FRACTIONAL_PRECISION;
}

let localeSpecificDecimalSeparator: string | undefined;
function getLocalizedDecimalSeparator(): string {
  if (localeSpecificDecimalSeparator !== undefined) {
    return localeSpecificDecimalSeparator;
  }

  localeSpecificDecimalSeparator = ".";
  const matches = (12345.6789).toLocaleString().match(/345(.*)67/);
  if (matches && matches.length > 1) {
    localeSpecificDecimalSeparator = matches[1];
  }

  return localeSpecificDecimalSeparator;
}

function isFractionalUnit(unitLabel: string) {
  return ["ft", "in", "yd"].includes(unitLabel.toLowerCase());
}

function getDecimalPrecision(numStr: string): string | undefined {
  const separator = getLocalizedDecimalSeparator();
  let lastDigit = -1;
  // find last digit of the number
  for (let i = numStr.length - 1; i >= 0; i--) {
    if (isDigit(numStr[i])) {
      lastDigit = i;
      break;
    }
  }

  if (lastDigit === -1) {
    return undefined;
  }

  let separatorIndex = -1;
  // find separator position in the number
  for (let i = lastDigit - 1; i >= 0; i--) {
    if (numStr[i] === separator) {
      separatorIndex = i;
      break;
    }

    if (!isDigit(numStr[i])) {
      break;
    }
  }

  if (separatorIndex === -1) {
    return "0.5";
  }

  const digitsAfterSeparator = lastDigit - separatorIndex;
  return `${0.5 * Math.pow(10, -digitsAfterSeparator)}`;
}

function isDigit(char: string) {
  return Number.isFinite(parseInt(char, 10));
}
