/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EmptyLocalization } from "@itwin/core-common";
import { IModelApp } from "@itwin/core-frontend";
import { Presentation } from "@itwin/presentation-frontend";
import { PresentationInstanceFilterProperty } from "../../presentation-components/instance-filter-builder/PresentationInstanceFilterProperty.js";
import { createTestPresentationInstanceFilterPropertyInfo } from "../_helpers/Common.js";
import { render, waitFor } from "../TestUtils.js";

describe("PresentationInstanceFilterProperty", () => {
  const className = "TestClassName";
  const schemaName = "TestSchema";

  beforeEach(() => {
    const localization = new EmptyLocalization();
    vi.spyOn(IModelApp, "initialized", "get").mockReturnValue(true);
    vi.spyOn(IModelApp, "localization", "get").mockReturnValue(localization);
    vi.spyOn(Presentation, "localization", "get").mockReturnValue(localization);
  });

  afterAll(() => {
    vi.restoreAllMocks();
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

    expect(queryByTitle(testPropertyInfo.propertyDescription.displayLabel)).not.toBeNull();
    const propertyBadgeSelector = container.querySelector<HTMLInputElement>(".badge");
    expect(propertyBadgeSelector).not.toBeNull();

    await user.hover(propertyBadgeSelector!);
    await waitFor(() => {
      expect(queryByText(className)).not.toBeNull();
      expect(queryByText(schemaName)).not.toBeNull();
    });
  });

  it("renders without badge", () => {
    const testPropertyInfo = createTestPresentationInstanceFilterPropertyInfo({
      className: `${schemaName}:${className}`,
    });
    const { container, queryByTitle } = render(
      <PresentationInstanceFilterProperty propertyDescription={testPropertyInfo.propertyDescription} fullClassName={testPropertyInfo.className} />,
    );

    expect(queryByTitle(testPropertyInfo.propertyDescription.displayLabel)).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>(".badge")).toBeNull();
  });
});
