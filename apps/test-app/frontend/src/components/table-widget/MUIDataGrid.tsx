/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PropertyRecord } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
import { TableCellRenderer, TableColumnDefinition, TableRowDefinition, usePresentationTableWithUnifiedSelection } from "@itwin/presentation-components";
import { useUnifiedSelectionContext } from "@itwin/unified-selection-react";
import { CircularProgress } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";

export interface TableWidgetProps {
  imodel: IModelConnection;
  rulesetId?: string;
}

export function MUIDataGridWidget(props: TableWidgetProps) {
  const { imodel, rulesetId } = props;

  if (!rulesetId) {
    return null;
  }

  return <MUIPresentationDataGrid imodel={imodel} rulesetId={rulesetId} />;
}

interface MUIPresentationDataGridProps {
  imodel: IModelConnection;
  rulesetId: string;
}

function MUIPresentationDataGrid(props: MUIPresentationDataGridProps) {
  const { imodel, rulesetId } = props;

  const unifiedSelectionContext = useUnifiedSelectionContext();
  if (!unifiedSelectionContext) {
    throw new Error("Unified selection context is not available");
  }

  const { columns, rows, isLoading } = usePresentationTableWithUnifiedSelection({
    imodel,
    ruleset: rulesetId,
    pageSize: 20,
    columnMapper: mapTableColumns,
    rowMapper: mapTableRow,
    selectionStorage: unifiedSelectionContext.storage,
  });

  if (columns === undefined || isLoading) {
    return <CircularProgress />;
  }

  return <DataGrid columns={columns} rows={rows} />;
}

function mapTableColumns(columnDefinitions: TableColumnDefinition): GridColDef {
  return {
    field: columnDefinitions.name,
    headerName: columnDefinitions.label,
    renderCell: cellRenderer,
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
  return (
    <div style={{ height: "100%", width: "100%" }}>
      <TableCellRenderer record={cellProps.value as PropertyRecord} />
    </div>
  );
}
