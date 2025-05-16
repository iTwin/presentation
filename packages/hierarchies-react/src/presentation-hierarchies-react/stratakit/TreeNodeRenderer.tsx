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
} from "react";
import { Spinner } from "@stratakit/bricks";
import refreshSvg from "@stratakit/icons/refresh.svg";
import { Tree } from "@stratakit/structures";
import { PresentationHierarchyNode } from "../TreeNode.js";
import { useTree, UseTreeResult } from "../UseTree.js";
import { ErrorNode } from "./FlatTreeNode.js";
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
  /** Specifies if tree item has error. */
  error?: ErrorNode;
}

/** @alpha */
type TreeNodeRendererProps = Pick<ReturnType<typeof useTree>, "expandNode"> &
  Partial<Pick<ReturnType<typeof useTree>, "getHierarchyLevelDetails">> &
  Omit<TreeNodeProps, "actions" | "label" | "expanded" | "unstable_decorations" | "error"> &
  Pick<UseTreeResult, "reloadTree"> &
  TreeNodeRendererOwnProps;

/**
 * A component that renders given `FlatTreeNode` using the `Tree.Item` component from `@itwin/itwinui-react`. The
 * `FlatTreeNode` objects for this renderer are generally created using the `useFlatTreeNodeList` hook.
 *
 * @see `TreeRenderer`
 * @see https://itwinui.bentley.com/docs/tree
 * @public
 */
export const TreeNodeRenderer: FC<PropsWithRef<TreeNodeRendererProps & RefAttributes<HTMLElement>>> = memo(
  forwardRef<HTMLElement, TreeNodeRendererProps>(function HierarchyNode(
    { node, selected, error, expandNode, onNodeClick, onNodeKeyDown, reloadTree, getLabel, getSublabel, getActions, getDecorations, ...treeItemProps },
    forwardedRef,
  ) {
    const nodeRef = useRef<HTMLElement>(null);
    const ref = useMergedRefs(forwardedRef, nodeRef);
    const { localizedStrings } = useLocalizationContext();

    const label = useMemo(() => (getLabel ? getLabel(node) : node.label), [getLabel, node]);
    const description = useMemo(() => (getSublabel ? getSublabel(node) : undefined), [getSublabel, node]);
    const decorations = useMemo(() => getDecorations?.(node), [getDecorations, node]);
    const actions = useMemo(
      () => [
        ...(error && error.error.type === "Unknown"
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
      [getActions, node, error, localizedStrings, reloadTree],
    );

    const isDisabled = treeItemProps["aria-disabled"] === true;
    return (
      <Tree.Item
        {...treeItemProps}
        ref={ref}
        label={label}
        description={description}
        selected={selected}
        expanded={node.isExpanded || node.children === true || node.children.length > 0 ? node.isExpanded : undefined}
        onExpandedChange={useCallback(
          (isExpanded: boolean) => {
            expandNode(node.id, isExpanded);
          },
          [node, expandNode],
        )}
        onClick={useCallback<Required<TreeNodeProps>["onClick"]>(
          (event) => {
            !isDisabled && onNodeClick?.(node, !selected, event);
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
        actions={actions}
        unstable_decorations={decorations}
        error={error?.error.id}
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
