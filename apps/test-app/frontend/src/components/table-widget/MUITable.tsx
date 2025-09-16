/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PropertyRecord } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
import { TableCellRenderer, TableColumnDefinition, TableRowDefinition, usePresentationTableWithUnifiedSelection } from "@itwin/presentation-components";
import { useUnifiedSelectionContext } from "@itwin/unified-selection-react";
import { CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";

export interface TableWidgetProps {
  imodel: IModelConnection;
  rulesetId?: string;
}

export function MUITableWidget(props: TableWidgetProps) {
  const { imodel, rulesetId } = props;

  if (!rulesetId) {
    return null;
  }

  return <MUIPresentationTable imodel={imodel} rulesetId={rulesetId} />;
}

interface MUIPresentationTableProps {
  imodel: IModelConnection;
  rulesetId: string;
}

function MUIPresentationTable(props: MUIPresentationTableProps) {
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

  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column.name}>{column.label}</TableCell>
            ))}
          </TableRow>
        </TableHead>

        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              {columns.map((column) => (
                <TableCell key={column.name}>{cellRenderer({ value: row[column.name] })}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function mapTableColumns(columnDefinitions: TableColumnDefinition) {
  return {
    id: columnDefinitions.name,
    name: columnDefinitions.name,
    label: columnDefinitions.label,
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
