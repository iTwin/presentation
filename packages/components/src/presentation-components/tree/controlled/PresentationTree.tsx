/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */
/** @packageDocumentation
 * @module Tree
 */

import { ControlledTree, useTreeModel } from "@itwin/components-react";

import type { ReactElement } from "react";
import type { AbstractTreeNodeLoaderWithProvider, ControlledTreeProps, TreeEventHandler, TreeRendererProps } from "@itwin/components-react";
import type { IPresentationTreeDataProvider } from "../IPresentationTreeDataProvider.js";
import type { UsePresentationTreeStateResult } from "./UsePresentationTreeState.js";

/**
 * Props for [[PresentationTree]] component.
 *
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export type PresentationTreeProps<TEventHandler extends TreeEventHandler> = Omit<
  ControlledTreeProps,
  "model" | "nodeLoader" | "eventsHandler" | "onItemsRendered" | "nodeHighlightingProps" | "treeRenderer"
> & {
  state: UsePresentationTreeStateResult<TEventHandler>;
  treeRenderer?: (props: TreeRendererProps & { nodeLoader: AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider> }) => ReactElement;
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
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
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
