/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { IModelConnection } from "@itwin/core-frontend";
import { KeySet, Ruleset } from "@itwin/presentation-common";
import { useMemo } from "react";
import { useUnifiedSelectionContext } from "../unified-selection/UnifiedSelectionContext";
import { ColumnDefinition, RowDefinition } from "./Types";
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
  keys: KeySet;
  /** Paging size for obtaining rows. */
  pageSize: number;
  /** Function that maps one column from generic [[ColumnDefinition]] to table component specific type. */
  columnMapper: (columns: ColumnDefinition) => TColumn;
  /** Function that maps one row from generic [[RowDefinition]] to table component specific type. */
  rowMapper: (row: RowDefinition) => TRow;
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
 * Custom hook that loads data for generic table component.
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
 * Custom hook that load data for generic table component. It uses UnifiedSelection to get keys of defining what to load rows for.
 * @beta
 */
export function useUnifiedSelectionPresentationTable<TColumn, TRow>(props: Omit<UsePresentationTableProps<TColumn, TRow>, "keys">): UsePresentationTableResult<TColumn, TRow> {
  const unifiedSelection = useUnifiedSelectionContext();
  const keys = useMemo(() => unifiedSelection ? new KeySet(unifiedSelection.getSelection(0)) : new KeySet(), [unifiedSelection]);
  return usePresentationTable({ ...props, keys });
}
