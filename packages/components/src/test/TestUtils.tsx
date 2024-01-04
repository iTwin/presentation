/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createElement, Fragment, PropsWithChildren, ReactElement, StrictMode } from "react";
import { RenderHookOptions, RenderHookResult, renderHook as renderHookRTL, RenderOptions, RenderResult, render as renderRTL } from "@testing-library/react";
import userEvent, { UserEvent } from "@testing-library/user-event";

function createWrapper(wrapper?: React.JSXElementConstructor<{ children: React.ReactElement }>, disableStrictMode?: boolean) {
  // if `DISABLE_STRICT_MODE` is set do not wrap components into `StrictMode` component
  const StrictModeWrapper = process.env.DISABLE_STRICT_MODE || disableStrictMode ? Fragment : StrictMode;

  return wrapper
    ? ({ children }: PropsWithChildren<unknown>) => <StrictModeWrapper>{createElement(wrapper, undefined, children)}</StrictModeWrapper>
    : StrictModeWrapper;
}

/**
 * Custom render function that wraps around `render` function from `@testing-library/react` and additionally
 * setup `userEvent` from `@testing-library/user-event`.
 *
 * It should be used when test need to do interactions with rendered components.
 */
function customRender(ui: ReactElement, options?: RenderOptions & { disableStrictMode?: boolean }): RenderResult & { user: UserEvent } {
  const wrapper = createWrapper(options?.wrapper, options?.disableStrictMode);
  return {
    ...renderRTL(ui, { ...options, wrapper }),
    user: userEvent.setup(),
  };
}

function customRenderHook<Result, Props>(
  render: (initialProps: Props) => Result,
  options?: RenderHookOptions<Props> & { disableStrictMode?: boolean },
): RenderHookResult<Result, Props> {
  const wrapper = createWrapper(options?.wrapper, options?.disableStrictMode);
  return renderHookRTL(render, { ...options, wrapper });
}

export * from "@testing-library/react";
export { customRender as render };
export { customRenderHook as renderHook };
