/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { useEffect, useState } from "react";
import { from, Subject } from "rxjs";
import { distinct } from "rxjs/internal/operators/distinct";
import { mergeMap } from "rxjs/internal/operators/mergeMap";
import { assert } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import {
  Content, KeySet, PageOptions, PresentationError, PresentationStatus, Ruleset, StartItemProps, traverseContent,
} from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { FieldHierarchyRecord, PropertyRecordsBuilder } from "../common/ContentBuilder";
import { RowDefinition } from "./Types";
import { TableOptions } from "./UseTableOptions";

export interface UseRowsProps {
  imodel: IModelConnection;
  ruleset: Ruleset | string;
  keys: KeySet;
  pageSize: number;
  options: TableOptions;
}

export interface UseRowsResult {
  isLoading: boolean;
  rows: RowDefinition[];
  loadMoreRows: () => void;
}

export function useRows(props: UseRowsProps): UseRowsResult {
  const { imodel, ruleset, keys, pageSize, options } = props;
  const [state, setState] = useState<UseRowsResult>({
    isLoading: true,
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
          setState((prev) => ({ ...prev, isLoading: true }));
          return from(loadRows(imodel, ruleset, keys, { start: pageStart, size: pageSize }, options));
        }, 1)
      )
      .subscribe({
        next: (rowDefinitions) => {
          setState(
            (prev) => ({
              isLoading: false,
              rows: [...prev.rows, ...rowDefinitions],
              loadMoreRows: () => {
                loader.next(prev.rows.length + rowDefinitions.length);
              },
            }),
          );
        },
        error: () => {
          setState((prev) => ({ ...prev, rows: [], isLoading: false }));
        },
      });

    loader.next(0);
    return () => { subscription.unsubscribe(); };
  }, [imodel, ruleset, keys, pageSize, options]);

  return state;
}

async function loadRows(imodel: IModelConnection, ruleset: Ruleset | string, keys: KeySet, paging: PageOptions, options: TableOptions): Promise<RowDefinition[]> {
  const content = await Presentation.presentation.getContent({
    imodel,
    keys,
    descriptor: {
      sorting: options.sorting,
      fieldsFilterExpression: options.fieldsFilterExpression,
    },
    rulesetOrId: ruleset,
    paging,
  });

  if (!content)
    throw new PresentationError(PresentationStatus.Error, "Failed to load table rows.");

  return createRows(content);
}

function createRows(content: Content) {
  const rowsBuilder = new RowsBuilder();
  traverseContent(rowsBuilder, content);
  return rowsBuilder.rows;
}

class RowsBuilder extends PropertyRecordsBuilder {
  private _rows: RowDefinition[] = [];
  private _currentRow: RowDefinition | undefined = undefined;

  public get rows(): RowDefinition[] {
    return this._rows;
  }

  protected createRootPropertiesAppender() {
    return {
      append: (record: FieldHierarchyRecord) => {
        if (record.fieldHierarchy.field.isNestedContentField())
          return;

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
    super.finishItem();
  }
}
