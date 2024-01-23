/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { OrderedId64Iterable } from "@itwin/core-bentley";
import { ECSqlReader, QueryBinder, QueryOptions, QueryOptionsBuilder, QueryRowFormat } from "@itwin/core-common";
import { Point2d, Point3d } from "@itwin/core-geometry";
import { ECSqlBinding, ECSqlQueryReader, ECSqlQueryReaderOptions, IECSqlQueryExecutor } from "@itwin/presentation-hierarchy-builder";

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
      return {
        async *[Symbol.asyncIterator]() {
          const opts = new QueryOptionsBuilder();
          switch (config?.rowFormat) {
            case "ECSqlPropertyNames":
              opts.setRowFormat(QueryRowFormat.UseECSqlPropertyNames);
              break;
            case "Indexes":
              opts.setRowFormat(QueryRowFormat.UseECSqlPropertyIndexes);
              break;
          }
          const reader = imodel.createQueryReader(ecsql, bind(bindings ?? []), opts.getOptions());
          while (await reader.step()) {
            // can't return `reader.current` in async fashion, because it may become invalid while the loop
            // continues - need to convert it to an immutable object
            yield config?.rowFormat === "Indexes" ? reader.current.toArray() : reader.current.toRow();
          }
        },
      };
    },
  };
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
