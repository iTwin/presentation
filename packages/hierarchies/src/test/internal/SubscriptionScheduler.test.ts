/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ResolvablePromise } from "presentation-test-utilities";
import {
  asapScheduler,
  asyncScheduler,
  defer,
  from,
  Observable,
  ObservableInput,
  queueScheduler,
  scheduled,
  SchedulerLike,
  Subscription,
  throwError,
} from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubscriptionScheduler } from "../../hierarchies/internal/SubscriptionScheduler.js";

describe("SubscriptionScheduler", () => {
  const concurrentSubscriptions = 3;
  let subscriptionScheduler: SubscriptionScheduler;

  beforeEach(() => {
    subscriptionScheduler = new SubscriptionScheduler(concurrentSubscriptions);
  });

  describe("scheduleSubscription", () => {
    // Affects when input observables emit values to `SubscriptionScheduler`.
    const schedulers: Array<[string, undefined | SchedulerLike]> = [
      ["no", undefined],
      ["queue", queueScheduler],
      ["asap", asapScheduler],
      ["async", asyncScheduler],
    ];

    for (const [schedulerName, scheduler] of schedulers) {
      const sequence = [0, 1, 2];

      describe(`with ${schedulerName} scheduler`, () => {
        it("schedules source observable and subscribes to it", async () => {
          const source = createScheduledObservable(sequence, scheduler);
          const subscriptionSpy = vi.spyOn(source, "subscribe");
          await expectSequence(sequence, subscriptionScheduler.scheduleSubscription(source));
          expect(subscriptionSpy).toHaveBeenCalledOnce();
        });

        it("schedules source observables in subscription order", async () => {
          const firstSource = createScheduledObservable(sequence, scheduler);
          const firstSubscriptionSpy = vi.spyOn(firstSource, "subscribe");
          const firstScheduledObservable = subscriptionScheduler.scheduleSubscription(firstSource);

          const secondSource = createScheduledObservable(sequence, scheduler);
          const secondSubscriptionSpy = vi.spyOn(secondSource, "subscribe");
          const secondScheduledObservable = subscriptionScheduler.scheduleSubscription(secondSource);

          expect(firstSubscriptionSpy).not.toHaveBeenCalled();
          expect(secondSubscriptionSpy).not.toHaveBeenCalled();

          const secondObservableSubscription = secondScheduledObservable.subscribe();
          const firstObservableSubscription = firstScheduledObservable.subscribe();

          await waitForUnsubscription(secondObservableSubscription);
          await waitForUnsubscription(firstObservableSubscription);
          expect(secondSubscriptionSpy.mock.invocationCallOrder[0]).toBeLessThan(firstSubscriptionSpy.mock.invocationCallOrder[0]);
          expect(firstSubscriptionSpy).toHaveBeenCalledOnce();
          expect(secondSubscriptionSpy).toHaveBeenCalledOnce();
        });

        it("reschedules the same observable source after it has been completed", async () => {
          const source = createScheduledObservable(sequence, scheduler);
          const subscriptionSpy = vi.spyOn(source, "subscribe");

          const firstScheduledObservable = subscriptionScheduler.scheduleSubscription(source);
          await waitForUnsubscription(firstScheduledObservable.subscribe());

          const secondScheduledObservable = subscriptionScheduler.scheduleSubscription(source);
          await waitForUnsubscription(secondScheduledObservable.subscribe());

          expect(subscriptionSpy).toHaveBeenCalledTimes(2);
        });

        it("does not subscribe to the next observable until the started ones are resolved", async () => {
          const initialPromises = Array.from({ length: concurrentSubscriptions + 1 }).map(() => new ResolvablePromise<number>());
          const initialSources = initialPromises.map((p) => createScheduledObservable(p, scheduler));
          const initialSubscriptions = initialSources.map((initialSource) => subscriptionScheduler.scheduleSubscription(initialSource).subscribe());

          const checkSource = createScheduledObservable(sequence, scheduler);
          const checkSourceSpy = vi.spyOn(checkSource, "subscribe");
          subscriptionScheduler.scheduleSubscription(checkSource).subscribe();

          expect(checkSourceSpy).not.toHaveBeenCalled();

          await initialPromises[0].resolve(0);
          await waitForUnsubscription(initialSubscriptions[0]);
          expect(checkSourceSpy).not.toHaveBeenCalled();

          await initialPromises[1].resolve(1);
          await waitForUnsubscription(initialSubscriptions[1]);
          expect(checkSourceSpy).toHaveBeenCalledOnce();

          for (let i = 2; i < initialPromises.length; ++i) {
            await initialPromises[i].resolve(i);
            await waitForUnsubscription(initialSubscriptions[i]);
          }
          expect(checkSourceSpy).toHaveBeenCalledOnce();
        });

        it("notifies subscribers about error in source observable", async () => {
          const error = new Error("TestError");
          const source = createScheduledObservable(
            throwError(() => error),
            scheduler,
          );
          const errorSpy = vi.fn();

          const scheduledObservable = subscriptionScheduler.scheduleSubscription(source);
          await waitForUnsubscription(scheduledObservable.subscribe({ error: errorSpy }));

          expect(errorSpy).toHaveBeenCalledExactlyOnceWith(error);
        });

        it("schedules the following observable when the previous one emits error", async () => {
          const error = new Error("TestError");
          const firstSource = createScheduledObservable(
            throwError(() => error),
            scheduler,
          );
          const secondSource = createScheduledObservable(sequence, scheduler);

          const errorSpy = vi.fn();
          const firstSubscription = subscriptionScheduler.scheduleSubscription(firstSource).subscribe({ error: errorSpy });
          const nextSpy = vi.fn();
          const completeSpy = vi.fn();
          const secondSubscription = subscriptionScheduler.scheduleSubscription(secondSource).subscribe({ next: nextSpy, complete: completeSpy });

          await waitForUnsubscription(firstSubscription);
          await waitForUnsubscription(secondSubscription);

          expect(errorSpy).toHaveBeenCalledExactlyOnceWith(error);
          expect(nextSpy).toHaveBeenCalledTimes(3);
          expect(completeSpy).toHaveBeenCalledOnce();
        });

        it("does not subscribe to source observable after schedule cancellation", async () => {
          const onSubscribe = vi.fn().mockImplementation(() => createScheduledObservable(sequence, scheduler));
          const source = defer<Observable<number>>(onSubscribe);
          subscriptionScheduler.scheduleSubscription(source).subscribe().unsubscribe();
          await Promise.resolve();
          expect(onSubscribe).not.toHaveBeenCalled();
        });
      });
    }
  });
});

// Creates an observable which emits values using the specified `rxjs` scheduler
function createScheduledObservable<T>(sequence: ObservableInput<T>, scheduler: undefined | SchedulerLike): Observable<T> {
  return scheduler ? scheduled(sequence, scheduler) : from(sequence);
}

async function expectSequence<T>(expectedSequence: T[], observable: Observable<T>): Promise<void> {
  const actualSequence = await extractSequence(observable);
  expect(actualSequence).toEqual(expectedSequence);
}

/** Expects observable to emit nodes in a specific order. The order is defined by the sequence of groups of emitted node ids, e.g. `[[0], [1, 2]]`. */
async function extractSequence<T>(observable: Observable<T>): Promise<T[]> {
  const sequence: T[] = [];
  await waitForUnsubscription(observable.subscribe((value) => sequence.push(value)));
  return sequence;
}

/** Returns a promise which is resolved when the input subscription is disposed. */
async function waitForUnsubscription(subscription: Subscription): Promise<void> {
  const promise = new ResolvablePromise<void>();
  subscription.add(async () => promise.resolve());
  return promise;
}
