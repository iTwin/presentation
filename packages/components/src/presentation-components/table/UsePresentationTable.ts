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
import { useUnifiedSelectionContext } from "../unified-selection/UnifiedSelectionContext";
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

  imodel: IModelConnection;
}

/**
 * Return type of [[usePresentationTable]] hook.
 * @beta
 */
export interface UseUnifiedPresentationTableResult<TColumns, TRow> {
  /** List of table columns. If columns are not loaded yet it is set to `undefined` */
  columns: TColumns[] | undefined;
  /** List of table rows loaded. */
  rows: TRow[];
  /** Specifies whether rows loading is on going. */
  isLoading: boolean;
  /** Specifies whether rows loading is on going. */
  selectedRows: TableRowDefinition[];
  /** Loads more rows if there are any available. If there are no rows available it is no-op. */
  loadMoreRows: () => void;
  /** Sorts table data by the specific column. If called with `undefined` column name sorting is removed. */
  sort: (columnName?: string, descending?: boolean) => void;
  /** Filters table data using provided ECExpression. If called with `undefined` filtering is removed. */
  filter: (filterExpression?: string) => void;
  /** Filters table data using provided ECExpression. If called with `undefined` filtering is removed. */
  onSelect: (selectedData: string[]) => void;
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
    imodel,
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
): UseUnifiedPresentationTableResult<TColumn, TRow> {
  const unifiedSelection = useUnifiedSelectionContext();
  const keys = unifiedSelection?.getSelection() ?? emptyKeySet;
  const [selectedRows, setSelectedRows] = useState<TableRowDefinition[]>();

  const { imodel, ruleset, pageSize } = props;
  const columns = useColumns({ imodel, ruleset, keys });
  const { options } = useTableOptions({ columns });
  const { rows } = useRows({ imodel, ruleset, keys, pageSize, options });

  const guid: string = useMemo(() => crypto.randomUUID(), []);
  useEffect(() => {
    const disposeListener = Presentation.selection.selectionChange.addListener((x) => {
      if (x.source !== guid) {
        if (unifiedSelection?.selectionLevel === undefined) {
          return;
        }

        if (x.level === unifiedSelection?.selectionLevel + 1) {
          const rowsToAddToSelection: TableRowDefinition[] = [];
          x.keys.forEach((key) => {
            // should return just on row
            const selectedRow = rows.filter((row) => row.key === JSON.stringify(key));
            rowsToAddToSelection.push(selectedRow[0]);
          });

          setSelectedRows(rowsToAddToSelection);
        }
      }
    });

    return () => {
      disposeListener();
    };
  }, [guid, rows, unifiedSelection?.selectionLevel]);
  const presentationTable = usePresentationTable({ ...props, keys });

  const onSelect = (selectedData: string[]) => {
    const parsedKeys: Key[] = [];
    for (const passedData of selectedData) {
      try {
        const parsedKey: Key = JSON.parse(passedData);
        parsedKeys.push(parsedKey);
      } catch {
        // possibly log?
        continue;
      }
    }
    Presentation.selection.replaceSelection(guid, imodel, parsedKeys, (unifiedSelection?.selectionLevel ?? 0) + 1);
  };

  return {
    ...presentationTable,
    onSelect,
    selectedRows: selectedRows ?? [],
  };
}

const emptyKeySet = new KeySet();
