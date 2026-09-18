/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { bufferCount, concatAll, concatMap, delay, from, of } from "rxjs";
import { Id64 } from "@itwin/core-bentley";

import type { Observable } from "rxjs";
import type { Id64Arg, Id64String } from "@itwin/core-bentley";

/** @internal */
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
 * Creates an Observable from provided props. If `releaseOnCount` is provided, main thread will be released after processing specified number of items.
 * @internal
 */
export function fromWithRelease(props: { source: Id64Arg; releaseOnCount?: number }): Observable<Id64String>;
export function fromWithRelease<T>(
  props: ({ source: Set<T> | Array<T> } | { source: Iterable<T>; size: number }) & { releaseOnCount?: number },
): Observable<T>;
export function fromWithRelease(props: {
  source: Id64Arg | Set<unknown> | Array<unknown> | Iterable<unknown>;
  size?: number;
  releaseOnCount?: number;
}): Observable<unknown> {
  const source = Array.isArray(props.source)
    ? { obs: from(props.source), size: props.source.length }
    : props.source instanceof Set
      ? { obs: from(props.source), size: props.source.size }
      : typeof props.source === "string"
        ? { obs: from(Id64.iterable(props.source)), size: Id64.sizeOf(props.source) }
        : { obs: from(props.source), size: props.size! };
  if (props.releaseOnCount === undefined || source.size < props.releaseOnCount) {
    return source.obs;
  }
  return source.obs.pipe(releaseMainThreadOnItemsCount(props.releaseOnCount));
}
