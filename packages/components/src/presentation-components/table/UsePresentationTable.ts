/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Table
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { debounceTime, EMPTY, from, map, mergeMap, of, Subject, switchMap, tap } from "rxjs";
import { BeEvent, Guid } from "@itwin/core-bentley";
import { Key, KeySet, NodeKey } from "@itwin/presentation-common";
import { createIModelKey } from "@itwin/presentation-core-interop";
import { Presentation } from "@itwin/presentation-frontend";
import { parseFullClassName } from "@itwin/presentation-shared";
import { Selectables } from "@itwin/unified-selection";
import { useColumns } from "./UseColumns.js";
import { useRows } from "./UseRows.js";
import { useTableOptions } from "./UseTableOptions.js";

import type { Observable } from "rxjs";
import type { IModelConnection } from "@itwin/core-frontend";
import type { Ruleset } from "@itwin/presentation-common";
import type { SelectableInstanceKey, SelectionStorage } from "@itwin/unified-selection";
import type { TableColumnDefinition, TableRowDefinition } from "./Types.js";

/**
 * Props for [[usePresentationTable]] hook.
 * @public
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
 * @public
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
 * @throws on failure to get table data. The error is thrown in the React's render loop, so it can be caught using an error boundary.
 * @public
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
 * Props for [[usePresentationTableWithUnifiedSelection]] hook.
 * @public
 */
export interface UsePresentationTableWithUnifiedSelectionProps<TColumn, TRow> extends Omit<UsePresentationTableProps<TColumn, TRow>, "keys"> {
  /**
   * Unified selection storage to use for listening, getting and changing active selection.
   *
   * When not specified, the deprecated `SelectionManager` from `@itwin/presentation-frontend` package
   * is used.
   */
  selectionStorage?: SelectionStorage;
}

/**
 * Return type of [[usePresentationTableWithUnifiedSelection]] hook.
 * @public
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
 * Custom hook that load data for generic table component. It uses [Unified Selection]($docs/presentation/unified-selection/index.md) to get keys defining what to load rows for.
 *
 * @throws on failure to get table data. The error is thrown in the React's render loop, so it can be caught using an error boundary.
 * @public
 */
export function usePresentationTableWithUnifiedSelection<TColumn, TRow>(
  props: UsePresentationTableWithUnifiedSelectionProps<TColumn, TRow>,
): UsePresentationTableWithUnifiedSelectionResult<TColumn, TRow> {
  const { imodel, ruleset, pageSize, columnMapper, rowMapper, selectionStorage } = props;
  const [tableName] = useState(() => `UnifiedSelectionTable_${Guid.createValue()}`);
  const [selectedRows, setSelectedRows] = useState<TableRowDefinition[]>();

  const {
    keys: { keys, isLoading: isLoadingKeys },
    getSelection,
    replaceSelection,
    selectionChange,
  } = useSelectionHandler({ imodel, selectionStorage, tableName });

  const columns = useColumns({ imodel, ruleset, keys });
  const { options, sort, filter } = useTableOptions({ columns });
  const { rows, isLoading: isLoadingRows, loadMoreRows } = useRows({ imodel, ruleset, keys, pageSize, options });

  useEffect(() => {
    const updateSelectedRows = new Subject<number>();
    const subscription = updateSelectedRows
      .pipe(
        mergeMap((level): Observable<TableRowDefinition[]> => {
          if (level > 1) {
            // ignore all selection changes with level > 1
            return EMPTY;
          }
          if (level === 0) {
            // selection at level 0 defines what the table shows, so just clear the selection
            return of([]);
          }
          return from(getSelection({ level: 1 })).pipe(
            debounceTime(0),
            map((selectedKeys) => {
              const rowsToAddToSelection: TableRowDefinition[] = [];
              selectedKeys.forEach((selectable) => {
                const selectedRow = rows.find((row) => {
                  // table content is built using the legacy Presentation library, where full class name format is
                  // "schema:class". In the unified selection library, the format is "schema.class".
                  const { schemaName, className } = parseFullClassName(selectable.className);
                  return row.key === JSON.stringify({ className: `${schemaName}:${className}`, id: selectable.id });
                });
                if (selectedRow !== undefined) {
                  rowsToAddToSelection.push(selectedRow);
                }
              });
              return rowsToAddToSelection;
            }),
          );
        }),
      )
      .subscribe({
        next: (rowsToSelect: TableRowDefinition[]) => {
          setSelectedRows(rowsToSelect);
        },
      });
    updateSelectedRows.next(1);
    const removeListener = selectionChange.addListener((level) => updateSelectedRows.next(level));
    return () => {
      subscription.unsubscribe();
      removeListener();
    };
  }, [rows, imodel, selectionChange, getSelection]);

  const onSelect = (selectedRowKeys: string[]) => {
    const selectables: SelectableInstanceKey[] = [];
    for (const selectedRowKey of selectedRowKeys) {
      if (!rows.find((row) => row.key === selectedRowKey)) {
        continue;
      }
      const selectableKey = JSON.parse(selectedRowKey);
      selectables.push(selectableKey);
    }
    replaceSelection({ source: tableName, selectables, level: 1 });
  };

  return {
    columns: useMemo(() => columns?.map(columnMapper), [columns, columnMapper]),
    rows: useMemo(() => rows.map(rowMapper), [rows, rowMapper]),
    isLoading: !columns || isLoadingRows || isLoadingKeys,
    loadMoreRows,
    sort,
    filter,
    onSelect,
    selectedRows: useMemo(() => (selectedRows ?? []).map(rowMapper), [selectedRows, rowMapper]),
  };
}

