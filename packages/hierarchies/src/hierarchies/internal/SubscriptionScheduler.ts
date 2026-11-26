/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  asapScheduler,
  connectable,
  defer,
  finalize,
  mergeMap,
  observeOn,
  onErrorResumeNextWith,
  queueScheduler,
  ReplaySubject,
  Subject,
  subscribeOn,
  takeUntil,
  tap,
} from "rxjs";

import type { Connectable, Observable } from "rxjs";

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
   * Each subscription queues the source. Unsubscribing prevents it from starting or stops an active subscription.
   *
   * @param source Input observable for which to schedule a subscription.
   * @returns Hot observable which starts emitting `source` values after subscription.
   */
  public scheduleSubscription<T>(source: Observable<T>): Observable<T> {
    return defer(() => {
      // Replay cancellation if the job is still queued when the caller unsubscribes.
      const cancelled = new ReplaySubject<void>(1);
      const connectableObservable = connectable(source.pipe(takeUntil(cancelled)), {
        connector: () => new Subject<T>(),
        resetOnDisconnect: false,
      });
      this._scheduler.next(connectableObservable);
      return connectableObservable.pipe(finalize(() => cancelled.next()));
    });
  }
}
