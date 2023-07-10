import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp } from "@itwin/core-frontend";
import { Presentation } from "@itwin/presentation-frontend";
import sinon from "sinon";
import { NumericInput, NumericPropertyInput, NumericPropertyInputAttributes } from "../../presentation-components/properties/NumericPropertyInput";
import { render, waitFor } from "@testing-library/react";
import { createRecord } from "./NumericPropertyEditor.test";
import { createRef } from "react";
import { PrimitiveValue } from "@itwin/appui-abstract";
import { expect } from "chai";
import userEvent from "@testing-library/user-event";

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

  it("get value from target input reference", async () => {
    const user = userEvent.setup();
    const record = createRecord(1);
    const ref = createRef<NumericPropertyInputAttributes>();
    const { getByRole } = render(<NumericPropertyInput ref={ref} propertyRecord={record}/>);

    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(1)

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "0");

    await waitFor(() => expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(10));
  });

  it("get value from target input reference returns undefined when input is not a number", async () => {
    const user = userEvent.setup();
    const record = createRecord();
    const ref = createRef<NumericPropertyInputAttributes>();
    const { getByRole } = render(<NumericPropertyInput ref={ref} propertyRecord={record} onCommit={() => {}}/>);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "-");

    await waitFor(() => expect((ref.current?.getValue() as PrimitiveValue).value).to.be.undefined);
  });

  describe("integration with <NumericInput /> ", () => {
    it("returns new value after typing number", async () => {
      const user = userEvent.setup();
      const record = createRecord(-10);
      const { getByDisplayValue, getByRole } = render(<NumericPropertyInput propertyRecord={record}/>);

      const inputContainer = await waitFor(() => getByRole("textbox"));

      await user.type(inputContainer, "1");
      expect(getByDisplayValue("-101")).to.not.be.null;
    });

    it("converts `-`", async () => {
      const user = userEvent.setup();
      const record = createRecord();
      const ref = createRef<NumericPropertyInputAttributes>();
      const { getByDisplayValue, getByRole } = render(<NumericPropertyInput propertyRecord={record} ref={ref}/>);

      const inputContainer = await waitFor(() => getByRole("textbox"));

      await user.type(inputContainer, "-");
      expect(getByDisplayValue("-")).to.not.be.null;

      await user.type(inputContainer, "1");
      expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(-1);
    });

    it("converts `+`", async () => {
      const user = userEvent.setup();
      const record = createRecord();
      const ref = createRef<NumericPropertyInputAttributes>();
      const { getByDisplayValue, getByRole } = render(<NumericPropertyInput propertyRecord={record} ref={ref}/>);

      const inputContainer = await waitFor(() => getByRole("textbox"));

      await user.type(inputContainer, "+");
      expect(getByDisplayValue("+")).to.not.be.null;

      await user.type(inputContainer, "1");
      expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(1);
    });

    it("converts `.` ", async () => {
      const user = userEvent.setup();
      const record = createRecord();
      const ref = createRef<NumericPropertyInputAttributes>();
      const { getByDisplayValue, getByRole } = render(<NumericPropertyInput propertyRecord={record} ref={ref}/>);

      const inputContainer = await waitFor(() => getByRole("textbox"));

      await user.type(inputContainer, ".");
      expect(getByDisplayValue(".")).to.not.be.null;

      await user.type(inputContainer, "1");
      expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(0.1);
    });

    it("converts `+.`", async () => {
      const user = userEvent.setup();
      const record = createRecord();
      const ref = createRef<NumericPropertyInputAttributes>();
      const { getByDisplayValue, getByRole } = render(<NumericPropertyInput propertyRecord={record} ref={ref}/>);

      const inputContainer = await waitFor(() => getByRole("textbox"));

      await user.type(inputContainer, "+.");
      expect(getByDisplayValue("+.")).to.not.be.null;

      await user.type(inputContainer, "1");
      expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(0.1);
    });

    it("converts `-.`", async () => {
      const user = userEvent.setup();
      const record = createRecord();
      const ref = createRef<NumericPropertyInputAttributes>();
      const { getByDisplayValue, getByRole } = render(<NumericPropertyInput propertyRecord={record} ref={ref}/>);

      const inputContainer = await waitFor(() => getByRole("textbox"));

      await user.type(inputContainer, "-.");
      expect(getByDisplayValue("-.")).to.not.be.null;

      await user.type(inputContainer, "1");
      expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(-0.1);
    });

    it("converts base-10 exponent (e)", async () => {
      const user = userEvent.setup();
      const record = createRecord(1);
      const ref = createRef<NumericPropertyInputAttributes>();
      const { getByDisplayValue, getByRole } = render(<NumericPropertyInput propertyRecord={record} ref={ref}/>);

      const inputContainer = await waitFor(() => getByRole("textbox"));

      await user.type(inputContainer, "e");
      expect(getByDisplayValue("1e")).to.not.be.null;

      await user.type(inputContainer, "5");
      expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(100000);
    });

    it("converts base-10 exponent (e) and negative numbers", async () => {
      const user = userEvent.setup();
      const record = createRecord(1);
      const ref = createRef<NumericPropertyInputAttributes>();
      const { getByDisplayValue, getByRole } = render(<NumericPropertyInput propertyRecord={record} ref={ref}/>);

      const inputContainer = await waitFor(() => getByRole("textbox"));

      await user.type(inputContainer, "e-");
      expect(getByDisplayValue("1e-")).to.not.be.null;

      await user.type(inputContainer, "5");
      expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(0.00001);
    });
  });
});