function useSelectionHandler({ imodel, selectionStorage, tableName }: { imodel: IModelConnection; selectionStorage?: SelectionStorage; tableName: string }) {
  const [selectionChange] = useState(() => new BeEvent<(level: number) => void>());
  useEffect(() => {
    if (selectionStorage) {
      return selectionStorage.selectionChangeEvent.addListener((args) => {
        if (args.imodelKey === createIModelKey(imodel) && args.source !== tableName) {
          selectionChange.raiseEvent(args.level);
        }
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return Presentation.selection.selectionChange.addListener((args) => {
      if (imodel === args.imodel && args.source !== tableName) {
        selectionChange.raiseEvent(args.level);
      }
    });
  }, [imodel, selectionStorage, tableName, selectionChange]);

  const getSelection = useCallback(
    async (args: { level: number }): Promise<SelectableInstanceKey[]> => {
      return selectionStorage
        ? loadInstanceKeysFromSelectables(selectionStorage.getSelection({ imodelKey: createIModelKey(imodel), level: args.level }))
        : // eslint-disable-next-line @typescript-eslint/no-deprecated
          loadInstanceKeysFromKeySet(Presentation.selection.getSelection(imodel, args.level));
    },
    [imodel, selectionStorage],
  );

  const getSelectionKeySet = useCallback(
    async (args: { level: number }): Promise<KeySet> => {
      return selectionStorage
        ? new KeySet(await loadInstanceKeysFromSelectables(selectionStorage.getSelection({ imodelKey: createIModelKey(imodel), level: args.level })))
        : // eslint-disable-next-line @typescript-eslint/no-deprecated
          new KeySet(Presentation.selection.getSelection(imodel, args.level));
    },
    [imodel, selectionStorage],
  );

  const replaceSelection = useCallback(
    (args: { source: string; level: number; selectables: SelectableInstanceKey[] }) => {
      return selectionStorage
        ? selectionStorage.replaceSelection({
            imodelKey: createIModelKey(imodel),
            source: args.source,
            level: args.level,
            selectables: args.selectables,
          })
        : // eslint-disable-next-line @typescript-eslint/no-deprecated
          Presentation.selection.replaceSelection(args.source, imodel, args.selectables, args.level);
    },
    [imodel, selectionStorage],
  );

  const keys = useUnifiedSelectionKeys({ getSelection: getSelectionKeySet, selectionChange });

  return {
    keys,
    getSelection,
    replaceSelection,
    selectionChange,
  };
}

async function loadInstanceKeysFromSelectables(selectables: Selectables) {
  const keys: SelectableInstanceKey[] = [];
  for await (const selectable of Selectables.load(selectables)) {
    keys.push(selectable);
  }
  return keys;
}

async function loadInstanceKeysFromKeySet(keySet: Readonly<KeySet>) {
  const keys: SelectableInstanceKey[] = [];
  keySet.forEach((key) => {
    if (Key.isInstanceKey(key)) {
      keys.push(key);
      /* c8 ignore start */
      // eslint-disable-next-line @typescript-eslint/no-deprecated
    } else if (NodeKey.isInstancesNodeKey(key)) {
      keys.push(...key.instanceKeys);
    }
    /* c8 ignore end */
  });
  return keys;
}

function useUnifiedSelectionKeys({
  getSelection,
  selectionChange,
}: {
  getSelection: (args: { level: number }) => Promise<KeySet>;
  selectionChange: BeEvent<(level: number) => void>;
}) {
  const [state, setState] = useState(() => ({ isLoading: false, keys: new KeySet() }));
  useEffect(() => {
    const update = new Subject<void>();
    const subscription = update
      .pipe(
        tap(() => setState((prev) => ({ ...prev, isLoading: true }))),
        switchMap(async () => getSelection({ level: 0 })),
      )
      .subscribe({
        next: (newKeys) => {
          setState({ isLoading: false, keys: newKeys });
        },
      });
    update.next();
    const removeListener = selectionChange.addListener(() => update.next());
    return () => {
      subscription.unsubscribe();
      removeListener();
    };
  }, [getSelection, selectionChange]);
  return state;
}
