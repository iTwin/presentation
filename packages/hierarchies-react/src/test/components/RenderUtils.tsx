/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import axe from "axe-core";
import { expect } from "vitest";
import { render } from "vitest-browser-react";
import { Root } from "@stratakit/foundations";

import type { ReactNode } from "react";
import type { Locator } from "vitest/browser";

interface RenderWithThemeOptions {
  colorScheme?: "light" | "dark";
}

export const COLOR_SCHEMES = ["light", "dark"] as const;

export async function renderWithTheme(element: ReactNode, options?: RenderWithThemeOptions) {
  const { colorScheme = "light" } = options ?? {};
  return render(<Root colorScheme={colorScheme}>{element}</Root>);
}

export async function validateSnapshot(
  /** Component to validate */
  component: Locator,
  /** Validation options */
  options?: {
    /** Skip visual validation */
    skipVisual?: boolean;
    /** Skip accessibility validation or specify specific rules to skip (preferred). */
    skipA11y?: boolean | string[];
  },
) {
  // step 1: validate the visual image
  if (!options?.skipVisual) {
    await expect(component).toMatchScreenshot();
  }

  // step 2: validate accessibility
  if (options?.skipA11y !== true) {
    const element = component.element();
    const rulesConfig: Record<string, { enabled: boolean }> = {};
    if (Array.isArray(options?.skipA11y)) {
      for (const ruleId of options.skipA11y) {
        rulesConfig[ruleId] = { enabled: false };
      }
    }
    const results = await axe.run(element, { rules: rulesConfig });
    const violations = results.violations.map((v) => ({
      rule: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.map((n) => n.html),
    }));
    expect(violations, `Accessibility violations found:\n${JSON.stringify(violations, undefined, 2)}`).toEqual([]);
  }
}
