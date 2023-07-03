import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp } from "@itwin/core-frontend";
import { Presentation } from "@itwin/presentation-frontend";
import sinon from "sinon";
import { NumericPropertyTargetInput, NumericPropertyTargetInputAttributes } from "../../presentation-components/properties/NumericPropertyTargetInput";
import { render, waitFor } from "@testing-library/react";
import { createRecord } from "./NumericPropertyEditor.test";
import { createRef } from "react";
import { PrimitiveValue } from "@itwin/appui-abstract";
import { expect } from "chai";
import userEvent from "@testing-library/user-event";


describe("<NumericPropertyTargetInput />", () => {
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

  it("get value from target input reference", async () => {
    const user = userEvent.setup();
    const record = createRecord();
    const ref = createRef<NumericPropertyTargetInputAttributes>();
    const { getByTestId } = render(<NumericPropertyTargetInput ref={ref} propertyRecord={record}/>);

    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.NaN;

    const inputContainer = await waitFor(() => getByTestId("numeric-editor-input"));

    await user.type(inputContainer, "1");

    await waitFor(() => expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(1));
  });

  describe("foramt value", () => {
    it("returns the old value after typing `-` not at the beginning of an input", async () => {
      const user = userEvent.setup();
      const record = createRecord(-10);
      const { getByDisplayValue, getByTestId } = render(<NumericPropertyTargetInput propertyRecord={record}/>);

      const inputContainer = await waitFor(() => getByTestId("numeric-editor-input"));

      await user.type(inputContainer, "-");
      expect(getByDisplayValue("-10")).to.not.be.null;
    });

    it("returns the old value after typing second `.`", async () => {
      const user = userEvent.setup();
      const record = createRecord(10.1);
      const { getByDisplayValue, getByTestId } = render(<NumericPropertyTargetInput propertyRecord={record}/>);

      const inputContainer = await waitFor(() => getByTestId("numeric-editor-input"));

      await user.type(inputContainer, ".");
      expect(getByDisplayValue("10.1")).to.not.be.null;
    });

    it("returns new value after typing number", async () => {
      const user = userEvent.setup();
      const record = createRecord(-10);
      const { getByDisplayValue, getByTestId } = render(<NumericPropertyTargetInput propertyRecord={record}/>);

      const inputContainer = await waitFor(() => getByTestId("numeric-editor-input"));

      await user.type(inputContainer, "1");
      expect(getByDisplayValue("-101")).to.not.be.null;
    });
  });
});
