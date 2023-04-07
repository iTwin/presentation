/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback } from "react";
import { PropertyRecord } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
import { ProgressRadial, Table } from "@itwin/itwinui-react";
import { TableCellRenderer, TableColumnDefinition, TableRowDefinition, usePresentationTableWithUnifiedSelection } from "@itwin/presentation-components";

export interface TableWidgetProps {
  imodel: IModelConnection;
  rulesetId?: string;
}

export function TableWidget(props: TableWidgetProps) {
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

  const { columns, rows, isLoading, loadMoreRows, sort } = usePresentationTableWithUnifiedSelection({
    imodel,
    ruleset: rulesetId,
    pageSize: 20,
    columnMapper: mapTableColumns,
    rowMapper: mapTableRow,
  });

  const onSort = useCallback(
    (tableState: any) => {
      const sortBy = tableState.sortBy[0];
      sort(sortBy?.id, sortBy?.desc);
    },
    [sort]
  );

  if (columns === undefined) {
    return <ProgressRadial indeterminate={true} />;
  }

  return (
    <Table
      columns={columns}
      data={rows}
      emptyTableContent={"No data"}
      isLoading={isLoading}
      onBottomReached={loadMoreRows}
      isSortable={true}
      manualSortBy={true}
      onSort={onSort}
      density="extra-condensed"
    />
  );
}

function mapTableColumns(columnDefinitions: TableColumnDefinition) {
  return {
    id: columnDefinitions.name,
    accessor: columnDefinitions.name,
    Header: columnDefinitions.label,
    Cell: cellRenderer,
  };
}

function mapTableRow(rowDefinition: TableRowDefinition) {
  const newRow: { [key: string]: PropertyRecord } = {};
  rowDefinition.cells.forEach((cell) => {
    newRow[cell.key] = cell.record;
  });
  return newRow;
}

function cellRenderer(cellProps: any) {
  if (!cellProps.value) {
    return null;
  }
  return <TableCellRenderer record={cellProps.value as PropertyRecord} />;
}
