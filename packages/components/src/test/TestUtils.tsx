/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createElement, Fragment, PropsWithChildren, ReactElement, StrictMode } from "react";
import { RenderHookOptions, RenderHookResult, renderHook as renderHookRTL, RenderOptions, RenderResult, render as renderRTL } from "@testing-library/react";
import userEvent, { UserEvent } from "@testing-library/user-event";

// if `DISABLE_STRICT_MODE` is set do not wrap components into `StrictMode` component
const StrictModeWrapper = process.env.DISABLE_STRICT_MODE ? Fragment : StrictMode;

/**
 * Custom render function that wraps around `render` function from `@testing-library/react` and additionally
 * setup `userEvent` from `@testing-library/user-event`.
 *
 * It should be used when test need to do interactions with rendered components.
 */
function customRender(ui: ReactElement, options?: RenderOptions): RenderResult & { user: UserEvent } {
  const user = userEvent.setup();

  const CustomWrapper = options?.wrapper;
  const wrapper = CustomWrapper
    ? ({ children }: PropsWithChildren<unknown>) => <StrictModeWrapper>{createElement(CustomWrapper, undefined, children)}</StrictModeWrapper>
    : StrictModeWrapper;

  return {
    ...renderRTL(ui, { ...options, wrapper }),
    user,
  };
}

function customRenderHook<Result, Props>(render: (initialProps: Props) => Result, options?: RenderHookOptions<Props>): RenderHookResult<Result, Props> {
  const CustomWrapper = options?.wrapper;
  const wrapper = CustomWrapper
    ? ({ children }: PropsWithChildren<unknown>) => <StrictModeWrapper>{createElement(CustomWrapper, undefined, children)}</StrictModeWrapper>
    : StrictModeWrapper;

  return renderHookRTL(render, { ...options, wrapper });
}

export * from "@testing-library/react";
export { customRender as render };
export { customRenderHook as renderHook };
