/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Tree
 */

import { ReactNode } from "react";
import {
  AbstractTreeNodeLoaderWithProvider,
  ControlledTree,
  ControlledTreeProps,
  TreeEventHandler,
  TreeRendererProps,
  useTreeModel,
} from "@itwin/components-react";
import { IPresentationTreeDataProvider } from "../IPresentationTreeDataProvider";
import { UsePresentationTreeStateResult } from "./UsePresentationTreeState";

/**
 * Props for [[PresentationTree]] component.
 *
 * @public
 */
export type PresentationTreeProps<TEventHandler extends TreeEventHandler> = Omit<
  ControlledTreeProps,
  "model" | "nodeLoader" | "eventsHandler" | "onItemsRendered" | "nodeHighlightingProps"
> & {
  state: UsePresentationTreeStateResult<TEventHandler>;
  treeRenderer?: (props: TreeRendererProps & { nodeLoader: AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider> }) => ReactNode;
};

/**
 * Component that provides a convenient API for using [[usePresentationTreeState]] hook with [ControlledTree]($components-react).
 *
 * Usage example:
 * ```tsx
 * function Tree(props) {
 *   const state = usePresentationTreeState({ imodel: props.imodel, ruleset: TREE_RULESET, pagingSize: PAGING_SIZE });
 *   if (!state) {
 *     return null;
 *   }
 *
 *   return <PresentationTree state={state} width={200} height={400} selectionMode={SelectionMode.Single} />;
 * }
 * ```
 *
 * @public
 */
export function PresentationTree<TEventHandler extends TreeEventHandler>({ state, ...props }: PresentationTreeProps<TEventHandler>) {
  const treeModel = useTreeModel(state.nodeLoader.modelSource);

  return (
    <ControlledTree
      {...props}
      model={treeModel}
      nodeLoader={state.nodeLoader}
      eventsHandler={state.eventHandler}
      onItemsRendered={state.onItemsRendered}
      nodeHighlightingProps={state.filteringResult?.highlightProps}
      treeRenderer={props.treeRenderer ? (treeProps) => props.treeRenderer!({ ...treeProps, nodeLoader: state.nodeLoader }) : undefined}
    />
  );
}
