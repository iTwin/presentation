/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./TreeWidget.css";
import { useCallback, useEffect } from "react";
import { SelectionMode } from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import {
  DiagnosticsProps,
  PresentationTree,
  PresentationTreeEventHandlerProps,
  PresentationTreeRenderer,
  UnifiedSelectionTreeEventHandler,
  usePresentationTreeState,
} from "@itwin/presentation-components";

const PAGING_SIZE = 10;

interface Props {
  imodel: IModelConnection;
  rulesetId: string;
  diagnostics: DiagnosticsProps;
  filtering: {
    filter: string;
    activeMatchIndex: number;
    onFilteringStateChange: (isFiltering: boolean, matchesCount: number | undefined) => void;
  };
  width: number;
  height: number;
}

export function Tree(props: Props) {
  const { filter, onFilteringStateChange, activeMatchIndex } = props.filtering;
  const state = usePresentationTreeState({
    imodel: props.imodel,
    ruleset: props.rulesetId,
    pagingSize: PAGING_SIZE,
    eventHandlerFactory: useCallback(
      (handlerProps: PresentationTreeEventHandlerProps) =>
        new UnifiedSelectionTreeEventHandler({ nodeLoader: handlerProps.nodeLoader, collapsedChildrenDisposalEnabled: false, name: "TestAppTree" }),
      [],
    ),
    filteringParams: {
      filter,
      activeMatchIndex,
    },
    ...props.diagnostics,
  });

  const isFiltering = state?.filteringResult?.isFiltering ?? false;
  const matchesCount = state?.filteringResult?.matchesCount;
  useEffect(() => {
    onFilteringStateChange(isFiltering, matchesCount);
  }, [isFiltering, matchesCount, onFilteringStateChange]);

  if (!state) {
    return null;
  }

  return (
    <PresentationTree
      state={state}
      selectionMode={SelectionMode.Extended}
      iconsEnabled={true}
      width={props.width}
      height={props.height}
      treeRenderer={(treeProps) => (
        <PresentationTreeRenderer
          {...treeProps}
          imodel={props.imodel}
          modelSource={state.nodeLoader.modelSource}
          nodeLoader={state.nodeLoader}
          onItemsRendered={state.onItemsRendered}
        />
      )}
    />
  );
}
