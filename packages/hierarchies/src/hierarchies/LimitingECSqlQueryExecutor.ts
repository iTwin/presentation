/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { StopWatch } from "@itwin/core-bentley";
import { ECSqlQueryDef, ECSqlQueryReaderOptions, ECSqlQueryRow, IECSqlQueryExecutor } from "@itwin/presentation-shared";
import { RowsLimitExceededError } from "./HierarchyErrors";
import { LOGGING_NAMESPACE as CommonLoggingNamespace } from "./internal/Common";
import { MainThreadBlockHandler } from "./internal/MainThreadBlockHandler";
import { getLogger } from "./Logging";

/**
 * An interface for something that knows how to create a limiting ECSQL query reader.
 * @beta
 */
export interface ILimitingECSqlQueryExecutor {
  /**
   * Creates a query reader for given query, but makes sure it doesn't return more than the configured
   * limit of rows.
   * @throws `RowsLimitExceededError` when the query returns more than configured limit of rows.
   */
  createQueryReader(
    query: ECSqlQueryDef,
    config?: ECSqlQueryReaderOptions & { limit?: number | "unbounded" },
  ): ReturnType<IECSqlQueryExecutor["createQueryReader"]>;
}

/**
 * Creates an `ILimitingECSqlQueryExecutor` that throws `RowsLimitExceededError` if the query exceeds given amount of rows.
 * @beta
 */
export function createLimitingECSqlQueryExecutor(baseExecutor: IECSqlQueryExecutor, defaultLimit: number | "unbounded"): ILimitingECSqlQueryExecutor {
  return {
    async *createQueryReader(query: ECSqlQueryDef, config?: ECSqlQueryReaderOptions & { limit?: number | "unbounded" }) {
      const { limit: configLimit, ...restConfig } = config ?? {};
      const limit = configLimit ?? defaultLimit;
      const perfLogger = createQueryPerformanceLogger();
      const blockHandler = new MainThreadBlockHandler();

      // handle "unbounded" case without a buffer
      const reader = baseExecutor.createQueryReader({ ...query, ecsql: addLimit(query.ecsql, limit) }, restConfig);
      if (limit === "unbounded") {
        try {
          for await (const row of reader) {
            perfLogger.onStep();
            yield row;
            await blockHandler.releaseMainThreadIfTimeElapsed();
          }
        } finally {
          perfLogger.onComplete();
        }
        return;
      }

      // avoid streaming until we know the number of rows is okay
      const buffer: ECSqlQueryRow[] = [];
      try {
        for await (const row of reader) {
          perfLogger.onStep();
          buffer.push(row);
          if (buffer.length > limit) {
            throw new RowsLimitExceededError(limit);
          }
          await blockHandler.releaseMainThreadIfTimeElapsed();
        }
      } finally {
        perfLogger.onComplete();
      }

      for (const row of buffer) {
        yield row;
        await blockHandler.releaseMainThreadIfTimeElapsed();
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

const LOGGING_NAMESPACE = `${CommonLoggingNamespace}.QueryPerformance`;
function createQueryPerformanceLogger(firstStepWarningThreshold = 3000, allRowsWarningThreshold = 5000) {
  let firstStep = true;
  let rowsCount = 0;
  const timer = new StopWatch(undefined, true);
  return {
    onStep() {
      if (firstStep) {
        // istanbul ignore next
        const logFunc = timer.current.milliseconds >= firstStepWarningThreshold ? getLogger().logWarning : getLogger().logTrace;
        logFunc(LOGGING_NAMESPACE, `First step took ${timer.currentSeconds} s.`);
        firstStep = false;
      }
      ++rowsCount;
    },
    onComplete() {
      // istanbul ignore next
      const logFunc = timer.current.milliseconds >= allRowsWarningThreshold ? getLogger().logWarning : getLogger().logTrace;
      logFunc(LOGGING_NAMESPACE, `Query took ${timer.currentSeconds} s. for ${rowsCount} rows.`);
    },
  };
}