describe("<NumericInput />", () => {
  it("renders NumericInput", () => {
    const { getByRole } = render(<NumericInput onChange={() => {}} value="" />)
    expect(getByRole("textbox")).to.not.be.null;
  });

  it("does not fire `onChange` when input is a letter", async () => {
    const user = userEvent.setup();
    const spy = sinon.spy();
    const { getByRole } = render(<NumericInput onChange={spy} value="" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "qwertyuiopasdfghjklzxcvbnm");

    expect(spy.called).to.be.false;
  });

  it("does not fire `onChange` when number transforms to `Infinity`", async () => {
    const user = userEvent.setup();
    const spy = sinon.spy();
    const { getByRole } = render(<NumericInput onChange={spy} value="1e90" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "1");

    expect(spy.called).to.be.false;
  });

  it("fires `onChange` when input is a number", async () => {
    const user = userEvent.setup();
    const spy = sinon.spy();
    const { getByRole } = render(<NumericInput onChange={spy} value="" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "1");

    expect(spy).to.be.calledWith("1");
  });

  it("fires `onChange` when input is `-`, `+` or `.`", async () => {
    const user = userEvent.setup();
    const spy = sinon.spy();
    const { getByRole } = render(<NumericInput onChange={spy} value="" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "+-.");

    expect(spy).to.be.calledWith("+");
    expect(spy).to.be.calledWith("-");
    expect(spy).to.be.calledWith(".");
  });

  it("fires `onChange` when input is `+.`", async () => {
    const user = userEvent.setup();
    const spy = sinon.spy();
    const { getByRole } = render(<NumericInput onChange={spy} value="+" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, ".");

    expect(spy).to.be.calledWith("+.");
  });

  it("fires `onChange` when input is `-.`", async () => {
    const user = userEvent.setup();
    const spy = sinon.spy();
    const { getByRole } = render(<NumericInput onChange={spy} value="-" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, ".");

    expect(spy).to.be.calledWith("-.");
  });

  it("fires `onChange` when input ends with `e` and input before `e` is a correct number", async () => {
    const user = userEvent.setup();
    const spy = sinon.spy();
    const { getByRole } = render(<NumericInput onChange={spy} value="1" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "e");

    expect(spy).to.be.calledWith("1e");
  });

  it("fires `onChange` when input ends with `e-` and input before `e` is a correct number", async () => {
    const user = userEvent.setup();
    const spy = sinon.spy();
    const { getByRole } = render(<NumericInput onChange={spy} value="1e" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "-");

    expect(spy).to.be.calledWith("1e-");
  });
});
