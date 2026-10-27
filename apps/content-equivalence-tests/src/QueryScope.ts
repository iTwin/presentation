/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { AsyncLocalStorage } from "node:async_hooks";
import { hashString, shortFingerprint } from "./Persistence.js";

import type {
  ECSqlQueryDef,
  ECSqlQueryExecutor,
  ECSqlQueryReaderOptions,
  ECSqlQueryRow,
  InstanceKey,
} from "@itwin/presentation-shared";

/** How long to wait for a canceled query to settle before leaving it behind. */
const CANCELLATION_GRACE_MS = 30 * 1000;
const SLOWEST_QUERY_COUNT = 20;
const REPORTED_QUERY_LIMIT = 50;

interface QueryContext {
  phase: string;
  instanceKey?: InstanceKey;
}

const queryContext = new AsyncLocalStorage<QueryContext>();

/** Labels every query started by `callback` (including asynchronously) with the given phase. */
export function runInQueryContext<T>(context: QueryContext, callback: () => T): T {
  return queryContext.run(context, callback);
}

type QueryStatus = "running" | "completed" | "closed" | "failed" | "expected-failure" | "canceled" | "abandoned";

/**
 * Query failures the new pipeline handles itself. Matching failures are rethrown unchanged and only counted, so
 * `failed` lists the failures worth looking at.
 */
const EXPECTED_QUERY_FAILURES: Array<{ ecsql: RegExp; error: RegExp }> = [
  {
    // `loadEmbeddedRulesets` treats a missing `PresentationRules` schema as "no embedded rulesets".
    ecsql: /^SELECT JsonProperties FROM PresentationRules\.Ruleset$/,
    error: /'PresentationRules\.Ruleset' does not exist or could not be loaded/,
  },
  {
    // `loadOverrideRules` of the shared instance label factory treats it as "no label overrides".
    ecsql:
      /^SELECT json_extract\(JsonProperties, '\$\.jsonProperties'\) AS jsonProperties FROM PresentationRules\.Ruleset$/,
    error: /'PresentationRules\.Ruleset' does not exist or could not be loaded/,
  },
];

function isExpectedFailure(ecsql: string, error: unknown): boolean {
  const query = ecsql.replace(/\s+/g, " ").trim();
  const message = toError(error).message;
  return EXPECTED_QUERY_FAILURES.some((expected) => expected.ecsql.test(query) && expected.error.test(message));
}

export interface QueryRecord {
  id: number;
  phase?: string;
  instanceKey?: InstanceKey;
  /** Stable hash of the ECSQL text, for grouping the same query across iModels and runs. */
  queryHash: string;
  ecsql: string;
  bindingCount: number;
  startedAt: string;
  status: QueryStatus;
  rows: number;
  firstRowMs?: number;
  durationMs?: number;
  error?: string;
}

export interface QueryReport {
  totalQueries: number;
  /** Queries canceled on abort that didn't settle within the grace period. */
  unsettledQueries: number;
  counts: {
    active: number;
    failed: number;
    /** Failures listed in `EXPECTED_QUERY_FAILURES`, which the pipeline handles itself. */
    expectedFailures: number;
    canceled: number;
    abandoned: number;
  };
  /** Lists below are truncated to the first `REPORTED_QUERY_LIMIT` entries; `counts` has the totals. */
  active: QueryRecord[];
  failed: QueryRecord[];
  canceled: QueryRecord[];
  /** Readers left open by their consumer when the capture failed, without a read in progress. */
  abandoned: QueryRecord[];
  slowest: QueryRecord[];
}

const SUMMARIZED_CANCELED_QUERY_LIMIT = 10;

/** Lists canceled queries for an error message, or returns `undefined` when none were canceled. */
export function summarizeCanceledQueries(report: QueryReport): string | undefined {
  const total = report.counts.canceled;
  if (total === 0) {
    return undefined;
  }
  const listed = report.canceled
    .slice(0, SUMMARIZED_CANCELED_QUERY_LIMIT)
    .map(
      (query) =>
        `#${query.id} [${query.queryHash}] ${query.phase ?? "unknown"} after ${Math.round((query.durationMs ?? 0) / 1000)} s`,
    )
    .join(", ");
  const remaining = total - Math.min(total, SUMMARIZED_CANCELED_QUERY_LIMIT);
  // cspell:words quer
  return `Canceled ${total} quer${total === 1 ? "y" : "ies"}: ${listed}${remaining > 0 ? `, and ${remaining} more` : ""}`;
}

