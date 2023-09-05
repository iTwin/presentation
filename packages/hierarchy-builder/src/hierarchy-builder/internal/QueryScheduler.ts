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
  onErrorResumeNext,
  queueScheduler,
  Subject,
  subscribeOn,
} from "rxjs";

const QUERY_CONCURRENCY = 10;

/** @internal */
export class QueryScheduler<T> {
  private _scheduler = new Subject<Connectable<T>>();
  constructor() {
    this._scheduler
      .pipe(
        mergeMap((sourceObservable) => {
          // Connect the observable
          sourceObservable.connect();
          return sourceObservable.pipe(
            // Guard against stack overflow when a lot of observables are scheduled. Without this operation `mergeMap`
            // will process each observable that is present in the pipeline recursively.
            observeOn(queueScheduler),
            // Delay the connection until another event loop task
            subscribeOn(asapScheduler),
            // Ignore errors in this pipeline without suppressing them for other subscribers
            onErrorResumeNext,
          );
        }, QUERY_CONCURRENCY),
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
  public scheduleSubscription(source: Observable<T>): Observable<T> {
    return defer(() => {
      let unsubscribed = false;
      const connectableObservable = connectable(iif(() => unsubscribed, EMPTY, source));
      this._scheduler.next(connectableObservable);
      return connectableObservable.pipe(
        finalize(() => {
          unsubscribed = true;
        }),
      );
    });
  }
}
