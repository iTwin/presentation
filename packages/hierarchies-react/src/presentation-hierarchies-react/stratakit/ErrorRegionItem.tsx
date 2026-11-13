/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { unstable_ErrorRegion as ErrorRegion } from "@stratakit/structures";

import type { ComponentPropsWithoutRef, JSX, ReactNode } from "react";

/**
 * Props for an item rendered inside `TreeErrorRenderer`.
 *
 * @alpha
 */
export interface StrataKitErrorRegionItemProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  /** The error message to display. */
  message?: ReactNode;
  /** Associates the message with the corresponding tree item. */
  messageId?: string;
  /** Actions available for this error. */
  actions?: ReactNode;
}

/**
 * Renders a custom error item inside `TreeErrorRenderer`.
 *
 * @alpha
 */
export function StrataKitErrorRegionItem(props: StrataKitErrorRegionItemProps): JSX.Element {
  return <ErrorRegion.Item {...props} />;
}
