/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { PropertyValueFormat as AbstractPropertyValueFormat, PrimitiveValue } from "@itwin/appui-abstract";
import { UiComponents } from "@itwin/components-react";
import { BeEvent } from "@itwin/core-bentley";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Descriptor } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { translate } from "../../presentation-components/common/Utils";
import { ECClassInfo, getIModelMetadataProvider } from "../../presentation-components/instance-filter-builder/ECMetadataProvider";
import { PresentationInstanceFilterInfo } from "../../presentation-components/instance-filter-builder/PresentationFilterBuilder";
import { PresentationInstanceFilter } from "../../presentation-components/instance-filter-builder/PresentationInstanceFilter";
import { PresentationInstanceFilterDialog } from "../../presentation-components/instance-filter-builder/PresentationInstanceFilterDialog";
import { createTestECClassInfo, stubDOMMatrix, stubRaf } from "../_helpers/Common";
import { createTestCategoryDescription, createTestContentDescriptor, createTestPropertiesContentField } from "../_helpers/Content";
import { render, waitFor, waitForElement } from "../TestUtils";

describe("PresentationInstanceFilterDialog", () => {
  stubRaf();
  stubDOMMatrix();
  const category = createTestCategoryDescription({ name: "root", label: "Root" });
  const classInfo = createTestECClassInfo();
  const stringField = createTestPropertiesContentField({
    properties: [{ property: { classInfo, name: "stringProps", type: "string" } }],
    name: "stringField",
    label: "String Field",
    category,
  });
  const descriptor = createTestContentDescriptor({
    selectClasses: [{ selectClassInfo: classInfo, isSelectPolymorphic: false }],
    categories: [category],
    fields: [stringField],
  });
  const initialFilter: PresentationInstanceFilterInfo = {
    filter: {
      field: stringField,
      operator: "is-null",
      value: undefined,
    },
    usedClasses: [classInfo],
  };

  const onCloseEvent = new BeEvent<() => void>();
  const imodel = {
    key: "test_imodel",
    onClose: onCloseEvent,
  } as IModelConnection;

  before(() => {
    HTMLElement.prototype.scrollIntoView = () => {};

    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "initialized").get(() => true);
    sinon.stub(IModelApp, "localization").get(() => localization);
    sinon.stub(Presentation, "localization").get(() => localization);
    sinon.stub(UiComponents, "translate").callsFake((key) => key as string);

    const metadataProvider = getIModelMetadataProvider(imodel);
    sinon.stub(metadataProvider, "getECClassInfo").callsFake(async () => {
      return new ECClassInfo(classInfo.id, classInfo.name, classInfo.label, new Set(), new Set());
    });
  });

  after(() => {
    onCloseEvent.raiseEvent();
    sinon.restore();
    delete (HTMLElement.prototype as any).scrollIntoView;
  });

  it("displays warning message on class selector opening if filtering rules are set ", async () => {
    const { container, getByText, queryByDisplayValue, user, queryByText } = render(
      <PresentationInstanceFilterDialog imodel={imodel} descriptor={descriptor} onApply={() => {}} isOpen={true} />,
    );

    // open property selector
    const propertySelector = await getRulePropertySelector(container);
    await user.click(propertySelector);
    // select property
    await user.click(getByText(stringField.label));

    // enter value
    const inputContainer = await waitForElement<HTMLInputElement>(container, ".fb-property-value input");
    await user.type(inputContainer, "test value");
    await waitFor(() => expect(queryByDisplayValue("test value")).to.not.be.null);

    // expand class selector
    const clickable = container.querySelector(".iui-actionable");
    await user.click(clickable!);

    expect(queryByText(translate("instance-filter-builder.class-selection-warning"))).to.not.be.null;
  });

  it("clears all filtering options on class list changing ", async () => {
    const { container, getByText, queryByDisplayValue, user } = render(
      <PresentationInstanceFilterDialog imodel={imodel} descriptor={descriptor} onApply={() => {}} isOpen={true} />,
    );

    // open property selector
    const propertySelector = await getRulePropertySelector(container);
    await user.click(propertySelector);
    // select property
    await user.click(getByText(stringField.label));

    // enter value
    const inputContainer = await waitForElement<HTMLInputElement>(container, ".fb-property-value input");
    await user.type(inputContainer, "test value");
    await waitFor(() => expect(queryByDisplayValue("test value")).to.not.be.null);

    // expand class selector
    const expander = container.querySelector(".iui-actionable");
    await user.click(expander!);

    // deselect class item from dropdown
    const classItem = document.querySelector('li[label="Class Label"]');
    await user.click(classItem!);

    // assert that filtering rule was cleared
    await waitFor(() => expect(queryByDisplayValue("test value")).to.be.null);
  });

  it("invokes 'onApply' with string property filter rule", async () => {
    const spy = sinon.spy();
    const { container, getByText, queryByDisplayValue, user } = render(
      <PresentationInstanceFilterDialog imodel={imodel} descriptor={descriptor} onApply={spy} isOpen={true} />,
    );

    // open property selector
    const propertySelector = await getRulePropertySelector(container);
    await user.click(propertySelector);
    // select property
    await user.click(getByText(stringField.label));

    // enter value
    const inputContainer = await waitForElement<HTMLInputElement>(container, ".fb-property-value input");
    await user.type(inputContainer, "test value");

    await waitFor(() => expect(queryByDisplayValue("test value")).to.not.be.null);
    await user.tab();

    const applyButton = await getApplyButton(container);
    await user.click(applyButton);

    await waitFor(() => {
      expect(spy).to.be.calledOnceWith({
        filter: {
          field: stringField,
          operator: "like",
          value: {
            valueFormat: AbstractPropertyValueFormat.Primitive,
            value: "test value",
            displayValue: "test value",
          } as PrimitiveValue,
        },
        usedClasses: [classInfo],
      });
    });
  });

  it("does not invoke `onApply` when there two empty rules", async () => {
    const spy = sinon.spy();
    const { container, user, getByText } = render(<PresentationInstanceFilterDialog imodel={imodel} descriptor={descriptor} onApply={spy} isOpen={true} />);

    await user.click(getByText(/filterBuilder.add/));

    const applyButton = await getApplyButton(container);
    await user.click(applyButton);

    expect(spy).to.not.be.called;
  });

  it("does not invoke `onApply` when filter is invalid", async () => {
    const spy = sinon.spy();
    const { container, getByText, user } = render(<PresentationInstanceFilterDialog imodel={imodel} descriptor={descriptor} onApply={spy} isOpen={true} />);

    // open property selector
    const propertySelector = await getRulePropertySelector(container);
    await user.click(propertySelector);
    // select property
    await user.click(getByText(stringField.label));

    const applyButton = await getApplyButton(container);
    await user.click(applyButton);

    expect(spy).to.not.be.called;
  });

  it("invokes `onApply` when there are no items selected", async () => {
    const spy = sinon.spy();
    const { container, user } = render(<PresentationInstanceFilterDialog imodel={imodel} descriptor={descriptor} onApply={spy} isOpen={true} />);

    const applyButton = await getApplyButton(container);
    await user.click(applyButton);

    expect(spy).to.be.called;
  });

  it("invokes `onReset` when reset is clicked.", async () => {
    const spy = sinon.spy();
    const { container, user } = render(
      <PresentationInstanceFilterDialog imodel={imodel} descriptor={descriptor} onReset={spy} onApply={() => {}} isOpen={true} />,
    );

    const resetButton = await getResetButton(container);
    await user.click(resetButton);

    expect(spy).to.be.called;
  });

  it("throws error when filter is missing presentation metadata", async () => {
    const fromComponentsPropertyFilterStub = sinon.stub(PresentationInstanceFilter, "fromComponentsPropertyFilter").throws(new Error("Some Error"));
    const spy = sinon.spy();
    const { container, getByText, queryByText, user } = render(
      <PresentationInstanceFilterDialog imodel={imodel} descriptor={descriptor} onApply={spy} isOpen={true} />,
    );

    // open property selector
    const propertySelector = await getRulePropertySelector(container);
    await user.click(propertySelector);
    // select property
    await user.click(getByText(stringField.label));

    // open operator selector
    const operatorSelector = await getRuleOperatorSelector(container);
    await user.click(operatorSelector);
    // select operator
    await user.click(getByText(/filterBuilder.operators.isNotNull/));

    // wait until operator is selected
    const applyButton = await getApplyButton(container);
    await user.click(applyButton);

    await waitFor(() => expect(queryByText("general.error")).to.not.be.null);
    fromComponentsPropertyFilterStub.restore();
  });

  it("renders custom title", async () => {
    const spy = sinon.spy();
    const title = "custom title";

    const { queryByText } = render(
      <PresentationInstanceFilterDialog
        imodel={imodel}
        descriptor={descriptor}
        title={<div>{title}</div>}
        onApply={spy}
        isOpen={true}
        initialFilter={initialFilter}
      />,
    );

    await waitFor(() => expect(queryByText(title)).to.not.be.null);
  });

  it("renders results count", async () => {
    const { queryByText } = render(
      <PresentationInstanceFilterDialog
        imodel={imodel}
        descriptor={descriptor}
        onApply={() => {}}
        isOpen={true}
        initialFilter={initialFilter}
        filterResultsCountRenderer={() => <div>Test Results</div>}
      />,
    );

    await waitFor(() => expect(queryByText("Test Results")).to.not.be.null);
  });

  it("renders error boundary if error is thrown", async () => {
    const descriptorGetter = async () => {
      throw new Error("Cannot load descriptor");
    };

    const { queryByText } = render(<PresentationInstanceFilterDialog imodel={imodel} descriptor={descriptorGetter} onApply={() => {}} isOpen={true} />);

    await waitFor(() => expect(queryByText("general.error")).to.not.be.null);
  });

  it("renders with lazy-loaded descriptor", async () => {
    const spy = sinon.spy();
    const descriptorGetter = async () => descriptor;

    const { container } = render(<PresentationInstanceFilterDialog imodel={imodel} descriptor={descriptorGetter} onApply={spy} isOpen={true} />);

    await getRulePropertySelector(container);
  });

  it("renders with passed in `toolbarRenderer`", async () => {
    const toolbarButtonsRenderer = () => {
      return <button>Click Me!</button>;
    };

    const { queryByText } = render(
      <PresentationInstanceFilterDialog
        imodel={imodel}
        descriptor={descriptor}
        onApply={() => {}}
        isOpen={true}
        toolbarButtonsRenderer={toolbarButtonsRenderer}
      />,
    );

    await waitFor(() => expect(queryByText("Click Me!")).to.not.be.null);
  });

  it("renders spinner while loading descriptor", async () => {
    const spy = sinon.spy();
    // simulate long loading descriptor
    const descriptorGetter = async () => undefined as unknown as Descriptor;

    const { container } = render(<PresentationInstanceFilterDialog imodel={imodel} descriptor={descriptorGetter} onApply={spy} isOpen={true} />);

    await waitFor(() => {
      const progressIndicator = container.querySelector<HTMLInputElement>(".presentation-instance-filter-dialog-progress");
      expect(progressIndicator).to.not.be.null;
    });
  });

  async function getRulePropertySelector(container: HTMLElement) {
    return waitForElement<HTMLInputElement>(container, ".fb-property-name input");
  }

  async function getRuleOperatorSelector(container: HTMLElement) {
    return waitForElement<HTMLDivElement>(container, `.fb-row-condition [role="combobox"]`);
  }

  async function getResetButton(container: HTMLElement) {
    return waitForElement<HTMLButtonElement>(container, ".presentation-instance-filter-dialog-reset-button", (e) => {
      expect(e).to.not.be.null;
    });
  }

  async function getApplyButton(container: HTMLElement, enabled: boolean = false) {
    return waitForElement<HTMLButtonElement>(container, ".presentation-instance-filter-dialog-apply-button", (e) => {
      expect(e).to.not.be.null;
      expect(e?.disabled ?? false).to.be.eq(enabled);
    });
  }
});
