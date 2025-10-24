/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp } from "@itwin/core-frontend";
import { Presentation } from "@itwin/presentation-frontend";
import { createTestPresentationInstanceFilterPropertyInfo, stubRaf } from "../_helpers/Common.js";
import { PresentationInstanceFilterProperty } from "../../presentation-components/instance-filter-builder/PresentationInstanceFilterProperty.js";
import { render, waitFor } from "../TestUtils.js";

describe("PresentationInstanceFilterProperty", () => {
  stubRaf();
  const className = "TestClassName";
  const schemaName = "TestSchema";

  before(() => {
    const localization = new EmptyLocalization();
    sinon.stub(IModelApp, "initialized").get(() => true);
    sinon.stub(IModelApp, "localization").get(() => localization);
    sinon.stub(Presentation, "localization").get(() => localization);
    Element.prototype.scrollIntoView = sinon.stub();
  });

  after(() => {
    sinon.restore();
  });

  it("renders with badge", async () => {
    const testPropertyInfo = createTestPresentationInstanceFilterPropertyInfo({
      className: `${schemaName}:${className}`,
      categoryLabel: "TestCategoryLabel",
    });
    const { user, container, queryByText, queryByTitle } = render(
      <PresentationInstanceFilterProperty
        propertyDescription={testPropertyInfo.propertyDescription}
        fullClassName={testPropertyInfo.className}
        categoryLabel={testPropertyInfo.categoryLabel}
      />,
    );

    expect(queryByTitle(testPropertyInfo.propertyDescription.displayLabel)).to.not.be.null;
    const propertyBadgeSelector = container.querySelector<HTMLInputElement>(".badge");
    expect(propertyBadgeSelector).to.not.be.null;

    await user.hover(propertyBadgeSelector!);
    await waitFor(() => {
      expect(queryByText(className)).to.not.be.null;
      expect(queryByText(schemaName)).to.not.be.null;
    });
  });

  it("renders without badge", () => {
    const testPropertyInfo = createTestPresentationInstanceFilterPropertyInfo({
      className: `${schemaName}:${className}`,
    });
    const { container, queryByTitle } = render(
      <PresentationInstanceFilterProperty propertyDescription={testPropertyInfo.propertyDescription} fullClassName={testPropertyInfo.className} />,
    );

    expect(queryByTitle(testPropertyInfo.propertyDescription.displayLabel)).to.not.be.null;
    expect(container.querySelector<HTMLInputElement>(".badge")).to.be.null;
  });
});