export class QueryExecutionError extends Error {
  public constructor(
    public readonly query: QueryRecord,
    cause: unknown,
  ) {
    super(
      `ECSQL query #${query.id} [${query.queryHash}] in phase '${query.phase ?? "unknown"}'${
        query.instanceKey ? ` for '${query.instanceKey.className}:${query.instanceKey.id}'` : ""
      } failed after ${formatSeconds(query.durationMs)} with ${query.rows} row(s): ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
    this.name = "QueryExecutionError";
  }
}

function formatSeconds(ms: number | undefined): string {
  return `${((ms ?? 0) / 1000).toFixed(1)} s`;
}

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

function getQueryText(query: ECSqlQueryDef): string {
  return `${query.ctes?.length ? `WITH RECURSIVE ${query.ctes.join(", ")} ` : ""}${query.ecsql}`;
}

function countBindings(bindings: ECSqlQueryDef["bindings"]): number {
  if (!bindings) {
    return 0;
  }
  return Array.isArray(bindings) ? bindings.length : Object.keys(bindings).length;
}

async function waitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(toError(signal.reason));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(toError(error));
      },
    );
  });
}

/**
 * Owns the ECSQL queries started through executors it wraps: records them for the report, cancels running ones
 * when the given signal is aborted or `abort` is called, and lets callers `settle` canceled ones before closing
 * the iModel, so no work is left running against it.
 */
export class QueryScope {
  private _nextId = 1;
  private _total = 0;
  private _unsettled = 0;
  private _expectedFailures = 0;
  private readonly _controller = new AbortController();
  private readonly _active = new Set<QueryRecord>();
  private readonly _pending = new Set<Promise<unknown>>();
  private readonly _failed: QueryRecord[] = [];
  private readonly _canceled: QueryRecord[] = [];
  private readonly _abandoned: QueryRecord[] = [];
  private _slowest: QueryRecord[] = [];

  public constructor(signal: AbortSignal) {
    if (signal.aborted) {
      this._controller.abort(signal.reason);
    } else {
      signal.addEventListener("abort", () => this._controller.abort(signal.reason), { once: true });
    }
  }

  /** Returns an executor whose queries belong to this scope. */
  public wrap(executor: ECSqlQueryExecutor): ECSqlQueryExecutor {
    const signal = this._controller.signal;
    return {
      createQueryReader: (query: ECSqlQueryDef, config?: ECSqlQueryReaderOptions) => {
        signal.throwIfAborted();
        const context = queryContext.getStore();
        const ecsql = getQueryText(query);
        const record: QueryRecord = {
          id: this._nextId++,
          phase: context?.phase,
          instanceKey: context?.instanceKey,
          queryHash: shortFingerprint(hashString(ecsql)),
          ecsql,
          bindingCount: countBindings(query.bindings),
          startedAt: new Date().toISOString(),
          status: "running",
          rows: 0,
        };
        ++this._total;
        this._active.add(record);
        return new ScopedQueryReader(executor.createQueryReader(query, config), record, this, signal);
      },
    };
  }

  /** Cancels every running query, including ones whose consumers stopped reading, without waiting for them. */
  public abort(reason: Error): void {
    if (!this._controller.signal.aborted) {
      this._controller.abort(reason);
    }
  }

  /**
   * Waits for reads in progress to settle, then reports readers still left open as abandoned. Call after `abort`,
   * once the consumers are done, so no work is left running against the iModel.
   */
  public async settle(): Promise<void> {
    await Promise.all(this._pending);
    for (const record of this._active) {
      this.finish(record, "abandoned");
    }
  }

  /** Registers a read in progress, so `settle` can wait for it. */
  public addPendingRead(promise: Promise<unknown>): void {
    const settled = promise.then(
      () => undefined,
      () => undefined,
    );
    this._pending.add(settled);
    void settled.then(() => this._pending.delete(settled));
  }

  public finish(record: QueryRecord, status: Exclude<QueryStatus, "running">, error?: unknown): void {
    if (record.status !== "running") {
      return;
    }
    record.status = status;
    record.durationMs = Date.now() - Date.parse(record.startedAt);
    if (error !== undefined) {
      record.error = toError(error).message;
    }
    this._active.delete(record);
    if (status === "failed") {
      this._failed.push(record);
    }
    if (status === "expected-failure") {
      ++this._expectedFailures;
    }
    if (status === "canceled") {
      this._canceled.push(record);
    }
    if (status === "abandoned") {
      this._abandoned.push(record);
    }
    this._slowest = [...this._slowest, record]
      .sort((lhs, rhs) => (rhs.durationMs ?? 0) - (lhs.durationMs ?? 0))
      .slice(0, SLOWEST_QUERY_COUNT);
  }

  public reportUnsettled(): void {
    ++this._unsettled;
  }

  public getReport(): QueryReport {
    const now = Date.now();
    const active = [...this._active].map((record) => ({ ...record, durationMs: now - Date.parse(record.startedAt) }));
    return {
      totalQueries: this._total,
      unsettledQueries: this._unsettled,
      counts: {
        active: active.length,
        failed: this._failed.length,
        expectedFailures: this._expectedFailures,
        canceled: this._canceled.length,
        abandoned: this._abandoned.length,
      },
      active: active.slice(0, REPORTED_QUERY_LIMIT),
      failed: this._failed.slice(0, REPORTED_QUERY_LIMIT),
      canceled: this._canceled.slice(0, REPORTED_QUERY_LIMIT),
      abandoned: this._abandoned.slice(0, REPORTED_QUERY_LIMIT),
      slowest: this._slowest,
    };
  }
}

class ScopedQueryReader implements AsyncIterableIterator<ECSqlQueryRow> {
  public constructor(
    private readonly _inner: AsyncIterableIterator<ECSqlQueryRow>,
    private readonly _record: QueryRecord,
    private readonly _scope: QueryScope,
    private readonly _signal: AbortSignal,
  ) {}

  public [Symbol.asyncIterator](): AsyncIterableIterator<ECSqlQueryRow> {
    return this;
  }

  public async next(): Promise<IteratorResult<ECSqlQueryRow>> {
    const result = this.read();
    this._scope.addPendingRead(result);
    return result;
  }

  private async read(): Promise<IteratorResult<ECSqlQueryRow>> {
    if (this._signal.aborted) {
      await this.cancel(undefined);
      throw this._signal.reason;
    }
    const pending = this._inner.next();
    let result: IteratorResult<ECSqlQueryRow>;
    try {
      result = await waitWithAbort(pending, this._signal);
    } catch (error) {
      // The `aborted` flag may change while we wait for `pending`
      // oxlint-disable-next-line typescript/no-unnecessary-condition
      if (this._signal.aborted) {
        await this.cancel(pending);
        throw this._signal.reason;
      }
      if (isExpectedFailure(this._record.ecsql, error)) {
        this._scope.finish(this._record, "expected-failure", error);
        // Rethrown unchanged, since the handling caller may match on the original error.
        throw error;
      }
      this._scope.finish(this._record, "failed", error);
      throw new QueryExecutionError(this._record, error);
    }
    if (result.done) {
      this._scope.finish(this._record, "completed");
    } else {
      if (this._record.rows === 0) {
        this._record.firstRowMs = Date.now() - Date.parse(this._record.startedAt);
      }
      ++this._record.rows;
    }
    return result;
  }

  public async return(): Promise<IteratorResult<ECSqlQueryRow>> {
    this._scope.finish(this._record, "closed");
    await this._inner.return?.();
    return { done: true, value: undefined };
  }

  private async cancel(pending: Promise<unknown> | undefined): Promise<void> {
    if (this._record.status === "running") {
      this._scope.finish(this._record, "canceled", this._signal.reason);
      // Closing the reader cancels the native query through its restart token.
      await this._inner.return?.();
    }
    // A reader closed by `return()` may still have a native read in progress.
    if (!pending) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settled = await Promise.race([
      pending.then(
        () => true,
        () => true,
      ),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), CANCELLATION_GRACE_MS);
      }),
    ]);
    clearTimeout(timer);
    if (!settled) {
      this._scope.reportUnsettled();
    }
  }
}
