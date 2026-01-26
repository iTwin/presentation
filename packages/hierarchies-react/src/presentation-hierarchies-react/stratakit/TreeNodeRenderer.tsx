/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./TreeNodeRenderer.css";

import type {
  ComponentPropsWithoutRef,
  FC,
  PropsWithRef,
  ReactNode,
  RefAttributes} from "react";
import {
  cloneElement,
  forwardRef,
  isValidElement,
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Description, IconButton, Spinner, Text, TextBox } from "@stratakit/bricks";
import checkmarkSvg from "@stratakit/icons/checkmark.svg";
import dismissSvg from "@stratakit/icons/dismiss.svg";
import refreshSvg from "@stratakit/icons/refresh.svg";
import { DropdownMenu, unstable_Popover as Popover, Tree } from "@stratakit/structures";
import type { TreeRendererProps } from "../Renderers.js";
import type { TreeNode } from "../TreeNode.js";
import { useLocalizationContext } from "./LocalizationContext.js";
import type { TreeActionBaseAttributes } from "./TreeAction.js";
import { TreeActionBase } from "./TreeAction.js";
import { useTreeNodeRenameContext } from "./TreeNodeRenameAction.js";

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
 * A component that renders given `FlatTreeNode` using the `Tree.Item` component from `@itwin/itwinui-react`. The
 * `FlatTreeNode` objects for this renderer are generally created using the `useFlatTreeNodeList` hook.
 *
 * @internal
 */
export const StrataKitTreeNodeRenderer: FC<PropsWithRef<TreeNodeRendererProps & RefAttributes<HTMLElement>>> = memo(
  forwardRef<HTMLElement, TreeNodeRendererProps>(function HierarchyNode(props, forwardedRef) {
    const { node, decorations, inlineActions, menuActions, contextMenuActions, expandNode, reloadTree, ...treeItemProps } = props;
    const { localizedStrings } = useLocalizationContext();
    const renameContext = useTreeNodeRenameContext();
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
        return undefined;
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
        <Popover content={labelEditor} placement="bottom" open={renameParameters?.nodeId === node.id} setOpen={cancelRename} unmountOnHide>
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
        </Popover>
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

function LabelEditor({
  initialLabel,
  labelValidationHint,
  onChange,
  onCancel,
  validate,
}: {
  initialLabel: string;
  labelValidationHint?: string;
  onChange?: (newLabel: string) => void;
  onCancel?: () => void;
  validate?: (newLabel: string) => boolean;
}) {
  const { localizedStrings } = useLocalizationContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [newLabelValue, setNewLabelValue] = useState(initialLabel);
  const [hasError, setHasError] = useState<boolean>(false);
  const handleLabelChange = () => {
    if (validate && !validate(newLabelValue)) {
      setHasError(true);
      return;
    }

    if (initialLabel !== newLabelValue) {
      onChange?.(newLabelValue);
      return;
    }
    onCancel?.();
  };

  const cancelLabelChange = () => {
    setNewLabelValue(initialLabel);
    onCancel?.();
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const canRename = newLabelValue && newLabelValue !== initialLabel && !hasError;
  const inputId = useId();

  return (
    <div key={initialLabel} className="phr-node-label-editor">
      <div className="phr-node-label-editor-input-row">
        <TextBox.Root style={{ width: "100%" }} className={hasError ? "with-error" : undefined}>
          <TextBox.Input
            id={inputId}
            ref={inputRef}
            value={newLabelValue}
            onChange={(event) => {
              setNewLabelValue(event.target.value);
              setHasError(false);
            }}
            onKeyUp={(event) => {
              if (event.key === "Enter") {
                handleLabelChange();
              } else if (event.key === "Escape") {
                cancelLabelChange();
              }
            }}
          />
        </TextBox.Root>
        <IconButton icon={dismissSvg} label={localizedStrings.cancel} onClick={cancelLabelChange} />
        <IconButton icon={checkmarkSvg} label={localizedStrings.confirm} onClick={handleLabelChange} disabled={!canRename} />
      </div>
      {labelValidationHint !== undefined ? (
        <Description id={inputId} tone={hasError ? "critical" : "neutral"} style={{ display: "flex" }}>
          <Text variant="caption-lg">{labelValidationHint}</Text>
        </Description>
      ) : undefined}
    </div>
  );
}

function injectActionVariant(actions: ReactNode[], variant: TreeActionBaseAttributes["variant"]) {
  return actions
    .filter((action) => isValidElement<TreeActionBaseAttributes>(action))
    .map((action) => cloneElement<TreeActionBaseAttributes>(action, { variant }));
}
