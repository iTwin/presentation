/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { OrderedId64Iterable } from "@itwin/core-bentley";
import { ECSqlReader, QueryBinder, QueryOptions, QueryOptionsBuilder, QueryRowFormat } from "@itwin/core-common";
import { Point2d, Point3d } from "@itwin/core-geometry";
import { ECSqlBinding, ECSqlQueryReader, ECSqlQueryReaderOptions, ECSqlQueryRow, IECSqlQueryExecutor } from "@itwin/presentation-hierarchy-builder";

/**
 * An interface for something that knows how to create an `ECSqlReader`. Generally, this represents either [IModelDb]($core-backend)
 * or [IModelConnection]($core-frontend).
 *
 * @beta
 */
export interface ICoreECSqlReaderFactory {
  createQueryReader(ecsql: string, binder?: QueryBinder, options?: QueryOptions): ECSqlReader;
}

/**
 * Create an `IECSqlQueryExecutor` using given `ICoreECSqlReaderFactory`, which, generally, is either [IModelDb]($core-backend)
 * or [IModelConnection]($core-frontend).
 *
 * @beta
 */
export function createECSqlQueryExecutor(imodel: ICoreECSqlReaderFactory): IECSqlQueryExecutor {
  return {
    createQueryReader(ecsql: string, bindings?: ECSqlBinding[], config?: ECSqlQueryReaderOptions): ECSqlQueryReader {
      const opts = new QueryOptionsBuilder();
      switch (config?.rowFormat) {
        case "ECSqlPropertyNames":
          opts.setRowFormat(QueryRowFormat.UseECSqlPropertyNames);
          break;
        case "Indexes":
          opts.setRowFormat(QueryRowFormat.UseECSqlPropertyIndexes);
          break;
      }
      return new ECSqlQueryReaderImpl(
        imodel.createQueryReader(ecsql, bind(bindings ?? []), opts.getOptions()),
        config?.rowFormat === "Indexes" ? "array" : "object",
      );
    },
  };
}

class ECSqlQueryReaderImpl implements ECSqlQueryReader {
  public constructor(
    private _coreReader: ECSqlReader,
    private _format: "array" | "object",
  ) {}
  public [Symbol.asyncIterator](): AsyncIterableIterator<ECSqlQueryRow> {
    return this;
  }
  public async next(): Promise<IteratorResult<ECSqlQueryRow>> {
    const res = await this._coreReader.next();
    if (res.done) {
      return { done: true, value: undefined };
    }
    return {
      done: false,
      value: this._format === "array" ? res.value.toArray() : res.value.toRow(),
    };
  }
}

function bind(bindings: ECSqlBinding[]): QueryBinder {
  const binder = new QueryBinder();
  bindings.forEach((b, i) => {
    if (b.value === undefined) {
      binder.bindNull(i + 1);
      return;
    }
    switch (b.type) {
      case "boolean":
        binder.bindBoolean(i + 1, b.value);
        break;
      case "double":
        binder.bindDouble(i + 1, b.value);
        break;
      case "id":
        binder.bindId(i + 1, b.value);
        break;
      case "idset":
        binder.bindIdSet(i + 1, OrderedId64Iterable.sortArray(b.value));
        break;
      case "int":
        binder.bindInt(i + 1, b.value);
        break;
      case "long":
        binder.bindLong(i + 1, b.value);
        break;
      case "point2d":
        binder.bindPoint2d(i + 1, Point2d.fromJSON(b.value));
        break;
      case "point3d":
        binder.bindPoint3d(i + 1, Point3d.fromJSON(b.value));
        break;
      case "string":
        binder.bindString(i + 1, b.value);
        break;
    }
  });
  return binder;
}
