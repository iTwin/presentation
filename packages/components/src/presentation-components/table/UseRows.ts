/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Internal
 */

import { useEffect, useRef, useState } from "react";
import { EMPTY, from, mergeMap, Observable, Subject } from "rxjs";
import { assert } from "@itwin/core-bentley";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Content, DefaultContentDisplayTypes, KeySet, PageOptions, Ruleset, StartItemProps, traverseContent } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { FieldHierarchyRecord, PropertyRecordsBuilder } from "../common/ContentBuilder";
import { useErrorState } from "../common/Utils";
import { TableRowDefinition } from "./Types";
import { TableOptions } from "./UseTableOptions";

/** @internal */
export interface UseRowsProps {
  imodel: IModelConnection;
  ruleset: Ruleset | string;
  keys: Readonly<KeySet>;
  pageSize: number;
  options: TableOptions;
}

/** @internal */
export interface UseRowsResult {
  isLoading: boolean;
  rows: TableRowDefinition[];
  loadMoreRows: () => void;
}

/** @internal */
export function useRows(props: UseRowsProps): UseRowsResult {
  interface State {
    total: number;
    isLoading: boolean;
    rows: TableRowDefinition[];
  }

  const { imodel, ruleset, keys, pageSize, options } = props;
  const setErrorState = useErrorState();
  const [state, setState] = useState<State>({
    isLoading: false,
    rows: [],
    total: 0,
  });

  const loaderRef = useRef<RowsLoader>(noopRowsLoader);

  useEffect(() => {
    setState((prev) => ({ ...prev, rows: [], total: 0 }));
    const { observable, ...loader } = createRowsLoader({
      imodel,
      ruleset,
      keys,
      pageSize,
      options,
      onPageLoadStart: () => setState((prev) => ({ ...prev, isLoading: true })),
    });
    loaderRef.current = loader;

    const subscription = observable.subscribe({
      next: ({ total, rowDefinitions, offset }) => {
        setState((prev) => {
          const newRows = [...prev.rows];
          newRows.splice(offset, rowDefinitions.length, ...rowDefinitions);

          return {
            ...prev,
            isLoading: false,
            rows: newRows,
            total,
          };
        });
      },
      error: (err) => {
        setErrorState(err);
      },
    });

    loaderRef.current.loadPage(0);
    return () => {
      subscription.unsubscribe();
      loaderRef.current = noopRowsLoader;
    };
  }, [imodel, ruleset, keys, pageSize, options, setErrorState]);

  useEffect(() => {
    return IModelApp.quantityFormatter.onActiveFormattingUnitSystemChanged.addListener(() => {
      loaderRef.current.reload(state.rows.length);
    });
  }, [state.rows]);

  return {
    rows: state.rows,
    isLoading: state.isLoading,
    loadMoreRows: () => {
      if (state.rows.length === state.total) {
        return;
      }

      loaderRef.current.loadPage(state.rows.length);
    },
  };
}

interface LoadPageOptions {
  action: "load-page";
  pageStart: number;
}

interface ReloadOptions {
  action: "reload";
  loadedRowsCount: number;
}

type LoaderOptions = LoadPageOptions | ReloadOptions;

interface RowsLoaderProps {
  imodel: IModelConnection;
  ruleset: Ruleset | string;
  keys: Readonly<KeySet>;
  pageSize: number;
  options: TableOptions;
  onPageLoadStart: () => void;
}

interface RowsLoader {
  loadPage: (pageStart: number) => void;
  reload: (loadedRowsCount: number) => void;
}

