import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';

import { PropertyRecord, PropertyValue, PropertyValueFormat } from '@itwin/appui-abstract';
import { PropertyEditorProps } from '@itwin/components-react';
import { Input } from '@itwin/itwinui-react';

/** @internal */
export interface NumericPropertyTargetInputAttributes {
  getValue: () => PropertyValue | undefined;
  inputElement: HTMLInputElement | null;
}

/** @internal */
export interface NumericPropertyTargetInputProps extends PropertyEditorProps {
  propertyRecord: PropertyRecord;
}

/** @internal */
export const NumericPropertyTargetInput = forwardRef<NumericPropertyTargetInputAttributes, NumericPropertyTargetInputProps>((props, ref) => {
  const { onCommit, propertyRecord } = props;
  const [inputValue, setInputValue] = useState<string>(() => getInputTargetFromPropertyRecord(propertyRecord) ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      getValue: () => ({ valueFormat: PropertyValueFormat.Primitive, value: parseFloat(inputValue), displayValue: inputValue }),
      inputElement: inputRef.current,
    }),
    [inputValue],
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = validateValue(e.currentTarget.value, inputValue);
      setInputValue(value);
      onCommit && onCommit({ propertyRecord, newValue: { valueFormat: PropertyValueFormat.Primitive, value: parseFloat(value), displayValue: value } });
    },
    [inputValue, onCommit, propertyRecord],
  );

  const validateValue = (newValue: string, oldValue: string) => {
    if (newValue.split(".").length > 2 || newValue.match(/[^0-9.-]/) || (newValue.match(/[-]/) && (newValue[0] !== "-" || newValue.split("-").length > 2))) {
      return oldValue;
    }
    return newValue;
  };

  return (
    <Input size="small" value={inputValue} onChange={onChange} data-testid="numeric-editor-input" ref={inputRef}/>
  );
});
NumericPropertyTargetInput.displayName = "NumericPropertyTargetInput";

const getInputTargetFromPropertyRecord = (propertyRecord: PropertyRecord) => {
  const value = propertyRecord.value;
  if (value.valueFormat !== PropertyValueFormat.Primitive || typeof value.value === "undefined" || typeof value.displayValue === "undefined") {
    return undefined;
  }
  return value.displayValue;
};
