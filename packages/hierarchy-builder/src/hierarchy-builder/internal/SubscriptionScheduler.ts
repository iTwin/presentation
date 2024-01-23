/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  asapScheduler,
  Connectable,
  connectable,
  defer,
  EMPTY,
  finalize,
  iif,
  mergeMap,
  Observable,
  observeOn,
  onErrorResumeNextWith,
  queueScheduler,
  Subject,
  subscribeOn,
  tap,
} from "rxjs";

/** @internal */
export class SubscriptionScheduler {
  private _scheduler = new Subject<Connectable<unknown>>();
  constructor(concurrency: number) {
    this._scheduler
      .pipe(
        mergeMap((sourceObservable) => {
          return sourceObservable.pipe(
            // connect source observable when scheduler subscribes
            tap({
              subscribe: () => {
                sourceObservable.connect();
              },
            }),
            // Guard against stack overflow when a lot of observables are scheduled. Without this operation `mergeMap`
            // will process each observable that is present in the pipeline recursively.
            observeOn(queueScheduler),
            // Delay the connection until another event loop task
            subscribeOn(asapScheduler),
            // Ignore errors in this pipeline without suppressing them for other subscribers
            onErrorResumeNextWith(),
          );
        }, concurrency),
      )
      // Start consuming scheduled observables
      .subscribe();
  }
  /**
   * Schedules `source` for subscription in the current scheduler.
   *
   * The actual scheduling is performed when the returned observable is subscribed to. To cancel, remove all subscribers
   * from the returned observable.
   *
   * @param source Input observable for which to schedule a subscription.
   * @returns Hot observable which starts emitting `source` values after subscription.
   */
  public scheduleSubscription<T>(source: Observable<T>): Observable<T> {
    return defer(() => {
      let unsubscribed = false;
      const connectableObservable = connectable(
        iif(() => unsubscribed, EMPTY, source),
        {
          connector: () => new Subject<T>(),
          resetOnDisconnect: false,
        },
      );
      this._scheduler.next(connectableObservable);
      return connectableObservable.pipe(
        finalize(() => {
          unsubscribed = true;
        }),
      );
    });
  }
}
