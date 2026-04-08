/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createElement } from "react";
import { expect, vi } from "vitest";
import { ThemeProvider } from "@itwin/itwinui-react";
import { render as renderRTL, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import type { PropsWithChildren, ReactElement } from "react";
import type { Mocked } from "vitest";
import type { RenderOptions, RenderResult } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

function createWrapper(Outer: React.JSXElementConstructor<{ children: React.ReactNode }>) {
  return (Inner?: React.JSXElementConstructor<{ children: React.ReactNode }>) => {
    return Inner
      ? ({ children }: PropsWithChildren<unknown>) =>
          createElement(Outer, undefined, createElement(Inner, undefined, children))
      : Outer;
  };
}

function combineWrappers(
  wraps: Array<ReturnType<typeof createWrapper>>,
  wrapper?: React.JSXElementConstructor<{ children: React.ReactNode }>,
) {
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
function customRender(
  ui: ReactElement,
  options?: RenderOptions & { addThemeProvider?: boolean },
): RenderResult & { user: UserEvent } {
  const wrappers = createDefaultWrappers(options?.addThemeProvider);
  const wrapper = combineWrappers(wrappers, options?.wrapper);
  return { ...renderRTL(ui, { ...options, wrapper }), user: userEvent.setup() };
}

export async function waitForElement<T extends HTMLElement>(
  container: HTMLElement,
  selector: string,
  condition?: (e: T | null) => void,
): Promise<T> {
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

export * from "@testing-library/react";
export { customRender as render };

export function createStub<T extends (...args: any[]) => any>() {
  return vi.fn<T>();
}

/**
 * Creates a vitest-mocked instance of `target` where every method in
 * the prototype chain is replaced with a `vi.fn()`.
 * Equivalent to sinon.createStubInstance().
 */
export function createMocked<T extends object>(target: { prototype: T }): Mocked<T> {
  const instance = {} as Mocked<T>;
  let proto: object | null = target.prototype as object;
  while (proto && proto !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === "constructor") {
        continue;
      }
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc && typeof desc.value === "function" && !(key in instance)) {
        (instance as Record<string, unknown>)[key] = vi.fn();
      }
    }
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  return instance;
}
