/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { PrimitiveValue, PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import { PropertyEditorProps } from "@itwin/components-react";
import { Input } from "@itwin/itwinui-react";
import { PropertyEditorAttributes } from "../editors/Common.js";
import { getDecimalRoundingError } from "./Utils.js";

/** @internal */
export interface NumericPropertyInputProps extends PropertyEditorProps {
  propertyRecord: PropertyRecord;
}

/** @internal */
export const NumericPropertyInput = forwardRef<PropertyEditorAttributes, NumericPropertyInputProps>((props, ref) => {
  const { onCommit, propertyRecord, setFocus } = props;

  const [inputValue, setInputValue] = useState<string>(() => getInputTargetFromPropertyRecord(propertyRecord) ?? "");

  const handleChange = (newVal: string) => {
    setInputValue(newVal);
  };

  const commitInput = () => {
    onCommit &&
      onCommit({
        propertyRecord,
        newValue: parsePrimitiveValue(inputValue),
      });
  };
  return <NumericInput onChange={handleChange} value={inputValue} onBlur={commitInput} isDisabled={propertyRecord.isReadonly} setFocus={setFocus} ref={ref} />;
});
NumericPropertyInput.displayName = "NumericPropertyInput";

function parsePrimitiveValue(value: string): PrimitiveValue {
  const isValid = value && !isNaN(Number(value));
  return {
    valueFormat: PropertyValueFormat.Primitive,
    value: isValid ? Number(value) : undefined,
    displayValue: value,
    roundingError: isValid ? getDecimalRoundingError(value) : undefined,
  };
}

function getInputTargetFromPropertyRecord(propertyRecord: PropertyRecord) {
  const value = propertyRecord.value;
  /* c8 ignore next 3 */
  if (value.valueFormat !== PropertyValueFormat.Primitive) {
    return undefined;
  }
  return value.value?.toString();
}

/** @internal */
export interface NumericInputProps extends PropertyEditorProps {
  onChange: (newValue: string) => void;
  onBlur?: React.FocusEventHandler;
  value: string;
  isDisabled?: boolean;
}

/** @internal */
export const NumericInput = forwardRef<PropertyEditorAttributes, NumericInputProps>(({ value, onChange, onBlur, isDisabled, setFocus }, ref) => {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      getValue: () => parsePrimitiveValue(value),
      htmlElement: inputRef.current,
    }),
    [value],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.currentTarget.value;
    // Check if it is a correct number and it is not infinity.
    if (!isNaN(Number(val)) && isFinite(Number(val))) {
      onChange(val);
    }
    // Number{"+"), Number("-") and Number(".") returns NaN, but if input is only `.`, `-` or `+`, we should fire `onChange` function.
    else if (val.length === 1 && "+-.".includes(val)) {
      onChange(val);
    }
    // Number("+.") and Number("-.") returns NaN, but if input is only `+.` or `-.`, we want to fire `onChange` function.
    else if (val === "+." || val === "-.") {
      onChange(val);
    }
    // Let user write scientific numbers. Number("1e") returns NaN, but we want to fire `onChange` function when input before `e` is a correct number.
    else if (val.endsWith("e") && !isNaN(Number(val.slice(0, val.length - 1))) && val.length !== 1) {
      onChange(val);
    }
    // Let user write scientific numbers. Number("1e-") returns NaN, but we want to fire `onChange` function when input before `e-` is a correct number.
    // We don't need to check if string before `e-` is a valid number, because there is a check if string before `e` is a correct number.
    else if (val.endsWith("e-")) {
      onChange(val);
    }
  };

  useEffect(() => {
    if (setFocus) {
      inputRef.current && inputRef.current.focus();
    }
  }, [setFocus]);

  return (
    <Input
      ref={inputRef}
      disabled={isDisabled}
      data-testid="numeric-input"
      size="small"
      value={value}
      onChange={handleChange}
      onBlur={onBlur}
      onFocus={() => inputRef.current?.setSelectionRange(0, 9999)}
    />
  );
});
NumericInput.displayName = "NumericInput";
