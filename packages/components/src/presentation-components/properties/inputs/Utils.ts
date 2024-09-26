/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Format, FormatType, Parser, ParserSpec } from "@itwin/core-quantity";

const FRACTIONAL_PRECISION = "1/16";

/**
 * Finds rounding error for entered value and converts it to persistence unit.
 * @internal
 */
export function getPersistenceUnitRoundingError(numberStr: string, parser: ParserSpec): number | undefined {
  const tokens = Parser.parseQuantitySpecification(numberStr, parser.format);
  const enteredUnit = tokens.length > 0 && tokens[tokens.length - 1].isString ? (tokens[tokens.length - 1].value as string) : undefined;

  // find unit of entered value that will be used when determining precision
  const precisionStr = getPrecision(numberStr, parser.format);
  if (!precisionStr) {
    return undefined;
  }

  // convert precision to persistence unit
  const parseResult = parser.parseToQuantityValue(enteredUnit ? `${precisionStr}${enteredUnit}` : precisionStr);
  return parseResult.ok ? parseResult.value : undefined;
}

/** @internal */
export function getDecimalRoundingError(numStr: string) {
  const precision = getDecimalPrecision(numStr);
  return precision ? Number(precision) : undefined;
}

function getPrecision(numberStr: string, format: Format) {
  // use decimal precision if number contains decimal separator
  if (numberStr.includes(getLocalizedDecimalSeparator())) {
    return getDecimalPrecision(numberStr);
  }

  // use fractional precision if number contains fraction separator
  if (numberStr.includes("/")) {
    return FRACTIONAL_PRECISION;
  }

  // if number does not have decimal or fraction separator use precision based on format type.
  // TODO: this might not be correct in all cases. For example:
  // if format is `Fractional` but entered value is `2 m` precision should be `0.5 m` but we will get ` 1/16 m`
  if (format.type === FormatType.Decimal) {
    return getDecimalPrecision(numberStr);
  }

  if (format.type === FormatType.Fractional) {
    return FRACTIONAL_PRECISION;
  }

  return undefined;
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
