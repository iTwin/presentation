/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { forwardRef, useEffect, useRef, useState } from "react";
import { FilteringInput, FilteringInputStatus } from "@itwin/components-react";
import { DiagnosticsProps } from "@itwin/presentation-components";
import { DiagnosticsSelector } from "../diagnostics-selector/DiagnosticsSelector";

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
