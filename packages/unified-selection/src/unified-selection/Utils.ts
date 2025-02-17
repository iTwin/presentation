/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./DisposePolyfill.js";
import { bufferCount, concatAll, concatMap, delay, Observable, of } from "rxjs";
import { createMainThreadReleaseOnTimePassedHandler, ECSqlBinding, ECSqlQueryDef, ECSqlQueryExecutor, ECSqlQueryRow } from "@itwin/presentation-shared";

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
export async function* genericExecuteQuery<T>(
  queryExecutor: ECSqlQueryExecutor,
  query: ECSqlQueryDef,
  parseQueryRow: (row: ECSqlQueryRow) => T,
): AsyncIterableIterator<T> {
  const releaseMainThread = createMainThreadReleaseOnTimePassedHandler();
  const reader = queryExecutor.createQueryReader(query);
  for await (const row of reader) {
    yield parseQueryRow(row);
    await releaseMainThread();
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
      concatMap((buff, i) => {
        const out = of(buff);
        if (i === 0 && buff.length < elementCount) {
          return out;
        }
        return out.pipe(delay(0));
      }),
      concatAll(),
    );
  };
}

/**
 * A helper that disposes the given object, if it's disposable.
 *
 * The first option is to dispose using the deprecated `dispose` method if it exists on the object.
 * If not, we use the new `Symbol.dispose` method. If that doesn't exist either, the object is
 * considered as non-disposable and nothing is done with it.
 *
 * @internal
 */
export function safeDispose(disposable: {} | { [Symbol.dispose]: () => void } | { dispose: () => void }) {
  if ("dispose" in disposable) {
    disposable.dispose();
  } else if (Symbol.dispose in disposable) {
    disposable[Symbol.dispose]();
  }
}
