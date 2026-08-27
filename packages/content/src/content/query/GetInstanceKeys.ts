/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { finalize, from, map, mergeMap } from "rxjs";
import { eachValueFrom } from "@itwin/presentation-shared";
import { buildBaseQuery } from "./BaseQuery.js";
import { QUERY_CONCURRENCY } from "./QueryConcurrency.js";

import type { ECSchemaProvider, ECSqlQueryExecutor, InstanceKey } from "@itwin/presentation-shared";
import type { ContentValueFilter } from "../Content.js";
import type { ContentSource } from "../ContentTarget.js";
import type { QueryFilterer } from "../extensions/QueryFilterer.js";

/**
 * Gets keys of instances matching the supplied sources.
 *
 * @internal
 */
export function getInstanceKeys(props: {
  imodelAccess: ECSchemaProvider & ECSqlQueryExecutor;
  sources: ContentSource[];
  queryFilterers?: QueryFilterer[];
  filters?: ContentValueFilter[];
}): AsyncIterable<InstanceKey> {
  return eachValueFrom(
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
            ecsql: [
              "SELECT [this].[ECInstanceId], ec_classname([this].[ECClassId], 's.c')",
              parts.from,
              parts.joins,
              parts.where && `WHERE ${parts.where}`,
            ]
              .filter((fragment) => fragment)
              .join(" "),
            bindings: parts.bindings,
          },
          { rowFormat: "Indexes" },
        );
        return from(reader).pipe(
          map((row): InstanceKey => ({ id: row[0], className: row[1] })),
          // Calling `return()` on the iterator should cancel the query execution on the backend and free up resources
          finalize(() => void reader.return?.(undefined)),
        );
      }, QUERY_CONCURRENCY),
    ),
  );
}
