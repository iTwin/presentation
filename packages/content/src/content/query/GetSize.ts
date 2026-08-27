/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defaultIfEmpty, finalize, from, lastValueFrom, map, mergeMap, reduce, take } from "rxjs";
import { buildBaseQuery } from "./BaseQuery.js";
import { QUERY_CONCURRENCY } from "./QueryConcurrency.js";

import type { ECSchemaProvider, ECSqlQueryExecutor } from "@itwin/presentation-shared";
import type { ContentValueFilter } from "../Content.js";
import type { ContentSource } from "../ContentTarget.js";
import type { QueryFilterer } from "../extensions/QueryFilterer.js";

/**
 * Counts items matching each source and sums their results.
 *
 * @internal
 */
export async function getSize(props: {
  imodelAccess: ECSchemaProvider & ECSqlQueryExecutor;
  sources: ContentSource[];
  queryFilterers?: QueryFilterer[];
  filters?: ContentValueFilter[];
}): Promise<number> {
  return lastValueFrom(
    from(props.sources).pipe(
      mergeMap(async (source) =>
        buildBaseQuery({
          schemaProvider: props.imodelAccess,
          source,
          queryFilterers: props.queryFilterers,
          filters: props.filters,
        }),
      ),
      mergeMap(({ anchor: { parts } }) => {
        const reader = props.imodelAccess.createQueryReader(
          {
            ecsql: ["SELECT COUNT(*)", parts.from, parts.joins, parts.where].filter((fragment) => fragment).join(" "),
            bindings: parts.bindings,
          },
          { rowFormat: "Indexes" },
        );
        return from(reader).pipe(
          take(1),
          map((row) => row[0]),
          defaultIfEmpty(0),
          // Calling `return()` on the iterator should cancel the query execution on the backend and free up resources
          finalize(() => void reader.return?.(undefined)),
        );
      }, QUERY_CONCURRENCY),
      reduce((sum, count) => sum + count, 0),
    ),
  );
}
