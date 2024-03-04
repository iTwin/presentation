/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "../TreeWidget.css";
import { useCallback, useEffect, useState } from "react";
import { FilteringInputStatus, SelectionMode } from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import {
  DiagnosticsProps,
  PresentationTree,
  PresentationTreeEventHandlerProps,
  PresentationTreeRenderer,
  UnifiedSelectionTreeEventHandler,
  usePresentationTreeState,
} from "@itwin/presentation-components";
import { TreeWidgetHeader, useTreeHeight } from "../TreeHeader";

const PAGING_SIZE = 10;

interface RulesDrivenTreeWidgetProps {
  imodel: IModelConnection;
  rulesetId?: string;
  height?: number;
  width?: number;
}

export function RulesDrivenTreeWidget(props: RulesDrivenTreeWidgetProps) {
  const { rulesetId, imodel, width, height } = props;
  const [diagnosticsOptions, setDiagnosticsOptions] = useState<DiagnosticsProps>({ ruleDiagnostics: undefined, devDiagnostics: undefined });
  const [filter, setFilter] = useState("");
  const [filteringStatus, setFilteringStatus] = useState(FilteringInputStatus.ReadyToFilter);
  const [matchesCount, setMatchesCount] = useState<number>();
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  const { headerRef, treeHeight } = useTreeHeight(height);
  const onFilteringStateChange = useCallback((isFiltering: boolean, newMatchesCount: number | undefined) => {
    setFilteringStatus(
      isFiltering
        ? FilteringInputStatus.FilteringInProgress
        : undefined !== newMatchesCount
          ? FilteringInputStatus.FilteringFinished
          : FilteringInputStatus.ReadyToFilter,
    );
    setMatchesCount(newMatchesCount);
  }, []);
  return (
    <>
      <TreeWidgetHeader
        ref={headerRef}
        onFilterChange={setFilter}
        filteringStatus={filteringStatus}
        showFilteringInput={!!rulesetId}
        onActiveMatchIndexChange={setActiveMatchIndex}
        matchesCount={matchesCount}
        onDiagnosticsOptionsChange={setDiagnosticsOptions}
      />
      <div className="filtered-tree">
        {rulesetId && width && treeHeight ? (
          <>
            <Tree
              imodel={imodel}
              rulesetId={rulesetId}
              diagnostics={diagnosticsOptions}
              filtering={{ filter, activeMatchIndex, onFilteringStateChange }}
              width={width}
              height={treeHeight}
            />
            {filteringStatus === FilteringInputStatus.FilteringInProgress ? <div className="filtered-tree-overlay" /> : null}
          </>
        ) : null}
      </div>
    </>
  );
}

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

function Tree(props: Props) {
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
      treeRenderer={(treeProps) => <PresentationTreeRenderer {...treeProps} />}
    />
  );
}
