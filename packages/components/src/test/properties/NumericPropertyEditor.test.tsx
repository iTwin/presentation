import sinon from "sinon";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp } from "@itwin/core-frontend";
import { Presentation } from "@itwin/presentation-frontend";
import { render, waitFor } from "@testing-library/react";
import { EditorContainer } from "@itwin/components-react";
import { expect } from "chai";
import { PrimitiveValue, PropertyDescription, PropertyRecord, PropertyValueFormat, StandardTypeNames } from "@itwin/appui-abstract";
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
  record.property.typename = "number:numeric-editor";
  return record;
};

describe("<NumericPropertyEditor />", () => {
  beforeEach(async () => {
    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "initialized").get(() => true);
    sinon.stub(IModelApp, "localization").get(() => localization);
    await Presentation.initialize();
  });

  afterEach(async () => {
    Presentation.terminate();
    sinon.restore();
  });

  it("renders editor for `numeric-editor` type", async () => {
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
  beforeEach(async () => {
    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "initialized").get(() => true);
    sinon.stub(IModelApp, "localization").get(() => localization);
    await Presentation.initialize();
  });

  afterEach(async () => {
    Presentation.terminate();
    sinon.restore();
  });

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
