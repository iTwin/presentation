/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from "react";
import { EMPTY, from, Subject } from "rxjs";
import { distinct } from "rxjs/internal/operators/distinct";
import { mergeMap } from "rxjs/internal/operators/mergeMap";
import { assert } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import {
  Content,
  DefaultContentDisplayTypes,
  KeySet,
  PageOptions,
  PresentationError,
  PresentationStatus,
  Ruleset,
  StartItemProps,
  traverseContent,
} from "@itwin/presentation-common";
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
  const { imodel, ruleset, keys, pageSize, options } = props;
  const setErrorState = useErrorState();
  const [state, setState] = useState<UseRowsResult>({
    isLoading: false,
    rows: [],
    loadMoreRows: /* istanbul ignore next*/ () => {},
  });

  useEffect(() => {
    setState((prev) => ({ ...prev, rows: [] }));

    const loader = new Subject<number>();
    const subscription = loader
      .pipe(
        distinct(),
        mergeMap((pageStart) => {
          if (keys.isEmpty) {
            return EMPTY;
          }
          setState((prev) => ({ ...prev, isLoading: true }));
          return from(loadRows(imodel, ruleset, keys, { start: pageStart, size: pageSize }, options));
        }, 1),
      )
      .subscribe({
        next: (loadedRows) => {
          setState((prev) => ({
            isLoading: false,
            rows: [...prev.rows, ...loadedRows.rowDefinitions],
            loadMoreRows: () => {
              const pageStart = prev.rows.length + loadedRows.rowDefinitions.length;
              if (pageStart >= loadedRows.total) {
                return;
              }
              loader.next(pageStart);
            },
          }));
        },
        error: (err) => {
          setErrorState(err);
          setState((prev) => ({ ...prev, rows: [], isLoading: false }));
        },
      });

    loader.next(0);
    return () => {
      subscription.unsubscribe();
    };
  }, [imodel, ruleset, keys, pageSize, options, setErrorState]);

  return state;
}

async function loadRows(imodel: IModelConnection, ruleset: Ruleset | string, keys: Readonly<KeySet>, paging: PageOptions, options: TableOptions) {
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
    throw new PresentationError(PresentationStatus.Error, "Failed to load table rows.");
  }

  return {
    rowDefinitions: createRows(result.content),
    total: result.size,
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
