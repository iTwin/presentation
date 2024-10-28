/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { PrimitiveValue, PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import { PropertyEditorProps } from "@itwin/components-react";
import { Input } from "@itwin/itwinui-react";
import { useSchemaMetadataContext } from "../../common/SchemaMetadataContext";
import { PropertyEditorAttributes } from "../editors/Common";
import { NumericPropertyInput } from "./NumericPropertyInput";
import { useQuantityValueInput, UseQuantityValueInputProps } from "./UseQuantityValueInput";

/** @internal */
export interface QuantityPropertyEditorImplProps extends PropertyEditorProps {
  propertyRecord: PropertyRecord;
}

/** @internal */
export const QuantityPropertyEditorInput = forwardRef<PropertyEditorAttributes, QuantityPropertyEditorImplProps>((props, ref) => {
  const schemaMetadataContext = useSchemaMetadataContext();

  if (!props.propertyRecord.property.quantityType || !schemaMetadataContext) {
    return <NumericPropertyInput {...props} ref={ref} />;
  }

  const initialValue = (props.propertyRecord.value as PrimitiveValue)?.value as number;
  return (
    <QuantityPropertyValueInput
      {...props}
      ref={ref}
      koqName={props.propertyRecord.property.quantityType}
      schemaContext={schemaMetadataContext.schemaContext}
      initialRawValue={initialValue}
    />
  );
});
QuantityPropertyEditorInput.displayName = "QuantityPropertyEditorInput";

type QuantityPropertyValueInputProps = QuantityPropertyEditorImplProps & UseQuantityValueInputProps;

const QuantityPropertyValueInput = forwardRef<PropertyEditorAttributes, QuantityPropertyValueInputProps>(
  ({ propertyRecord, onCommit, koqName, schemaContext, initialRawValue, setFocus }, ref) => {
    const { quantityValue, inputProps } = useQuantityValueInput({ koqName, schemaContext, initialRawValue });

    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(
      ref,
      () => ({
        getValue: () => ({
          valueFormat: PropertyValueFormat.Primitive,
          value: quantityValue.rawValue,
          displayValue: quantityValue.formattedValue,
          roundingError: quantityValue.roundingError,
        }),
        htmlElement: inputRef.current,
      }),
      [quantityValue],
    );

    const onBlur = () => {
      onCommit &&
        onCommit({
          propertyRecord,
          newValue: {
            valueFormat: PropertyValueFormat.Primitive,
            value: quantityValue.rawValue,
            displayValue: quantityValue.formattedValue,
            roundingError: quantityValue.roundingError,
          },
        });
    };

    useEffect(() => {
      if (setFocus) {
        setTimeout(() => {
          inputRef.current && inputRef.current.focus();
        }, 10);
      }
    }, [setFocus]);

    return (
      <Input
        size="small"
        {...inputProps}
        disabled={propertyRecord.isReadonly || inputProps.disabled}
        ref={inputRef}
        onBlur={onBlur}
        onFocus={() => inputRef.current?.setSelectionRange(0, inputProps.value.length)}
      />
    );
  },
);
QuantityPropertyValueInput.displayName = "QuantityPropertyValueInput";
