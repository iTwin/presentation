/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createRef, forwardRef, PureComponent, useImperativeHandle, useRef } from "react";
import { PrimitiveValue, PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import { PropertyEditorBase, PropertyEditorProps, TypeEditor } from "@itwin/components-react";
import { Input } from "@itwin/itwinui-react";
import { useSchemaMetadataContext } from "../../common/SchemaMetadataContext";
import { NumericPropertyInput } from "../inputs/NumericPropertyInput";
import { useQuantityValueInput, UseQuantityValueInputProps } from "../inputs/UseQuantityValueInput";
import { PropertyEditorAttributes } from "./Common";

/**
 * Name for `QuantityPropertyEditor`.
 * @internal
 */
export const QuantityEditorName = "presentation-quantity-editor";

/**
 * Editor for quantity properties.
 * @internal
 */
export class QuantityPropertyEditorBase extends PropertyEditorBase {
  // istanbul ignore next
  public override get containerStopsKeydownPropagation(): boolean {
    return false;
  }

  public get reactNode(): React.ReactNode {
    return <QuantityPropertyEditor />;
  }
}

/**
 * Component that renders quantity property value input
 * @internal
 */
export class QuantityPropertyEditor extends PureComponent<PropertyEditorProps> implements TypeEditor {
  private _ref = createRef<PropertyEditorAttributes>();

  // istanbul ignore next
  public async getPropertyValue() {
    return this._ref.current?.getValue();
  }

  // istanbul ignore next
  public get htmlElement() {
    return this._ref.current?.htmlElement ?? null;
  }

  // istanbul ignore next
  public get hasFocus() {
    if (!this._ref.current?.htmlElement || !document.activeElement) {
      return false;
    }
    return this._ref.current.htmlElement.contains(document.activeElement);
  }

  /** @internal */
  public override render() {
    return this.props.propertyRecord ? <QuantityPropertyEditorImpl ref={this._ref} {...this.props} propertyRecord={this.props.propertyRecord} /> : null;
  }
}

interface QuantityPropertyEditorImplProps extends PropertyEditorProps {
  propertyRecord: PropertyRecord;
}

const QuantityPropertyEditorImpl = forwardRef<PropertyEditorAttributes, QuantityPropertyEditorImplProps>((props, ref) => {
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
QuantityPropertyEditorImpl.displayName = "QuantityPropertyEditorImpl";

type QuantityPropertyValueInputProps = QuantityPropertyEditorImplProps & UseQuantityValueInputProps;

const QuantityPropertyValueInput = forwardRef<PropertyEditorAttributes, QuantityPropertyValueInputProps>(
  ({ propertyRecord, onCommit, koqName, schemaContext, initialRawValue }, ref) => {
    const { quantityValue, inputProps } = useQuantityValueInput({ koqName, schemaContext, initialRawValue });

    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(
      ref,
      () => ({
        getValue: () => ({ valueFormat: PropertyValueFormat.Primitive, value: quantityValue.rawValue, displayValue: quantityValue.formattedValue }),
        htmlElement: inputRef.current,
      }),
      [quantityValue],
    );

    const onBlur = () => {
      onCommit &&
        onCommit({
          propertyRecord,
          newValue: { valueFormat: PropertyValueFormat.Primitive, value: quantityValue.rawValue, displayValue: quantityValue.formattedValue },
        });
    };

    return <Input size="small" {...inputProps} ref={inputRef} onBlur={onBlur} />;
  },
);
QuantityPropertyValueInput.displayName = "QuantityPropertyValueInput";
