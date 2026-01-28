/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createRef } from "react";
import sinon from "sinon";
import { StandardTypeNames } from "@itwin/appui-abstract";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp } from "@itwin/core-frontend";
import { Presentation } from "@itwin/presentation-frontend";
import { createTestPropertyRecord } from "../../_helpers/UiComponents.js";
import { NumericInput, NumericPropertyInput } from "../../../presentation-components/properties/inputs/NumericPropertyInput.js";
import { render, waitFor } from "../../TestUtils.js";

import type { PrimitiveValue, PropertyDescription, PropertyRecord } from "@itwin/appui-abstract";
import type { PropertyUpdatedArgs } from "@itwin/components-react";
import type { WithConstraints } from "../../../presentation-components/common/ContentBuilder.js";
import type { PropertyEditorAttributes } from "../../../presentation-components/properties/editors/Common.js";

const createRecord = (initialValue?: number) => {
  return createTestPropertyRecord({ value: initialValue, displayValue: initialValue?.toString() }, { typename: StandardTypeNames.Double });
};

describe("<NumericPropertyInput />", () => {
  beforeEach(async () => {
    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "initialized").get(() => true);
    sinon.stub(IModelApp, "localization").get(() => localization);
    sinon.stub(Presentation, "localization").get(() => localization);
  });

  afterEach(async () => {
    sinon.restore();
  });

  [
    { testName: "the input value if min and max are undefined", input: "0", expectedResult: 0, min: undefined, max: undefined },
    { testName: "undefined if input value isn't a number", input: "+", expectedResult: undefined, min: 1, max: 2 },
    { testName: "the input value if value falls in min and max range", input: "1", expectedResult: 1, min: 1, max: 2 },
    { testName: "min when input value is less than min", input: "0", expectedResult: 1, min: 1, max: undefined },
    { testName: "max when input value is more than max", input: "3", expectedResult: 2, min: undefined, max: 2 },
  ].forEach((testCase) =>
    it(`calls onCommit with ${testCase.testName}`, async () => {
      const record: PropertyRecord & { property: WithConstraints<PropertyDescription> } = createRecord(2);
      record.property.constraints = { minimumValue: testCase.min, maximumValue: testCase.max };
      const ref = createRef<PropertyEditorAttributes>();
      const spy = sinon.spy();
      const onCommit = (args: PropertyUpdatedArgs) => {
        if ("value" in args.newValue) {
          spy(args.newValue.value);
        }
      };
      const { getByRole, user } = render(<NumericPropertyInput ref={ref} propertyRecord={record} onCommit={onCommit} />);

      expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(2);

      const inputContainer = await waitFor(() => getByRole("textbox"));

      await user.clear(inputContainer);
      await user.click(inputContainer);
      await user.type(inputContainer, testCase.input);
      await user.tab();

      await waitFor(() => expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(testCase.expectedResult));
      expect(spy).to.be.calledOnceWith(testCase.expectedResult);
    }),
  );

  it("calls onCommit with correct values with non numeric constraints", async () => {
    const record: PropertyRecord & { property: WithConstraints<PropertyDescription> } = createRecord(2);
    record.property.constraints = { minimumLength: 2 };
    const ref = createRef<PropertyEditorAttributes>();
    const spy = sinon.spy();
    const onCommit = (args: PropertyUpdatedArgs) => {
      if ("value" in args.newValue) {
        spy(args.newValue.value);
      }
    };
    const { getByRole, user } = render(<NumericPropertyInput ref={ref} propertyRecord={record} onCommit={onCommit} />);

    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(2);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.clear(inputContainer);
    await user.click(inputContainer);
    await user.type(inputContainer, "3");
    await user.tab();

    await waitFor(() => expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(3));
    expect(spy).to.be.calledOnceWith(3);
  });

  it("get value from NumericPropertyInput reference", async () => {
    const record = createRecord(1);
    const ref = createRef<PropertyEditorAttributes>();
    const { getByRole, user } = render(<NumericPropertyInput ref={ref} propertyRecord={record} />);

    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(1);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.click(inputContainer);
    await user.type(inputContainer, "0");

    await waitFor(() => expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(10));
  });

  it("get value from NumericPropertyInput reference returns undefined when input is not a number", async () => {
    const record = createRecord();
    const ref = createRef<PropertyEditorAttributes>();
    const { getByRole, user } = render(<NumericPropertyInput ref={ref} propertyRecord={record} onCommit={() => {}} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "-");

    await waitFor(() => expect((ref.current?.getValue() as PrimitiveValue).value).to.be.undefined);
  });

  it("returns new value after typing number", async () => {
    const record = createRecord(-10);
    const ref = createRef<PropertyEditorAttributes>();
    const { getByRole, queryByDisplayValue, user } = render(<NumericPropertyInput propertyRecord={record} ref={ref} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.click(inputContainer);
    await user.type(inputContainer, "1");
    expect(queryByDisplayValue("-101")).to.not.be.null;
    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(-101);
  });

  it("returns undefined value when input is empty", async () => {
    const record = createRecord(-10);
    const ref = createRef<PropertyEditorAttributes>();
    const { getByRole, queryByDisplayValue, user } = render(<NumericPropertyInput propertyRecord={record} ref={ref} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.clear(inputContainer);
    expect(queryByDisplayValue("")).to.not.be.null;
    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.undefined;
  });

  it("allows typing `-1`", async () => {
    const record = createRecord();
    const ref = createRef<PropertyEditorAttributes>();
    const { getByRole, queryByDisplayValue, user } = render(<NumericPropertyInput propertyRecord={record} ref={ref} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "-1");
    expect(queryByDisplayValue("-1")).to.not.be.null;
    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(-1);
  });

  it("allows typing `+1`", async () => {
    const record = createRecord();
    const ref = createRef<PropertyEditorAttributes>();
    const { getByRole, queryByDisplayValue, user } = render(<NumericPropertyInput propertyRecord={record} ref={ref} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "+1");
    expect(queryByDisplayValue("+1")).to.not.be.null;
    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(1);
  });

  it("allows typing `.1` ", async () => {
    const record = createRecord();
    const ref = createRef<PropertyEditorAttributes>();
    const { getByRole, queryByDisplayValue, user } = render(<NumericPropertyInput propertyRecord={record} ref={ref} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, ".1");
    expect(queryByDisplayValue(".1")).to.not.be.null;
    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(0.1);
  });

  it("allows typing `+.1`", async () => {
    const record = createRecord();
    const ref = createRef<PropertyEditorAttributes>();
    const { getByRole, queryByDisplayValue, user } = render(<NumericPropertyInput propertyRecord={record} ref={ref} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "+.1");
    expect(queryByDisplayValue("+.1")).to.not.be.null;
    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(0.1);
  });

  it("allows typing `-.1`", async () => {
    const record = createRecord();
    const ref = createRef<PropertyEditorAttributes>();
    const { getByRole, queryByDisplayValue, user } = render(<NumericPropertyInput propertyRecord={record} ref={ref} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "-.1");
    expect(queryByDisplayValue("-.1")).to.not.be.null;
    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(-0.1);
  });

  it("allows typing 1e5", async () => {
    const record = createRecord();
    const ref = createRef<PropertyEditorAttributes>();
    const { getByDisplayValue, getByRole, user } = render(<NumericPropertyInput propertyRecord={record} ref={ref} />);

    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.type(inputContainer, "1e5");
    expect(getByDisplayValue("1e5")).to.not.be.null;
    expect((ref.current?.getValue() as PrimitiveValue).value).to.be.eq(100000);
  });

  it("allows typing 1e-5", async () => {
    const record = createRecord();
    const ref = createRef<PropertyEditorAttributes>();
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

    // cspell:disable-next-line
    await user.type(inputContainer, "qwertyuiopasdfghjklzxcvbnm");

    expect(spy.called).to.be.false;
  });

  it("does not fire `onChange` when number transforms to `Infinity`", async () => {
    const spy = sinon.spy();
    const { getByRole, user } = render(<NumericInput onChange={spy} value="1e90" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.click(inputContainer);
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

    await user.click(inputContainer);
    await user.type(inputContainer, ".");

    expect(spy).to.be.calledWith("+.");
  });

  it("fires `onChange` when input is `-.`", async () => {
    const spy = sinon.spy();
    const { getByRole, user } = render(<NumericInput onChange={spy} value="-" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.click(inputContainer);
    await user.type(inputContainer, ".");

    expect(spy).to.be.calledWith("-.");
  });

  it("fires `onChange` when input ends with `e` and input before `e` is a correct number", async () => {
    const spy = sinon.spy();
    const { getByRole, user } = render(<NumericInput onChange={spy} value="1" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.click(inputContainer);
    await user.type(inputContainer, "e");

    expect(spy).to.be.calledWith("1e");
  });

  it("fires `onChange` when input ends with `e-` and input before `e` is a correct number", async () => {
    const spy = sinon.spy();
    const { getByRole, user } = render(<NumericInput onChange={spy} value="1e" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));

    await user.click(inputContainer);
    await user.type(inputContainer, "-");

    expect(spy).to.be.calledWith("1e-");
  });

  it("fires `onBlur` when inputContainer becomes blurred", async () => {
    const spy = sinon.spy();
    const { getByRole, user } = render(<NumericInput onBlur={spy} onChange={() => {}} value="1" />);
    const inputContainer = await waitFor(() => getByRole("textbox"));
    await user.click(inputContainer);
    await user.tab();

    expect(spy).to.be.be.calledOnce;
  });

  it("should focus on input if setFocus is true", async () => {
    const { getByRole } = render(<NumericInput onChange={() => {}} value="1" setFocus={true} />);

    const input = await waitFor(() => getByRole("textbox"));
    await waitFor(() => expect(input).to.be.eq(document.activeElement));
  });

  it("commits undefined value when propertyRecord value is NaN on `onBlur` event", async () => {
    const record = createRecord(Number.NaN);
    const spy = sinon.spy();
    const ref = createRef<PropertyEditorAttributes>();
    const { getByRole, user } = render(<NumericPropertyInput ref={ref} propertyRecord={record} onCommit={spy} />);
    const inputContainer = await waitFor(() => getByRole("textbox"));
    await user.click(inputContainer);
    await user.tab();

    expect(spy).to.be.calledWith({ propertyRecord: record, newValue: { valueFormat: 0, value: undefined, displayValue: "NaN", roundingError: undefined } });
  });
});
