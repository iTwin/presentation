/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import {
  ArrayValue, PrimitiveValue, PropertyDescription, PropertyRecord, PropertyValue, PropertyValueFormat, StructValue,
} from "@itwin/appui-abstract";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { TableCellRenderer } from "../../presentation-components/table/CellRenderer";

describe("TableCellRenderer", () => {
  function createRecord(value: PropertyValue, propDescription?: Partial<PropertyDescription>) {
    const descr: PropertyDescription = {
      ...propDescription,
      typename:  propDescription?.typename ?? "string",
      name: propDescription?.name ?? "test_prop",
      displayLabel: propDescription?.displayLabel ?? "TestProp",
    };
    return new PropertyRecord(value, descr);
  }

  it("renders primitive value", async () => {
    const stringValue = "test_value";
    const value: PrimitiveValue = {
      valueFormat: PropertyValueFormat.Primitive,
      value: stringValue,
    };
    const record = createRecord(value, { typename: "string" });

    const { queryByText } = render(<TableCellRenderer record={record}/>);
    expect(queryByText(stringValue)).to.not.be.null;
  });

  it("renders array value as button that opens dialog", async () => {
    const arrayElementValue = "ArrayElement";
    const value: ArrayValue = {
      valueFormat: PropertyValueFormat.Array,
      itemsTypeName: "TestArrayTypeName",
      items: [createRecord({ valueFormat: PropertyValueFormat.Primitive, value: arrayElementValue })],
    };
    const record = createRecord(value, { typename: "array" });

    const { getByText, queryByText } = render(<TableCellRenderer record={record}/>);
    const buttonLabel = `${value.itemsTypeName}[1]`;
    const button = getByText(buttonLabel);

    fireEvent.click(button);
    const dialogLabel = `Array of type "${value.itemsTypeName}"`;
    await waitFor(() => expect(queryByText(dialogLabel)).to.not.be.null);
  });

  it("renders empty array value as button that opens dialog", async () => {
    const value: ArrayValue = {
      valueFormat: PropertyValueFormat.Array,
      itemsTypeName: "TestArrayTypeName",
      items: [],
    };
    const record = createRecord(value, { typename: "array" });

    const { getByText, queryByText } = render(<TableCellRenderer record={record}/>);
    const buttonLabel = `[]`;
    const button = getByText(buttonLabel);

    fireEvent.click(button);
    const dialogLabel = `Array of type "${value.itemsTypeName}"`;
    await waitFor(() => expect(queryByText(dialogLabel)).to.not.be.null);
  });

  it("renders struct value as button that opens dialog", async () => {
    const structMemberValue = "FirstMemberValue";
    const value: StructValue = {
      valueFormat: PropertyValueFormat.Struct,
      members: {
        firstMember: createRecord({ valueFormat: PropertyValueFormat.Primitive, value: structMemberValue }),
      },
    };
    const record = createRecord(value, { typename: "TestStruct" });

    const { getByText, queryByText } = render(<TableCellRenderer record={record}/>);
    const buttonLabel = `{${record.property.typename}}`;
    const button = getByText(buttonLabel);

    fireEvent.click(button);
    const dialogLabel = `Struct of type "${record.property.typename}"`;
    await waitFor(() => expect(queryByText(dialogLabel)).to.not.be.null);
  });
});
