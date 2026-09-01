/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { cloneElement, forwardRef, isValidElement, memo, useCallback, useMemo, useState } from "react";
import { CircularProgress, Menu } from "@mui/material";
import { unstable_Popover as Popover, Tree } from "@stratakit/structures";
import { useTranslation } from "../LocalizationContext.js";
import { LabelEditor } from "./LabelEditor.js";
import { TreeActionBase } from "./TreeAction.js";
import { useTreeNodeRenameContext } from "./TreeNodeRenameAction.js";

import refreshSvg from "@stratakit/icons/refresh.svg";

import type { ComponentPropsWithoutRef, FC, PropsWithRef, ReactNode, RefAttributes } from "react";
import type { TreeRendererProps } from "../Renderers.js";
import type { TreeNode } from "../TreeNode.js";
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
export type StrataKitTreeItemProps = Omit<
  ComponentPropsWithoutRef<typeof Tree.Item>,
  "actions" | "inlineActions" | "expanded" | "onExpandedChange" | "icon" | "unstable_decorations" | "error"
> & {
  /**
   * Used to render elements between expander and label.
   * E.g. icons, color picker, etc.
   */
  decorations?: ReactNode;
};

/** @internal */
export type TreeNodeRendererProps = StrataKitTreeItemProps & TreeNodeRendererOwnProps;

/**
 * A component that renders a given `TreeNode` using the `Tree.Item` component from `@stratakit/structures`.
 *
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated
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
    const renameContext = useTreeNodeRenameContext();
    const [contextMenuProps, setContextMenuProps] = useState<
      { position: { x: number; y: number }; actions: ReactNode[] } | undefined
    >(undefined);

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
      if (node.errors.some((e) => e.type !== "Unknown" || !e.isNodeExpandable)) {
        return undefined;
      }

      // this is a leaf node
      if (node.children !== true && node.children.length === 0) {
        return undefined;
      }

      return node.isExpanded;
    }, [node]);

    const { renameParameters, cancelRename } = renameContext ?? {};
    const labelEditor = (
      <LabelEditor
        initialLabel={node.label}
        onChange={renameParameters?.commit}
        onCancel={cancelRename}
        labelValidationHint={renameParameters?.labelValidationHint}
        validate={renameParameters?.validate}
      />
    );

    return (
      <>
        <Popover
          content={labelEditor}
          placement="bottom"
          open={renameParameters?.nodeId === node.id}
          setOpen={cancelRename}
          unmountOnHide
        >
          <Tree.Item
            {...treeItemProps}
            ref={forwardedRef}
            label={label}
            expanded={expanded}
            onExpandedChange={useCallback(
              (isExpanded: boolean) => {
                expandNode(node.id, isExpanded);
              },
              [node, expandNode],
            )}
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

              setContextMenuProps({ position: { x: e.clientX, y: e.clientY }, actions });
            }}
          />
        </Popover>
        <Menu
          open={!!contextMenuProps}
          onClose={() => setContextMenuProps(undefined)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenuProps(undefined);
          }}
          anchorReference="anchorPosition"
          anchorPosition={
            contextMenuProps ? { top: contextMenuProps.position.y, left: contextMenuProps.position.x } : undefined
          }
          aria-label={translate("more")}
          onClick={() => setContextMenuProps(undefined)}
        >
          {contextMenuProps?.actions}
        </Menu>
      </>
    );
  }),
);

export const PlaceholderNode: FC<
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  PropsWithRef<
    Pick<StrataKitTreeItemProps, "style" | "aria-level" | "aria-posinset" | "aria-setsize"> & RefAttributes<HTMLElement>
  >
> = memo(
  forwardRef<HTMLElement, Pick<StrataKitTreeItemProps, "style" | "aria-level" | "aria-posinset" | "aria-setsize">>(
    // eslint-disable-next-line @typescript-eslint/no-shadow
    function PlaceholderNode({ ...props }, forwardedRef) {
      const translate = useTranslation();
      return (
        <Tree.Item
          {...props}
          ref={forwardedRef}
          label={translate("loading")}
          unstable_decorations={<CircularProgress size={16} title={translate("loading")} />}
        />
      );
    },
  ),
);

function injectActionVariant(actions: ReactNode[], variant: TreeActionBaseAttributes["variant"]) {
  return actions
    .filter((action) => isValidElement<TreeActionBaseAttributes>(action))
    .map((action) => cloneElement<TreeActionBaseAttributes>(action, { variant }));
}
