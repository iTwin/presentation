/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { from, Observable, ObservableInput, ReplaySubject, Subscription } from "rxjs";
import { assert } from "@itwin/core-bentley";

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
  let sourceSubscription: Subscription | undefined;
  let sourceSubscriptionsCount = 0;
  function subscribeToSource() {
    if (sourceSubscriptionsCount++ > 0) {
      return;
    }
    assert(!sourceSubscription);
    sourceSubscription = from(source).subscribe({
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
  function unsubscribeFromSource() {
    assert(sourceSubscriptionsCount > 0);
    if (--sourceSubscriptionsCount === 0) {
      assert(!!sourceSubscription);
      sourceSubscription.unsubscribe();
      sourceSubscription = undefined;
    }
  }
  return [matches, nonMatches].map(
    (subject) =>
      new Observable((subscriber) => {
        const subjectSubscription = subject.subscribe(subscriber);
        subscribeToSource();
        return () => {
          subjectSubscription.unsubscribe();
          unsubscribeFromSource();
        };
      }),
  ) as [Observable<T>, Observable<T>];
}
