/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { PropertyRecord } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
import { TableCellRenderer, TableColumnDefinition, TableRowDefinition, usePresentationTableWithUnifiedSelection } from "@itwin/presentation-components";
import { useUnifiedSelectionContext } from "@itwin/unified-selection-react";
import { ProgressBar, Text } from "@stratakit/bricks";
import { Table } from "@stratakit/structures";

export interface TableWidgetProps {
  imodel: IModelConnection;
  rulesetId?: string;
}

export function StrataKitTableWidget(props: TableWidgetProps) {
  const { imodel, rulesetId } = props;

  if (!rulesetId) {
    return null;
  }

  return <StrataKitTable imodel={imodel} rulesetId={rulesetId} />;
}

interface StrataKitTableProps {
  imodel: IModelConnection;
  rulesetId: string;
}

function StrataKitTable(props: StrataKitTableProps) {
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
    return (
      <>
        <ProgressBar aria-labelledby="loadingId" />
        <Text id="loadingId" variant="body-md">
          Loading...
        </Text>
      </>
    );
  }

  return (
    <Table.CustomTable>
      <Table.Header>
        <Table.Row>
          {columns.map((column) => (
            <Table.Cell key={column.name}>{column.label}</Table.Cell>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.map((row, index) => (
          <Table.Row key={index}>
            {columns.map((column) => (
              <Table.Cell key={column.name}>{cellRenderer({ value: row[column.name] })}</Table.Cell>
            ))}
          </Table.Row>
        ))}
      </Table.Body>
    </Table.CustomTable>
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
