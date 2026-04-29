/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from "vitest";
import { StrataKitRootErrorRenderer } from "../../presentation-hierarchies-react/stratakit/RootErrorRenderer.js";
import { COLOR_SCHEMES, renderWithTheme } from "./RenderUtils.js";

import type { StrataKitRootErrorRendererProps } from "../../presentation-hierarchies-react/stratakit/RootErrorRenderer.js";

COLOR_SCHEMES.map((colorScheme) => {
  describe(`[${colorScheme}] <StrataKitRootErrorRenderer />`, () => {
    const defaultProps: StrataKitRootErrorRendererProps = {
      error: { id: "test-error", type: "Unknown", message: "Something went wrong" },
      reloadTree: vi.fn(),
      getHierarchyLevelDetails: vi.fn(),
    };

    it("renders generic error", async () => {
      const { locator } = await renderWithTheme(<StrataKitRootErrorRenderer {...defaultProps} />, { colorScheme });
      await expect(locator).toMatchScreenshot();
    });

    it("renders result set too large error", async () => {
      const props: StrataKitRootErrorRendererProps = {
        ...defaultProps,
        error: { id: "test-error", type: "ResultSetTooLarge", resultSetSizeLimit: 1000 },
      };
      const { locator } = await renderWithTheme(<StrataKitRootErrorRenderer {...props} />, { colorScheme });
      await expect(locator).toMatchScreenshot();
    });
  });
});
