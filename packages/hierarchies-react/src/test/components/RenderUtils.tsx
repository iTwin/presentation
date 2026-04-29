/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { render } from "vitest-browser-react";
import { Root } from "@stratakit/foundations";

import type { ReactNode } from "react";

interface RenderWithThemeOptions {
  colorScheme?: "light" | "dark";
}

export const COLOR_SCHEMES = ["light", "dark"] as const;

export async function renderWithTheme(element: ReactNode, options?: RenderWithThemeOptions) {
  const { colorScheme = "light" } = options ?? {};
  return render(<Root colorScheme={colorScheme}>{element}</Root>);
}
