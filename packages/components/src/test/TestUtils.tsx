/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { createElement, Fragment, PropsWithChildren, ReactElement, StrictMode } from "react";
import { ThemeProvider } from "@itwin/itwinui-react";
import {
  RenderHookOptions,
  RenderHookResult,
  renderHook as renderHookRTL,
  RenderOptions,
  RenderResult,
  render as renderRTL,
  waitFor,
} from "@testing-library/react";
import userEvent, { UserEvent } from "@testing-library/user-event";

function createWrapper(Outer: React.JSXElementConstructor<{ children: React.ReactNode }>) {
  return (Inner?: React.JSXElementConstructor<{ children: React.ReactNode }>) => {
    return Inner ? ({ children }: PropsWithChildren<unknown>) => createElement(Outer, undefined, createElement(Inner, undefined, children)) : Outer;
  };
}

function combineWrappers(wraps: Array<ReturnType<typeof createWrapper>>, wrapper?: React.JSXElementConstructor<{ children: React.ReactNode }>) {
  let currWrapper = wrapper;
  for (const wrap of wraps) {
    currWrapper = wrap(currWrapper);
  }
  return currWrapper;
}

function createDefaultWrappers(disableStrictMode?: boolean, addThemeProvider?: boolean) {
  const wrappers: Array<ReturnType<typeof createWrapper>> = [];
  if (addThemeProvider) {
    wrappers.push(createWrapper(ThemeProvider));
  }

  // if `DISABLE_STRICT_MODE` is set do not wrap components into `StrictMode` component
  const StrictModeWrapper = process.env.DISABLE_STRICT_MODE || disableStrictMode ? Fragment : StrictMode;
  wrappers.push(createWrapper(StrictModeWrapper));

  return wrappers;
}

/**
 * Custom render function that wraps around `render` function from `@testing-library/react` and additionally
 * setup `userEvent` from `@testing-library/user-event`.
 *
 * It should be used when test need to do interactions with rendered components.
 */
function customRender(
  ui: ReactElement,
  options?: RenderOptions & { disableStrictMode?: boolean; addThemeProvider?: boolean },
): RenderResult & { user: UserEvent } {
  const wrappers = createDefaultWrappers(options?.disableStrictMode, options?.addThemeProvider);
  const wrapper = combineWrappers(wrappers, options?.wrapper);

  return {
    ...renderRTL(ui, { ...options, wrapper }),
    user: userEvent.setup(),
  };
}

export async function waitForElement<T extends HTMLElement>(container: HTMLElement, selector: string, condition?: (e: T | null) => void): Promise<T> {
  return waitFor(() => {
    const element = container.querySelector<T>(selector);
    if (condition) {
      condition(element);
    } else {
      expect(element, `Failed to find element. Selector: "${selector}"`).to.not.be.null;
    }
    return element as T;
  });
}

function customRenderHook<Result, Props>(
  render: (initialProps: Props) => Result,
  options?: RenderHookOptions<Props> & { disableStrictMode?: boolean },
): RenderHookResult<Result, Props> {
  const defaultWrappers = createDefaultWrappers(options?.disableStrictMode);
  const combinedWrappers = combineWrappers(defaultWrappers, options?.wrapper);
  return renderHookRTL(render, { ...options, wrapper: combinedWrappers });
}

export * from "@testing-library/react";
export { customRender as render };
export { customRenderHook as renderHook };
