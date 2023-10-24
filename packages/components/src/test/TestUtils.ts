/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ReactElement, StrictMode } from "react";
import { RenderOptions, RenderResult, render as renderRTL } from "@testing-library/react";
import userEvent, { UserEvent } from "@testing-library/user-event";

// if `DISABLE_STRICT_MODE` is set do not wrap components into `StrictMode` component
const wrapper = process.env.DISABLE_STRICT_MODE ? undefined : StrictMode;

/**
 * Custom render function that wraps around `render` function from `@testing-library/react` and additionally
 * setup `userEvent` from `@testing-library/user-event`.
 *
 * It should be used when test need to do interactions with rendered components.
 */
function customRender(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">): RenderResult & { user: UserEvent } {
  const user = userEvent.setup();
  return {
    ...renderRTL(ui, { ...options, wrapper }),
    user,
  };
}

export * from "@testing-library/react";
export { customRender as render };
