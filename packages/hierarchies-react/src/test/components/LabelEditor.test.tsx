/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { LabelEditor } from "../../presentation-hierarchies-react/stratakit/LabelEditor.js";
import { COLOR_SCHEMES, renderWithTheme, validateSnapshot } from "./RenderUtils.js";

COLOR_SCHEMES.forEach((colorScheme) => {
  describe(`[${colorScheme}] <LabelEditor />`, () => {
    beforeEach(async () => {
      await page.viewport(400, 100);
    });

    it("renders label editor", async () => {
      const { locator } = await renderWithTheme(
        <LabelEditor initialLabel="Node label" labelValidationHint={`Allowed are A to Z, 0 to 9, "-" and "_"`} />,
        { colorScheme },
      );
      await expect.element(locator.getByRole("textbox", { name: "New label" })).toBeVisible();
      await validateSnapshot(locator);
    });
  });
});
