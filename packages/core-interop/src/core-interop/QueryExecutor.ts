/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { CompressedId64Set, Logger, OrderedId64Iterable } from "@itwin/core-bentley";
import { ECSqlReader, QueryBinder, QueryOptions, QueryOptionsBuilder, QueryRowFormat } from "@itwin/core-common";
import { Point2d, Point3d } from "@itwin/core-geometry";
import { ECSqlBinding, ECSqlQueryDef, ECSqlQueryExecutor, ECSqlQueryReaderOptions, ECSqlQueryRow, trimWhitespace } from "@itwin/presentation-shared";
import { QueryArgument, QueryRequest } from "@itwin/imodelread-common";

/**
 * Defines input for `createECSqlQueryExecutor`. Generally, this is an instance of either [IModelDb](https://www.itwinjs.org/reference/core-backend/imodels/imodeldb/)
 * or [IModelConnection](https://www.itwinjs.org/reference/core-frontend/imodelconnection/imodelconnection/).
 * @beta
 */
interface CoreECSqlReaderFactory {
  createQueryReader(ecsql: string, binder?: QueryBinder, options?: QueryOptions): ECSqlReader;
  runQuery?: (ecsql: QueryRequest) => AsyncIterableIterator<unknown>;
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
 * @beta
 */
export function createECSqlQueryExecutor(imodel: CoreECSqlReaderFactory): ECSqlQueryExecutor {
  return {
    createQueryReader(query: ECSqlQueryDef, config?: ECSqlQueryReaderOptions) {
      const { ctes, ecsql, bindings } = query;
      Logger.logInfo("NO-SQL", `Executing ECSQL: ${config?.rowFormat}`);
      if (imodel.runQuery !== undefined && config?.rowFormat !== "Indexes") {
        const runQuery = imodel.runQuery.bind(imodel);
        return (async function* () {
          try {
            const it = await runQuery({ query: addCTEs(ecsql, ctes), arguments: bindings === undefined ? undefined : noRpcBind(bindings) });
            for await (const row of it) {
              yield row as any;
            }
          } catch (error) {
            console.error(error);
            Logger.logError("NO-SQL", `runQuery failed, falling back to ECSqlReader: ${error}`);
            const old = createOld(imodel, query, config);
            for await (const row of old) {
              yield row;
            }
          }
        })();
      } else {
        return createOld(imodel, query, config);
      }
    },
  };
}

function createOld(imodel: CoreECSqlReaderFactory, query: ECSqlQueryDef, config?: ECSqlQueryReaderOptions) {
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
  return new ECSqlQueryReaderImpl(
    imodel.createQueryReader(trimWhitespace(addCTEs(ecsql, ctes)), bind(bindings ?? []), opts.getOptions()),
    config?.rowFormat === "Indexes" ? "array" : "object",
  );
}

class ECSqlQueryReaderImpl implements ReturnType<ECSqlQueryExecutor["createQueryReader"]> {
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

function noRpcBind(bindings: ECSqlBinding[]): QueryArgument[] {
  const bound: QueryArgument[] = [];
  bindings.forEach((b) => {
    if (b.value === undefined || b.value === null) {
      bound.push({ type: "null" });
      return;
    }
    switch (b.type) {
      case "string":
        bound.push({ type: "string", value: b.value });
        break;
      case "boolean":
        bound.push({ type: b.type, value: b.value });
        break;
      case "double":
        bound.push({ type: "double", value: b.value });
        break;
      case "long":
        bound.push({ type: "long", value: b.value });
        break;
      case "id":
        bound.push({ type: "id", value: b.value });
        break;
      case "int":
        bound.push({ type: "integer", value: b.value });
        break;
      case "idset":
        bound.push({ type: "idSet", value: CompressedId64Set.compressIds(b.value ?? []) });
        break;
      case "point2d":
        bound.push({ type: "point2d", value: b.value });
        break;
      case "point3d":
        bound.push({ type: "point3d", value: b.value });
        break;
    }
  });
  return bound;
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

function addCTEs(ecsql: string, ctes: string[] | undefined) {
  const ctesPrefix = ctes?.length ? `WITH RECURSIVE ${ctes.join(", ")} ` : "";
  return `${ctesPrefix}${ecsql}`;
}
