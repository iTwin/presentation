/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { PropertyRecord } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
import { ProgressRadial, Table, tableFilters } from "@itwin/itwinui-react";
import { ColumnDefinition, RowDefinition, TableCellRenderer, useUnifiedSelectionPresentationTable } from "@itwin/presentation-components";
import { useCallback, useMemo } from "react";

export interface TableWidgetProps {
  imodel: IModelConnection;
  rulesetId?: string;
}

export function TableWidget(props: TableWidgetProps) {
  const { imodel, rulesetId } = props;

  if (!rulesetId)
    return null;

  return <PresentationTable imodel={imodel} rulesetId={rulesetId} />;
}

interface PresentationTableProps {
  imodel: IModelConnection;
  rulesetId: string;
}

function PresentationTable(props: PresentationTableProps) {
  const { imodel, rulesetId } = props;

  const { columns, rows, isLoading, loadMoreRows, sort, filter } = useUnifiedSelectionPresentationTable({
    imodel,
    ruleset: rulesetId,
    pageSize: 20,
    columnMapper: mapTableColumns,
    rowMapper: mapTableRow,
  });

  const onSort = useCallback((tableState: any) => {
    const sortBy = tableState.sortBy[0];
    sort(sortBy?.id, sortBy?.desc);
  }, [sort]);

  const onFilter = useCallback((filters: any) => {
    const tableFilter = filters[0];
    if (!tableFilter) {
      filter(undefined);
      return;
    }

    const expression = `${tableFilter.id} = "${tableFilter.value}"`;
    filter(expression);
  }, [filter]);

  const tableColumns = useMemo(() => columns
    ? ([{ Header: "Table Header", columns }])
    : undefined,
  [columns]);

  if (!tableColumns) {
    return <ProgressRadial indeterminate={true} />;
  }

  return (
    <Table
      columns={tableColumns}
      data={rows}
      emptyTableContent={"No data"}
      isLoading={isLoading}
      onBottomReached={loadMoreRows}
      isSortable={true}
      manualSortBy={true}
      onSort={onSort}
      manualFilters={true}
      onFilter={onFilter}
    />
  );
}

function mapTableColumns(columnDefinitions: ColumnDefinition) {
  return {
    id: columnDefinitions.name,
    accessor: columnDefinitions.name,
    Header: columnDefinitions.label,
    Cell: cellRenderer,
    fieldTypes: "string",
    Filter: tableFilters.TextFilter(),
  };
}

function mapTableRow(rowDefinition: RowDefinition) {
  const newRow: { [key: string]: PropertyRecord } = {};
  rowDefinition.cells.forEach((cell) => { newRow[cell.key] = cell.record; });
  return newRow;
}

function cellRenderer(cellProps: any) {
  if (!cellProps.value)
    return null;
  return <TableCellRenderer record={(cellProps.value as PropertyRecord)} />;
}
