/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { ResolvablePromise } from "presentation-test-utilities";
import sinon from "sinon";
import { PropertyValueFormat as AbstractPropertyValueFormat, PrimitiveValue } from "@itwin/appui-abstract";
import { UiComponents } from "@itwin/components-react";
import { BeEvent } from "@itwin/core-bentley";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Presentation } from "@itwin/presentation-frontend";
import { translate } from "../../presentation-components/common/Utils.js";
import { ECClassInfo, getIModelMetadataProvider } from "../../presentation-components/instance-filter-builder/ECMetadataProvider.js";
import { PresentationInstanceFilterInfo } from "../../presentation-components/instance-filter-builder/PresentationFilterBuilder.js";
import { PresentationInstanceFilter } from "../../presentation-components/instance-filter-builder/PresentationInstanceFilter.js";
import {
  PresentationInstanceFilterDialog,
  PresentationInstanceFilterPropertiesSource,
} from "../../presentation-components/instance-filter-builder/PresentationInstanceFilterDialog.js";
import { createTestECClassInfo, stubDOMMatrix, stubGetBoundingClientRect, stubRaf } from "../_helpers/Common.js";
import { createTestCategoryDescription, createTestContentDescriptor, createTestPropertiesContentField } from "../_helpers/Content.js";
import {
  act,
  getAllByRole,
  getByPlaceholderText,
  getByRole,
  getByTestId,
  getByText,
  getByTitle,
  queryByDisplayValue,
  queryByText,
  render,
  waitFor,
  waitForElement,
  within,
} from "../TestUtils.js";

