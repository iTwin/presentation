/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { SchemaContext, SchemaKey } from "@itwin/ecschema-metadata";
import { ECSchema, IMetadataProvider } from "@itwin/presentation-hierarchies";
import { createECSchema } from "./MetadataInternal";

/**
 * Create an `IMetadataProvider` for given [SchemaContext]($ecschema-metadata).
 * @beta
 */
export function createMetadataProvider(schemaContext: SchemaContext): IMetadataProvider {
  const schemaCache = new Map<string, Promise<ECSchema | undefined>>();
  return {
    async getSchema(name) {
      // workaround for https://github.com/iTwin/itwinjs-core/issues/6542
      let schema = schemaCache.get(name);
      // istanbul ignore else
      if (!schema) {
        schema = schemaContext.getSchema(new SchemaKey(name)).then((coreSchema) => (coreSchema ? createECSchema(coreSchema) : undefined));
        schemaCache.set(name, schema);
      }
      return schema;
    },
  };
}
