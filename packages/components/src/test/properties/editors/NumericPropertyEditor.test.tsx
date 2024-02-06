/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { StandardTypeNames } from "@itwin/appui-abstract";
import { NumericEditorName, NumericPropertyEditor } from "../../../presentation-components/properties/editors/NumericPropertyEditor";
import { createTestPropertyRecord } from "../../_helpers/UiComponents";
import { render, waitFor } from "../../TestUtils";

const createRecord = (initialValue?: number) => {
  return createTestPropertyRecord(
    { value: initialValue, displayValue: initialValue?.toString() },
    { typename: StandardTypeNames.Double, editor: { name: NumericEditorName } },
  );
};

describe("<NumericPropertyEditor />", () => {
  it("renders input when property record is provided", async () => {
    const record = createRecord();
    const { getByTestId } = render(<NumericPropertyEditor propertyRecord={record} />);
    expect(getByTestId("numeric-input")).to.not.be.null;
  });

  it("renders nothing when property record is not provided", async () => {
    const { container } = render(<NumericPropertyEditor />);
    expect(container.firstChild).to.be.null;
  });

  it("Invokes `onCommit` with correct parameters only when input container gets blurred", async () => {
    const record = createRecord();
    const spy = sinon.spy();
    const { getByTestId, queryByDisplayValue, user } = render(<NumericPropertyEditor propertyRecord={record} onCommit={spy} />);

    const inputContainer = await waitFor(() => getByTestId("numeric-input"));

    await user.type(inputContainer, "1");
    expect(spy).to.not.be.called;

    await user.tab();

    await waitFor(() => expect(queryByDisplayValue("1")).to.not.be.null);
    expect(spy).to.be.calledOnceWith({ propertyRecord: record, newValue: { valueFormat: 0, value: 1, displayValue: "1" } });
  });
});
