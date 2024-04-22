/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, Observable, ObservableInput, ReplaySubject } from "rxjs";

/** @internal */
export function partition<T, U extends T>(source: ObservableInput<T>, predicate: (value: T) => value is U): [Observable<U>, Observable<Exclude<T, U>>];
/** @internal */
export function partition<T>(source: ObservableInput<T>, predicate: (value: T) => boolean): [Observable<T>, Observable<T>];

/**
 * This is similar to `rxjs` `partition` operator, but it subscribes to source observable only once.
 * @internal
 */
export function partition<T>(source: ObservableInput<T>, predicate: (value: T) => boolean): [Observable<T>, Observable<T>] {
  const matches = new ReplaySubject<T>();
  const nonMatches = new ReplaySubject<T>();
  let didSubscribe = false;
  function subscribe() {
    if (didSubscribe) {
      return;
    }
    didSubscribe = true;
    from(source).subscribe({
      next(value) {
        if (predicate(value)) {
          matches.next(value);
        } else {
          nonMatches.next(value);
        }
      },
      error(error) {
        matches.error(error);
        nonMatches.error(error);
      },
      complete() {
        matches.complete();
        nonMatches.complete();
      },
    });
  }
  return [matches, nonMatches].map(
    (subject) =>
      new Observable((subscriber) => {
        const subscription = subject.subscribe(subscriber);
        subscribe();
        return subscription;
      }),
  ) as [Observable<T>, Observable<T>];
}
