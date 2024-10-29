/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createElement, PropsWithChildren, ReactElement } from "react";
import { ThemeProvider } from "@itwin/itwinui-react";
import { RenderOptions, RenderResult, render as renderRTL } from "@testing-library/react";
import { userEvent, UserEvent } from "@testing-library/user-event";

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

function createDefaultWrappers(addThemeProvider?: boolean) {
  const wrappers: Array<ReturnType<typeof createWrapper>> = [];
  if (addThemeProvider) {
    wrappers.push(createWrapper(ThemeProvider));
  }
  return wrappers;
}

/**
 * Custom render function that wraps around `render` function from `@testing-library/react` and additionally
 * setup `userEvent` from `@testing-library/user-event`.
 *
 * It should be used when test need to do interactions with rendered components.
 */
function customRender(ui: ReactElement, options?: RenderOptions & { addThemeProvider?: boolean }): RenderResult & { user: UserEvent } {
  const wrappers = createDefaultWrappers(options?.addThemeProvider);
  const wrapper = combineWrappers(wrappers, options?.wrapper);
  return {
    ...renderRTL(ui, { ...options, wrapper }),
    user: userEvent.setup(),
  };
}

export * from "@testing-library/react";
export { customRender as render };
