/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */
/** @packageDocumentation
 * @module Tree
 */

import "../../common/DisposePolyfill.js";

import { AbstractTreeNodeLoaderWithProvider } from "@itwin/components-react";
import { IPresentationTreeDataProvider } from "../IPresentationTreeDataProvider.js";
import { useFilteredNodeLoader, useNodeHighlightingProps } from "./UseControlledTreeFiltering.js";

/**
 * Parameters for [[useControlledPresentationTreeFiltering]] hook
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export interface ControlledPresentationTreeFilteringProps {
  nodeLoader: AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>;
  filter?: string;
  activeMatchIndex?: number;
}

/**
 * A custom hook that creates filtered model source and node loader for supplied filter.
 * If filter string is not provided or filtering is still in progress it returns supplied
 * model source and node loader.
 *
 * @public
 * @deprecated in 5.7. All tree-related APIs have been deprecated in favor of the new generation hierarchy
 * building APIs (see https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/README.md#the-packages).
 */
export function useControlledPresentationTreeFiltering(props: ControlledPresentationTreeFilteringProps) {
  const { filteredNodeLoader, filteredProvider, isFiltering, matchesCount } = useFilteredNodeLoader({
    dataProvider: props.nodeLoader.dataProvider,
    filter: props.filter,
  });
  const nodeHighlightingProps = useNodeHighlightingProps(props.filter, filteredProvider, props.activeMatchIndex);
  return {
    nodeHighlightingProps,
    filteredNodeLoader: filteredNodeLoader || props.nodeLoader,
    filteredModelSource: filteredNodeLoader?.modelSource || props.nodeLoader.modelSource,
    isFiltering,
    matchesCount,
  };
}
