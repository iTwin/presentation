/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { PrimitiveValue, PropertyDescription, PropertyRecord, PropertyValueFormat, StandardTypeNames } from "@itwin/appui-abstract";
import { EditorContainer } from "@itwin/components-react";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumericPropertyEditor } from "../../presentation-components";

export const createRecord = (initialValue?: number) => {
  const value: PrimitiveValue = {
    valueFormat: PropertyValueFormat.Primitive,
    value: initialValue,
    displayValue: initialValue?.toString(),
  };
  const descr: PropertyDescription = {
    typename: StandardTypeNames.Double,
    name: "test_prop",
    displayLabel: "TestProp",
  };
  const record = new PropertyRecord(value, descr);
  record.property.typename = "number:presentation-numeric-editor";
  return record;
};

describe("<NumericPropertyEditorBase />", () => {
  afterEach(async () => {
    sinon.restore();
  });

  it("renders editor for `presentation-numeric-editor` type", async () => {
    const record = createRecord();
    const { getByTestId } = render(<EditorContainer propertyRecord={record} onCancel={() => {}} onCommit={() => {}} />);
    await waitFor(() => expect(getByTestId("numeric-input")).to.not.be.null);
  });

  it("invokes `onCommit` when input changes", async () => {
    const user = userEvent.setup();
    const record = createRecord();
    const spy = sinon.spy();
    const { getByTestId, queryByDisplayValue } = render(<EditorContainer propertyRecord={record} onCancel={() => {}} onCommit={spy} />);

    const inputContainer = await waitFor(() => getByTestId("numeric-input"));

    await user.type(inputContainer, "1");

    await waitFor(() => expect(queryByDisplayValue("1")).to.not.be.null);
    expect(spy).to.be.calledOnce;
  });
});

describe("<NumericPropertyEditor />", () => {
  it("renders input when property record is provided", async () => {
    const record = createRecord();
    const { getByTestId } = render(<NumericPropertyEditor propertyRecord={record}/>);
    expect(getByTestId("numeric-input")).to.not.be.null;
  });

  it("renders nothing when property record is not provided", async () => {
    const { container } = render(<NumericPropertyEditor />);
    expect(container.firstChild).to.be.null;
  });
});
