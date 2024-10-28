/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ChangeEventHandler, useEffect, useState } from "react";
import { assert } from "@itwin/core-bentley";
import { IModelApp } from "@itwin/core-frontend";
import { FormatterSpec, ParserSpec } from "@itwin/core-quantity";
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
  /** Formatted value with unit label based on active unit system or user input. */
  formattedValue: string;
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

  const [{ quantityValue, placeholder }, setState] = useState<State>(() => ({
    quantityValue: {
      rawValue: initialRawValue,
      formattedValue: "",
      roundingError: undefined,
    },
    placeholder: "",
  }));
  const { formatter, parser } = useFormatterAndParser(koqName, schemaContext);

  useEffect(() => {
    if (!formatter || !parser) {
      return;
    }

    setState((prev): State => {
      const newPlaceholder = formatter.applyFormatting(PLACEHOLDER_RAW_VALUE);
      const newFormattedValue = prev.quantityValue.rawValue !== undefined ? formatter.applyFormatting(prev.quantityValue.rawValue) : "";
      const roundingError = getPersistenceUnitRoundingError(newFormattedValue, parser);

      return {
        ...prev,
        quantityValue: {
          ...prev.quantityValue,
          formattedValue: newFormattedValue,
          roundingError,
        },
        placeholder: newPlaceholder,
      };
    });
  }, [formatter, parser]);

  const onChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    assert(parser !== undefined); // input should be disabled if parser is `undefined`
    const newValue = e.currentTarget.value;
    const parseResult = parser.parseToQuantityValue(newValue);
    const roundingError = getPersistenceUnitRoundingError(newValue, parser);

    setState(
      (prev): State => ({
        ...prev,
        quantityValue: {
          formattedValue: newValue,
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
      value: quantityValue.formattedValue,
      disabled: !formatter || !parser,
    },
  };
}

function useFormatterAndParser(koqName: string, schemaContext: SchemaContext) {
  interface State {
    formatterSpec: FormatterSpec;
    parserSpec: ParserSpec;
  }

  const [state, setState] = useState<State>();

  useEffect(() => {
    const findFormatterAndParser = async () => {
      const koqFormatter = new KoqPropertyValueFormatter(schemaContext);
      const formatterSpec = await koqFormatter.getFormatterSpec({ koqName, unitSystem: IModelApp.quantityFormatter.activeUnitSystem });
      const parserSpec = await koqFormatter.getParserSpec({ koqName, unitSystem: IModelApp.quantityFormatter.activeUnitSystem });
      if (formatterSpec && parserSpec) {
        setState({ formatterSpec, parserSpec });
        return;
      }

      setState(undefined);
    };
    void findFormatterAndParser();

    return IModelApp.quantityFormatter.onActiveFormattingUnitSystemChanged.addListener(findFormatterAndParser);
  }, [koqName, schemaContext]);

  return {
    formatter: state?.formatterSpec,
    parser: state?.parserSpec,
  };
}