function createRowsLoader({
  imodel,
  ruleset,
  keys,
  pageSize,
  options,
  onPageLoadStart,
}: RowsLoaderProps): RowsLoader & { observable: Observable<RowsLoadResult> } {
  const loaderSubject = new Subject<LoaderOptions>();
  const loaderObservable = loaderSubject.pipe(
    mergeMap((loaderOptions) => {
      if (keys.isEmpty) {
        return EMPTY;
      }

      switch (loaderOptions.action) {
        case "load-page": {
          onPageLoadStart();
          return from(loadRows(imodel, ruleset, keys, { start: loaderOptions.pageStart, size: pageSize }, options));
        }
        case "reload": {
          return loaderOptions.loadedRowsCount === 0 ? EMPTY : createReloadObs(imodel, ruleset, keys, options, loaderOptions.loadedRowsCount);
        }
      }
    }),
  );

  return {
    observable: loaderObservable,
    loadPage: (pageStart: number) => {
      loaderSubject.next({ action: "load-page", pageStart });
    },
    reload: (rowsCount: number) => {
      loaderSubject.next({ action: "reload", loadedRowsCount: rowsCount });
    },
  };
}

/** @internal */
export const ROWS_RELOAD_PAGE_SIZE = 1000;

function createReloadObs(imodel: IModelConnection, ruleset: Ruleset | string, keys: Readonly<KeySet>, options: TableOptions, loadedItemsCount: number) {
  const lastPageIndex = Math.floor(loadedItemsCount / ROWS_RELOAD_PAGE_SIZE);
  const lastPageSize = loadedItemsCount % ROWS_RELOAD_PAGE_SIZE;

  const pages: Array<Required<PageOptions>> = [];
  for (let i = 0; i <= lastPageIndex; i++) {
    pages.push({
      start: i * ROWS_RELOAD_PAGE_SIZE,
      size: i === lastPageIndex ? lastPageSize : ROWS_RELOAD_PAGE_SIZE,
    });
  }

  return from(pages).pipe(mergeMap((pageOptions) => from(loadRows(imodel, ruleset, keys, pageOptions, options))));
}

interface RowsLoadResult {
  rowDefinitions: TableRowDefinition[];
  total: number;
  offset: number;
}

async function loadRows(
  imodel: IModelConnection,
  ruleset: Ruleset | string,
  keys: Readonly<KeySet>,
  paging: Required<PageOptions>,
  options: TableOptions,
): Promise<RowsLoadResult> {
  const result = await Presentation.presentation.getContentAndSize({
    imodel,
    keys: new KeySet(keys),
    descriptor: {
      displayType: DefaultContentDisplayTypes.Grid,
      sorting: options.sorting,
      fieldsFilterExpression: options.fieldsFilterExpression,
    },
    rulesetOrId: ruleset,
    paging,
  });

  if (!result) {
    return {
      rowDefinitions: [],
      total: 0,
      offset: 0,
    };
  }

  return {
    rowDefinitions: createRows(result.content),
    total: result.size,
    offset: paging.start,
  };
}

function createRows(content: Content) {
  const rowsBuilder = new RowsBuilder();
  traverseContent(rowsBuilder, content);
  return rowsBuilder.rows;
}

class RowsBuilder extends PropertyRecordsBuilder {
  private _rows: TableRowDefinition[] = [];
  private _currentRow: TableRowDefinition | undefined = undefined;

  public get rows(): TableRowDefinition[] {
    return this._rows;
  }

  protected createRootPropertiesAppender() {
    return {
      append: (record: FieldHierarchyRecord) => {
        if (record.fieldHierarchy.field.isNestedContentField()) {
          return;
        }

        assert(this._currentRow !== undefined);
        this._currentRow.cells.push({
          key: record.fieldHierarchy.field.name,
          record: record.record,
        });
      },
    };
  }

  public override startItem(props: StartItemProps): boolean {
    const key = JSON.stringify(props.item.primaryKeys[0]);
    this._currentRow = { key, cells: [] };
    return super.startItem(props);
  }

  public override finishItem(): void {
    assert(this._currentRow !== undefined);
    this._rows.push(this._currentRow);
    this._currentRow = undefined;
    super.finishItem();
  }
}

// istanbul ignore next
const noopRowsLoader: RowsLoader = {
  loadPage: () => {},
  reload: () => {},
};
