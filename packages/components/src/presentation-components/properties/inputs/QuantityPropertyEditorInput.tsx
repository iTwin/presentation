/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  type PrimitiveValue,
  type PropertyDescription,
  type PropertyRecord,
  PropertyValueFormat,
} from "@itwin/appui-abstract";
import { assert } from "@itwin/core-bentley";
import { Input } from "@itwin/itwinui-react";
import { useSchemaMetadataContext } from "../../common/SchemaMetadataContext.js";
import { NumericPropertyInput } from "./NumericPropertyInput.js";
import { useQuantityValueInput, type UseQuantityValueInputProps } from "./UseQuantityValueInput.js";
import { applyNumericConstraints, getMinMaxFromPropertyConstraints } from "./Utils.js";

import type { PropertyEditorProps } from "@itwin/components-react";
import type { WithConstraints } from "../../common/ContentBuilder.js";
import type { PropertyEditorAttributes } from "../editors/Common.js";

/** @internal */
export interface QuantityPropertyEditorImplProps extends PropertyEditorProps {
  propertyRecord: PropertyRecord;
}

/** @internal */
export const QuantityPropertyEditorInput = forwardRef<PropertyEditorAttributes, QuantityPropertyEditorImplProps>(
  (props, ref) => {
    const schemaMetadataContext = useSchemaMetadataContext();

    if (
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      (!props.propertyRecord.property.kindOfQuantityName && !props.propertyRecord.property.quantityType) ||
      !schemaMetadataContext
    ) {
      return <NumericPropertyInput {...props} ref={ref} />;
    }
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const koqName = props.propertyRecord.property.kindOfQuantityName ?? props.propertyRecord.property.quantityType;
    assert(koqName !== undefined);

    const initialValue = (props.propertyRecord.value as PrimitiveValue)?.value as number;
    return (
      <QuantityPropertyValueInput
        {...props}
        ref={ref}
        koqName={koqName}
        schemaContext={schemaMetadataContext.schemaContext}
        initialRawValue={initialValue}
      />
    );
  },
);
QuantityPropertyEditorInput.displayName = "QuantityPropertyEditorInput";

type QuantityPropertyValueInputProps = QuantityPropertyEditorImplProps & UseQuantityValueInputProps;

const QuantityPropertyValueInput = forwardRef<PropertyEditorAttributes, QuantityPropertyValueInputProps>(
  ({ propertyRecord, onCommit, koqName, schemaContext, initialRawValue, setFocus, onCancel }, ref) => {
    const { quantityValue, inputProps, setNewValue } = useQuantityValueInput({
      koqName,
      schemaContext,
      initialRawValue,
    });
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
      if (!onCommit) {
        return;
      }

      let valueToCommit = quantityValue;
      const rawValue = quantityValue.rawValue;
      const property: WithConstraints<PropertyDescription> = propertyRecord.property;
      if (rawValue !== undefined && property.constraints) {
        const { min, max } = getMinMaxFromPropertyConstraints(property.constraints);
        const constrainedValue = applyNumericConstraints({ value: rawValue, min, max });
        if (constrainedValue !== rawValue) {
          valueToCommit = setNewValue(constrainedValue);
        }
      }

      onCommit({
        propertyRecord,
        newValue: {
          valueFormat: PropertyValueFormat.Primitive,
          value: valueToCommit.rawValue,
          displayValue: valueToCommit.defaultFormattedValue,
          roundingError: valueToCommit.roundingError,
        },
      });
    };

    useEffect(() => {
      if (setFocus && !inputProps.disabled) {
        inputRef.current && inputRef.current.focus();
      }
    }, [inputProps.disabled, setFocus]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        onCancel?.();
      }
      if (e.key === "Enter") {
        inputRef.current?.blur();
        e.stopPropagation();
      }
    };

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
          requestAnimationFrame(() => {
            if (quantityValue.highPrecisionFormattedValue === inputProps.placeholder) {
              inputRef.current?.setSelectionRange(0, 0);
              return;
            }
            inputRef.current?.setSelectionRange(0, 9999);
          });
        }}
        onKeyDown={handleKeyDown}
      />
    );
  },
);
QuantityPropertyValueInput.displayName = "QuantityPropertyValueInput";
