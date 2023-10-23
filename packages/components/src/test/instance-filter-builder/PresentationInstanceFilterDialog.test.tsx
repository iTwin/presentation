/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import * as moq from "typemoq";
import { PropertyValueFormat as AbstractPropertyValueFormat, PrimitiveValue } from "@itwin/appui-abstract";
import { getPropertyFilterOperatorLabel, PropertyFilterRuleOperator, UiComponents } from "@itwin/components-react";
import { BeEvent } from "@itwin/core-bentley";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Descriptor } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { waitFor } from "@testing-library/react";
import { ECClassInfo, getIModelMetadataProvider } from "../../presentation-components/instance-filter-builder/ECMetadataProvider";
import { PresentationInstanceFilter, PresentationInstanceFilterInfo } from "../../presentation-components/instance-filter-builder/PresentationFilterBuilder";
import { PresentationInstanceFilterDialog } from "../../presentation-components/instance-filter-builder/PresentationInstanceFilterDialog";
import { createTestECClassInfo, render, stubDOMMatrix, stubRaf } from "../_helpers/Common";
import { createTestCategoryDescription, createTestContentDescriptor, createTestPropertiesContentField } from "../_helpers/Content";

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
      operator: PropertyFilterRuleOperator.IsNull,
      value: undefined,
    },
    usedClasses: [classInfo],
  };

  const imodelMock = moq.Mock.ofType<IModelConnection>();
  const onCloseEvent = new BeEvent<() => void>();

  before(() => {
    HTMLElement.prototype.scrollIntoView = () => {};
  });

  after(() => {
    delete (HTMLElement.prototype as any).scrollIntoView;
  });

  beforeEach(async () => {
    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "initialized").get(() => true);
    sinon.stub(IModelApp, "localization").get(() => localization);

    sinon.stub(Presentation, "localization").get(() => localization);
    sinon.stub(UiComponents, "translate").callsFake((key) => key as string);

    imodelMock.setup((x) => x.key).returns(() => "test_imodel");
    imodelMock.setup((x) => x.onClose).returns(() => onCloseEvent);
    const metadataProvider = getIModelMetadataProvider(imodelMock.object);
    sinon.stub(metadataProvider, "getECClassInfo").callsFake(async () => {
      return new ECClassInfo(classInfo.id, classInfo.name, classInfo.label, new Set(), new Set());
    });
  });

  afterEach(() => {
    onCloseEvent.raiseEvent();
    imodelMock.reset();
    sinon.restore();
  });

  it("invokes 'onApply' with string property filter rule", async () => {
    const spy = sinon.spy();
    const { container, getByText, queryByDisplayValue, user } = render(
      <PresentationInstanceFilterDialog imodel={imodelMock.object} descriptor={descriptor} onClose={() => {}} onApply={spy} isOpen={true} />,
    );

    // open property selector
    const propertySelector = await getRulePropertySelector(container);
    await user.click(propertySelector);
    // select property
    await user.click(getByText(stringField.label));

    // enter value
    const inputContainer = await waitForElement<HTMLInputElement>(container, ".rule-value input");
    await user.type(inputContainer, "test value");
    await waitFor(() => expect(queryByDisplayValue("test value")).to.not.be.null);

    await user.tab();

    const applyButton = await getApplyButton(container);
    await user.click(applyButton);

    expect(spy).to.be.calledOnceWith({
      filter: {
        field: stringField,
        operator: PropertyFilterRuleOperator.Like,
        value: {
          valueFormat: AbstractPropertyValueFormat.Primitive,
          value: "test value",
          displayValue: "test value",
        } as PrimitiveValue,
      },
      usedClasses: [classInfo],
    });
  });

  it("does not invoke `onApply` when filter is invalid", async () => {
    const spy = sinon.spy();
    const { container, getByText, user } = render(
      <PresentationInstanceFilterDialog imodel={imodelMock.object} descriptor={descriptor} onClose={() => {}} onApply={spy} isOpen={true} />,
    );

    // open property selector
    const propertySelector = await getRulePropertySelector(container);
    await user.click(propertySelector);
    // select property
    await user.click(getByText(stringField.label));

    const applyButton = await getApplyButton(container);
    await user.click(applyButton);

    expect(spy).to.not.be.called;
  });

  it("throws error when filter is missing presentation metadata", async () => {
    sinon.stub(PresentationInstanceFilter, "fromComponentsPropertyFilter").throws(new Error("Some Error"));
    const spy = sinon.spy();
    const { container, getByText, queryByText, user } = render(
      <PresentationInstanceFilterDialog imodel={imodelMock.object} descriptor={descriptor} onClose={() => {}} onApply={spy} isOpen={true} />,
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
    await user.click(getByText(getPropertyFilterOperatorLabel(PropertyFilterRuleOperator.IsNotNull)));

    // wait until operator is selected
    const applyButton = await getApplyButton(container);
    await user.click(applyButton);

    await waitFor(() => expect(queryByText("general.error")).to.not.be.null);
  });

  it("renders custom title", () => {
    const spy = sinon.spy();
    const title = "custom title";

    const { queryByText } = render(
      <PresentationInstanceFilterDialog
        imodel={imodelMock.object}
        descriptor={descriptor}
        onClose={() => {}}
        title={<div>{title}</div>}
        onApply={spy}
        isOpen={true}
        initialFilter={initialFilter}
      />,
    );

    expect(queryByText(title)).to.not.be.null;
  });

  it("renders results count", async () => {
    const { queryByText } = render(
      <PresentationInstanceFilterDialog
        imodel={imodelMock.object}
        descriptor={descriptor}
        onClose={() => {}}
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

    const { queryByText } = render(
      <PresentationInstanceFilterDialog imodel={imodelMock.object} descriptor={descriptorGetter} onClose={() => {}} onApply={() => {}} isOpen={true} />,
    );

    await waitFor(() => expect(queryByText("general.error")).to.not.be.null);
  });

  it("renders with lazy-loaded descriptor", async () => {
    const spy = sinon.spy();
    const descriptorGetter = async () => descriptor;

    const { container } = render(
      <PresentationInstanceFilterDialog imodel={imodelMock.object} descriptor={descriptorGetter} onClose={() => {}} onApply={spy} isOpen={true} />,
    );

    await getRulePropertySelector(container);
  });

  it("renders spinner while loading descriptor", async () => {
    const spy = sinon.spy();
    // simulate long loading descriptor
    const descriptorGetter = async () => undefined as unknown as Descriptor;

    const { container } = render(
      <PresentationInstanceFilterDialog imodel={imodelMock.object} descriptor={descriptorGetter} onClose={() => {}} onApply={spy} isOpen={true} />,
    );

    await waitFor(() => {
      const progressIndicator = container.querySelector<HTMLInputElement>(".presentation-instance-filter-dialog-progress");
      expect(progressIndicator).to.not.be.null;
    });
  });

  async function waitForElement<T extends HTMLElement>(container: HTMLElement, selector: string, condition?: (e: T | null) => void): Promise<T> {
    return waitFor(() => {
      const element = container.querySelector<T>(selector);
      if (condition) {
        condition(element);
      } else {
        expect(element, `Failed to find element. Selector: "${selector}"`).to.not.be.null;
      }
      return element as T;
    });
  }

  async function getRulePropertySelector(container: HTMLElement) {
    return waitForElement<HTMLInputElement>(container, ".rule-property input");
  }

  async function getRuleOperatorSelector(container: HTMLElement) {
    return waitForElement<HTMLDivElement>(container, `.rule-operator [role="combobox"]`);
  }

  async function getApplyButton(container: HTMLElement, enabled: boolean = false) {
    return waitForElement<HTMLButtonElement>(container, ".presentation-instance-filter-dialog-apply-button", (e) => {
      expect(e).to.not.be.null;
      expect(e?.disabled ?? false).to.be.eq(enabled);
    });
  }
});