describe("PresentationInstanceFilterDialog", () => {
  stubRaf();
  stubDOMMatrix();
  stubGetBoundingClientRect();
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

  const propertiesSource = {
    descriptor,
  };

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

  it("renders with initial filter", async () => {
    const { baseElement } = render(
      <PresentationInstanceFilterDialog
        imodel={imodel}
        propertiesSource={propertiesSource}
        onApply={() => {}}
        isOpen={true}
        initialFilter={() => initialFilter}
      />,
      {
        addThemeProvider: true,
      },
    );

    // verify class is selected
    await waitFor(() => expect(queryByText(baseElement, classInfo.label)).to.not.be.null);

    // verify property is selected
    await waitFor(() => expect(queryByDisplayValue(baseElement, stringField.label)).to.not.be.null);
  });

  it("displays warning message on class selector opening if filtering rules are set ", async () => {
    const { baseElement, user } = render(
      <PresentationInstanceFilterDialog imodel={imodel} propertiesSource={propertiesSource} onApply={() => {}} isOpen={true} />,
      {
        addThemeProvider: true,
      },
    );

    // open property selector
    const propertySelector = await getRulePropertySelector(baseElement);
    await user.click(propertySelector);
    // select property
    await user.click(getByTitle(baseElement, stringField.label));

    // enter value
    const inputContainer = await waitForElement<HTMLInputElement>(baseElement, ".fb-property-value input");
    await user.type(inputContainer, "test value");
    await waitFor(() => expect(queryByDisplayValue(baseElement, "test value")).to.not.be.null);

    // expand class selector
    const classListContainer = getByPlaceholderText(baseElement, "instance-filter-builder.selected-classes");
    await user.click(classListContainer);

    expect(queryByText(baseElement, translate("instance-filter-builder.class-selection-warning"))).to.not.be.null;
  });

  it("hides warning message when class selection dropdown is hidden ", async () => {
    const { baseElement, user } = render(
      <PresentationInstanceFilterDialog imodel={imodel} propertiesSource={propertiesSource} onApply={() => {}} isOpen={true} />,
      {
        addThemeProvider: true,
      },
    );

    // open property selector
    const propertySelector = await getRulePropertySelector(baseElement);
    await user.click(propertySelector);
    // select property
    await user.click(getByTitle(baseElement, stringField.label));

    // enter value
    const inputContainer = await waitFor(() => getByTestId(baseElement, "components-text-editor"));
    await user.type(inputContainer, "test value");
    await waitFor(() => expect(queryByDisplayValue(baseElement, "test value")).to.not.be.null);

    // expand class selector
    const classListContainer = getByPlaceholderText(baseElement, "instance-filter-builder.selected-classes");
    await user.click(classListContainer);

    // assert that the warning is shown initially
    expect(queryByText(baseElement, translate("instance-filter-builder.class-selection-warning"))).to.not.be.null;

    // click somewhere else to hide the dropdown
    const header = baseElement.querySelector(".presentation-instance-filter-title");
    await user.click(header!);

    // hiding the dropdown should also hide the warning
    expect(queryByText(baseElement, translate("instance-filter-builder.class-selection-warning"))).to.be.null;
  });

  it("clears all filtering options on class list changing ", async () => {
    const { baseElement, user } = render(
      <PresentationInstanceFilterDialog imodel={imodel} propertiesSource={propertiesSource} onApply={() => {}} isOpen={true} />,
      {
        addThemeProvider: true,
      },
    );

    // open property selector
    const propertySelector = await getRulePropertySelector(baseElement);
    await user.click(propertySelector);
    // select property
    await user.click(getByTitle(baseElement, stringField.label));

    // enter value
    const inputContainer = await waitForElement<HTMLInputElement>(baseElement, ".fb-property-value input");
    await user.type(inputContainer, "test value");
    await waitFor(() => expect(queryByDisplayValue(baseElement, "test value")).to.not.be.null);

    // expand class selector
    const classListContainer = getByPlaceholderText(baseElement, "instance-filter-builder.selected-classes");
    await user.click(classListContainer);

    // deselect class item from dropdown
    await user.click(within(getByRole(baseElement, "listbox")).getByText("Class Label"));

    // assert that filtering rule was cleared
    await waitFor(() => expect(queryByDisplayValue(baseElement, "test value")).to.be.null);
  });

  it("invokes 'onApply' with string property filter rule", async () => {
    const spy = sinon.spy();
    const { baseElement, user } = render(<PresentationInstanceFilterDialog imodel={imodel} propertiesSource={propertiesSource} onApply={spy} isOpen={true} />, {
      addThemeProvider: true,
    });

    // open property selector
    const propertySelector = await getRulePropertySelector(baseElement);
    await user.click(propertySelector);
    // select property
    await user.click(getByTitle(baseElement, stringField.label));

    // enter value
    const inputContainer = await waitForElement<HTMLInputElement>(baseElement, ".fb-property-value input");
    await user.type(inputContainer, "test value");

    await waitFor(() => expect(queryByDisplayValue(baseElement, "test value")).to.not.be.null);
    await user.tab();

    const applyButton = await getApplyButton(baseElement);
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
    const { baseElement, user } = render(<PresentationInstanceFilterDialog imodel={imodel} propertiesSource={propertiesSource} onApply={spy} isOpen={true} />, {
      addThemeProvider: true,
    });

    const addButton = getAllByRole(baseElement, "button").find((el) => within(el).queryByText("Add"))!;
    await user.click(addButton);

    const applyButton = await getApplyButton(baseElement);
    await user.click(applyButton);

    expect(spy).to.not.be.called;
  });

  it("does not invoke `onApply` when filter is invalid", async () => {
    const spy = sinon.spy();
    const { baseElement, user } = render(<PresentationInstanceFilterDialog imodel={imodel} propertiesSource={propertiesSource} onApply={spy} isOpen={true} />, {
      addThemeProvider: true,
    });

    // open property selector
    const propertySelector = await getRulePropertySelector(baseElement);
    await user.click(propertySelector);
    // select property
    await user.click(getByTitle(baseElement, stringField.label));

    const applyButton = await getApplyButton(baseElement);
    await user.click(applyButton);

    expect(spy).to.not.be.called;
  });

  it("invokes `onApply` when there are no items selected", async () => {
    const spy = sinon.spy();
    const { baseElement, user } = render(<PresentationInstanceFilterDialog imodel={imodel} propertiesSource={propertiesSource} onApply={spy} isOpen={true} />, {
      addThemeProvider: true,
    });

    const applyButton = await getApplyButton(baseElement);
    await user.click(applyButton);

    expect(spy).to.be.called;
  });

  it("invokes `onApply` with only selected classes", async () => {
    const spy = sinon.spy();
    const { baseElement, user } = render(<PresentationInstanceFilterDialog imodel={imodel} propertiesSource={propertiesSource} onApply={spy} isOpen={true} />, {
      addThemeProvider: true,
    });

    // expand class selector
    const classListContainer = getByPlaceholderText(baseElement, "instance-filter-builder.select-classes-optional");
    await user.click(classListContainer);

    // deselect class item from dropdown
    const classItem = getByRole(baseElement, "option", { name: "Class Label" });
    await user.click(classItem);

    const applyButton = await getApplyButton(baseElement);
    await user.click(applyButton);

    expect(spy).to.be.calledWith({ filter: undefined, usedClasses: [classInfo] });
  });

  it("invokes `onReset` when reset is clicked.", async () => {
    const spy = sinon.spy();
    const { baseElement, user } = render(
      <PresentationInstanceFilterDialog imodel={imodel} propertiesSource={propertiesSource} onReset={spy} onApply={() => {}} isOpen={true} />,
      {
        addThemeProvider: true,
      },
    );

    const resetButton = await getResetButton(baseElement);
    await user.click(resetButton);

    expect(spy).to.be.called;
  });

  it("throws error when filter is missing presentation metadata", async () => {
    const fromComponentsPropertyFilterStub = sinon.stub(PresentationInstanceFilter, "fromComponentsPropertyFilter").throws(new Error("Some Error"));
    const consoleErrorStub = sinon.stub(console, "error").callsFake(() => {});
    const spy = sinon.spy();
    const { baseElement, user } = render(<PresentationInstanceFilterDialog imodel={imodel} propertiesSource={propertiesSource} onApply={spy} isOpen={true} />, {
      addThemeProvider: true,
    });

    // open property selector
    const propertySelector = await getRulePropertySelector(baseElement);
    await user.click(propertySelector);
    // select property
    await user.click(getByTitle(baseElement, stringField.label));

    // open operator selector
    const operatorSelector = await getRuleOperatorSelector(baseElement);
    await user.click(operatorSelector);
    // select operator
    await user.click(getByText(baseElement, "Is not null"));

    // wait until operator is selected
    const applyButton = await getApplyButton(baseElement);
    await user.click(applyButton);

    await waitFor(() => expect(queryByText(baseElement, "general.error")).to.not.be.null);
    fromComponentsPropertyFilterStub.restore();
    consoleErrorStub.restore();
  });

  it("renders custom title", async () => {
    const spy = sinon.spy();
    const title = "custom title";

    const { baseElement } = render(
      <PresentationInstanceFilterDialog imodel={imodel} propertiesSource={propertiesSource} title={<div>{title}</div>} onApply={spy} isOpen={true} />,
    );

    await waitFor(() => expect(queryByText(baseElement, title)).to.not.be.null);
  });

  it("renders results count", async () => {
    const { baseElement } = render(
      <PresentationInstanceFilterDialog
        imodel={imodel}
        propertiesSource={propertiesSource}
        onApply={() => {}}
        isOpen={true}
        initialFilter={initialFilter}
        filterResultsCountRenderer={() => <div>Test Results</div>}
      />,
    );

    // wait for filter builder to render
    await waitFor(() => expect(queryByDisplayValue(baseElement, stringField.label)).to.not.be.null);

    // verify results count renderer is used
    await waitFor(() => expect(queryByText(baseElement, "Test Results")).to.not.be.null);
  });

  it("renders error boundary if error is thrown", async () => {
    const consoleErrorStub = sinon.stub(console, "error").callsFake(() => {});
    const propertiesSourceGetter = () => {
      throw new Error("Cannot load descriptor");
    };

    const { baseElement } = render(
      <PresentationInstanceFilterDialog imodel={imodel} propertiesSource={propertiesSourceGetter} onApply={() => {}} isOpen={true} />,
    );

    await waitFor(() => expect(queryByText(baseElement, "general.error")).to.not.be.null);
    consoleErrorStub.restore();
  });

  it("renders with lazy-loaded descriptor", async () => {
    const spy = sinon.spy();
    const propertiesSourceGetter = async () => ({ descriptor });

    const { baseElement } = render(<PresentationInstanceFilterDialog imodel={imodel} propertiesSource={propertiesSourceGetter} onApply={spy} isOpen={true} />, {
      addThemeProvider: true,
    });

    await getRulePropertySelector(baseElement);
  });

  it("renders with passed in `toolbarRenderer`", async () => {
    const toolbarButtonsRenderer = () => {
      return <button>Click Me!</button>;
    };

    const { baseElement } = render(
      <PresentationInstanceFilterDialog
        imodel={imodel}
        propertiesSource={propertiesSource}
        onApply={() => {}}
        isOpen={true}
        toolbarButtonsRenderer={toolbarButtonsRenderer}
      />,
    );

    await waitFor(() => expect(queryByText(baseElement, "Click Me!")).to.not.be.null);
  });

  it("renders spinner while loading descriptor", async () => {
    const propertiesSourcePromise = new ResolvablePromise<PresentationInstanceFilterPropertiesSource>();
    // simulate long loading descriptor
    const propertiesSourceGetter = async () => propertiesSourcePromise;

    const { baseElement } = render(
      <PresentationInstanceFilterDialog imodel={imodel} propertiesSource={propertiesSourceGetter} onApply={() => {}} isOpen={true} />,
      {
        addThemeProvider: true,
      },
    );

    await waitFor(() => {
      expect(baseElement.querySelector(".presentation-instance-filter-dialog-progress")).to.not.be.null;
    });

    await act(async () => {
      await propertiesSourcePromise.resolve(propertiesSource);
    });

    await waitFor(() => {
      expect(baseElement.querySelector(".presentation-instance-filter-dialog-progress")).to.be.null;
    });
  });

  async function getRulePropertySelector(container: HTMLElement) {
    return waitForElement<HTMLInputElement>(container, `.fb-property-name [role="combobox"]`);
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
