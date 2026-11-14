/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { cloneElement, forwardRef, isValidElement, memo, useCallback, useMemo } from "react";
import { CircularProgress } from "@mui/material";
import { Tree } from "@stratakit/structures";
import { useTranslation } from "../LocalizationContext.js";
import { TreeActionBase } from "./TreeAction.js";
import { useTreeContextMenu } from "./TreeContextMenu.js";

import refreshSvg from "@stratakit/icons/refresh.svg";

import type { FC, PropsWithRef, ReactNode, RefAttributes } from "react";
import type { TreeRendererProps } from "../Renderers.js";
import type { TreeNode } from "../TreeNode.js";
import type { ElementPropsWithRender } from "./ElementPropsWithRender.js";
import type { TreeActionBaseAttributes } from "./TreeAction.js";

/** @internal */
interface TreeNodeRendererOwnProps extends Pick<TreeRendererProps, "expandNode" | "reloadTree"> {
  /** Node that is rendered. */
  node: TreeNode;
  /**
   * Menu actions for tree item.
   * Must be an array of `<TreeActionBase />` or `<Divider />` elements.
   */
  menuActions?: ReactNode[];
  /**
   * Inline actions for tree item.
   * Must be an array of `<TreeActionBase />` elements.
   * Max 2 items.
   */
  inlineActions?: ReactNode[];
  /**
   * Context menu actions for tree item.
   * Must be an array of `<TreeActionBase />` or `<Divider />` elements.
   */
  contextMenuActions?: ReactNode[];
}

/** @alpha */
export type StrataKitTreeItemProps = Omit<ElementPropsWithRender<"div">, "content" | "children"> & {
  selected?: boolean;
  /** Invoked when the tree item's selection changes. */
  onSelectedChange?: (selected: boolean) => void;
  /** Primary label displayed for the tree item. */
  label?: ReactNode;
  /** Secondary text displayed with the tree item. */
  description?: ReactNode;
  /**
   * Used to render elements between expander and label.
   * E.g. icons, color picker, etc.
   */
  decorations?: ReactNode;
};

/** Tree item position props that are optional on a `div`, but required by the StrataKit tree item. */
type TreeItemPositionProps = Required<Pick<StrataKitTreeItemProps, "aria-level" | "aria-posinset" | "aria-setsize">>;

/** @internal */
export type TreeNodeRendererProps = StrataKitTreeItemProps & TreeItemPositionProps & TreeNodeRendererOwnProps;

/**
 * A component that renders a given `TreeNode` using StrataKit's tree item component.
 *
 * @internal
 */
// oxlint-disable-next-line @typescript-eslint/no-deprecated
export const StrataKitTreeNodeRenderer: FC<PropsWithRef<TreeNodeRendererProps & RefAttributes<HTMLElement>>> = memo(
  forwardRef<HTMLElement, TreeNodeRendererProps>(function HierarchyNode(props, forwardedRef) {
    const {
      node,
      decorations,
      inlineActions,
      menuActions,
      contextMenuActions,
      expandNode,
      reloadTree,
      ...treeItemProps
    } = props;
    const translate = useTranslation();
    const contextMenu = useTreeContextMenu();

    const label = treeItemProps.label ?? node.label;
    const inlineActionItems = useMemo(() => {
      if (node.errors.some((e) => e.type === "ChildrenLoad")) {
        return [
          <TreeActionBase
            key="retry"
            label={translate("retry")}
            onClick={() => reloadTree({ parentNodeId: node.id, state: "reset" })}
            visible={true}
            icon={refreshSvg}
            variant="inline"
          />,
        ];
      }
      if (!inlineActions) {
        return undefined;
      }
      return injectActionVariant(inlineActions, "inline");
    }, [node, inlineActions, translate, reloadTree]);

    const menuActionItems = useMemo(() => {
      if (!menuActions) {
        return undefined;
      }
      return injectActionVariant(menuActions, "default");
    }, [menuActions]);

    const expanded = useMemo(() => {
      if (node.errors.some((e) => e.type !== "Generic" || !e.isNodeExpandable)) {
        return undefined;
      }

      // this is a leaf node
      if (node.children !== true && node.children.length === 0) {
        return undefined;
      }

      return node.isExpanded;
    }, [node]);

    const onExpandedChange = useCallback(
      (isExpanded: boolean) => {
        expandNode(node.id, isExpanded);
      },
      [node, expandNode],
    );

    return (
      <Tree.Item
        {...treeItemProps}
        ref={forwardedRef}
        label={label}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        inlineActions={inlineActionItems}
        actions={menuActionItems}
        unstable_decorations={decorations}
        error={node.errors.length > 0 ? node.errors[0].id : undefined}
        onContextMenu={(e) => {
          if (treeItemProps.onContextMenu) {
            treeItemProps.onContextMenu(e);
          }

          if (!contextMenuActions) {
            return;
          }

          e.preventDefault();
          const actions = injectActionVariant(contextMenuActions, "context-menu");
          if (actions.length === 0) {
            return;
          }

          contextMenu.openContextMenu({ position: { x: e.clientX, y: e.clientY }, actions });
        }}
      />
    );
  }),
);

export const PlaceholderNode: FC<
  // oxlint-disable-next-line @typescript-eslint/no-deprecated
  PropsWithRef<Pick<StrataKitTreeItemProps, "style"> & TreeItemPositionProps & RefAttributes<HTMLElement>>
> = memo(
  forwardRef<HTMLElement, Pick<StrataKitTreeItemProps, "style"> & TreeItemPositionProps>(function PlaceholderNode(
    { ...props },
    forwardedRef,
  ) {
    const translate = useTranslation();
    return (
      <Tree.Item
        {...props}
        ref={forwardedRef}
        label={translate("loading")}
        unstable_decorations={<CircularProgress size={16} title={translate("loading")} />}
      />
    );
  }),
);

function injectActionVariant(actions: ReactNode[], variant: TreeActionBaseAttributes["variant"]) {
  return actions
    .filter((action) => isValidElement<TreeActionBaseAttributes>(action))
    .map((action) => cloneElement<TreeActionBaseAttributes>(action, { variant }));
}
