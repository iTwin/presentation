/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  ComponentPropsWithoutRef,
  FC,
  forwardRef,
  LegacyRef,
  memo,
  MutableRefObject,
  PropsWithRef,
  ReactElement,
  ReactNode,
  Ref,
  RefAttributes,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Spinner, TextBox } from "@stratakit/bricks";
import placeholderSvg from "@stratakit/icons/placeholder.svg";
import refreshSvg from "@stratakit/icons/refresh.svg";
import { Tree } from "@stratakit/structures";
import { TreeRendererProps } from "../Renderers.js";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { useLocalizationContext } from "./LocalizationContext.js";
import { useRenameContext } from "./RenameAction.js";

/** @alpha */
type TreeNodeProps = ComponentPropsWithoutRef<typeof Tree.Item>;

/** @alpha */
export interface TreeNodeRendererOwnProps {
  /** Node that is rendered. */
  node: PresentationHierarchyNode;
  /** Returns a label for a given node. */
  getLabel?: (node: PresentationHierarchyNode) => ReactElement | undefined;
  /** Returns sublabel for a given node. */
  getSublabel?: (node: PresentationHierarchyNode) => ReactElement | undefined;
  /** Action to perform when the node is clicked. */
  onNodeClick?: (node: PresentationHierarchyNode, isSelected: boolean, event: React.MouseEvent<HTMLElement>) => void;
  /** Action to perform when a key is pressed when the node is hovered on. */
  onNodeKeyDown?: (node: PresentationHierarchyNode, isSelected: boolean, event: React.KeyboardEvent<HTMLElement>) => void;

  /**
   * Used to render elements between expander and label.
   * E.g. icons, color picker, etc.
   */
  getDecorations?: (node: PresentationHierarchyNode) => ReactNode;
  /**
   * Callback that returns menu action getters for tree item.
   * Getters must return an array of `Tree.ItemAction` or `undefined` in case the action should not be displayed.
   */
  getMenuActions?: ((node: PresentationHierarchyNode) => ReactElement | undefined)[];
  /**
   * Callback that returns inline action getters for tree item.
   * Getters must return an array of `Tree.ItemAction` or `undefined` in case the action should not be displayed.
   * Max 2 items.
   */
  getInlineActions?: ((node: PresentationHierarchyNode) => ReactElement | undefined)[];
}

/** @alpha */
type TreeNodeRendererProps = Pick<TreeRendererProps, "expandNode" | "reloadTree"> &
  Omit<TreeNodeProps, "actions" | "label" | "expanded" | "unstable_decorations" | "error"> &
  TreeNodeRendererOwnProps;

/**
 * A component that renders given `FlatTreeNode` using the `Tree.Item` component from `@itwin/itwinui-react`. The
 * `FlatTreeNode` objects for this renderer are generally created using the `useFlatTreeNodeList` hook.
 *
 * @see `TreeRenderer`
 * @see https://itwinui.bentley.com/docs/tree
 * @public
 */
export const StrataKitTreeNodeRenderer: FC<PropsWithRef<TreeNodeRendererProps & RefAttributes<HTMLElement>>> = memo(
  forwardRef<HTMLElement, TreeNodeRendererProps>(function HierarchyNode(
    {
      node,
      selected,
      expandNode,
      onNodeClick,
      onNodeKeyDown,
      reloadTree,
      getLabel,
      getSublabel,
      getInlineActions,
      getMenuActions,
      getDecorations,
      ...treeItemProps
    },
    forwardedRef,
  ) {
    const nodeRef = useRef<HTMLElement>(null);
    const ref = useMergedRefs(forwardedRef, nodeRef);
    const { localizedStrings } = useLocalizationContext();
    const renameContext = useRenameContext();

    const label = useMemo(() => (getLabel ? getLabel(node) : node.label), [getLabel, node]);
    const description = useMemo(() => (getSublabel ? getSublabel(node) : undefined), [getSublabel, node]);
    const decorations = useMemo(() => getDecorations?.(node), [getDecorations, node]);
    const inlineActions = useMemo(() => {
      if (node.error === undefined) {
        if (!getInlineActions || getInlineActions.length === 0) {
          return [];
        }
        return [
          getInlineActions[0](node) ?? <Tree.ItemAction label="hidden-action" visible={false} icon={placeholderSvg} />,
          getInlineActions[1](node) ?? <Tree.ItemAction label="hidden-action" visible={false} icon={placeholderSvg} />,
        ];
      }

      if (node.error.type === "Unknown") {
        return [
          <Tree.ItemAction
            key="retry"
            label={localizedStrings.retry}
            onClick={() => reloadTree({ parentNodeId: node.id, state: "reset" })}
            visible={true}
            icon={refreshSvg}
          />,
        ];
      }
      return [];
    }, [node, getInlineActions, localizedStrings.retry, reloadTree]);

    const expanded = useMemo(() => {
      if (node.error) {
        return undefined;
      }

      if (node.isExpanded || node.children === true || node.children.length > 0) {
        return node.isExpanded;
      }

      return undefined;
    }, [node.children, node.error, node.isExpanded]);

    const isDisabled = treeItemProps["aria-disabled"] === true;

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
      <Tree.Item
        {...treeItemProps}
        ref={ref}
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
        onClick={useCallback<Required<TreeNodeProps>["onClick"]>(
          (event) => {
            if (isDisabled) {
              return;
            }

            onNodeClick?.(node, !selected, event);
          },
          [node, isDisabled, selected, onNodeClick],
        )}
        onKeyDown={useCallback<Required<TreeNodeProps>["onKeyDown"]>(
          (event) => {
            // Ignore if it is called on the element inside, e.g. checkbox or expander
            if (!isDisabled && event.target === nodeRef.current) {
              onNodeKeyDown?.(node, !selected, event);
            }
          },
          [onNodeKeyDown, selected, isDisabled, node],
        )}
        actions={useMemo(() => getMenuActions?.map((menuAction) => menuAction(node)), [getMenuActions, node])}
        inlineActions={inlineActions}
        unstable_decorations={decorations}
        error={node.error ? node.error.id : undefined}
      />
    );
  }),
);

export const PlaceholderNode: FC<PropsWithRef<Omit<TreeNodeProps, "onExpanded" | "label" | "actions" | "icon" | "error"> & RefAttributes<HTMLElement>>> = memo(
  forwardRef<HTMLElement, Omit<TreeNodeProps, "onExpanded" | "label" | "actions" | "icon" | "error">>(function PlaceholderNode({ ...props }, forwardedRef) {
    const { localizedStrings } = useLocalizationContext();
    return <Tree.Item {...props} ref={forwardedRef} label={localizedStrings.loading} icon={<Spinner size={"small"} title={localizedStrings.loading} />} />;
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

function useMergedRefs<T>(...refs: ReadonlyArray<Ref<T> | LegacyRef<T> | undefined | null>) {
  return useCallback(
    (instance: T | null) => {
      refs.forEach((ref) => {
        if (typeof ref === "function") {
          ref(instance);
        } else if (ref) {
          (ref as MutableRefObject<T | null>).current = instance;
        }
      });
    }, // eslint-disable-next-line react-hooks/exhaustive-deps
    [...refs],
  );
}
