/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ComponentPropsWithoutRef, JSX, HTMLAttributes, ReactElement, ReactNode, Ref } from "react";

/**
 * Props of a native element, extended with a `render` prop that replaces the rendered element. The new element
 * receives the component's props and ref.
 * @alpha
 */
export type ElementPropsWithRender<TElement extends keyof JSX.IntrinsicElements> = {
  /** Element to render instead of the default one, or a function that renders it from the given props. */
  render?: ReactElement | ((props: HTMLAttributes<any> & { ref?: Ref<any> }) => ReactNode);
} & Omit<ComponentPropsWithoutRef<TElement>, "render">;
