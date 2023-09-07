/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, useState } from "react";
import { PropertyRecord } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
import { ProgressRadial } from "@itwin/itwinui-react";
import { TableCellRenderer, TableColumnDefinition, TableRowDefinition, usePresentationTableWithUnifiedSelection } from "@itwin/presentation-components";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";

export interface ExperimentalTableWidgetProps {
  imodel: IModelConnection;
  rulesetId?: string;
}

export function ExperimentalTableWidget(props: ExperimentalTableWidgetProps) {
  const { imodel, rulesetId } = props;

  if (!rulesetId) {
    return null;
  }

  return <PresentationTable imodel={imodel} rulesetId={rulesetId} />;
}

interface PresentationTableProps {
  imodel: IModelConnection;
  rulesetId: string;
}

function PresentationTable(props: PresentationTableProps) {
  const { imodel, rulesetId } = props;

  const { columns, rows, isLoading, loadMoreRows, selectedRows, onSelect } = usePresentationTableWithUnifiedSelection({
    imodel,
    ruleset: rulesetId,
    pageSize: 20,
    columnMapper: mapTableColumns,
    rowMapper: mapTableRow,
  });

  const visibleColumns = columns?.slice(0, 5);

  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // create row selection state based on rows selected in unified selection
    const selection: Record<string, boolean> = {};
    selectedRows.forEach((row) => {
      selection[row.id] = true;
    });
    setRowSelection(selection);
  }, [selectedRows]);

  const table = useReactTable({
    data: rows,
    columns: visibleColumns ?? [],
    state: {
      rowSelection,
    },
    enableRowSelection: true,
    onRowSelectionChange: (updater) => {
      const newRowSelection = typeof updater === "function" ? updater(rowSelection) : updater;

      // collect selected row ids
      const newSelectedRows = Object.entries(newRowSelection)
        .filter(([_, isSelected]) => isSelected)
        .map(([rowId]) => rowId);

      onSelect(newSelectedRows);
    },
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  // we need a reference to the scrolling element for logic down below
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const fetchMoreOnBottomReached = useCallback(
    (containerRefElement?: HTMLDivElement | null) => {
      if (containerRefElement) {
        const { scrollHeight, scrollTop, clientHeight } = containerRefElement;
        // once the user has scrolled within 300px of the bottom of the table, fetch more data if there is any
        if (scrollHeight - scrollTop - clientHeight < 300 && !isLoading) {
          loadMoreRows();
        }
      }
    },
    [isLoading, loadMoreRows],
  );

  // a check on mount and after a fetch to see if the table is already scrolled to the bottom and immediately needs to fetch more data
  useEffect(() => {
    fetchMoreOnBottomReached(tableContainerRef.current);
  }, [fetchMoreOnBottomReached]);

  if (visibleColumns === undefined) {
    return <ProgressRadial indeterminate={true} />;
  }

  return (
    <div className="container" onScroll={(e) => fetchMoreOnBottomReached(e.target as HTMLDivElement)} ref={tableContainerRef}>
      <table>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <th key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder ? null : <>{flexRender(header.column.columnDef.header, header.getContext())}</>}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>

        <tbody style={{ overflow: "scroll" }}>
          {table.getRowModel().rows.map((row) => {
            return (
              <tr
                key={row.id}
                style={{ backgroundColor: row.getIsSelected() ? "blue" : "" }}
                onClick={() => {
                  row.toggleSelected();
                }}
              >
                {row.getVisibleCells().map((cell) => {
                  return <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function mapTableColumns(columnDefinitions: TableColumnDefinition) {
  return {
    id: columnDefinitions.name,
    accessorKey: columnDefinitions.name,
    header: columnDefinitions.label,
    cell: cellRenderer,
  };
}

function mapTableRow(rowDefinition: TableRowDefinition) {
  const newRow: { [key: string]: PropertyRecord | string; id: string } = { id: rowDefinition.key };
  rowDefinition.cells.forEach((cell) => {
    newRow[cell.key] = cell.record;
  });
  return newRow;
}

function cellRenderer(cellProps: any) {
  if (!cellProps.getValue()) {
    return null;
  }
  return <TableCellRenderer record={cellProps.getValue() as PropertyRecord} />;
}
