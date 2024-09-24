/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ChangeEventHandler, useEffect, useState } from "react";
import { IModelApp } from "@itwin/core-frontend";
import { FormatterSpec, ParserSpec, UnitsProvider } from "@itwin/core-quantity";
import { SchemaContext, SchemaUnitProvider } from "@itwin/ecschema-metadata";
import { KoqPropertyValueFormatter } from "@itwin/presentation-common";
import { getPersistenceUnitRoundingError } from "./Utils";

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
    value: string;
  }

  const [{ quantityValue, placeholder, value }, setState] = useState<State>(() => ({
    quantityValue: {
      rawValue: initialRawValue,
      formattedValue: "",
      roundingError: undefined,
    },
    placeholder: "",
    value: "",
  }));
  const { formatter, parser, unitsProvider } = useFormatterAndParser(koqName, schemaContext);

  useEffect(() => {
    if (!formatter) {
      return;
    }

    setState((prev): State => {
      const newPlaceholder = formatter.applyFormatting(PLACEHOLDER_RAW_VALUE);
      const newFormattedValue = prev.quantityValue.rawValue !== undefined ? formatter.applyFormatting(prev.quantityValue.rawValue) : "";

      return {
        ...prev,
        quantityValue: {
          ...prev.quantityValue,
          formattedValue: newFormattedValue,
        },
        placeholder: newPlaceholder,
        value: newFormattedValue,
      };
    });
  }, [formatter]);

  useEffect(() => {
    if (!parser || !unitsProvider) {
      return;
    }

    let disposed = false;
    const parseValue = async () => {
      const parseResult = parser.parseToQuantityValue(value);
      const roundingError = await getPersistenceUnitRoundingError(value, parser, unitsProvider);
      if (disposed) {
        return;
      }

      setState(
        (prev): State => ({
          ...prev,
          quantityValue: {
            rawValue: parseResult.ok ? parseResult.value : undefined,
            formattedValue: value,
            roundingError: parseResult.ok ? roundingError : undefined,
          },
        }),
      );
    };

    void parseValue();
    return () => {
      disposed = true;
    };
  }, [value, parser, unitsProvider]);

  const onChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const newValue = e.currentTarget.value;
    setState(
      (prev): State => ({
        ...prev,
        value: newValue,
      }),
    );
  };

  return {
    quantityValue,
    inputProps: {
      onChange,
      placeholder,
      value,
      disabled: !formatter || !parser,
    },
  };
}

function useFormatterAndParser(koqName: string, schemaContext: SchemaContext) {
  interface State {
    formatterSpec: FormatterSpec;
    parserSpec: ParserSpec;
    unitsProvider: UnitsProvider;
  }

  const [state, setState] = useState<State>();

  useEffect(() => {
    const findFormatterAndParser = async () => {
      const koqFormatter = new KoqPropertyValueFormatter(schemaContext);
      const unitsProvider = new SchemaUnitProvider(schemaContext);
      const formatterSpec = await koqFormatter.getFormatterSpec({ koqName, unitSystem: IModelApp.quantityFormatter.activeUnitSystem });
      const parserSpec = await koqFormatter.getParserSpec({ koqName, unitSystem: IModelApp.quantityFormatter.activeUnitSystem });
      if (formatterSpec && parserSpec) {
        setState({ formatterSpec, parserSpec, unitsProvider });
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
    unitsProvider: state?.unitsProvider,
  };
}
