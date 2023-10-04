/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createRef } from "react";
import sinon from "sinon";
import { PrimitiveValue } from "@itwin/appui-abstract";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp } from "@itwin/core-frontend";
import { Presentation } from "@itwin/presentation-frontend";
import { waitFor } from "@testing-library/react";
import { NumericInput, NumericPropertyInput, NumericPropertyInputAttributes } from "../../presentation-components/properties/NumericPropertyInput";
import { render } from "../_helpers/Common";
import { createRecord } from "./NumericPropertyEditor.test";

describe("<NumericPropertyInput />", () => {
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

  it("get value from NumericPropertyInput reference", async () => {
    const record = createRecord(1);
    const ref = createRef<NumericPropertyInputAttributes>();
    const { getByRole, user } = render(<NumericPropertyInput ref={ref} propertyRecord={record} />);

    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(1);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "0");

    await waitFor(() => expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(10));
  });

  it("get value from NumericPropertyInput reference returns undefined when input is not a number", async () => {
    const record = createRecord();
    const ref = createRef<NumericPropertyInputAttributes>();
    const { getByRole, user } = render(<NumericPropertyInput ref={ref} propertyRecord={record} onCommit={() => {}} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "-");

    await waitFor(() => expect((ref.current?.getValue() as PrimitiveValue).value).to.be.undefined);
  });

  it("returns new value after typing number", async () => {
    const record = createRecord(-10);
    const ref = createRef<NumericPropertyInputAttributes>();
    const { getByRole, queryByDisplayValue, user } = render(<NumericPropertyInput propertyRecord={record} ref={ref} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "1");
    expect(queryByDisplayValue("-101")).to.not.be.null;
    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(-101);
  });

  it("allows typing `-1`", async () => {
    const record = createRecord();
    const ref = createRef<NumericPropertyInputAttributes>();
    const { getByRole, queryByDisplayValue, user } = render(<NumericPropertyInput propertyRecord={record} ref={ref} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "-1");
    expect(queryByDisplayValue("-1")).to.not.be.null;
    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(-1);
  });

  it("allows typing `+1`", async () => {
    const record = createRecord();
    const ref = createRef<NumericPropertyInputAttributes>();
    const { getByRole, queryByDisplayValue, user } = render(<NumericPropertyInput propertyRecord={record} ref={ref} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "+1");
    expect(queryByDisplayValue("+1")).to.not.be.null;
    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(1);
  });

  it("allows typing `.1` ", async () => {
    const record = createRecord();
    const ref = createRef<NumericPropertyInputAttributes>();
    const { getByRole, queryByDisplayValue, user } = render(<NumericPropertyInput propertyRecord={record} ref={ref} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, ".1");
    expect(queryByDisplayValue(".1")).to.not.be.null;
    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(0.1);
  });

  it("allows typing `+.1`", async () => {
    const record = createRecord();
    const ref = createRef<NumericPropertyInputAttributes>();
    const { getByRole, queryByDisplayValue, user } = render(<NumericPropertyInput propertyRecord={record} ref={ref} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "+.1");
    expect(queryByDisplayValue("+.1")).to.not.be.null;
    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(0.1);
  });

  it("allows typing `-.1`", async () => {
    const record = createRecord();
    const ref = createRef<NumericPropertyInputAttributes>();
    const { getByRole, queryByDisplayValue, user } = render(<NumericPropertyInput propertyRecord={record} ref={ref} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "-.1");
    expect(queryByDisplayValue("-.1")).to.not.be.null;
    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(-0.1);
  });

  it("allows typing 1e5", async () => {
    const record = createRecord();
    const ref = createRef<NumericPropertyInputAttributes>();
    const { getByDisplayValue, getByRole, user } = render(<NumericPropertyInput propertyRecord={record} ref={ref} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "1e5");
    expect(getByDisplayValue("1e5")).to.not.be.null;
    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(100000);
  });

  it("allows typing 1e-5", async () => {
    const record = createRecord();
    const ref = createRef<NumericPropertyInputAttributes>();
    const { getByDisplayValue, getByRole, user } = render(<NumericPropertyInput propertyRecord={record} ref={ref} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "1e-5");
    expect(getByDisplayValue("1e-5")).to.not.be.null;
    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(0.00001);
  });
});

describe("<NumericInput />", () => {
  it("renders NumericInput with initial value", () => {
    const { getByRole } = render(<NumericInput onChange={() => {}} value="1" />);
    expect((getByRole("textbox") as HTMLInputElement).value).to.be.eq("1");
  });

  it("does not fire `onChange` when input is a letter", async () => {
    const spy = sinon.spy();
    const { getByRole, user } = render(<NumericInput onChange={spy} value="" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "qwertyuiopasdfghjklzxcvbnm");

    expect(spy.called).to.be.false;
  });

  it("does not fire `onChange` when number transforms to `Infinity`", async () => {
    const spy = sinon.spy();
    const { getByRole, user } = render(<NumericInput onChange={spy} value="1e90" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "1");

    expect(spy.called).to.be.false;
  });

  it("fires `onChange` when input is a number", async () => {
    const spy = sinon.spy();
    const { getByRole, user } = render(<NumericInput onChange={spy} value="" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "1");

    expect(spy).to.be.calledWith("1");
  });

  it("fires `onChange` when input is `-`, `+` or `.`", async () => {
    const spy = sinon.spy();
    const { getByRole, user } = render(<NumericInput onChange={spy} value="" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "+");
    expect(spy).to.be.calledWith("+");

    await user.type(inputContainer, "-");
    expect(spy).to.be.calledWith("-");

    await user.type(inputContainer, ".");
    expect(spy).to.be.calledWith(".");
  });

  it("fires `onChange` when input is `+.`", async () => {
    const spy = sinon.spy();
    const { getByRole, user } = render(<NumericInput onChange={spy} value="+" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, ".");

    expect(spy).to.be.calledWith("+.");
  });

  it("fires `onChange` when input is `-.`", async () => {
    const spy = sinon.spy();
    const { getByRole, user } = render(<NumericInput onChange={spy} value="-" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, ".");

    expect(spy).to.be.calledWith("-.");
  });

  it("fires `onChange` when input ends with `e` and input before `e` is a correct number", async () => {
    const spy = sinon.spy();
    const { getByRole, user } = render(<NumericInput onChange={spy} value="1" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "e");

    expect(spy).to.be.calledWith("1e");
  });

  it("fires `onChange` when input ends with `e-` and input before `e` is a correct number", async () => {
    const spy = sinon.spy();
    const { getByRole, user } = render(<NumericInput onChange={spy} value="1e" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "-");

    expect(spy).to.be.calledWith("1e-");
  });

  it("fires `onBlur` when inputContainer becomes blurred", async () => {
    const spy = sinon.spy();
    const { getByRole } = render(<NumericInput onBlur={spy} onChange={() => {}} value="1" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));
    fireEvent.blur(inputContainer);

    expect(spy).to.be.be.calledOnce;
  });

  it("commits undefined value when propertyRecord value is NaN on `onBlur` event", async () => {
    const record = createRecord(Number.NaN);
    const spy = sinon.spy();
    const ref = createRef<NumericPropertyInputAttributes>();
    const { getByRole } = render(<NumericPropertyInput ref={ref} propertyRecord={record} onCommit={spy} />);
    const inputContainer = await waitFor(() => getByRole("textbox"));
    fireEvent.blur(inputContainer);

    expect(spy).to.be.calledWith({ propertyRecord: record, newValue: { valueFormat: 0, value: undefined, displayValue: "NaN" } });
  });
});
