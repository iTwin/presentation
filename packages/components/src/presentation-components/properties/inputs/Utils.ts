/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { FormatType, Parser } from "@itwin/core-quantity";

import type { Format, ParserSpec } from "@itwin/core-quantity";

/**
 * Finds rounding error for entered value and converts it to persistence unit.
 * @internal
 */
export function getPersistenceUnitRoundingError(numberStr: string, parser: ParserSpec): number | undefined {
  const tokens = Parser.parseQuantitySpecification(numberStr, parser.format);
  const enteredUnit = tokens.length > 0 && tokens[tokens.length - 1].isString ? (tokens[tokens.length - 1].value as string) : undefined;

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
    return getFractionalPrecision(numberStr);
  }

  // if number does not have decimal or fraction separator use precision based on format type.
  // TODO: this might not be correct in all cases. For example:
  // if format is `Fractional` but entered value is `2 m` precision should be `0.5 m` but we will get ` 1/16 m`
  if (format.type === FormatType.Decimal) {
    return getDecimalPrecision(numberStr);
  }

  if (format.type === FormatType.Fractional) {
    return getFractionalPrecision(numberStr);
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

function getFractionalPrecision(numStr: string): string | undefined {
  const digitsAfterFraction = parseDigitsAfterSymbol(numStr, "/");
  if (digitsAfterFraction.result !== "success") {
    return digitsAfterFraction.result === "noSymbol" ? "1/2" : undefined;
  }

  return `1/${Number(digitsAfterFraction.value) * 2}`;
}

function getDecimalPrecision(numStr: string): string | undefined {
  const separator = getLocalizedDecimalSeparator();
  const digitsAfterSeparator = parseDigitsAfterSymbol(numStr, separator);
  if (digitsAfterSeparator.result !== "success") {
    return digitsAfterSeparator.result === "noSymbol" ? "0.5" : undefined;
  }

  return `${0.5 * Math.pow(10, -digitsAfterSeparator.value.length)}`;
}

type ParseResult =
  | {
      result: "noNumber" | "noSymbol";
    }
  | {
      result: "success";
      value: string;
    };

function parseDigitsAfterSymbol(numStr: string, symbol: string): ParseResult {
  let lastDigitIndex = -1;
  for (let i = numStr.length - 1; i >= 0; i--) {
    if (isDigit(numStr[i])) {
      lastDigitIndex = i;
      break;
    }
  }

  if (lastDigitIndex === -1) {
    return { result: "noNumber" };
  }

  let symbolIndex = -1;
  // find symbol position in the number
  for (let i = lastDigitIndex - 1; i >= 0; i--) {
    if (numStr[i] === symbol) {
      symbolIndex = i;
      break;
    }

    if (!isDigit(numStr[i])) {
      break;
    }
  }

  if (symbolIndex === -1) {
    return { result: "noSymbol" };
  }

  return { result: "success", value: numStr.substring(symbolIndex + 1, lastDigitIndex + 1) };
}

function isDigit(char: string) {
  return Number.isFinite(parseInt(char, 10));
}
