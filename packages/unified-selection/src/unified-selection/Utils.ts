/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { bufferCount, concatAll, concatMap, Observable } from "rxjs";
import { ECSqlBinding, ECSqlQueryDef, ECSqlQueryExecutor, ECSqlQueryRow, MainThreadBlockHandler } from "@itwin/presentation-shared";

/**
 * Forms ECSql bindings from given ID's.
 * @internal
 */
export function formIdBindings(property: string, ids: string[], bindings: ECSqlBinding[]): string {
  if (ids.length > 1000) {
    bindings.push({ type: "idset", value: ids });
    return `InVirtualSet(?, ${property})`;
  }

  if (ids.length === 0) {
    return `FALSE`;
  }

  ids.forEach((id) => bindings.push({ type: "id", value: id }));
  return `${property} IN (${ids.map(() => "?").join(",")})`;
}

/**
 * Executes given ECSql query and extracts data from rows. Additionally handles main thread releasing.
 * @internal
 */
export async function* executeQuery<T>(
  queryExecutor: ECSqlQueryExecutor,
  query: ECSqlQueryDef,
  blockHandler: MainThreadBlockHandler,
  extractData: (row: ECSqlQueryRow) => T,
): AsyncIterableIterator<T> {
  const reader = queryExecutor.createQueryReader(query);
  for await (const row of reader) {
    yield extractData(row);
    await blockHandler.releaseMainThreadIfTimeElapsed();
  }
}

/**
 * Emits a certain amount of values, then releases the main thread for other timers to use.
 * @internal
 */
export function releaseMainThreadOnItemsCount<T>(elementCount: number) {
  return (obs: Observable<T>): Observable<T> => {
    return obs.pipe(
      bufferCount(elementCount),
      concatMap(async (x) => {
        await MainThreadBlockHandler.releaseMainThread();
        return x;
      }),
      concatAll(),
    );
  };
}
