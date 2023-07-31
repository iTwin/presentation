/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { PropertyRecord, PropertyValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { PropertyEditorProps } from "@itwin/components-react";
import { Input } from "@itwin/itwinui-react";

/** @internal */
export interface NumericPropertyInputAttributes {
  getValue: () => PropertyValue | undefined;
  divElement: HTMLDivElement | null;
}

/** @internal */
export interface NumericPropertyInputProps extends PropertyEditorProps {
  propertyRecord: PropertyRecord;
}

/** @internal */
export const NumericPropertyInput = forwardRef<NumericPropertyInputAttributes, NumericPropertyInputProps>((props, ref) => {
  const { onCommit, propertyRecord } = props;

  const [inputValue, setInputValue] = useState<string>(() => getInputTargetFromPropertyRecord(propertyRecord) ?? "");

  const divRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      getValue: () => ({
        valueFormat: PropertyValueFormat.Primitive,
        value: isNaN(Number(inputValue)) ? undefined : Number(inputValue),
        displayValue: inputValue,
      }),
      divElement: divRef.current,
    }),
    [inputValue],
  );

  const handleChange = (newVal: string) => {
    setInputValue(newVal);
    onCommit &&
      onCommit({
        propertyRecord,
        newValue: {
          valueFormat: PropertyValueFormat.Primitive,
          value: isNaN(Number(newVal)) || newVal.trim() === "" ? undefined : Number(newVal),
          displayValue: newVal,
        },
      });
  };
  return (
    <div ref={divRef}>
      <NumericInput onChange={handleChange} value={inputValue} />
    </div>
  );
});
NumericPropertyInput.displayName = "NumericPropertyInput";

const getInputTargetFromPropertyRecord = (propertyRecord: PropertyRecord) => {
  const value = propertyRecord.value;
  if (value.valueFormat !== PropertyValueFormat.Primitive || typeof value.value === "undefined" || typeof value.displayValue === "undefined") {
    return undefined;
  }
  return value.displayValue;
};

/** @internal */
export interface NumericInputProps {
  onChange: (newValue: string) => void;
  value: string;
}

/** @internal */
export const NumericInput = ({ value, onChange }: NumericInputProps) => {
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

  return <Input data-testid="numeric-input" size="small" value={value} onChange={handleChange} />;
};
