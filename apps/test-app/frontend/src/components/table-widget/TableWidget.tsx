/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect } from "react";
import { UseRowSelectInstanceProps } from "react-table";
import { PropertyRecord } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
import { Table } from "@itwin/itwinui-react";
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

  const tableInstance = React.useRef<
    UseRowSelectInstanceProps<{
      [key: string]: string | PropertyRecord;
    }>
  >();

  const { columns, rows, isLoading, loadMoreRows, sort, onSelect, selectedKeys } = usePresentationTableWithUnifiedSelection({
    imodel,
    ruleset: rulesetId,
    pageSize: 20,
    columnMapper: mapTableColumns,
    rowMapper: mapTableRow,
  });

  // useEffect(() => {
  //   selectedKeys?.forEach((selRow) => {
  //     tableInstance.current?.toggleAllRowsSelected( true);
  //   });
  // }, [selectedKeys]);

  const onSort = useCallback(
    (tableState: any) => {
      const sortBy = tableState.sortBy[0];
      sort(sortBy?.id, sortBy?.desc);
    },
    [sort],
  );

  // if (columns === undefined) {
  //   return <ProgressRadial indeterminate={true} />;
  // }

  const plswork = selectedKeys?.map((x) => mapTableRow(x));

  useEffect(() => {
    plswork?.forEach((plspls) => {
      plspls.toString();
      tableInstance.current?.toggleRowSelected(plspls.id as string, true);
    });
  }, [plswork]);

  return (
    <Table
      columns={columns ?? []}
      data={rows}
      emptyTableContent={"No data"}
      isLoading={isLoading}
      onBottomReached={loadMoreRows}
      isSortable={true}
      manualSortBy={true}
      onSort={onSort}
      getRowId={(x) => {
        return x.id as string;
      }}
      isSelectable={true}
      onSelect={(rowsList, _) => {
        onSelect((rowsList ?? []).map((a) => a.id as string));
      }}
      stateReducer={useCallback((newState, _action, _prevState, instance) => {
        tableInstance.current = instance;
        return newState;
      }, [])}
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
  const newRow: { [key: string]: PropertyRecord | string } = {};
  rowDefinition.cells.forEach((cell) => {
    newRow[cell.key] = cell.record;
  });
  newRow.id = rowDefinition.key;
  return newRow;
}

function cellRenderer(cellProps: any) {
  if (!cellProps.value) {
    return null;
  }
  return <TableCellRenderer record={cellProps.value as PropertyRecord} />;
}
