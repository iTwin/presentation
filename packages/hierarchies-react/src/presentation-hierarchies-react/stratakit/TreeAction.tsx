/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { memo } from "react";
import { DropdownMenu, Tree } from "@stratakit/structures";

import type { ComponentProps } from "react";

/**
 * Attributes used to decide how to render tree actions. They allow to differentiate action style based on the context
 * where that action is used.
 * @alpha
 */
export interface TreeActionBaseAttributes {
  /**
   * Specifies action variant supported by tree nodes:
   *
   * - "default" - standard action displayed in the dropdown menu accessible through the ellipsis button on the node.
   * - "inline" - actions displayed directly on the tree node.
   * - "context-menu" - actions displayed in the context menu opened by right-clicking the tree node.
   */
  variant?: "default" | "inline" | "context-menu";
  /**
   * Indicates that the actions is not applicable for current tree node and should be hidden.
   * When set to true, the action will not be rendered at all.
   */
  hide?: boolean;
}

/** @alpha */
export type TreeActionBaseProps = ComponentProps<typeof Tree.ItemAction> & TreeActionBaseAttributes;

/**
 * Base component used to render tree actions. It is designed to allow rendering same action in different contexts: inline, dropdown, context menu.
 * Should be used together with `StrataKitTreeNodeRenderer` and returned from `getInlineActions`, `getMenuActions` and `getContextMenuActions` callbacks.
 *
 * When implementing custom action that returns this component, make sure to forward `TreeActionBaseAttributes` props to it. Example:
 *
 * ```tsx
 * interface MyCustomTreeActionProps extends TreeActionBaseAttributes {
 *   myProp: string
 * }
 *
 * function MyCustomTreeAction({ myProp, ...attributes }: MyCustomTreeActionProps) {
 *   // custom button logic goes here
 *   return <TreeActionBase {...attributes} icon={...} onClick={...} />
 * }
 * ```
 *
 * @alpha
 */
export const TreeActionBase = memo(function TreeActionBase({ hide, variant = "default", dot, visible, ...actionProps }: TreeActionBaseProps) {
  if (hide) {
    return variant === "inline" ? <Tree.ItemAction {...actionProps} visible={false} /> : undefined;
  }

  if (variant === "context-menu") {
    return <DropdownMenu.Item {...actionProps} />;
  }

  return <Tree.ItemAction {...actionProps} dot={dot} visible={variant === "inline" ? visible : undefined} />;
});
