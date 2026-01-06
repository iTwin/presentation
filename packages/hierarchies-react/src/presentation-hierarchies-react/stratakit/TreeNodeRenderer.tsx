/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  cloneElement,
  ComponentPropsWithoutRef,
  FC,
  forwardRef,
  isValidElement,
  memo,
  PropsWithRef,
  ReactNode,
  RefAttributes,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Spinner, TextBox } from "@stratakit/bricks";
import refreshSvg from "@stratakit/icons/refresh.svg";
import { DropdownMenu, Tree } from "@stratakit/structures";
import { TreeRendererProps } from "../Renderers.js";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { useLocalizationContext } from "./LocalizationContext.js";
import { useRenameContext } from "./RenameAction.js";
import { TreeActionBase, TreeActionBaseAttributes } from "./TreeAction.js";

/** @alpha */
export interface TreeNodeRendererOwnProps extends Pick<TreeRendererProps, "expandNode" | "reloadTree"> {
  /** Node that is rendered. */
  node: PresentationHierarchyNode;

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

/** @alpha */
export type TreeNodeRendererProps = StrataKitTreeItemProps & TreeNodeRendererOwnProps;

/**
 * A component that renders given `FlatTreeNode` using the `Tree.Item` component from `@itwin/itwinui-react`. The
 * `FlatTreeNode` objects for this renderer are generally created using the `useFlatTreeNodeList` hook.
 *
 * @see `TreeRenderer`
 * @see https://itwinui.bentley.com/docs/tree
 * @public
 */
export const StrataKitTreeNodeRenderer: FC<PropsWithRef<TreeNodeRendererProps & RefAttributes<HTMLElement>>> = memo(
  forwardRef<HTMLElement, TreeNodeRendererProps>(function HierarchyNode(props, forwardedRef) {
    const { node, selected, className, description, decorations, inlineActions, menuActions, contextMenuActions, expandNode, reloadTree, ...treeItemProps } =
      props;
    const { localizedStrings } = useLocalizationContext();
    const renameContext = useRenameContext();
    const [contextMenuProps, setContextMenuProps] = useState<{ position: { x: number; y: number }; actions: ReactNode[] } | undefined>(undefined);

    const label = treeItemProps.label ?? node.label;
    const inlineActionItems = useMemo(() => {
      if (node.error !== undefined && node.error.type === "ChildrenLoad") {
        return [
          <TreeActionBase
            key="retry"
            label={localizedStrings.retry}
            onClick={() => reloadTree({ parentNodeId: node.id, state: "reset" })}
            visible={true}
            icon={refreshSvg}
            variant="inline"
          />,
        ];
      }
      if (!inlineActions) {
        return [];
      }
      return injectActionVariant(inlineActions, "inline");
    }, [node, inlineActions, localizedStrings.retry, reloadTree]);

    const menuActionItems = useMemo(() => {
      if (!menuActions) {
        return undefined;
      }
      return injectActionVariant(menuActions, "default");
    }, [menuActions]);

    const expanded = useMemo(() => {
      if (node.error) {
        return undefined;
      }

      if (node.isExpanded || node.children === true || node.children.length > 0) {
        return node.isExpanded;
      }

      return undefined;
    }, [node.children, node.error, node.isExpanded]);

    const { onLabelChanged, setIsRenaming, isRenaming } = renameContext ?? {};
    const labelEditor = isRenaming ? (
      <LabelEditor
        initialLabel={node.label}
        onChange={(newLabel) => {
          onLabelChanged?.(newLabel);
          setIsRenaming?.(false);
        }}
        onCancel={() => {
          setIsRenaming?.(false);
        }}
      />
    ) : undefined;

    return (
      <>
        <Tree.Item
          {...treeItemProps}
          ref={forwardedRef}
          className={className}
          label={labelEditor ?? label}
          description={description}
          selected={selected}
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
          error={node.error ? node.error.id : undefined}
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

            setContextMenuProps({
              position: {
                x: e.clientX,
                y: e.clientY,
              },
              actions,
            });
          }}
        />
        <DropdownMenu.Provider
          open={contextMenuProps !== undefined}
          setOpen={(open) => {
            if (!open) {
              setContextMenuProps(undefined);
            }
          }}
          key={`${node.id}-${contextMenuProps?.position.x ?? ""}-${contextMenuProps?.position.y ?? ""}`}
        >
          {contextMenuProps ? (
            <DropdownMenu.Button style={{ position: "fixed", top: contextMenuProps.position.y, left: contextMenuProps.position.x }} render={<div />} />
          ) : null}
          {/* `autoFocus` prop is coming from ariakit and is not native HTML `autoFocus` prop. */}
          {/* `focusable` is needed for `autoFocus` to work. StrataKit exposes only `autoFocus` and does not set `focusable` internally. */}
          {/* eslint-disable jsx-a11y/no-autofocus */}
          {/* @ts-expect-error focusable is passed through */}
          <DropdownMenu.Content focusable autoFocus={true}>
            {contextMenuProps?.actions}
          </DropdownMenu.Content>
        </DropdownMenu.Provider>
      </>
    );
  }),
);

export const PlaceholderNode: FC<
  PropsWithRef<Pick<StrataKitTreeItemProps, "style" | "aria-level" | "aria-posinset" | "aria-setsize"> & RefAttributes<HTMLElement>>
> = memo(
  forwardRef<HTMLElement, Pick<StrataKitTreeItemProps, "style" | "aria-level" | "aria-posinset" | "aria-setsize">>(function PlaceholderNode(
    { ...props },
    forwardedRef,
  ) {
    const { localizedStrings } = useLocalizationContext();
    return (
      <Tree.Item
        {...props}
        ref={forwardedRef}
        label={localizedStrings.loading}
        unstable_decorations={<Spinner size={"small"} title={localizedStrings.loading} />}
      />
    );
  }),
);

function LabelEditor({ initialLabel, onChange, onCancel }: { initialLabel: string; onChange: (newLabel: string) => void; onCancel: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [newLabelValue, setNewLabelValue] = useState(initialLabel);
  const handleLabelChange = () => {
    if (initialLabel !== newLabelValue) {
      onChange(newLabelValue);
      return;
    }
    onCancel();
  };

  const cancelLabelChange = () => {
    setNewLabelValue(initialLabel);
    onCancel();
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  return (
    <TextBox.Root>
      <TextBox.Input
        ref={inputRef}
        value={newLabelValue}
        onChange={(event) => setNewLabelValue(event.target.value)}
        onBlur={handleLabelChange}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            handleLabelChange();
          } else if (event.key === "Escape") {
            cancelLabelChange();
          }
        }}
      />
    </TextBox.Root>
  );
}

function injectActionVariant(actions: ReactNode[], variant: TreeActionBaseAttributes["variant"]) {
  return actions
    .filter((action) => isValidElement<TreeActionBaseAttributes>(action))
    .map((action) => cloneElement<TreeActionBaseAttributes>(action, { variant }));
}
