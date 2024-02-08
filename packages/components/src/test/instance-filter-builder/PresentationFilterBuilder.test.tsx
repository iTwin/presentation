/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import * as sinon from "sinon";
import { PropertyFilterRuleGroupOperator, PropertyFilterRuleOperator, UiComponents } from "@itwin/components-react";
import { BeEvent } from "@itwin/core-bentley";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Presentation } from "@itwin/presentation-frontend";
import { ECClassInfo, getIModelMetadataProvider } from "../../presentation-components/instance-filter-builder/ECMetadataProvider";
import {
  PresentationInstanceFilterBuilder,
  PresentationInstanceFilterInfo,
} from "../../presentation-components/instance-filter-builder/PresentationFilterBuilder";
import { createTestECClassInfo, stubDOMMatrix, stubRaf } from "../_helpers/Common";
import { createTestCategoryDescription, createTestContentDescriptor, createTestPropertiesContentField } from "../_helpers/Content";
import { render, waitFor, waitForElement } from "../TestUtils";

describe("PresentationInstanceFilter", () => {
  stubRaf();
  stubDOMMatrix();

  const category = createTestCategoryDescription({ name: "root", label: "Root" });
  const classInfo = createTestECClassInfo({ id: "0x123", name: "class1", label: "Class 1" });
  const classInfo2 = createTestECClassInfo({ id: "0x456", name: "class2", label: "Class 2" });
  const propertiesField = createTestPropertiesContentField({
    properties: [{ property: { classInfo, name: "prop1", type: "string" } }],
    name: "prop1Field",
    label: "propertiesField",
    category,
  });
  const propertiesField2 = createTestPropertiesContentField({
    properties: [{ property: { classInfo, name: "prop2", type: "string" } }],
    name: "prop2Field",
    label: "propertiesField2",
    category,
  });
  const propertiesField3 = createTestPropertiesContentField({
    properties: [{ property: { classInfo, name: "prop3", type: "string" } }],
    name: "prop3Field",
    label: "propertiesField3",
    category,
  });
  const descriptor = createTestContentDescriptor({
    selectClasses: [
      { selectClassInfo: classInfo, isSelectPolymorphic: false },
      { selectClassInfo: classInfo2, isSelectPolymorphic: false },
    ],
    categories: [category],
    fields: [propertiesField, propertiesField2, propertiesField3],
  });

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
    sinon.stub(UiComponents, "translate").callsFake((key) => key as string);
    sinon.stub(Presentation, "localization").get(() => localization);

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

  it("invokes 'onInstanceFilterChanged' with filter", async () => {
    const spy = sinon.spy();
    const { container, getByText, getByDisplayValue, user } = render(
      <PresentationInstanceFilterBuilder imodel={imodel} descriptor={descriptor} onInstanceFilterChanged={spy} />,
    );

    // open property selector
    const propertySelector = await getRulePropertySelector(container);
    await user.click(propertySelector);

    // select property
    await user.click(getByText(propertiesField.label));

    // wait until property is selected
    await waitFor(() => getByDisplayValue(propertiesField.label));

    // open operator selector
    const operatorSelector = await getRuleOperatorSelector(container);
    await user.click(operatorSelector);

    // select operator
    await user.click(getByText(/filterBuilder.operators.isNotNull/i));

    // wait until operator is selected
    await waitFor(() => getByText(/filterBuilder.operators.isNotNull/i));

    await waitFor(() =>
      expect(spy).to.be.calledWith({
        filter: {
          field: propertiesField,
          operator: PropertyFilterRuleOperator.IsNotNull,
          value: undefined,
        },
        usedClasses: [classInfo],
      }),
    );
  });

  it("renders with initial filter", async () => {
    const initialFilter: PresentationInstanceFilterInfo = {
      filter: {
        operator: PropertyFilterRuleGroupOperator.And,
        conditions: [
          {
            field: propertiesField,
            operator: PropertyFilterRuleOperator.IsNull,
            value: undefined,
          },
          {
            field: propertiesField2,
            operator: PropertyFilterRuleOperator.IsNull,
            value: undefined,
          },
        ],
      },
      usedClasses: [classInfo],
    };

    const spy = sinon.spy();
    const { queryByDisplayValue } = render(
      <PresentationInstanceFilterBuilder imodel={imodel} descriptor={descriptor} onInstanceFilterChanged={spy} initialFilter={initialFilter} />,
    );

    await waitFor(() => {
      expect(queryByDisplayValue(propertiesField.label)).to.not.be.null;
      expect(queryByDisplayValue(propertiesField2.label)).to.not.be.null;
    });
  });

  it("clears property filters upon class selector change", async () => {
    const initialFilter: PresentationInstanceFilterInfo = {
      filter: {
        operator: PropertyFilterRuleGroupOperator.And,
        conditions: [
          {
            field: propertiesField,
            operator: PropertyFilterRuleOperator.IsNull,
            value: undefined,
          },
        ],
      },
      usedClasses: [classInfo, classInfo2],
    };

    const spy = sinon.spy();
    const { container, queryByDisplayValue, user } = render(
      <PresentationInstanceFilterBuilder imodel={imodel} descriptor={descriptor} onInstanceFilterChanged={spy} initialFilter={initialFilter} />,
    );

    // ensure there's a property filter
    await waitFor(() => expect(queryByDisplayValue(propertiesField.label)).to.not.be.null);

    // expand class selector
    const expander = container.querySelector(".iui-actionable");
    await user.click(expander!);

    // deselect class item from dropdown
    const classItem = document.querySelector(`li[label="${classInfo2.label}"]`);
    await user.click(classItem!);

    // assert that filtering rule was cleared
    await waitFor(() => expect(queryByDisplayValue(propertiesField.label)).to.be.null);
  });
});

async function getRulePropertySelector(container: HTMLElement) {
  return waitForElement<HTMLInputElement>(container, ".fb-property-name input");
}

async function getRuleOperatorSelector(container: HTMLElement) {
  return waitForElement<HTMLDivElement>(container, `.fb-row-condition [role="combobox"]`);
}
