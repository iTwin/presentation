/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Observable } from "rxjs";

/**
 * This is pretty much a copy of https://github.com/benlesh/rxjs-for-await/blob/94f9cf9cb015ac3700dfd1850eb81d36962eb70f/src/index.ts#L33,
 * except that we're using a linked list-based queue rather than an array-based one.
 *
 * @internal
 */
export async function* eachValueFrom<T>(source: Observable<T>): AsyncIterableIterator<T> {
  const deferreds = new Queue<ResolvablePromise<{ value?: T; done: boolean }>>();
  const values = new Queue<T>();
  let hasError = false;
  let error = null;
  let completed = false;
  const subs = source.subscribe({
    next: (value) => {
      const deferred = deferreds.pop();
      if (deferred) {
        deferred.resolve({ value, done: false });
      } else {
        values.push(value);
      }
    },
    error: (err) => {
      hasError = true;
      error = err;
      for (let deferred = deferreds.pop(); deferred !== undefined; deferred = deferreds.pop()) {
        deferred.reject(err);
      }
    },
    complete: () => {
      completed = true;
      for (let deferred = deferreds.pop(); deferred !== undefined; deferred = deferreds.pop()) {
        deferred.resolve({ value: undefined, done: true });
      }
    },
  });
  try {
    while (true) {
      const value = values.pop();
      if (value !== undefined) {
        yield value;
      } else if (completed) {
        return;
      } else if (hasError) {
        throw error;
      } else {
        const d = new ResolvablePromise<{ value?: T; done: boolean }>();
        deferreds.push(d);
        const result = await d;
        if (result.done) {
          return;
        } else {
          yield result.value!;
        }
      }
    }
  } catch (err) {
    throw err;
  } finally {
    subs.unsubscribe();
  }
}

class ResolvablePromise<T> {
  private _wrapped: Promise<T>;
  private _resolve!: (value: T) => void;
  private _reject!: (err: any) => void;
  public constructor() {
    this._wrapped = new Promise<T>((resolve: (value: T) => void, reject: (err: any) => void) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }
  public [Symbol.toStringTag] = "ResolvablePromise";
  public resolve(result: T) {
    this._resolve(result);
  }
  public reject(err: any) {
    this._reject(err);
  }
  public async then<TResult1 = T, TResult2 = never>(
    onFulfilled?: ((value: T) => TResult1 | Promise<TResult1>) | undefined | null,
    onRejected?: ((reason: any) => TResult2 | Promise<TResult2>) | undefined | null,
  ): Promise<TResult1 | TResult2> {
    return this._wrapped.then(onFulfilled, onRejected);
  }
}

class QueueEntry<T> {
  constructor(
    public readonly value: T,
    public next?: QueueEntry<T>,
  ) {}
}

class Queue<T> {
  private _front?: QueueEntry<T>;
  private _back?: QueueEntry<T>;

  public push(item: T) {
    const entry = new QueueEntry<T>(item);
    if (this._back) {
      this._back.next = entry;
    }
    this._back = entry;
    if (!this._front) {
      this._front = entry;
    }
  }

  public pop(): T | undefined {
    if (!this._front) {
      return undefined;
    }
    const value = this._front.value;
    this._front = this._front.next;
    if (!this._front) {
      this._back = undefined;
    }
    return value;
  }
}
