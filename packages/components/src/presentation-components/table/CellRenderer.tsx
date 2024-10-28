/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Table
 */

import { useState } from "react";
import { ArrayValue, PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import { NonPrimitivePropertyRenderer, PropertyValueRendererManager } from "@itwin/components-react";
import { Orientation } from "@itwin/core-react";
import { Anchor, Modal } from "@itwin/itwinui-react";

/**
 * Props for [[TableCellRenderer]] component.
 * @public
 */
export interface TableCellRendererProps {
  /** Record containing cell value and property description. */
  record: PropertyRecord;
}

/**
 * Renderer for single table cell.
 * @public
 */
export function TableCellRenderer(props: TableCellRendererProps) {
  const { record } = props;

  if (record.value.valueFormat === PropertyValueFormat.Array) {
    return <ArrayPropertyRenderer record={record} />;
  }
  if (record.value.valueFormat === PropertyValueFormat.Struct) {
    return <StructPropertyRenderer record={record} />;
  }

  return <>{PropertyValueRendererManager.defaultManager.render(record)}</>;
}

function ArrayPropertyRenderer(props: TableCellRendererProps) {
  const { record } = props;
  const value = record.value as ArrayValue;

  const rendererProps: NonPrimitiveCellRendererProps = {
    record,
    buttonLabel: value.items.length !== 0 ? `${value.itemsTypeName}[${value.items.length}]` : "[]",
    dialogLabel: `Array of type "${value.itemsTypeName}"`,
    uniqueKey: `table_array_${record.property.name}`,
  };
  return <NonPrimitiveCellRenderer {...rendererProps} />;
}

function StructPropertyRenderer(props: TableCellRendererProps) {
  const { record } = props;

  const rendererProps: NonPrimitiveCellRendererProps = {
    record,
    buttonLabel: `{${record.property.typename}}`,
    dialogLabel: `Struct of type "${record.property.typename}"`,
    uniqueKey: `table_struct_${record.property.name}`,
  };
  return <NonPrimitiveCellRenderer {...rendererProps} />;
}

interface NonPrimitiveCellRendererProps {
  record: PropertyRecord;
  dialogLabel: string;
  buttonLabel: string;
  uniqueKey: string;
}

function NonPrimitiveCellRenderer(props: NonPrimitiveCellRendererProps) {
  const { record, dialogLabel, buttonLabel, uniqueKey } = props;
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Anchor
        onClick={() => {
          setIsOpen(true);
        }}
      >
        {buttonLabel}
      </Anchor>
      <Modal
        isOpen={isOpen}
        title={dialogLabel}
        onClose={
          /* istanbul ignore next */ () => {
            setIsOpen(false);
          }
        }
        className="presentation-components-non-primitive-value"
      >
        {/* Can't change our import to `components-react`, because it was added there in a version later than our peer dependency */}
        {/* eslint-disable-next-line @typescript-eslint/no-deprecated */}
        <NonPrimitivePropertyRenderer uniqueKey={uniqueKey} propertyRecord={record} orientation={Orientation.Horizontal} />
      </Modal>
    </>
  );
}
