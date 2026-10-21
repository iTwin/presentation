/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { QueryRowFormat } from "@itwin/core-common";
import { SchemaView, schemaViewFormatVersion } from "@itwin/ecschema-metadata";

import type { QueryBinder, QueryOptions } from "@itwin/core-common";

/** Minimal query reader shape needed to read the schema view blob. */
interface SchemaViewQueryReaderFactory {
  createQueryReader(
    ecsql: string,
    bindings?: QueryBinder,
    config?: QueryOptions,
  ): { next(): Promise<IteratorResult<any>> };
}

/**
 * Creates a memoized `getSchemaView` function that loads the whole-schema view blob once via
 * `PRAGMA schema_view` and parses it with `SchemaView.fromBinary`. The blob is self-contained, so a
 * single fetch serves every schema. Useful for query sources (e.g. `ECDb`) that have no native
 * `getSchemaView`.
 */
export function createSchemaViewGetter(queryReaderFactory: SchemaViewQueryReaderFactory): () => Promise<SchemaView> {
  let schemaViewPromise: Promise<SchemaView> | undefined;
  return async () => {
    schemaViewPromise ??= (async () => {
      const pragma = `PRAGMA schema_view(${schemaViewFormatVersion})`;
      const reader = queryReaderFactory.createQueryReader(pragma, undefined, {
        rowFormat: QueryRowFormat.UseECSqlPropertyNames,
      });
      const row = await reader.next();
      if (row.done) {
        throw new Error(`${pragma} returned no rows`);
      }
      return SchemaView.fromBinary(row.value.data as Uint8Array, row.value.schemaToken as string | undefined);
    })();
    return schemaViewPromise;
  };
}
