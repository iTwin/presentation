/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Table
 */

import { useEffect, useMemo, useState } from "react";
import { IModelConnection } from "@itwin/core-frontend";
import { Key, KeySet, Ruleset } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { TableColumnDefinition, TableRowDefinition } from "./Types";
import { useColumns } from "./UseColumns";
import { useRows } from "./UseRows";
import { useTableOptions } from "./UseTableOptions";

/**
 * Props for [[usePresentationTable]] hook.
 * @beta
 */
export interface UsePresentationTableProps<TColumn, TRow> {
  /** iModel connection to pull data from. */
  imodel: IModelConnection;
  /** Ruleset or ruleset id that should be used to load data. */
  ruleset: Ruleset | string;
  /** Keys defining what to request data for. */
  keys: Readonly<KeySet>;
  /** Paging size for obtaining rows. */
  pageSize: number;
  /** Function that maps one column from generic [[TableColumnDefinition]] to table component specific type. */
  columnMapper: (columns: TableColumnDefinition) => TColumn;
  /** Function that maps one row from generic [[TableRowDefinition]] to table component specific type. */
  rowMapper: (row: TableRowDefinition) => TRow;
}

/**
 * Return type of [[usePresentationTable]] hook.
 * @beta
 */
export interface UsePresentationTableResult<TColumns, TRow> {
  /** List of table columns. If columns are not loaded yet it is set to `undefined` */
  columns: TColumns[] | undefined;
  /** List of table rows loaded. */
  rows: TRow[];
  /** Specifies whether rows loading is on going. */
  isLoading: boolean;
  /** Loads more rows if there are any available. If there are no rows available it is no-op. */
  loadMoreRows: () => void;
  /** Sorts table data by the specific column. If called with `undefined` column name sorting is removed. */
  sort: (columnName?: string, descending?: boolean) => void;
  /** Filters table data using provided ECExpression. If called with `undefined` filtering is removed. */
  filter: (filterExpression?: string) => void;
}

/**
 * Return type of [[usePresentationTableWithUnifiedSelection]] hook.
 * @beta
 */
export interface UsePresentationTableWithUnifiedSelectionResult<TColumns, TRow> extends UsePresentationTableResult<TColumns, TRow> {
  /** Specifies rows that have been selected (toggled) by other components on the appropriate selection level. */
  selectedRows: TRow[];
  /**
   * A function that should be called when a table row is selected.
   * @param selectedRowKeys Keys of selected table rows. These should match `TableRowDefinition.key` passed to `UsePresentationTableProps.rowMapper` function when new rows are loaded.
   */
  onSelect: (selectedRowKeys: string[]) => void;
}

/**
 * Custom hook that loads data for generic table component.
 * @throws on failure to get table data. The error is thrown in the React's render loop, so it can be caught using an error boundary.
 * @beta
 */
export function usePresentationTable<TColumn, TRow>(props: UsePresentationTableProps<TColumn, TRow>): UsePresentationTableResult<TColumn, TRow> {
  const { imodel, ruleset, keys, pageSize, columnMapper, rowMapper } = props;
  const columns = useColumns({ imodel, ruleset, keys });
  const { options, sort, filter } = useTableOptions({ columns });
  const { rows, isLoading, loadMoreRows } = useRows({ imodel, ruleset, keys, pageSize, options });

  return {
    columns: useMemo(() => columns?.map(columnMapper), [columns, columnMapper]),
    rows: useMemo(() => rows?.map(rowMapper), [rows, rowMapper]),
    isLoading,
    loadMoreRows,
    sort,
    filter,
  };
}

/**
 * Custom hook that load data for generic table component. It uses [Unified Selection]($docs/presentation/unified-selection/index.md) to get keys defining what to load rows for.
 *
 * **Note**: Should be used within [[UnifiedSelectionContextProvider]].
 *
 * @throws on failure to get table data. The error is thrown in the React's render loop, so it can be caught using an error boundary.
 * @beta
 */
export function usePresentationTableWithUnifiedSelection<TColumn, TRow>(
  props: Omit<UsePresentationTableProps<TColumn, TRow>, "keys">,
): UsePresentationTableWithUnifiedSelectionResult<TColumn, TRow> {
  const { imodel, ruleset, pageSize, columnMapper, rowMapper } = props;
  const [tableName] = useState(() => `UnifiedSelectionTable_${counter++}`);

  const [selectedRows, setSelectedRows] = useState<TableRowDefinition[]>();

  const keys = useUnifiedSelectionKeys(imodel);
  const columns = useColumns({ imodel, ruleset, keys });
  const { options, sort, filter } = useTableOptions({ columns });
  const { rows, isLoading, loadMoreRows } = useRows({ imodel, ruleset, keys, pageSize, options });

  useEffect(() => {
    const updateSelectedRows = () => {
      const toggledRowKeys = Presentation.selection.getSelection(imodel, 1);

      const rowsToAddToSelection: TableRowDefinition[] = [];
      toggledRowKeys?.forEach((key) => {
        // should return just one row
        const selectedRow = rows.filter((row) => row.key === JSON.stringify(key));

        if (selectedRow[0] !== undefined) {
          rowsToAddToSelection.push(selectedRow[0]);
        }
      });

      setSelectedRows(rowsToAddToSelection);
    };

    const disposeListener = Presentation.selection.selectionChange.addListener(({ imodel: selectionIModel, level }) => {
      if (selectionIModel !== imodel || level > 1) {
        return;
      }

      return level === 1 ? updateSelectedRows() : setSelectedRows([]);
    });

    updateSelectedRows();

    return disposeListener;
  }, [rows, imodel]);

  const onSelect = (selectedKeys: string[]) => {
    const parsedKeys: Key[] = [];
    for (const selectedKey of selectedKeys) {
      try {
        const parsedKey: Key = JSON.parse(selectedKey);
        if (rows.some((row) => row.key === selectedKey)) {
          parsedKeys.push(parsedKey);
        }
      } catch {
        continue;
      }
    }

    Presentation.selection.replaceSelection(tableName, props.imodel, parsedKeys, 1);
  };

  return {
    columns: useMemo(() => columns?.map(columnMapper), [columns, columnMapper]),
    rows: useMemo(() => rows.map(rowMapper), [rows, rowMapper]),
    isLoading,
    loadMoreRows,
    sort,
    filter,
    onSelect,
    selectedRows: useMemo(() => (selectedRows ?? []).map(rowMapper), [selectedRows, rowMapper]),
  };
}

function useUnifiedSelectionKeys(imodel: IModelConnection) {
  const [keys, setKeys] = useState(Presentation.selection.getSelection(imodel, 0));
  useEffect(() => {
    return Presentation.selection.selectionChange.addListener((args) => {
      if (imodel !== args.imodel) {
        return;
      }
      setKeys(Presentation.selection.getSelection(imodel, 0));
    });
  }, [imodel]);
  return keys;
}

let counter = 0;
