/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Guid, StopWatch } from "@itwin/core-bentley";
import {
  createMainThreadReleaseOnTimePassedHandler,
  ECSqlQueryDef,
  ECSqlQueryExecutor,
  ECSqlQueryReaderOptions,
  ECSqlQueryRow,
  trimWhitespace,
} from "@itwin/presentation-shared";
import { RowsLimitExceededError } from "../HierarchyErrors.js";
import { LOGGING_NAMESPACE as BASE_LOGGING_NAMESPACE, LOGGING_NAMESPACE_PERFORMANCE as BASE_LOGGING_NAMESPACE_PERFORMANCE } from "../internal/Common.js";
import { doLog } from "../internal/LoggingUtils.js";

/**
 * An interface for something that knows how to create a limiting ECSQL query reader.
 * @beta
 */
export interface LimitingECSqlQueryExecutor {
  /**
   * Creates a query reader for given query, but makes sure it doesn't return more than the configured
   * limit of rows.
   * @throws `RowsLimitExceededError` when the query returns more than configured limit of rows.
   */
  createQueryReader(
    query: ECSqlQueryDef,
    config?: ECSqlQueryReaderOptions & { limit?: number | "unbounded" },
  ): ReturnType<ECSqlQueryExecutor["createQueryReader"]>;
}

/**
 * Creates an `LimitingECSqlQueryExecutor` that throws `RowsLimitExceededError` if the query exceeds given amount of rows.
 * @beta
 */
export function createLimitingECSqlQueryExecutor(baseExecutor: ECSqlQueryExecutor, defaultLimit: number | "unbounded"): LimitingECSqlQueryExecutor {
  return {
    async *createQueryReader(query: ECSqlQueryDef, config?: ECSqlQueryReaderOptions & { limit?: number | "unbounded" }) {
      const { limit: configLimit, ...restConfig } = config ?? {};
      const limit = configLimit ?? defaultLimit;
      const queryLogger = createQueryLogger(query);
      const releaseMainThread = createMainThreadReleaseOnTimePassedHandler();

      // handle "unbounded" case without a buffer
      const reader = baseExecutor.createQueryReader({ ...query, ecsql: addLimit(query.ecsql, limit) }, restConfig);
      if (limit === "unbounded") {
        try {
          for await (const row of reader) {
            await releaseMainThread();
            queryLogger.onStep();
            yield row;
          }
        } finally {
          queryLogger.onComplete();
        }
        return;
      }

      // avoid streaming until we know the number of rows is okay
      const buffer: ECSqlQueryRow[] = [];
      try {
        for await (const row of reader) {
          await releaseMainThread();
          queryLogger.onStep();
          buffer.push(row);
          if (buffer.length > limit) {
            throw new RowsLimitExceededError(limit);
          }
        }
      } finally {
        queryLogger.onComplete();
      }

      for (const row of buffer) {
        await releaseMainThread();
        yield row;
      }
    },
  };
}

function addLimit(ecsql: string, limit: number | "unbounded") {
  if (limit === "unbounded") {
    return ecsql;
  }
  return `
    SELECT *
    FROM (${ecsql})
    LIMIT ${limit + 1}
  `;
}

const LOGGING_NAMESPACE = `${BASE_LOGGING_NAMESPACE}.Queries`;
const LOGGING_NAMESPACE_PERFORMANCE = `${BASE_LOGGING_NAMESPACE_PERFORMANCE}.Queries`;
function createQueryLogger(query: ECSqlQueryDef, firstStepWarningThreshold = 3000, allRowsWarningThreshold = 5000) {
  const queryId = Guid.createValue();
  doLog({
    category: LOGGING_NAMESPACE,
    message: /* c8 ignore next */ () => `Executing query [${queryId}]: ${createQueryLogMessage(query)}`,
  });

  let firstStep = true;
  let rowsCount = 0;
  const timer = new StopWatch(undefined, true);
  return {
    onStep() {
      if (firstStep) {
        /* c8 ignore start */
        doLog({
          category: LOGGING_NAMESPACE_PERFORMANCE,
          severity: timer.current.milliseconds >= firstStepWarningThreshold ? "warning" : "trace",
          message: () => `[${queryId}] First step took ${timer.currentSeconds} s.`,
        });
        /* c8 ignore end */
        firstStep = false;
      }
      ++rowsCount;
    },
    onComplete() {
      /* c8 ignore start */
      doLog({
        category: LOGGING_NAMESPACE_PERFORMANCE,
        severity: timer.current.milliseconds >= allRowsWarningThreshold ? "warning" : "trace",
        message: () => `[${queryId}] Query took ${timer.currentSeconds} s. for ${rowsCount} rows.`,
      });
      /* c8 ignore end */
    },
  };
}

/* c8 ignore start */
function createQueryLogMessage(query: ECSqlQueryDef): string {
  const ctes = query.ctes?.map((cte) => `    ${trimWhitespace(cte)}`).join(", \n");
  const bindings = query.bindings?.map((b) => JSON.stringify(b.value)).join(", ");
  let output = "{\n";
  if (ctes) {
    output += `  ctes: [ \n${ctes} \n], \n`;
  }
  output += `  ecsql: ${trimWhitespace(query.ecsql)}, \n`;
  if (bindings) {
    output += `  bindings: [${bindings}], \n`;
  }
  output += "}";
  return output;
}
/* c8 ignore end */
