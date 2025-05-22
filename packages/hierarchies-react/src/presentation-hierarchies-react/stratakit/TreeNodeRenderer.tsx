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
  useMemo,
  useRef,
  useState,
} from "react";
import { Spinner, TextBox } from "@stratakit/bricks";
import refreshSvg from "@stratakit/icons/refresh.svg";
import { Tree } from "@stratakit/structures";
import { TreeRendererProps } from "../Renderers.js";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { useLocalizationContext } from "./LocalizationContext.js";

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
   * Callback that returns actions for tree item. Must return an array of `Tree.ItemAction` elements.
   */
  getActions?: (node: PresentationHierarchyNode) => ReactNode[];
  onLabelChanged?: (newLabel: string) => void;
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
    { node, selected, expandNode, onNodeClick, onNodeKeyDown, reloadTree, getLabel, getSublabel, getActions, getDecorations, onLabelChanged, ...treeItemProps },
    forwardedRef,
  ) {
    const nodeRef = useRef<HTMLElement>(null);
    const ref = useMergedRefs(forwardedRef, nodeRef);
    const { localizedStrings } = useLocalizationContext();
    const [isEditing, setIsEditing] = useState(false);
    const [newLabelValue, setNewLabelValue] = useState(node.label);

    const label = useMemo(() => (getLabel ? getLabel(node) : node.label), [getLabel, node]);
    const description = useMemo(() => (getSublabel ? getSublabel(node) : undefined), [getSublabel, node]);
    const decorations = useMemo(() => getDecorations?.(node), [getDecorations, node]);
    const actions = useMemo(
      () => [
        ...(node.error?.type === "Unknown"
          ? [
              <Tree.ItemAction
                key="retry"
                label={localizedStrings.retry}
                onClick={() => reloadTree({ parentNodeId: node.id, state: "reset" })}
                visible={true}
                icon={refreshSvg}
              />,
            ]
          : []),
        ...(getActions ? getActions(node) : []),
      ],
      [getActions, node, localizedStrings, reloadTree],
    );

    const handleLabelChange = useCallback(() => {
      if (node.label !== newLabelValue) {
        onLabelChanged?.(newLabelValue);
      }
      setIsEditing(false);
    }, [node, newLabelValue, onLabelChanged]);

    const cancelLabelChange = useCallback(() => {
      setNewLabelValue(node.label);
      setIsEditing(false);
    }, [node]);

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

    const labelEditor = isEditing ? (
      <TextBox.Root>
        <TextBox.Input
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
            if (onLabelChanged && !isEditing && selected) {
              setIsEditing(true);
              return;
            }

            onNodeClick?.(node, !selected, event);
          },
          [node, isDisabled, isEditing, selected, onLabelChanged, onNodeClick],
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
        actions={actions}
        unstable_decorations={decorations}
        error={!!node.error}
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
