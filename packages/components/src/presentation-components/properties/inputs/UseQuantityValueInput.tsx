/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ChangeEventHandler, useEffect, useRef, useState } from "react";
import { assert } from "@itwin/core-bentley";
import { IModelApp } from "@itwin/core-frontend";
import { FormatterSpec, FormatType, ParserSpec } from "@itwin/core-quantity";
import { SchemaContext } from "@itwin/ecschema-metadata";
import { KoqPropertyValueFormatter } from "@itwin/presentation-common";
import { getPersistenceUnitRoundingError } from "./Utils.js";

/**
 * Value of kind of quantity property.
 * @internal
 */
export interface QuantityValue {
  /** Raw value in persistence unit. */
  rawValue?: number;
  /** Formatted value with unit label based on active unit system or user input. With precision set to 12. */
  highPrecisionFormattedValue: string;
  /** Formatted value with unit label based on active unit system or user input. Default precision. */
  defaultFormattedValue: string;
  roundingError?: number;
}

const PLACEHOLDER_RAW_VALUE = 12.34;

/**
 * Props for [[useQuantityValueInput]]
 * @internal
 */
export interface UseQuantityValueInputProps {
  initialRawValue?: number;
  schemaContext: SchemaContext;
  koqName: string;
}

/**
 * Custom hook that manages state for quantity values input.
 * @internal
 */
export function useQuantityValueInput({ initialRawValue, schemaContext, koqName }: UseQuantityValueInputProps) {
  interface State {
    quantityValue: QuantityValue;
    placeholder: string;
  }
  const { highPrecisionFormatter, parser, defaultFormatter } = useFormatterAndParser(koqName, schemaContext);
  const initialRawValueRef = useRef(initialRawValue);

  const [{ quantityValue, placeholder }, setState] = useState<State>(() => ({
    quantityValue: {
      rawValue: initialRawValueRef.current,
      highPrecisionFormattedValue: "",
      defaultFormattedValue: "",
      roundingError: undefined,
    },
    placeholder: "",
  }));

  useEffect(() => {
    if (!highPrecisionFormatter || !parser) {
      return;
    }

    setState((prev): State => {
      /* c8 ignore next 1 */
      const defaultValue = (defaultFormatter ?? highPrecisionFormatter).applyFormatting(
        initialRawValueRef.current ? initialRawValueRef.current : PLACEHOLDER_RAW_VALUE,
      );
      const newFormattedValue = prev.quantityValue.rawValue !== undefined ? highPrecisionFormatter.applyFormatting(prev.quantityValue.rawValue) : "";
      const roundingError = getPersistenceUnitRoundingError(newFormattedValue, parser);

      return {
        ...prev,
        quantityValue: {
          ...prev.quantityValue,
          highPrecisionFormattedValue: newFormattedValue,
          defaultFormattedValue: defaultValue,
          roundingError,
        },
        placeholder: defaultValue,
      };
    });
  }, [highPrecisionFormatter, parser, defaultFormatter]);

  const onChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    assert(parser !== undefined); // input should be disabled if parser is `undefined`
    const newValue = e.currentTarget.value;
    const parseResult = parser.parseToQuantityValue(newValue);
    const roundingError = getPersistenceUnitRoundingError(newValue, parser);
    const defaultFormattedValue = parseResult.ok ? defaultFormatter?.applyFormatting(parseResult.value) : undefined;

    setState(
      (prev): State => ({
        ...prev,
        quantityValue: {
          highPrecisionFormattedValue: newValue,
          defaultFormattedValue: defaultFormattedValue ?? newValue,
          rawValue: parseResult.ok ? parseResult.value : undefined,
          roundingError: parseResult.ok ? roundingError : undefined,
        },
      }),
    );
  };

  return {
    quantityValue,
    inputProps: {
      onChange,
      placeholder,
      disabled: !highPrecisionFormatter || !parser,
    },
  };
}

function useFormatterAndParser(koqName: string, schemaContext: SchemaContext) {
  interface State {
    defaultFormatter: FormatterSpec;
    highPrecisionFormatter: FormatterSpec;
    parserSpec: ParserSpec;
  }
  const [state, setState] = useState<State>();

  useEffect(() => {
    const findFormatterAndParser = async () => {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const koqFormatter = new KoqPropertyValueFormatter(schemaContext, undefined, IModelApp.formatsProvider);
      const highPrecisionFormatter = await koqFormatter.getFormatterSpec({
        koqName,
        unitSystem: IModelApp.quantityFormatter.activeUnitSystem,
      });
      // formatter for default value should not have precision override
      const defaultFormatter = await koqFormatter.getFormatterSpec({
        koqName,
        unitSystem: IModelApp.quantityFormatter.activeUnitSystem,
      });
      const parserSpec = await koqFormatter.getParserSpec({ koqName, unitSystem: IModelApp.quantityFormatter.activeUnitSystem });
      if (highPrecisionFormatter && parserSpec && defaultFormatter) {
        if (highPrecisionFormatter.format.type === FormatType.Decimal) {
          highPrecisionFormatter.format.precision = 12;
        }
        setState({ highPrecisionFormatter, parserSpec, defaultFormatter });
        return;
      }

      setState(undefined);
    };
    void findFormatterAndParser();

    const listeners = [IModelApp.quantityFormatter.onActiveFormattingUnitSystemChanged.addListener(findFormatterAndParser)];
    if (IModelApp.formatsProvider) {
      listeners.push(IModelApp.formatsProvider.onFormatsChanged.addListener(findFormatterAndParser));
    }

    return () => {
      listeners.forEach((listener) => listener());
    };
  }, [koqName, schemaContext]);

  return {
    highPrecisionFormatter: state?.highPrecisionFormatter,
    parser: state?.parserSpec,
    defaultFormatter: state?.defaultFormatter,
  };
}
