/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useResizeDetector } from "react-resize-detector";
import { FilteringInput, FilteringInputStatus } from "@itwin/components-react";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Tab, Tabs } from "@itwin/itwinui-react";
import { DiagnosticsProps } from "@itwin/presentation-components";
import { DiagnosticsSelector } from "../diagnostics-selector/DiagnosticsSelector";
import { Tree } from "./rules-driven/Tree";
import { TreeComponent } from "./stateless-agnostic/Tree";
import { StatelessTreeWidget } from "./stateless/Tree";

export interface TreeWidgetProps {
  imodel: IModelConnection;
  rulesetId?: string;
  height?: number;
  width?: number;
}

export function TreeWidget(props: Omit<TreeWidgetProps, "height" | "width">) {
  const [openTab, setOpenTab] = useState(0);
  const { width, height, ref } = useResizeDetector<HTMLDivElement>();
  const tabsClassName = "tree-widget-tabs";
  const [heightOfTreeWidget, setHeightOfTreeWidget] = useState(0);
  useEffect(() => {
    const tabElements = ref.current?.getElementsByClassName(tabsClassName);
    const heightOfTab = tabElements && tabElements.length > 0 ? tabElements[0].clientHeight : 0;
    setHeightOfTreeWidget(height ? height - heightOfTab : 0);
    // When width changes tab height might change, so it needs to be included in dependency list
  }, [height, ref, width]);

  return (
    <div ref={ref}>
      <Tabs
        labels={[
          <Tab key={1} label={IModelApp.localization.getLocalizedString("Sample:controls.tree-widget.rules-driven-tree")} />,
          <Tab key={2} label={IModelApp.localization.getLocalizedString("Sample:controls.tree-widget.stateless-models-tree")} />,
        ]}
        onTabSelected={setOpenTab}
        contentClassName="tree-widget-tabs-content"
        tabsClassName={tabsClassName}
      >
        <div className="tree-widget">
          {openTab === 0 ? (
            <TreeComponent imodel={props.imodel} height={heightOfTreeWidget} width={width ?? 0} />
          ) : (
            <StatelessTreeWidget imodel={props.imodel} height={heightOfTreeWidget} width={width} />
          )}
        </div>
      </Tabs>
    </div>
  );
}

export function RulesDrivenTreeWidget(props: TreeWidgetProps) {
  const { rulesetId, imodel } = props;
  const [diagnosticsOptions, setDiagnosticsOptions] = useState<DiagnosticsProps>({ ruleDiagnostics: undefined, devDiagnostics: undefined });
  const [filter, setFilter] = useState("");
  const [filteringStatus, setFilteringStatus] = useState(FilteringInputStatus.ReadyToFilter);
  const [matchesCount, setMatchesCount] = useState<number>();
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
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
  const { headerRef, treeHeight } = useTreeHeight(props.height);
  return (
    <>
      <TreeWidgetHeader
        onFilterChange={setFilter}
        filteringStatus={filteringStatus}
        showFilteringInput={!!rulesetId}
        ref={headerRef}
        onActiveMatchIndexChange={setActiveMatchIndex}
        matchesCount={matchesCount}
        onDiagnosticsOptionsChange={setDiagnosticsOptions}
      />
      <div className="filtered-tree">
        {rulesetId && props.width && treeHeight ? (
          <>
            <Tree
              imodel={imodel}
              rulesetId={rulesetId}
              diagnostics={diagnosticsOptions}
              filtering={{ filter, activeMatchIndex, onFilteringStateChange }}
              width={props.width}
              height={treeHeight}
            />
            {filteringStatus === FilteringInputStatus.FilteringInProgress ? <div className="filtered-tree-overlay" /> : null}
          </>
        ) : null}
      </div>
    </>
  );
}

export function useTreeHeight(height?: number) {
  const [treeHeight, setTreeHeight] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const heightOfHeader = headerRef.current?.clientHeight ?? 0;
    const heightToSet = height ? height - heightOfHeader : 0;
    setTreeHeight(heightToSet);
  }, [height]);
  return { headerRef, treeHeight };
}

interface HeaderProps {
  onFilterChange: (newFilter: string) => void;
  filteringStatus: FilteringInputStatus;
  showFilteringInput: boolean;
  onActiveMatchIndexChange?: (index: number) => void;
  matchesCount?: number;
  onDiagnosticsOptionsChange?: (options: DiagnosticsProps) => void;
}

export const TreeWidgetHeader = forwardRef(function TreeWidgetHeader(props: HeaderProps, ref: React.ForwardedRef<HTMLDivElement>) {
  const { onFilterChange, filteringStatus, showFilteringInput } = props;
  return (
    <div ref={ref} className="tree-widget-header">
      {showFilteringInput && (
        <FilteringInput
          status={filteringStatus}
          onFilterCancel={() => {
            onFilterChange("");
          }}
          onFilterClear={() => {
            onFilterChange("");
          }}
          onFilterStart={(newFilter) => {
            onFilterChange(newFilter);
          }}
          resultSelectorProps={
            props.onActiveMatchIndexChange || props.matchesCount
              ? {
                  onSelectedChanged: (index) => (props.onActiveMatchIndexChange ? props.onActiveMatchIndexChange(index) : {}),
                  resultCount: props.matchesCount || 0,
                }
              : undefined
          }
        />
      )}
      {props.onDiagnosticsOptionsChange && <DiagnosticsSelector onDiagnosticsOptionsChanged={props.onDiagnosticsOptionsChange} />}
    </div>
  );
});
