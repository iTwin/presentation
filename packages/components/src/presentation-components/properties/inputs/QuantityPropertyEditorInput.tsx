/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { PropertyValueFormat } from "@itwin/appui-abstract";
import { assert } from "@itwin/core-bentley";
import { Input } from "@itwin/itwinui-react";
import { useSchemaMetadataContext } from "../../common/SchemaMetadataContext.js";
import { NumericPropertyInput } from "./NumericPropertyInput.js";
import { useQuantityValueInput } from "./UseQuantityValueInput.js";

import type { PrimitiveValue, PropertyRecord } from "@itwin/appui-abstract";
import type { PropertyEditorProps } from "@itwin/components-react";
import type { PropertyEditorAttributes } from "../editors/Common.js";
import type { UseQuantityValueInputProps } from "./UseQuantityValueInput.js";

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

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const initialValue = (props.propertyRecord.value as PrimitiveValue)?.value as number | undefined;
  return (
    <QuantityPropertyValueInput {...props} ref={ref} koqName={koqName} schemaContext={schemaMetadataContext.schemaContext} initialRawValue={initialValue} />
  );
});
QuantityPropertyEditorInput.displayName = "QuantityPropertyEditorInput";

type QuantityPropertyValueInputProps = QuantityPropertyEditorImplProps & UseQuantityValueInputProps;

const QuantityPropertyValueInput = forwardRef<PropertyEditorAttributes, QuantityPropertyValueInputProps>(
  ({ propertyRecord, onCommit, koqName, schemaContext, initialRawValue, setFocus }, ref) => {
    const { quantityValue, inputProps } = useQuantityValueInput({ koqName, schemaContext, initialRawValue });
    const [isEditing, setEditing] = useState(false);
    const value = isEditing ? quantityValue.highPrecisionFormattedValue : quantityValue.defaultFormattedValue;

    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(
      ref,
      () => ({
        getValue: () => ({
          valueFormat: PropertyValueFormat.Primitive,
          value: quantityValue.rawValue,
          displayValue: quantityValue.defaultFormattedValue,
          roundingError: quantityValue.roundingError,
        }),
        htmlElement: inputRef.current,
      }),
      [quantityValue.defaultFormattedValue, quantityValue.rawValue, quantityValue.roundingError],
    );

    const onBlur = () => {
      onCommit &&
        onCommit({
          propertyRecord,
          newValue: {
            valueFormat: PropertyValueFormat.Primitive,
            value: quantityValue.rawValue,
            displayValue: quantityValue.defaultFormattedValue,
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
        disabled={propertyRecord.isReadonly || inputProps.disabled}
        ref={inputRef}
        onBlur={() => {
          onBlur();
          setEditing(false);
        }}
        onFocus={() => {
          setEditing(true);
          inputRef.current?.setSelectionRange(0, 9999);
        }}
      />
    );
  },
);
QuantityPropertyValueInput.displayName = "QuantityPropertyValueInput";
