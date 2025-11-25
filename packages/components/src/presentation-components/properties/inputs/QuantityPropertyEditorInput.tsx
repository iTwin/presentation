/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { PrimitiveValue, PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import { PropertyEditorProps } from "@itwin/components-react";
import { assert } from "@itwin/core-bentley";
import { Input } from "@itwin/itwinui-react";
import { useSchemaMetadataContext } from "../../common/SchemaMetadataContext.js";
import { PropertyEditorAttributes } from "../editors/Common.js";
import { NumericPropertyInput } from "./NumericPropertyInput.js";
import { useQuantityValueInput, UseQuantityValueInputProps } from "./UseQuantityValueInput.js";

/** @internal */
export interface QuantityPropertyEditorImplProps extends PropertyEditorProps {
  propertyRecord: PropertyRecord;
}

/** @internal */
export const QuantityPropertyEditorInput = forwardRef<PropertyEditorAttributes, QuantityPropertyEditorImplProps>((props, ref) => {
  const schemaMetadataContext = useSchemaMetadataContext();

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  if ((!props.propertyRecord.property.kindOfQuantityName && !props.propertyRecord.property.quantityType) || !schemaMetadataContext) {
    return <NumericPropertyInput {...props} ref={ref} />;
  }
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const koqName = props.propertyRecord.property.kindOfQuantityName ?? props.propertyRecord.property.quantityType;
  assert(koqName !== undefined);

  const initialValue = (props.propertyRecord.value as PrimitiveValue)?.value as number;
  return (
    <QuantityPropertyValueInput {...props} ref={ref} koqName={koqName} schemaContext={schemaMetadataContext.schemaContext} initialRawValue={initialValue} />
  );
});
QuantityPropertyEditorInput.displayName = "QuantityPropertyEditorInput";

type QuantityPropertyValueInputProps = QuantityPropertyEditorImplProps & UseQuantityValueInputProps;

const QuantityPropertyValueInput = forwardRef<PropertyEditorAttributes, QuantityPropertyValueInputProps>(
  ({ propertyRecord, onCommit, koqName, schemaContext, initialRawValue, setFocus }, ref) => {
    const { quantityValue, inputProps } = useQuantityValueInput({ koqName, schemaContext, initialRawValue });
    const [value, setValue] = useState(quantityValue.defaultFormattedValue);

    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(
      ref,
      () => ({
        getValue: () => ({
          valueFormat: PropertyValueFormat.Primitive,
          value: quantityValue.rawValue,
          displayValue: value,
          roundingError: quantityValue.roundingError,
        }),
        htmlElement: inputRef.current,
      }),
      [quantityValue.rawValue, quantityValue.roundingError, value],
    );

    const onBlur = () => {
      onCommit &&
        onCommit({
          propertyRecord,
          newValue: {
            valueFormat: PropertyValueFormat.Primitive,
            value: quantityValue.rawValue,
            displayValue: quantityValue.fullFormattedValue,
            roundingError: quantityValue.roundingError,
          },
        });
    };

    useEffect(() => {
      if (setFocus && !inputProps.disabled) {
        inputRef.current && inputRef.current.focus();
      }
    }, [inputProps.disabled, setFocus]);

    return (
      <Input
        {...inputProps}
        value={value}
        size="small"
        id="quantityEditorId"
        disabled={propertyRecord.isReadonly || inputProps.disabled}
        ref={inputRef}
        onBlur={() => {
          onBlur();
          setValue(quantityValue.defaultFormattedValue);
        }}
        onFocus={() => {
          setValue(quantityValue.fullFormattedValue);
          inputRef.current?.setSelectionRange(0, 9999);
        }}
      />
    );
  },
);
QuantityPropertyValueInput.displayName = "QuantityPropertyValueInput";
