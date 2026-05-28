/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Guid, OrderedId64Iterable } from "@itwin/core-bentley";
import { QueryBinder, QueryOptionsBuilder, QueryRowFormat } from "@itwin/core-common";
import { Point2d, Point3d } from "@itwin/core-geometry";
import { trimWhitespace } from "@itwin/presentation-shared";

import type { QueryOptions, QueryRowProxy } from "@itwin/core-common";
import type {
  ECSqlBinding,
  ECSqlQueryDef,
  ECSqlQueryExecutor,
  ECSqlQueryReaderOptions,
  ECSqlQueryRow,
} from "@itwin/presentation-shared";

export const QUERY_CANCEL_DELAY_MS = 100;

/**
 * Defines input for `createECSqlQueryExecutor`. Generally, this is an instance of either [IModelDb](https://www.itwinjs.org/reference/core-backend/imodels/imodeldb/)
 * or [IModelConnection](https://www.itwinjs.org/reference/core-frontend/imodelconnection/imodelconnection/).
 * @public
 */
interface CoreECSqlReaderFactory {
  createQueryReader(ecsql: string, binder?: QueryBinder, options?: QueryOptions): AsyncIterableIterator<QueryRowProxy>;
}

/**
 * Creates an `ECSqlQueryExecutor` from either [IModelDb](https://www.itwinjs.org/reference/core-backend/imodels/imodeldb/) or
 * [IModelConnection](https://www.itwinjs.org/reference/core-frontend/imodelconnection/imodelconnection/).
 *
 * Usage example:
 *
 * ```ts
 * import { IModelDb } from "@itwin/core-backend";
 * import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
 *
 * const imodel: IModelDb = getIModelDb();
 * const executor = createECSqlQueryExecutor(imodel);
 * for await (const row of executor.createQueryReader(MY_QUERY)) {
 *   // TODO: do something with `row`
 * }
 * ```
 *
 * @public
 */
export function createECSqlQueryExecutor(imodel: CoreECSqlReaderFactory): ECSqlQueryExecutor {
  return {
    createQueryReader(query: ECSqlQueryDef, config?: ECSqlQueryReaderOptions) {
      const { ctes, ecsql, bindings } = query;
      const opts = new QueryOptionsBuilder();
      switch (config?.rowFormat) {
        case "ECSqlPropertyNames":
          opts.setRowFormat(QueryRowFormat.UseECSqlPropertyNames);
          break;
        case "Indexes":
          opts.setRowFormat(QueryRowFormat.UseECSqlPropertyIndexes);
          break;
      }
      const restartToken = config?.restartToken ?? Guid.createValue();
      opts.setRestartToken(restartToken);
      const onCancel = () => {
        try {
          const cancelReader = imodel.createQueryReader(
            "SELECT 1",
            undefined,
            new QueryOptionsBuilder().setRestartToken(restartToken).getOptions(),
          );
          void (async () => {
            try {
              for await (const _ of cancelReader) {
                /* drain */
              }
            } catch {
              /* expected */
            }
          })();
        } catch {
          /* ignore */
        }
      };
      return new ECSqlQueryReaderImpl(
        imodel.createQueryReader(
          trimWhitespace(addCTEs(ecsql, ctes)),
          bindings ? bind(bindings) : undefined,
          opts.getOptions(),
        ),
        config?.rowFormat === "Indexes" ? "array" : "object",
        onCancel,
      );
    },
  };
}

class ECSqlQueryReaderImpl implements ReturnType<ECSqlQueryExecutor["createQueryReader"]> {
  private _cancelTimer: ReturnType<typeof setTimeout> | undefined;

  public constructor(
    private _coreReader: AsyncIterableIterator<QueryRowProxy>,
    private _format: "array" | "object",
    private _onCancel: () => void,
  ) {}

  public [Symbol.asyncIterator](): AsyncIterableIterator<ECSqlQueryRow> {
    return this;
  }

  public async next(): Promise<IteratorResult<ECSqlQueryRow>> {
    const res = await this._coreReader.next();
    if (res.done) {
      if (this._cancelTimer) {
        clearTimeout(this._cancelTimer);
        this._cancelTimer = undefined;
      }
      return { done: true, value: undefined };
    }
    return { done: false, value: this._format === "array" ? res.value.toArray() : res.value.toRow() };
  }

  public async return(): Promise<IteratorResult<ECSqlQueryRow>> {
    if (this._coreReader.return) {
      await this._coreReader.return();
    } else {
      this._cancelTimer = setTimeout(() => this._onCancel(), QUERY_CANCEL_DELAY_MS);
    }
    return { done: true, value: undefined };
  }
}

function bind(bindings: ECSqlBinding[] | Record<string, ECSqlBinding>): QueryBinder {
  const binder = new QueryBinder();
  const entries: Array<[string | number, ECSqlBinding]> = Array.isArray(bindings)
    ? bindings.map((b, i) => [i + 1, b])
    : Object.entries(bindings);
  for (const [key, b] of entries) {
    if (b.value === undefined) {
      binder.bindNull(key);
      continue;
    }
    switch (b.type) {
      case "boolean":
        binder.bindBoolean(key, b.value);
        break;
      case "double":
        binder.bindDouble(key, b.value);
        break;
      case "id":
        binder.bindId(key, b.value);
        break;
      case "idset":
        binder.bindIdSet(key, OrderedId64Iterable.sortArray(b.value));
        break;
      case "int":
        binder.bindInt(key, b.value);
        break;
      case "long":
        binder.bindLong(key, b.value);
        break;
      case "point2d":
        binder.bindPoint2d(key, Point2d.fromJSON(b.value));
        break;
      case "point3d":
        binder.bindPoint3d(key, Point3d.fromJSON(b.value));
        break;
      case "string":
        binder.bindString(key, b.value);
        break;
    }
  }
  return binder;
}

function addCTEs(ecsql: string, ctes: string[] | undefined) {
  const ctesPrefix = ctes?.length ? `WITH RECURSIVE ${ctes.join(", ")} ` : "";
  return `${ctesPrefix}${ecsql}`;
}
