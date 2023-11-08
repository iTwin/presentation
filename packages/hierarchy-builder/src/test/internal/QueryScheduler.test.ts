/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
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
import sinon from "sinon";
import { QueryScheduler } from "../../hierarchy-builder/internal/QueryScheduler";
import { ResolvablePromise } from "../Utils";

describe("QueryScheduler", () => {
  const concurrentSubscriptions = 3;
  let queryScheduler: QueryScheduler<number>;

  beforeEach(() => {
    queryScheduler = new QueryScheduler(concurrentSubscriptions);
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
          const subscriptionSpy = sinon.spy(source, "subscribe");
          await expectSequence(sequence, queryScheduler.scheduleSubscription(source));
          expect(subscriptionSpy).to.have.been.calledOnce;
        });

        it("schedules source observables in subscription order", async () => {
          const firstSource = createScheduledObservable(sequence, scheduler);
          const firstSubscriptionSpy = sinon.spy(firstSource, "subscribe");
          const firstScheduledObservable = queryScheduler.scheduleSubscription(firstSource);

          const secondSource = createScheduledObservable(sequence, scheduler);
          const secondSubscriptionSpy = sinon.spy(secondSource, "subscribe");
          const secondScheduledObservable = queryScheduler.scheduleSubscription(secondSource);

          expect(firstSubscriptionSpy).to.have.not.been.called;
          expect(secondSubscriptionSpy).to.have.not.been.called;

          const secondObservableSubscription = secondScheduledObservable.subscribe();
          const firstObservableSubscription = firstScheduledObservable.subscribe();

          await waitForUnsubscription(secondObservableSubscription);
          await waitForUnsubscription(firstObservableSubscription);
          expect(secondSubscriptionSpy.calledBefore(firstSubscriptionSpy)).to.be.true;
          expect(firstSubscriptionSpy).to.have.been.calledOnce;
          expect(secondSubscriptionSpy).to.have.been.calledOnce;
        });

        it("reschedules the same observable source after it has been completed", async () => {
          const source = createScheduledObservable(sequence, scheduler);
          const subscriptionSpy = sinon.spy(source, "subscribe");

          const firstScheduledObservable = queryScheduler.scheduleSubscription(source);
          await waitForUnsubscription(firstScheduledObservable.subscribe());

          const secondScheduledObservable = queryScheduler.scheduleSubscription(source);
          await waitForUnsubscription(secondScheduledObservable.subscribe());

          expect(subscriptionSpy).to.have.been.calledTwice;
        });

        it("does not subscribe to the next observable until the started ones are resolved", async () => {
          const initialPromises = Array.from({ length: concurrentSubscriptions + 1 }).map(() => new ResolvablePromise<number>());
          const initialSources = initialPromises.map((p) => createScheduledObservable(p, scheduler));
          const initialSubscriptions = initialSources.map((initialSource) => queryScheduler.scheduleSubscription(initialSource).subscribe());

          const checkSource = createScheduledObservable(sequence, scheduler);
          const checkSourceSpy = sinon.spy(checkSource, "subscribe");
          queryScheduler.scheduleSubscription(checkSource).subscribe();

          expect(checkSourceSpy).to.not.have.been.called;

          await initialPromises[0].resolve(0);
          await waitForUnsubscription(initialSubscriptions[0]);
          expect(checkSourceSpy).to.not.have.been.called;

          await initialPromises[1].resolve(1);
          await waitForUnsubscription(initialSubscriptions[1]);
          expect(checkSourceSpy).to.have.been.calledOnce;

          for (let i = 2; i < initialPromises.length; ++i) {
            await initialPromises[i].resolve(i);
            await waitForUnsubscription(initialSubscriptions[i]);
          }
          expect(checkSourceSpy).to.have.been.calledOnce;
        });

        it("notifies subscribers about error in source observable", async () => {
          const error = new Error("TestError");
          const source = createScheduledObservable(
            throwError(() => error),
            scheduler,
          );
          const errorSpy = sinon.spy();

          const scheduledObservable = queryScheduler.scheduleSubscription(source);
          await waitForUnsubscription(scheduledObservable.subscribe({ error: errorSpy }));

          expect(errorSpy).to.have.been.calledOnceWithExactly(error);
        });

        it("schedules the following observable when the previous one emits error", async () => {
          const error = new Error("TestError");
          const firstSource = createScheduledObservable(
            throwError(() => error),
            scheduler,
          );
          const secondSource = createScheduledObservable(sequence, scheduler);

          const errorSpy = sinon.spy();
          const firstSubscription = queryScheduler.scheduleSubscription(firstSource).subscribe({ error: errorSpy });
          const nextSpy = sinon.spy();
          const completeSpy = sinon.spy();
          const secondSubscription = queryScheduler.scheduleSubscription(secondSource).subscribe({ next: nextSpy, complete: completeSpy });

          await waitForUnsubscription(firstSubscription);
          await waitForUnsubscription(secondSubscription);

          expect(errorSpy).to.have.been.calledOnceWithExactly(error);
          expect(errorSpy).to.have.been.calledBefore(nextSpy);
          expect(nextSpy).to.have.been.calledThrice;
          expect(completeSpy).to.have.been.calledAfter(nextSpy);
        });

        it("does not subscribe to source observable after schedule cancellation", async () => {
          const onSubscribe = sinon.fake(() => createScheduledObservable(sequence, scheduler));
          const source = defer<Observable<number>>(onSubscribe);
          queryScheduler.scheduleSubscription(source).subscribe().unsubscribe();
          await Promise.resolve();
          expect(onSubscribe).not.to.have.been.called;
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
  expect(actualSequence).to.eql(expectedSequence);
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
