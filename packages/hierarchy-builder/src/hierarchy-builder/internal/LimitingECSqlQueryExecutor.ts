/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { RowsLimitExceededError } from "../HierarchyErrors";
import { ECSqlQueryDef, ECSqlQueryReaderOptions, ECSqlQueryRow, IECSqlQueryExecutor, ILimitingECSqlQueryExecutor } from "../queries/ECSqlCore";

/** @internal */
export function createLimitingECSqlQueryExecutor(baseExecutor: IECSqlQueryExecutor, defaultLimit: number | "unbounded"): ILimitingECSqlQueryExecutor {
  return {
    async *createQueryReader(query: ECSqlQueryDef, config?: ECSqlQueryReaderOptions & { limit?: number | "unbounded" }) {
      const { limit: configLimit, ...restConfig } = config ?? {};
      const limit = configLimit ?? defaultLimit;
      const ecsql = addCTEs(addLimit(query.ecsql, limit), query.ctes);

      // handle "unbounded" case without a buffer
      const reader = baseExecutor.createQueryReader(ecsql, query.bindings, restConfig);
      if (limit === "unbounded") {
        for await (const row of reader) {
          yield row;
        }
        return;
      }

      // avoid streaming until we know the number of rows is okay
      const buffer: ECSqlQueryRow[] = [];
      for await (const row of reader) {
        buffer.push(row);
        if (buffer.length > limit) {
          throw new RowsLimitExceededError(limit);
        }
      }
      for (const row of buffer) {
        yield row;
      }
    },
  };
}

/** @internal */
export function addCTEs(ecsql: string, ctes: string[] | undefined) {
  const ctesPrefix = ctes?.length ? `WITH RECURSIVE ${ctes.join(", ")} ` : "";
  return `${ctesPrefix}${ecsql}`;
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
